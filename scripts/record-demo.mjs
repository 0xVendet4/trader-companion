// Records /demo.html into MP4s with sound (H.264 + AAC, 30 fps):
//
//   npm run dev                                   (in another terminal)
//   npm run record-demo                           → release/candy-demo.mp4           1920×1080: README, X
//   npm run record-demo -- vertical               → release/candy-demo-vertical.mp4  1080×1920, if ever wanted: TikTok, Reels, Shorts
//   npm run record-demo -- horizontal vertical    → both
//   npm run record-demo -- --music lofi           a loop made here under it: groove (the default), lofi or trap
//   npm run record-demo -- --music lofi --music trap   one file each: candy-demo-lofi.mp4, candy-demo-trap.mp4
//   npm run record-demo -- --music song.mp3       your own track under it (one you may use: Pixabay, YouTube Audio Library…)
//   npm run record-demo -- --no-music             effects only, to add music in the app you post with
//
// No ffmpeg needed: a headless Microsoft Edge plays the demo while Chrome
// DevTools' screencast hands us every frame. The page logs every sound it
// would have played (the island's own and the demo's effects); the same
// browser then renders that soundtrack with the groove (src/demo/soundtrack.ts),
// encodes picture and sound with WebCodecs, and mp4-muxer packs the file.

import puppeteer from "puppeteer-core";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.DEMO_URL ?? "http://localhost:1420";
const FRAMES = join(ROOT, "demo-frames");
const FPS = 30;
const SAMPLE_RATE = 48_000;

const FORMATS = {
  horizontal: { width: 1920, height: 1080, out: "candy-demo.mp4" },
  vertical: { width: 1080, height: 1920, out: "candy-demo-vertical.mp4" },
};
const args = process.argv.slice(2);
const asked = args.filter((a) => a in FORMATS);
const formats = asked.length ? asked : ["horizontal"];
// The music: each --music (a loop made here, or a file of yours), and/or
// --no-music. With more than one, one file each: candy-demo-lofi.mp4…
const LOOPS = ["groove", "lofi", "trap"];
const tunes = [];
args.forEach((a, i) => {
  if (a !== "--music") return;
  const v = args[i + 1];
  if (LOOPS.includes(v)) tunes.push({ name: v, music: v });
  else if (v && existsSync(v)) tunes.push({ name: basename(v, extname(v)).replace(/[^\w-]+/g, "-"), file: v });
  else {
    console.error(`No music file at ${v}.`);
    process.exit(1);
  }
});
if (args.includes("--no-music")) tunes.push({ name: "no-music", music: "none" });
if (!tunes.length) tunes.push({ name: "groove", music: "groove" });

const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

const executablePath = BROWSERS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Edge or Chrome found. Set BROWSER_PATH to a Chromium browser.");
  process.exit(1);
}

try {
  await fetch(`${BASE}/demo.html`);
} catch {
  console.error(`Nothing answers at ${BASE}. Start the dev server first: npm run dev`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
});

try {
  for (const format of formats) await record(format, FORMATS[format]);
} finally {
  await browser.close();
  rmSync(FRAMES, { recursive: true, force: true });
}

