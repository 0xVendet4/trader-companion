// The presentation demo: the real island, fed by a scripted market instead of
// DexScreener, with captions and a fake cursor. Open /demo.html with `npm run
// dev`, or turn it into a video with scripts/record-demo.mjs (which opens it
// with ?autoplay).
//
// Every token here is fictional, so no real coin is shown making moves it
// never made.

import "../style.css";
import "./demo.css";
import { Companion } from "../companion";
import { FULL_NAME, MASCOT_NAME } from "../core/brand";
import { Sound } from "../core/sound";
import { State, normalizeSettings, type Quote, type WatchToken } from "../core/state";
import { Island } from "../island/island";
import { loadManifest } from "../mascot/mascot";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

// ── Fictional market ──────────────────────────────────────────────────────────

function avatar(letter: string, bg: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='${bg}'/><text x='20' y='26' font-family='Segoe UI,Arial' font-size='18' font-weight='700' fill='white' text-anchor='middle'>${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TOKENS: WatchToken[] = [
  { key: "DemoCandLe1111111111111111111111111111111111", chainId: "solana", address: "DemoCandLe1111111111111111111111111111111111", symbol: "CANDLE", name: "Candle Cat", pairAddress: "DemoPairCandLe11111111111111111111111111111", dexId: "pumpswap", imageUrl: avatar("C", "#16a34a") },
  { key: "DemoFroGe11111111111111111111111111111111111", chainId: "solana", address: "DemoFroGe11111111111111111111111111111111111", symbol: "FROGE", name: "Froge", pairAddress: "DemoPairFroGe111111111111111111111111111111", dexId: "raydium", imageUrl: avatar("F", "#0ea5e9") },
  { key: "DemoWiCk111111111111111111111111111111111111", chainId: "solana", address: "DemoWiCk111111111111111111111111111111111111", symbol: "WICK", name: "Wick", pairAddress: "DemoPairWiCk1111111111111111111111111111111", dexId: "pumpswap", imageUrl: avatar("W", "#a855f7") },
  { key: "DemoSPaRK11111111111111111111111111111111111", chainId: "solana", address: "DemoSPaRK11111111111111111111111111111111111", symbol: "SPARK", name: "Spark", pairAddress: "DemoPairSPaRK111111111111111111111111111111", dexId: "meteora", imageUrl: avatar("S", "#f59e0b") },
];

interface Live {
  price: number;
  supply: number;
  liq: number;
  m5: number;
  h1: number;
  h24: number;
}

const live: Record<string, Live> = {
  CANDLE: { price: 0.004213, supply: 1e9, liq: 182_000, m5: 1.2, h1: 6.4, h24: 41.8 },
  FROGE: { price: 0.01874, supply: 1e9, liq: 640_000, m5: -0.6, h1: -2.1, h24: 12.5 },
  WICK: { price: 0.000918, supply: 1e9, liq: 96_000, m5: 2.4, h1: 11.2, h24: -18.3 },
  SPARK: { price: 0.0612, supply: 1e9, liq: 1_250_000, m5: 0.3, h1: 1.8, h24: 4.2 },
};

function quotes(): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  for (const t of TOKENS) {
    const l = live[t.symbol];
    out[t.address] = {
      address: t.address,
      pairAddress: t.pairAddress,
      priceUsd: l.price,
      marketCap: l.price * l.supply,
      liquidityUsd: l.liq,
      change: { m5: l.m5, h1: l.h1, h6: 0, h24: l.h24 },
      volume: { m5: 25_000, h1: 300_000, h6: 900_000, h24: 2_000_000 },
      txnsM5: { buys: 80, sells: 60 },
      updatedAt: Date.now(),
    };
  }
  return out;
}

/** Small random drift, so the numbers look alive between scripted moves. */
function drift() {
  for (const l of Object.values(live)) {
    const step = (Math.random() - 0.5) * 0.006;
    l.price *= 1 + step;
    l.m5 = Math.round((l.m5 + step * 100) * 10) / 10;
    l.liq *= 1 + (Math.random() - 0.5) * 0.002;
  }
}

// ── Chart ─────────────────────────────────────────────────────────────────────

type Candle = { o: number; h: number; l: number; c: number };
const candles: Candle[] = [];

function seedChart() {
  candles.length = 0;
  let p = 100;
  for (let i = 0; i < 70; i++) {
    const o = p;
    const c = o * (1 + (Math.random() - 0.46) * 0.04);
    candles.push({ o, c, h: Math.max(o, c) * (1 + Math.random() * 0.015), l: Math.min(o, c) * (1 - Math.random() * 0.015) });
    p = c;
  }
}

function pushCandle(changePct: number) {
  const o = candles[candles.length - 1].c;
  const c = o * (1 + changePct / 100);
  candles.push({ o, c, h: Math.max(o, c) * 1.01, l: Math.min(o, c) * 0.99 });
  if (candles.length > 70) candles.shift();
  drawChart();
}

function drawChart() {
  const svg = $<HTMLElement>("#chart");
  const W = 1000;
  const H = 470;
  const hi = Math.max(...candles.map((c) => c.h));
  const lo = Math.min(...candles.map((c) => c.l));
  const y = (v: number) => 20 + (1 - (v - lo) / (hi - lo)) * (H - 40);
  const w = W / candles.length;
  let out = "";
  for (let i = 1; i < 5; i++) out += `<line x1="0" x2="${W}" y1="${(H / 5) * i}" y2="${(H / 5) * i}" stroke="rgba(255,255,255,0.04)"/>`;
  candles.forEach((c, i) => {
    const x = i * w + w / 2;
    const color = c.c >= c.o ? "#22c55e" : "#ef4444";
    out += `<line x1="${x}" x2="${x}" y1="${y(c.h)}" y2="${y(c.l)}" stroke="${color}" stroke-width="1.5"/>`;
    const top = y(Math.max(c.o, c.c));
    const bh = Math.max(2, Math.abs(y(c.o) - y(c.c)));
    out += `<rect x="${x - w * 0.32}" y="${top}" width="${w * 0.64}" height="${bh}" fill="${color}" rx="1"/>`;
  });
  svg.innerHTML = out;
}

// ── Captions, cursor, cards ───────────────────────────────────────────────────

const caption = (html: string | null) => {
  const el = $<HTMLElement>("#demo-caption");
  if (!html) {
    el.classList.remove("on");
    return;
  }
  el.innerHTML = html;
  el.classList.add("on");
};

const card = (html: string | null) => {
  const el = $<HTMLElement>("#demo-card");
  if (html) el.innerHTML = html;
  el.classList.toggle("on", html != null);
};

const ROOT_LEFT = (1280 - 720) / 2;
const params = new URLSearchParams(location.search);
const AUTOPLAY = params.has("autoplay");
let island: Island;
let scale = 1;

/** Fits the 1280×720 stage into the window, letterboxed. */
function fit() {
  const stage = $<HTMLElement>("#stage");
  scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  const x = (window.innerWidth - 1280 * scale) / 2;
  const y = (window.innerHeight - 720 * scale) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
const cursor = { x: 900, y: 700 };

async function moveTo(x: number, y: number, ms = 700) {
  const el = $<HTMLElement>("#demo-cursor");
  el.style.opacity = "1";
  el.style.transitionDuration = `${ms}ms`;
  el.style.transform = `translate(${x}px, ${y}px)`;
  cursor.x = x;
  cursor.y = y;
  await wait(ms);
  island.onCursor(x - ROOT_LEFT, y);
}

/** Moves the cursor onto an element (stage coordinates) and clicks it. */
async function clickEl(el: Element | null, ms = 600) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const stage = $<HTMLElement>("#stage").getBoundingClientRect();
  // Page pixels → stage pixels: the stage may be scaled to fit the window.
  await moveTo((r.left - stage.left + r.width / 2) / scale, (r.top - stage.top + r.height / 2) / scale, ms);
  const c = $<HTMLElement>("#demo-cursor");
  c.classList.add("press");
  await wait(120);
  c.classList.remove("press");
  (el as HTMLElement).click();
}

async function type(input: HTMLInputElement, text: string) {
  input.value = "";
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new Event("input"));
    await wait(110);
  }
}

