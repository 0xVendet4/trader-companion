// The voice chat's recorder: the trader's words, taken in the page with the
// microphone chosen in Settings → AI, on Windows, macOS and Linux alike. The
// webview records (MediaRecorder, or a plain WAV where it is missing), a gate
// listens for the pause that ends a sentence, and the recording goes to OpenAI
// to be written down (src/ai/openai.ts).

export interface Microphone {
  id: string;
  /** "" until the microphone was allowed once (allowMicrophone). */
  label: string;
}

export type RecordingError = "permission-denied" | "no-microphone" | "busy" | "unsupported" | "failed";

export interface Recording {
  blob: Blob;
  /** The blob's media type: "audio/webm;codecs=opus", "audio/mp4", "audio/wav"… */
  mime: string;
  /** How long it ran. */
  ms: number;
  /** Whether anything above the silence floor was heard. */
  spoke: boolean;
}

const media = () => (typeof navigator !== "undefined" ? navigator.mediaDevices : undefined);

/** The microphones the webview sees, without the "default"/"communications" aliases Windows adds. */
export async function listMicrophones(): Promise<Microphone[]> {
  const devices = (await media()?.enumerateDevices?.().catch(() => [])) ?? [];
  return devices
    .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
    .map((d) => ({ id: d.deviceId, label: d.label }));
}

/** Asks for the microphone once, so the list carries names, and lets it go. */
export async function allowMicrophone(): Promise<RecordingError | null> {
  const m = media();
  if (!m?.getUserMedia) return "unsupported";
  try {
    const stream = await m.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return null;
  } catch (err) {
    return errorCode(err);
  }
}

/** What getUserMedia's error means. */
export function errorCode(err: unknown): RecordingError {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "permission-denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no-microphone";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  return "failed";
}

// ── the pause that ends a sentence ───────────────────────────────────────────

export interface GateOptions {
  /** Below this level (dBFS) the room is quiet. */
  silenceDb: number;
  /** A pause this long after speech ends the recording. */
  silenceMs: number;
  /** Nothing said for this long from the start ends it too. */
  leadMs: number;
  /** The longest a recording runs. */
  maxMs: number;
}

export const GATE_DEFAULTS: GateOptions = { silenceDb: -40, silenceMs: 1200, leadMs: 6000, maxMs: 60_000 };

/** Decides when a recording ends: a pause once something was said, nothing said at all, or the cap. */
export class SilenceGate {
  elapsed = 0;
  spoke = false;
  private quiet = 0;

  constructor(private readonly o: GateOptions = GATE_DEFAULTS) {}

  /** Feeds one level reading (dBFS) taken `dt` ms after the last; true when the recording should end. */
  push(db: number, dt: number): boolean {
    this.elapsed += dt;
    if (db > this.o.silenceDb) {
      this.spoke = true;
      this.quiet = 0;
    } else {
      this.quiet += dt;
    }
    if (this.elapsed >= this.o.maxMs) return true;
    return this.spoke ? this.quiet >= this.o.silenceMs : this.elapsed >= this.o.leadMs;
  }
}

/** The level of a time-domain frame in dBFS (-100 for digital silence). */
export function levelDb(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / Math.max(1, frame.length));
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// ── formats ──────────────────────────────────────────────────────────────────

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** The container the webview can record in, or "" for the WAV fallback. */
export function pickMime(supported: (mime: string) => boolean = (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)): string {
  return MIMES.find(supported) ?? "";
}

/** The file extension OpenAI tells the format by. */
export function extFor(mime: string): string {
  const base = mime.split(";")[0].trim();
  return base === "audio/mp4" ? "mp4" : base === "audio/ogg" ? "ogg" : base === "audio/wav" ? "wav" : "webm";
}

