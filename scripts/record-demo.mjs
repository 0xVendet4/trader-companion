// Records /demo.html into an MP4 (1920×1080, 30 fps, no audio).
//
//   npm run dev                      (in another terminal)
//   node scripts/record-demo.mjs     → release/trader-companion-demo.mp4
//
// No ffmpeg needed: a headless Microsoft Edge plays the demo while Chrome
// DevTools' screencast hands us every frame, then the same browser encodes
// them to H.264 with WebCodecs and mp4-muxer packs the file.

import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.DEMO_URL ?? "http://localhost:1420";
const OUT = join(ROOT, "release", "trader-companion-demo.mp4");
const FRAMES = join(ROOT, "demo-frames");
const FPS = 30;
const SCALE = 1.5; // 1280×720 stage → 1920×1080 video

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
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: SCALE },
});

try {
  const page = await browser.newPage();
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

  await page.goto(`${BASE}/demo.html?autoplay`, { waitUntil: "networkidle0" });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: 1280 * SCALE,
    maxHeight: 720 * SCALE,
    everyNthFrame: 1,
  });
  process.stdout.write("Recording the demo");
  const ticker = setInterval(() => process.stdout.write("."), 2000);
  await page.waitForFunction("window.__demoDone === true", { timeout: 180_000, polling: 250 });
  clearInterval(ticker);
  await cdp.send("Page.stopScreencast");
  console.log(` ${frames.length} frames captured.`);
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
  console.log(`${duration.toFixed(1)} s → ${plan.length} frames at ${FPS} fps.`);

  // ── 3. Encode in the browser (WebCodecs + mp4-muxer) ───────────────────────
  // A localhost page is a secure context, which WebCodecs needs. `?still`
  // keeps the demo script from running underneath.
  await page.goto(`${BASE}/demo.html?still`, { waitUntil: "networkidle0" });
  await page.addScriptTag({ path: join(ROOT, "node_modules", "mp4-muxer", "build", "mp4-muxer.js") });
  const size = await page.evaluate(
    async ({ plan, fps, base }) => {
      const width = 1920;
      const height = 1080;
      const codecs = ["avc1.640028", "avc1.4d0028", "avc1.42002a"];
      let config = null;
      for (const codec of codecs) {
        const c = { codec, width, height, bitrate: 10_000_000, framerate: fps };
        if ((await VideoEncoder.isConfigSupported(c)).supported) {
          config = c;
          break;
        }
      }
      if (!config) throw new Error("this browser cannot encode H.264");

      const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: "avc", width, height },
        fastStart: "in-memory",
      });
      let failure = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => (failure = e),
      });
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
        // Keep the encoder queue short so memory stays flat.
        while (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
        if (failure) throw failure;
      }
      await encoder.flush();
      muxer.finalize();
      window.__mp4 = new Uint8Array(muxer.target.buffer);
      return window.__mp4.length;
    },
    { plan, fps: FPS, base: BASE },
  );

  // ── 4. Bring the file back in chunks ───────────────────────────────────────
  const parts = [];
  const CHUNK = 4 * 1024 * 1024;
  for (let off = 0; off < size; off += CHUNK) {
    const b64 = await page.evaluate(
      ({ off, len }) => {
        const bytes = window.__mp4.subarray(off, off + len);
        let s = "";
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      },
      { off, len: CHUNK },
    );
    parts.push(Buffer.from(b64, "base64"));
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.concat(parts));
  console.log(`Done: ${OUT} (${(size / 1024 / 1024).toFixed(1)} MB)`);
} finally {
  await browser.close();
  rmSync(FRAMES, { recursive: true, force: true });
}