function button(scope: string, label: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find((b) => b.textContent?.trim() === label) ?? null;
}

// ── Script ────────────────────────────────────────────────────────────────────

const TITLE = `<img src="/mascot/still/idle.svg" alt=""><h1>${FULL_NAME}</h1><p>A tiny friend that watches your memecoins</p>`;

async function run() {
  // Scene 1 — title card (a visitor already saw it with the play button).
  if (AUTOPLAY) {
    card(TITLE);
    await wait(2800);
  }
  card(null);
  await wait(500);

  // Scene 2 — the greeting.
  island.launch();
  caption(`Meet <em>${MASCOT_NAME}</em>. It lives at the top of your screen.`);
  await wait(3600);

  // Scene 3 — the compact ticker.
  caption("A live ticker of your watchlist, always in view");
  await wait(4200);

  // Scene 4 — hover and open the watchlist.
  caption("Hover to open: market cap, price, 5m · 1h · 24h");
  await moveTo(ROOT_LEFT + 360, 16, 900);
  island.fsm.click();
  await wait(3600);

  // Scene 5 — create an alert.
  caption("Alerts on price, market cap, % moves and liquidity");
  await clickEl(button("#header", "Alerts"));
  await wait(700);
  const selects = document.querySelectorAll<HTMLSelectElement>(".alert-form select");
  selects[0].value = TOKENS[0].address;
  selects[0].dispatchEvent(new Event("change"));
  selects[1].value = "pctUp";
  selects[1].dispatchEvent(new Event("change"));
  await wait(400);
  const value = document.querySelector<HTMLInputElement>(".alert-form input")!;
  await clickEl(value, 500);
  await type(value, "30");
  await clickEl(button(".alert-form", "Create"), 500);
  await wait(1600);

  // Scene 6 — walk away; the island folds back into the ticker.
  caption(null);
  island.fsm.homeToPetitDelay = 1.5;
  await moveTo(820, 520, 900);
  await wait(2600);

  // Scene 7 — CANDLE pumps. Alert cards stay up long enough to read.
  island.fsm.homeToPetitDelay = 8;
  caption("It tells you the moment something moves");
  for (const step of [6, 9, 8, 7]) {
    pushCandle(step);
    live.CANDLE.price *= 1 + step / 100;
    await wait(250);
  }
  live.CANDLE.m5 = 34.2;
  live.CANDLE.h1 = 48.9;
  Companion.feed(quotes());
  await wait(3800);
  await clickEl(button(".view.event", "OK"));
  await wait(900);

  // Scene 8 — liquidity gets pulled on FROGE.
  caption("…and when liquidity suddenly gets pulled");
  document.querySelector("#chart-title")!.textContent = "FROGE / SOL · 1m";
  seedChart();
  drawChart();
  await wait(900);
  pushCandle(-38);
  live.FROGE.liq = 220_000;
  live.FROGE.price *= 0.62;
  live.FROGE.m5 = -38.4;
  Companion.feed(quotes());
  await wait(3800);
  await clickEl(button(".view.event", "OK"));
  await wait(900);

  // Scene 9 — discipline: log a loss, get a cooldown.
  caption("Discipline: your own loss limit, cooldowns and breaks");
  await moveTo(ROOT_LEFT + 360, 16, 700);
  island.fsm.click();
  await wait(600);
  await clickEl(button("#header", "Discipline"));
  await wait(900);
  const amount = document.querySelector<HTMLInputElement>(".log-bar input")!;
  await clickEl(amount, 500);
  await type(amount, "1.2");
  await clickEl(button(".log-bar", "− Loss"), 500);
  await wait(3600);
  await clickEl(button(".view.event", "Got it"));
  await wait(700);

  // Scene 10 — a break reminder.
  Companion.raise({ kind: "break", id: "demo-break", minutes: 90 });
  await wait(3400);
  await clickEl(button(".view.event", "Took a break"));
  caption(null);
  await moveTo(820, 560, 700);
  await wait(1200);

  // Scene 11 — end card.
  card(
    `<img src="/mascot/still/happy.svg" alt=""><h1>${FULL_NAME}</h1><p>Only public market data. Never your wallet, never your keys.</p><p class="small">for Windows · not financial advice</p>` +
      (AUTOPLAY ? "" : `<button class="play ghost" type="button">↻ Watch again</button>`),
  );
  document.querySelector("#demo-card .play")?.addEventListener("click", () => location.reload());
  await wait(4500);
  (window as unknown as { __demoDone: boolean }).__demoDone = true;
}

