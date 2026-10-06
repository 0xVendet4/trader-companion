// Sounds, synthesised with WebAudio — no audio files to license or ship.
// Each sound is a few short notes with an envelope. Volume range 0–0.2 and the
// suspend-when-idle trick come from Coucou's SoundEngine (MIT, © Louis Raillé).
//
// To use recorded sounds instead, decode WAVs into buffers here and play them
// from `play()`; the rest of the app only knows the names below.

export type SoundName =
  | "open"
  | "close"
  | "blip"
  | "hover"
  | "pop"
  | "alertUp"
  | "alertDown"
  | "warn"
  | "reminder"
  | "greet"
  | "boing"
  | "squeak"
  | "whee"
  | "eep"
  | "dizzy"
  | "grumble"
  | "achoo"
  | "tada"
  | "hmm";

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number };

const NOTES: Record<SoundName, Note[]> = {
  open: [
    { f: 660, at: 0, dur: 0.07, type: "sine" },
    { f: 990, at: 0.06, dur: 0.09, type: "sine" },
  ],
  close: [
    { f: 880, at: 0, dur: 0.06, type: "sine", gain: 0.7 },
    { f: 587, at: 0.05, dur: 0.08, type: "sine", gain: 0.7 },
  ],
  blip: [{ f: 1320, at: 0, dur: 0.035, type: "triangle", gain: 0.6 }],
  hover: [{ f: 1100, at: 0, dur: 0.03, type: "sine", gain: 0.35 }],
  pop: [
    { f: 520, at: 0, dur: 0.05, type: "triangle" },
    { f: 1040, at: 0.03, dur: 0.06, type: "sine", gain: 0.6 },
  ],
  // C major arpeggio going up.
  alertUp: [
    { f: 523.25, at: 0, dur: 0.1, type: "triangle" },
    { f: 659.25, at: 0.08, dur: 0.1, type: "triangle" },
    { f: 783.99, at: 0.16, dur: 0.1, type: "triangle" },
    { f: 1046.5, at: 0.24, dur: 0.22, type: "triangle" },
  ],
  // The same, coming down a minor third lower.
  alertDown: [
    { f: 783.99, at: 0, dur: 0.1, type: "triangle" },
    { f: 622.25, at: 0.09, dur: 0.1, type: "triangle" },
    { f: 523.25, at: 0.18, dur: 0.1, type: "triangle" },
    { f: 392.0, at: 0.27, dur: 0.24, type: "triangle" },
  ],
  // Two-tone, twice: "look at this".
  warn: [
    { f: 880, at: 0, dur: 0.12, type: "square", gain: 0.35 },
    { f: 660, at: 0.14, dur: 0.12, type: "square", gain: 0.35 },
    { f: 880, at: 0.28, dur: 0.12, type: "square", gain: 0.35 },
    { f: 660, at: 0.42, dur: 0.16, type: "square", gain: 0.35 },
  ],
  // A soft bell: fundamental plus an inharmonic partial, long decay.
  reminder: [
    { f: 784, at: 0, dur: 0.9, type: "sine" },
    { f: 784 * 2.76, at: 0, dur: 0.5, type: "sine", gain: 0.18 },
    { f: 1046.5, at: 0.22, dur: 0.9, type: "sine", gain: 0.8 },
  ],
  greet: [
    { f: 587.33, at: 0, dur: 0.08, type: "sine" },
    { f: 880, at: 0.08, dur: 0.08, type: "sine" },
    { f: 1174.66, at: 0.16, dur: 0.16, type: "sine" },
  ],
  // Mascot pokes. A spring: low, then a quick climb.
  boing: [
    { f: 220, at: 0, dur: 0.05, type: "sine" },
    { f: 330, at: 0.035, dur: 0.05, type: "sine" },
    { f: 494, at: 0.07, dur: 0.05, type: "sine" },
    { f: 740, at: 0.105, dur: 0.12, type: "sine", gain: 0.8 },
  ],
  squeak: [
    { f: 1568, at: 0, dur: 0.04, type: "sine", gain: 0.6 },
    { f: 2093, at: 0.05, dur: 0.06, type: "sine", gain: 0.5 },
  ],
  whee: [
    { f: 523.25, at: 0, dur: 0.07, type: "triangle" },
    { f: 698.46, at: 0.06, dur: 0.07, type: "triangle" },
    { f: 932.33, at: 0.12, dur: 0.07, type: "triangle" },
    { f: 1244.51, at: 0.18, dur: 0.18, type: "triangle", gain: 0.8 },
  ],
  eep: [{ f: 1760, at: 0, dur: 0.07, type: "triangle", gain: 0.6 }],
  // Wobbling between two close notes.
  dizzy: [
    { f: 660, at: 0, dur: 0.1, type: "sine" },
    { f: 622.25, at: 0.1, dur: 0.1, type: "sine" },
    { f: 587.33, at: 0.2, dur: 0.1, type: "sine" },
    { f: 554.37, at: 0.3, dur: 0.1, type: "sine" },
    { f: 523.25, at: 0.4, dur: 0.18, type: "sine" },
  ],
  grumble: [
    { f: 196, at: 0, dur: 0.12, type: "square", gain: 0.3 },
    { f: 174.61, at: 0.13, dur: 0.18, type: "square", gain: 0.3 },
  ],
  // "Ah… ah… CHOO".
  achoo: [
    { f: 420, at: 0, dur: 0.12, type: "sine", gain: 0.55 },
    { f: 520, at: 0.13, dur: 0.14, type: "sine", gain: 0.6 },
    { f: 180, at: 0.32, dur: 0.1, type: "square", gain: 0.3 },
    { f: 900, at: 0.32, dur: 0.07, type: "triangle", gain: 0.4 },
  ],
  tada: [
    { f: 523.25, at: 0, dur: 0.08, type: "triangle" },
    { f: 783.99, at: 0.09, dur: 0.28, type: "triangle", gain: 0.9 },
  ],
  hmm: [
    { f: 220, at: 0, dur: 0.24, type: "sine", gain: 0.5 },
    { f: 246.94, at: 0.24, dur: 0.3, type: "sine", gain: 0.5 },
  ],
};

class SoundEngine {
  enabled = true;
  volume = 0.12;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private idleTimer: number | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** WebView2 can hand us a suspended context; call after any user input. */
  resume() {
    void this.ensure()?.resume();
  }

  /**
   * Called when the island goes quiet. A running AudioContext keeps an audio
   * thread alive even with nothing playing; suspend it after the tail of the
   * last sound. `play()` resumes it.
   */
  idle() {
    if (!this.ctx || this.ctx.state !== "running" || this.idleTimer != null) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      void this.ctx?.suspend();
    }, 1500);
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(0.2, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  play(name: SoundName) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    const master = this.master;
    if (!ctx || !master) return;
    if (this.idleTimer != null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const n of NOTES[name]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = n.type ?? "sine";
      osc.frequency.value = n.f;
      const start = t0 + n.at;
      const peak = n.gain ?? 1;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + n.dur + 0.02);
    }
    this.idle();
  }
}

export const Sound = new SoundEngine();