/** The recording as base64, for the Rust side. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

/** PCM frames as a 16-bit mono WAV, brought down to about 16 kHz: all speech needs, a third of the bytes. */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const step = Math.max(1, Math.floor(sampleRate / 16_000));
  const rate = Math.round(sampleRate / step);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const n = Math.floor(total / step);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  let at = 44;
  let acc = 0;
  let count = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++) {
      acc += c[i];
      if (++count === step) {
        const s = Math.max(-1, Math.min(1, acc / step));
        if (at < buf.byteLength) v.setInt16(at, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
        at += 2;
        acc = 0;
        count = 0;
      }
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

// ── recording ────────────────────────────────────────────────────────────────

export interface Recorder {
  readonly recording: boolean;
  /**
   * Starts recording with the microphone `micId` ("" = the system's) and calls
   * `onDone` when it ends: after a pause, at the cap, or on stop(). Resolves
   * null, or why it could not start.
   */
  start(micId: string, onDone: (rec: Recording) => void): Promise<RecordingError | null>;
  stop(): void;
}

export function createRecorder(gate: GateOptions = GATE_DEFAULTS): Recorder {
  let session: { stop(): void } | null = null;
  return {
    get recording() {
      return session != null;
    },
    async start(micId, onDone) {
      if (session) return null;
      const m = media();
      if (!m?.getUserMedia || typeof AudioContext === "undefined") return "unsupported";
      let stream: MediaStream;
      try {
        stream = await m.getUserMedia({ audio: micId ? { deviceId: { exact: micId } } : true });
      } catch (err) {
        // The chosen microphone is gone: the system's, then.
        if (!micId || errorCode(err) !== "no-microphone") return errorCode(err);
        try {
          stream = await m.getUserMedia({ audio: true });
        } catch (again) {
          return errorCode(again);
        }
      }
      try {
        session = record(stream, gate, (rec) => {
          session = null;
          onDone(rec);
        });
      } catch {
        for (const track of stream.getTracks()) track.stop();
        return "failed";
      }
      return null;
    },
    stop() {
      session?.stop();
    },
  };
}

function record(stream: MediaStream, gate: GateOptions, done: (rec: Recording) => void): { stop(): void } {
  const ctx = new AudioContext();
  void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const frame = new Float32Array(analyser.fftSize);
  const silence = new SilenceGate(gate);
  const started = performance.now();
  let last = started;
  let heard = false;
  let ended = false;

  const mime = pickMime();
  const capture = mime ? recordCompressed(stream, mime) : recordWav(ctx, source);

  const finish = async () => {
    if (ended) return;
    ended = true;
    window.clearInterval(timer);
    const blob = await capture.stop();
    for (const track of stream.getTracks()) track.stop();
    void ctx.close().catch(() => {});
    // A context that never ran (no gesture to start it) heard nothing: assume words.
    done({ blob, mime: blob.type || mime || "audio/wav", ms: Math.round(performance.now() - started), spoke: heard ? silence.spoke : true });
  };
  const timer = window.setInterval(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (ctx.state !== "running") {
      if (now - started >= gate.maxMs) void finish();
      return;
    }
    heard = true;
    analyser.getFloatTimeDomainData(frame);
    if (silence.push(levelDb(frame), dt)) void finish();
  }, 150);
  return { stop: () => void finish() };
}

function recordCompressed(stream: MediaStream, mime: string): { stop(): Promise<Blob> } {
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || mime }));
  });
  rec.start();
  return {
    stop: () => {
      if (rec.state !== "inactive") rec.stop();
      return stopped;
    },
  };
}

/** PCM through a ScriptProcessorNode, for webviews without MediaRecorder. */
function recordWav(ctx: AudioContext, source: MediaStreamAudioSourceNode): { stop(): Promise<Blob> } {
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const chunks: Float32Array[] = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  // Chromium runs the processor only when it reaches the output: through a muted gain.
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  return {
    stop: async () => {
      source.disconnect(node);
      node.disconnect();
      mute.disconnect();
      return encodeWav(chunks, ctx.sampleRate);
    },
  };
}