async function main() {
  const root = document.getElementById("root");
  if (!root) return;
  Sound.setEnabled(false);
  Companion.persist = false;

  const settings = normalizeSettings(null);
  settings.autoCloseInterval = 2.5;
  // Browsers only allow sound after a click: it is switched on by the play button.
  settings.soundEnabled = false;
  settings.companion.watchlist = TOKENS;
  settings.companion.discipline.dailyLossLimit = 3;
  settings.companion.log = { day: "", entries: [] };
  // A liquidity rule set up earlier, so scene 8 has something to fire.
  settings.companion.alerts = [
    { id: "demo-liq", address: TOKENS[1].address, kind: "liqDrop", value: 50, windowMin: 10, enabled: true },
  ];
  State.settings = settings;

  fit();
  window.addEventListener("resize", fit);
  island = new Island(root, { followMouse: false });
  island.useArt(await loadManifest());
  island.applySettings();
  Companion.onEvent = (e) => island.showEvent(e);
  Companion.onFeeling = (state, line) => island.feel(state, line);
  Companion.recordTrade(0.8);
  State.events.length = 0;

  seedChart();
  drawChart();
  Companion.feed(quotes());
  window.setInterval(() => {
    drift();
    Companion.feed(quotes());
    if (Math.random() < 0.5) pushCandle((Math.random() - 0.45) * 3);
  }, 1800);

  // ?still freezes the page (the recorder encodes on it); ?autoplay starts at
  // once, silently; otherwise a visitor presses play, which also unlocks sound.
  if (params.has("still")) return;
  if (AUTOPLAY) {
    void run();
    return;
  }
  card(TITLE + `<button class="play" type="button">▶ Watch the demo</button>`);
  document.querySelector("#demo-card .play")?.addEventListener("click", () => {
    State.settings.soundEnabled = true;
    Sound.setEnabled(true);
    Sound.setVolume(0.12);
    Sound.resume();
    void run();
  });
}

void main();