async function record(format, { width, height, out }) {
  const page = await browser.newPage();
  // The window is the video's size; the page fits its stage into it.
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  // A step of the script that missed its button says so here.
  page.on("console", (m) => (m.type() === "warn" || m.type() === "error") && console.log(`\n  page ${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => console.log(`\n  page error: ${e.message}`));
  const cdp = await page.createCDPSession();

  // ── 1. Play the demo and collect frames ────────────────────────────────────
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    const name = `${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(join(FRAMES, name), Buffer.from(f.data, "base64"));
    frames.push({ t: f.metadata.timestamp, name });
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });

  await page.goto(`${BASE}/demo.html?record&format=${format}`, { waitUntil: "networkidle0" });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });
  // Film from the first frame on: the demo waits for this.
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => window.__demoGo());
  process.stdout.write(`Recording the ${format} cut`);
  const ticker = setInterval(() => process.stdout.write("."), 2000);
  await page.waitForFunction("window.__demoDone === true", { timeout: 240_000, polling: 250 });
  clearInterval(ticker);
  await cdp.send("Page.stopScreencast");
  const { cues, musicAt } = await page.evaluate(() => ({ cues: window.__demoCues, musicAt: window.__demoMusicAt }));
  console.log(` ${frames.length} frames, ${cues.length} sounds.`);
  if (frames.length < 10) throw new Error("too few frames captured");

  // ── 2. Resample to a constant frame rate ───────────────────────────────────
  const t0 = frames[0].t;
  const duration = frames[frames.length - 1].t - t0;
  const plan = [];
  let k = 0;
  for (let i = 0; i <= Math.floor(duration * FPS); i++) {
    const at = t0 + i / FPS;
    while (k + 1 < frames.length && frames[k + 1].t <= at) k++;
    plan.push(frames[k].name);
  }
  // Both clocks are wall time (seconds since the epoch): the video starts at the first frame.
  const sounds = cues.map((c) => ({ at: c.t - t0, sound: c.sound, fx: c.fx }));
  console.log(`${duration.toFixed(1)} s → ${plan.length} frames at ${FPS} fps.`);

  // ── 3. Encode in the browser (WebCodecs + mp4-muxer) ───────────────────────
  // A localhost page is a secure context, which WebCodecs needs. `?still`
  // keeps the demo script from running underneath. Music files are served
  // from beside the frames. The picture is encoded once; each tune gets its
  // own soundtrack and its own file around the same picture.
  const served = tunes.map((t, i) => {
    if (!t.file) return { name: t.name, music: t.music };
    const name = `music-${i}${extname(t.file)}`;
    copyFileSync(t.file, join(FRAMES, name));
    return { name: t.name, file: name };
  });
  await page.goto(`${BASE}/demo.html?still&format=${format}`, { waitUntil: "networkidle0" });
  await page.addScriptTag({ path: join(ROOT, "node_modules", "mp4-muxer", "build", "mp4-muxer.js") });
  await page.evaluate(
    ({ plan, fps, base, width, height, sounds, musicAt, duration, sampleRate, served }) => {
      // Started here and left running: the recorder asks how far it got, so no
      // single call has to last as long as the encode (up to half an hour).
      window.__enc = { done: null, error: null, progress: 0 };
      window.__mp4s = [];
      void (async () => {
        const codecs = ["avc1.640028", "avc1.4d0028", "avc1.42002a"];
        let config = null;
        for (const codec of codecs) {
          const c = { codec, width, height, bitrate: 6_000_000, framerate: fps };
          if ((await VideoEncoder.isConfigSupported(c)).supported) {
            config = c;
            break;
          }
        }
        if (!config) throw new Error("this browser cannot encode H.264");
        const audioConfig = { codec: "mp4a.40.2", sampleRate, numberOfChannels: 2, bitrate: 192_000 };
        if (!(await AudioEncoder.isConfigSupported(audioConfig)).supported) throw new Error("this browser cannot encode AAC");
        let failure = null;

        // The picture, once: its chunks are kept for every file.
        const video = [];
        const encoder = new VideoEncoder({ output: (chunk, meta) => video.push({ chunk, meta }), error: (e) => (failure = e) });
        encoder.configure(config);
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        let current = "";
        for (let i = 0; i < plan.length; i++) {
          if (plan[i] !== current) {
            current = plan[i];
            const blob = await (await fetch(`${base}/demo-frames/${current}`)).blob();
            const bitmap = await createImageBitmap(blob);
            ctx.drawImage(bitmap, 0, 0, width, height);
            bitmap.close();
          }
          const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
          encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
          frame.close();
          window.__enc.progress = (i + 1) / plan.length;
          // Keep the encoder queue short so memory stays flat.
          while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
          if (failure) throw failure;
        }
        await encoder.flush();

        // Then, per tune: the whole soundtrack rendered offline, in AAC, and the file.
        const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
        for (const t of served) {
          const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: { codec: "avc", width, height },
            audio: { codec: "aac", numberOfChannels: 2, sampleRate },
            fastStart: "in-memory",
          });
          const tune = t.file ? await (await fetch(`${base}/demo-frames/${t.file}`)).arrayBuffer() : t.music;
          const track = await window.__renderSoundtrack(sounds, musicAt, duration, sampleRate, tune);
          const audio = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) });
          audio.configure(audioConfig);
          const left = track.getChannelData(0);
          const right = track.getChannelData(1);
          const BLOCK = 4096;
          for (let off = 0; off < track.length; off += BLOCK) {
            const n = Math.min(BLOCK, track.length - off);
            const data = new Float32Array(n * 2);
            data.set(left.subarray(off, off + n), 0);
            data.set(right.subarray(off, off + n), n);
            const chunk = new AudioData({ format: "f32-planar", sampleRate, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off / sampleRate) * 1e6), data });
            audio.encode(chunk);
            chunk.close();
            if (failure) throw failure;
          }
          await audio.flush();
          for (const v of video) muxer.addVideoChunk(v.chunk, v.meta);
          muxer.finalize();
          window.__mp4s.push(new Uint8Array(muxer.target.buffer));
        }
        window.__enc.done = window.__mp4s.map((m) => m.length);
      })().catch((e) => (window.__enc.error = String(e?.message ?? e)));
    },
    { plan, fps: FPS, base: BASE, width, height, sounds, musicAt: musicAt - t0, duration, sampleRate: SAMPLE_RATE, served },
  );
  process.stdout.write("Encoding");
  let sizes = [];
  for (let shown = 0; ; ) {
    await new Promise((r) => setTimeout(r, 5000));
    const enc = await page.evaluate(() => window.__enc);
    if (enc.error) throw new Error(`encoding failed: ${enc.error}`);
    if (enc.done != null) {
      sizes = enc.done;
      break;
    }
    const pct = Math.floor(enc.progress * 10);
    for (; shown < pct; shown++) process.stdout.write(` ${(shown + 1) * 10}%`);
  }
  console.log(" done.");

  // ── 4. Bring each file back in chunks ──────────────────────────────────────
  for (const [k, size] of sizes.entries()) {
    const file = tunes.length === 1 ? join(ROOT, "release", out) : join(ROOT, "release", out.replace(/\.mp4$/, `-${tunes[k].name}.mp4`));
    const parts = [];
    const CHUNK = 4 * 1024 * 1024;
    for (let off = 0; off < size; off += CHUNK) {
      const b64 = await page.evaluate(
        ({ k, off, len }) => {
          const bytes = window.__mp4s[k].subarray(off, off + len);
          let s = "";
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        },
        { k, off, len: CHUNK },
      );
      parts.push(Buffer.from(b64, "base64"));
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.concat(parts));
    console.log(`Done: ${file} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }
  await page.close();
}
