// The README's pictures, taken from the demo (fictional tokens, the real
// island): npm run dev in another terminal, then
//
//   npm run screenshots     → docs/images/*.webp (and share.png, the recap card itself)
//
// Each still is set up by the demo page itself (`still` in src/demo/demo.ts);
// a headless Microsoft Edge takes it at twice the size, for sharp screens.

import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.DEMO_URL ?? "http://localhost:1420";
const OUT = join(ROOT, "docs", "images");

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
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--hide-scrollbars"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  page.on("console", (m) => (m.type() === "warn" || m.type() === "error") && console.log(`  page ${m.type()}: ${m.text()}`));
  await page.goto(`${BASE}/demo.html?stills&format=horizontal`, { waitUntil: "networkidle0" });
  await page.waitForFunction("Array.isArray(window.__demoStills)");
  // Let the market tick a few times, so the charts have lines.
  await new Promise((r) => setTimeout(r, 6000));
  const names = await page.evaluate(() => window.__demoStills);
  for (const name of names) {
    const shot = await page.evaluate((n) => window.__demoStill(n), name);
    if (shot.png) {
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(shot.png, "base64"));
      console.log(`  ${name}.png`);
      continue;
    }
    const clip = { x: Math.max(0, shot.clip.x), y: Math.max(0, shot.clip.y), width: shot.clip.width, height: shot.clip.height };
    await page.screenshot({ path: join(OUT, `${name}.webp`), type: "webp", quality: 90, clip });
    console.log(`  ${name}.webp`);
  }
} finally {
  await browser.close();
}
