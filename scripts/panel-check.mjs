// Settings and the Closet open inside the island's page (Island.openPanel):
// once closed, nothing of them may keep running there (CLAUDE.md: 0% CPU
// while the island is hidden). With `npm run dev` running:
//
//   npm run panel-check     (BROWSER_PATH: a Chromium browser; DEMO_URL: the dev server)
//
// It counts animation frames and live intervals over a few seconds with the
// island minimized, then opens and closes each panel a few times and counts
// again: more than before is a leak, and the check fails.

import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const BASE = process.env.DEMO_URL ?? "http://localhost:1420";
const executablePath = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!executablePath) {
  console.error("No Edge or Chrome found. Set BROWSER_PATH to a Chromium browser.");
  process.exit(1);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  page.on("pageerror", (e) => console.log(`  page error: ${e.message}`));
  // Every frame callback run, and every interval still set.
  await page.evaluateOnNewDocument(() => {
    const w = window;
    w.__frames = 0;
    w.__intervals = new Set();
    const raf = w.requestAnimationFrame.bind(w);
    w.requestAnimationFrame = (fn) => raf((t) => {
      w.__frames++;
      fn(t);
    });
    const set = w.setInterval.bind(w);
    const clear = w.clearInterval.bind(w);
    w.setInterval = (fn, ms, ...a) => {
      const id = set(fn, ms, ...a);
      w.__intervals.add(id);
      return id;
    };
    w.clearInterval = (id) => {
      w.__intervals.delete(id);
      clear(id);
    };
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__companion && window.__companion.island");
  await wait(4000);
  const idle = async () => {
    await page.evaluate(() => window.__companion.island.minimize());
    await wait(1500);
    return page.evaluate(async () => {
      const f0 = window.__frames;
      await new Promise((r) => setTimeout(r, 3000));
      return { frames: window.__frames - f0, intervals: window.__intervals.size };
    });
  };
  const before = await idle();
  console.log(`  minimized, before: ${before.frames} frames in 3 s, ${before.intervals} intervals`);
  for (let i = 0; i < 3; i++) {
    for (const kind of ["settings", "closet"]) {
      await page.evaluate((k) => window.__companion.island.openPanel(k), kind);
      await wait(1800);
      // Down to the mascot gallery and back: its Candies move while seen.
      await page.evaluate(() => {
        const p = document.querySelector(".panel-page");
        if (p) p.scrollTop = p.scrollHeight;
      });
      await wait(600);
      await page.evaluate(() => window.__companion.island.closePanel());
      await wait(800);
    }
  }
  const after = await idle();
  console.log(`  minimized, after three of each: ${after.frames} frames in 3 s, ${after.intervals} intervals`);
  if (after.frames > before.frames + 2 || after.intervals > before.intervals) {
    console.error("  Something of a panel keeps running after it closed.");
    failed = true;
  } else console.log("  Nothing of the panels is left running.");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
