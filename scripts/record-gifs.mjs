// The README's GIFs, from the demo's clips (fictional tokens, the real island
// and Candy; see CLIPS in src/demo/demo.ts): npm run dev in another terminal, then
//
//   npm run gifs                 → docs/media/<clip>.gif, every clip
//   npm run gifs -- moods pokes  → just those
//
// No ffmpeg needed: a headless Microsoft Edge plays each clip while Chrome
// DevTools' screencast hands us every frame; a second tab of the same browser
// crops and scales them, picks one palette for the whole clip and encodes the
// GIF with gifenc.

import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.DEMO_URL ?? "http://localhost:1420";
const OUT = join(ROOT, "docs", "media");
const VIEW = { width: 1280, height: 720 };
// Filmed at twice the size, so Candy stays sharp once scaled down.
const DPR = 2;

const executablePath = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
]
  .filter(Boolean)
  .find((p) => existsSync(p));
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

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 10 * 60_000, args: ["--hide-scrollbars"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ ...VIEW, deviceScaleFactor: DPR });
  page.on("console", (m) => (m.type() === "warn" || m.type() === "error") && console.log(`  page ${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => console.log(`  page error: ${e.message}`));
  await page.goto(`${BASE}/demo.html?clips&format=horizontal`, { waitUntil: "networkidle0" });
  await page.waitForFunction("Array.isArray(window.__demoClips)");
  // Let the market tick a few times, so the charts have lines.
  await new Promise((r) => setTimeout(r, 5000));
  const all = await page.evaluate(() => window.__demoClips);
  const asked = process.argv.slice(2).filter((a) => all.includes(a));
  const cdp = await page.createCDPSession();

  // The encoder's tab: same origin as the dev server, which serves gifenc.
  const enc = await browser.newPage();
  await enc.goto(`${BASE}/node_modules/gifenc/package.json`);
  await enc.evaluate(async (url) => {
    window.gifenc = await import(url);
  }, `${BASE}/node_modules/gifenc/dist/gifenc.esm.js`);

  for (const name of asked.length ? asked : all) {
    // The tab that films must be in front: a tab behind draws nothing.
    await page.bringToFront();
    const shot = await page.evaluate((n) => window.__demoClip(n), name);

    // ── Film it ───────────────────────────────────────────────────────────────
    const frames = [];
    const onFrame = (f) => {
      frames.push({ t: f.metadata.timestamp, data: f.data });
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    };
    cdp.on("Page.screencastFrame", onFrame);
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, maxWidth: VIEW.width * DPR, maxHeight: VIEW.height * DPR, everyNthFrame: 1 });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => window.__demoClipPlay());
    await new Promise((r) => setTimeout(r, 250));
    await cdp.send("Page.stopScreencast");
    cdp.off("Page.screencastFrame", onFrame);
    if (frames.length < 2) throw new Error(`${name}: too few frames`);

    // ── A constant frame rate: the last frame shown at each tick ────────────────
    const t0 = frames[0].t;
    const duration = frames[frames.length - 1].t - t0;
    const plan = [];
    let k = 0;
    for (let i = 0; i <= Math.floor(duration * shot.fps); i++) {
      const at = t0 + i / shot.fps;
      while (k + 1 < frames.length && frames[k + 1].t <= at) k++;
      plan.push(k);
    }

    // ── Crop, scale, encode ─────────────────────────────────────────────────────
    await enc.evaluate(
      (opts) => {
        const w = opts.width;
        const h = Math.round((opts.clip.height * w) / opts.clip.width);
        const canvas = new OffscreenCanvas(w, h);
        window.__gif = { opts, w, h, ctx: canvas.getContext("2d", { willReadFrequently: true }), cache: new Map(), order: [] };
      },
      { ...shot, view: VIEW },
    );
    const sent = new Set();
    for (const idx of plan) {
      if (!sent.has(idx)) {
        sent.add(idx);
        await enc.evaluate(
          async (i, b64) => {
            const g = window.__gif;
            const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
            const bmp = await createImageBitmap(blob);
            const s = bmp.width / g.opts.view.width;
            const c = g.opts.clip;
            g.ctx.imageSmoothingQuality = "high";
            g.ctx.drawImage(bmp, c.x * s, c.y * s, c.width * s, c.height * s, 0, 0, g.w, g.h);
            g.cache.set(i, g.ctx.getImageData(0, 0, g.w, g.h).data);
          },
          idx,
          frames[idx].data,
        );
      }
      await enc.evaluate((i) => window.__gif.order.push(i), idx);
    }
    const b64 = await enc.evaluate(() => {
      const { GIFEncoder, quantize, applyPalette } = window.gifenc;
      const g = window.__gif;
      // One palette for the whole clip, from a sample of its frames: no flicker.
      const keys = [...g.cache.keys()];
      const pick = keys.filter((_, i) => i % Math.max(1, Math.floor(keys.length / 12)) === 0);
      const px = g.w * g.h;
      const sample = new Uint8Array(pick.length * Math.ceil(px / 3) * 4);
      let o = 0;
      for (const key of pick) {
        const d = g.cache.get(key);
        for (let p = 0; p < px; p += 3) {
          sample[o++] = d[p * 4];
          sample[o++] = d[p * 4 + 1];
          sample[o++] = d[p * 4 + 2];
          sample[o++] = 255;
        }
      }
      const palette = quantize(sample.subarray(0, o), 256);
      const gif = GIFEncoder();
      const indexed = new Map();
      g.order.forEach((key, i) => {
        if (!indexed.has(key)) indexed.set(key, applyPalette(g.cache.get(key), palette));
        gif.writeFrame(indexed.get(key), g.w, g.h, { palette: i === 0 ? palette : undefined, delay: Math.round(1000 / g.opts.fps) });
      });
      gif.finish();
      const bytes = gif.bytes();
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    const file = join(OUT, `${name}.gif`);
    writeFileSync(file, Buffer.from(b64, "base64"));
    const mb = (Buffer.byteLength(b64, "base64") / 1e6).toFixed(1);
    console.log(`  ${name}.gif  ${duration.toFixed(1)} s, ${plan.length} frames, ${mb} MB`);
  }
} finally {
  await browser.close();
}
