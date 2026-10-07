// The presentation demo: the real island on a fake desktop, fed by a scripted
// market instead of DexScreener, filmed by a moving camera under captions,
// with sound. Open /demo.html with `npm run dev` (?format=vertical for the
// 9:16 cut), or turn it into videos with scripts/record-demo.mjs, which opens
// it with ?record and starts it once it is filming.
//
// Every memecoin here is fictional, so no real coin is shown making moves it
// never made; BTC only shows up as a search result, standing still.

import "../style.css";
import "./demo.css";
import { Companion } from "../companion";
import { FULL_NAME, MASCOT_NAME } from "../core/brand";
import { hotkeyLabel } from "../core/hotkey";
import { Sound, type SoundName } from "../core/sound";
import { DEFAULT_HOTKEY, State, normalizeSettings, type Quote, type Skin, type TrendingItem, type WatchToken } from "../core/state";
import { todayKey } from "../discipline/discipline";
import { Island } from "../island/island";
import { tokenKey } from "../market/chains";
import { Mascot, accessory, loadManifest, type Manifest, type MascotState } from "../mascot/mascot";
import { skinFilter } from "../mascot/skins";
import { liveAudio, renderSoundtrack, type FxName } from "./soundtrack";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

const params = new URLSearchParams(location.search);
const RECORD = params.has("record");
const AUTOPLAY = RECORD || params.has("autoplay");
/** 9:16 for TikTok, Reels and Shorts; a phone held upright gets it too. */
const VERTICAL = params.get("format") === "vertical" || (!params.has("format") && window.innerHeight > window.innerWidth);
const STAGE = VERTICAL ? { w: 720, h: 1280 } : { w: 1280, h: 720 };
/** About how long a run lasts, for the live soundtrack. */
const DURATION_S = 72;

// ── Sound: everything heard is logged, so the recorder can render it ─────────

interface CueLog {
  t: number;
  sound?: SoundName;
  fx?: FxName;
}
const cues: CueLog[] = [];
const clock = () => Date.now() / 1000;
let live: { fx(name: FxName): void } | null = null;

function fx(name: FxName) {
  cues.push({ t: clock(), fx: name });
  live?.fx(name);
}

// The island's own sounds go through Sound.play: log them too.
const playSound = Sound.play.bind(Sound);
Sound.play = (name: SoundName) => {
  cues.push({ t: clock(), sound: name });
  playSound(name);
};

Object.assign(window, { __demoCues: cues, __renderSoundtrack: renderSoundtrack });

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
const [CANDLE, FROGE, WICK, SPARK] = TOKENS;

interface Live {
  price: number;
  supply: number;
  liq: number;
  m5: number;
  h1: number;
  h24: number;
}

const live$: Record<string, Live> = {
  CANDLE: { price: 0.004213, supply: 1e9, liq: 182_000, m5: 1.2, h1: 6.4, h24: 41.8 },
  FROGE: { price: 0.01874, supply: 1e9, liq: 640_000, m5: -0.6, h1: -2.1, h24: 12.5 },
  WICK: { price: 0.000918, supply: 1e9, liq: 96_000, m5: 2.4, h1: 11.2, h24: -18.3 },
  SPARK: { price: 0.0612, supply: 1e9, liq: 1_250_000, m5: 0.3, h1: 1.8, h24: 4.2 },
};

function quotes(): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  for (const t of TOKENS) {
    const l = live$[t.symbol];
    out[t.address] = {
      address: t.address,
      pairAddress: t.pairAddress,
      priceUsd: l.price,
      marketCap: l.price * l.supply,
      liquidityUsd: l.liq,
      change: { m5: l.m5, h1: l.h1, h6: 0, h24: l.h24 },
      volume: { m5: 25_000, h1: 300_000, h6: 900_000, h24: 2_000_000 },
      txnsM5: { buys: 80, sells: 60 },
      txns: { m5: { buys: 80, sells: 60 }, h1: { buys: 910, sells: 702 }, h6: { buys: 4_100, sells: 3_350 }, h24: { buys: 12_800, sells: 10_400 } },
      updatedAt: Date.now(),
    };
  }
  return out;
}

/** Small random drift, so the numbers look alive between scripted moves. */
function drift() {
  for (const l of Object.values(live$)) {
    const step = (Math.random() - 0.5) * 0.006;
    l.price *= 1 + step;
    l.m5 = Math.round((l.m5 + step * 100) * 10) / 10;
    l.liq *= 1 + (Math.random() - 0.5) * 0.002;
  }
}

/** What a search for "btc" turns up: the coin itself, then the copycats. */
function btcSearch(): TrendingItem[] {
  const wbtc = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
  const base = (over: Partial<Quote>): Quote => ({
    address: "",
    pairAddress: "",
    priceUsd: 0,
    marketCap: null,
    liquidityUsd: null,
    change: { m5: 0, h1: 0, h6: 0, h24: 0 },
    volume: { m5: 0, h1: 0, h6: 0, h24: 0 },
    txnsM5: { buys: 0, sells: 0 },
    updatedAt: Date.now(),
    ...over,
  });
  const fake = (n: number, name: string, mc: number, liq: number, vol: number, age: number): TrendingItem => {
    const address = `DemoFakeBtc${n}${"1".repeat(33)}`;
    return {
      token: { key: address, chainId: "solana", address, symbol: n === 3 ? "BITCOIN" : "BTC", name, pairAddress: address, dexId: "pumpswap", imageUrl: null },
      quote: base({ address, priceUsd: mc / 1e9, marketCap: mc, liquidityUsd: liq, suspectLiquidity: liq < 1_000, volume: { m5: 0, h1: 0, h6: 0, h24: vol } }),
      boost: 0,
      pairCreatedAt: Date.now() - age * 86_400_000,
    };
  };
  const key = tokenKey("ethereum", wbtc);
  return [
    {
      token: { key, chainId: "ethereum", address: wbtc, symbol: "BTC", name: "Bitcoin", pairAddress: "demo", dexId: "uniswap", imageUrl: avatar("₿", "#f7931a"), coingecko: "bitcoin" },
      quote: base({ address: key, priceUsd: 83_000, marketCap: 1.65e12, volume: { m5: 0, h1: 0, h6: 0, h24: 3.9e10 }, major: true, rank: 1 }),
      boost: 0,
      pairCreatedAt: null,
    },
    fake(1, "Bitcoin", 846e6, 71, 91_600, 4),
    fake(2, "Bitcoin", 776e6, 35, 91_500, 7),
    fake(3, "Bitcoin 2.0", 178_000, 95_000, 78_500, 700),
  ];
}

const WALLET = "DemoWa11et1111111111111111111111111111111111";

/** A wallet that bought CANDLE early, WICK late and SPARK on the way. */
function seedWallet() {
  const c = State.companion;
  const now = Date.now();
  const position = (t: WatchToken, amount: number, multiple: number) => ({
    mint: t.address,
    symbol: t.symbol,
    amounts: { [WALLET]: amount },
    costUsd: (amount * live$[t.symbol].price) / multiple,
    realizedUsd: 0,
    openedAt: now - 5 * 3_600_000,
    fromTracking: false,
    alerted: [],
    historyChecked: true,
    fromHistory: true,
  });
  c.wallets = [{ address: WALLET, label: "Main", mine: true, baselineUsd: 5_200, addedAt: now - 3 * 86_400_000 }];
  c.book = {
    wallets: [WALLET],
    positions: {
      [CANDLE.address]: position(CANDLE, 1_500_000, 2.4),
      [WICK.address]: position(WICK, 2_000_000, 0.82),
      [SPARK.address]: position(SPARK, 30_000, 1.12),
    },
    day: todayKey(),
    realizedToday: 640,
    activity: [],
  };
  State.wallets[WALLET] = { sol: 12.4, holdings: {}, values: {}, totalUsd: 14_850, top: [], checkedAt: now, error: null };
  State.notify();
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

// ── Stage and camera ──────────────────────────────────────────────────────────

let island: Island;
let manifest: Manifest = { name: "", states: {} };
let fit = 1;

/** Fits the stage into the window, letterboxed. */
function fitStage() {
  const stage = $<HTMLElement>("#stage");
  fit = Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h);
  const x = (window.innerWidth - STAGE.w * fit) / 2;
  const y = (window.innerHeight - STAGE.h * fit) / 2;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${fit})`;
}

/** A camera position: the world point (x, y) shown at (sx, sy) on the stage, zoomed `s` times. */
interface Shot {
  x: number;
  y: number;
  s: number;
  sx?: number;
  sy?: number;
  /** A dutch angle, in degrees. */
  r?: number;
}

const SHOTS: Record<"wide" | "ticker" | "island" | "chart" | "left" | "right", Shot> = VERTICAL
  ? {
      wide: { x: 640, y: 360, s: 0.5625, sy: 760 },
      ticker: { x: 640, y: 16, s: 1.9, sy: 470 },
      island: { x: 640, y: 170, s: 1.04, sy: 650 },
      chart: { x: 960, y: 330, s: 1.25, sy: 760 },
      left: { x: 360, y: 360, s: 1.05, sy: 780 },
      right: { x: 920, y: 360, s: 1.05, sy: 780 },
    }
  : {
      wide: { x: 640, y: 360, s: 1 },
      ticker: { x: 640, y: 16, s: 2.5, sy: 140 },
      island: { x: 640, y: 170, s: 1.5, sy: 300 },
      chart: { x: 930, y: 330, s: 1.7 },
      left: { x: 430, y: 360, s: 1.3 },
      right: { x: 850, y: 360, s: 1.3 },
    };

/** Close on the floating island's ticker at (x, y). */
const floatShot = (x: number, y: number, s = VERTICAL ? 1.45 : 1.8): Shot => ({ x, y, s, sy: VERTICAL ? 700 : 330 });

let shot: Shot = SHOTS.wide;
let driftTimer: number | null = null;

function frame(to: Shot, ms: number, ease: string) {
  const world = $<HTMLElement>("#world");
  const sx = to.sx ?? STAGE.w / 2;
  const sy = to.sy ?? STAGE.h / 2;
  world.style.transition = `transform ${ms}ms ${ease}`;
  // The shot's point lands at (sx, sy), whatever the zoom and the angle.
  world.style.transform = `translate(${sx}px, ${sy}px) rotate(${to.r ?? 0}deg) scale(${to.s}) translate(${-to.x}px, ${-to.y}px)`;
}

/**
 * Moves the camera, ease-in-out. Once there it keeps breathing: a slow push
 * in while the scene holds (`drift: false` holds still). Close-ups blur the
 * desktop behind the island; a `whip` blurs the move itself.
 */
function camera(to: Shot, ms = 950, opts: { drift?: boolean; whip?: boolean; ease?: string } = {}) {
  if (driftTimer != null) window.clearTimeout(driftTimer);
  driftTimer = null;
  const travels = Math.abs(to.s - shot.s) > 0.08 || Math.hypot(to.x - shot.x, to.y - shot.y) > 60;
  shot = to;
  frame(to, ms, opts.ease ?? "var(--ease-move)");
  // Depth of field on close-ups of the island, which lives near the top.
  document.body.classList.toggle("dof", to.s >= SHOTS.island.s * 0.95 && to.y < 300);
  if (opts.whip) {
    const world = $<HTMLElement>("#world");
    world.classList.add("whip");
    window.setTimeout(() => world.classList.remove("whip"), ms * 0.75);
  }
  if (travels && ms > 0 && ms < 1500) fx("whoosh");
  if (opts.drift !== false) {
    driftTimer = window.setTimeout(() => {
      driftTimer = null;
      frame({ ...to, s: to.s * 1.045, y: to.y + 4 }, 7000, "cubic-bezier(0.37, 0, 0.63, 1)");
    }, ms + 60);
  }
}

/** A shot centred on an element, zoomed `s` times. */
function focusOn(el: Element | null, s: number, extra: Partial<Shot> = {}): Shot {
  if (!el) return shot;
  const b = inWorld(el);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, s, ...extra };
}

/** A point on the page in world coordinates, wherever the camera is (angle included). */
function toWorld(px: number, py: number): DOMPoint {
  const st = $<HTMLElement>("#stage").getBoundingClientRect();
  const k = st.width / STAGE.w;
  const m = new DOMMatrix(getComputedStyle($("#world")).transform);
  return m.inverse().transformPoint(new DOMPoint((px - st.left) / k, (py - st.top) / k));
}

/** An element's box in world coordinates (its centre exact; its size, close enough on an angle). */
function inWorld(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  const st = $<HTMLElement>("#stage").getBoundingClientRect();
  const m = new DOMMatrix(getComputedStyle($("#world")).transform);
  const k = (st.width / STAGE.w) * Math.hypot(m.a, m.b);
  const w = r.width / k;
  const h = r.height / k;
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/** Rings around what the caption talks about. */
function mark(els: (Element | null)[], ms = 1900) {
  for (const el of els) {
    if (!el) continue;
    const b = inWorld(el);
    const ring = document.createElement("div");
    ring.className = "mark";
    Object.assign(ring.style, { left: `${b.x - 6}px`, top: `${b.y - 4}px`, width: `${b.w + 12}px`, height: `${b.h + 8}px`, animationDuration: `${ms}ms` });
    $("#world-fx").append(ring);
    window.setTimeout(() => ring.remove(), ms + 50);
  }
}

/** Cinema bars, top and bottom, for the opening and the end. */
function bars(on: boolean) {
  $("#bars").classList.toggle("on", on);
}

/** An element's box on the stage (where the overlay effects draw). */
function onStage(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  const s = $<HTMLElement>("#stage").getBoundingClientRect();
  const k = s.width / STAGE.w;
  return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
}

// ── Cursor ────────────────────────────────────────────────────────────────────

const cursor = { x: 1060, y: 660 };
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** Runs `step` every frame for `ms`, with an ease-in-out progress. */
function tween(ms: number, step: (e: number) => void): Promise<void> {
  const t0 = performance.now();
  return new Promise((done) => {
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      step(easeInOut(k));
      if (k < 1) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}

/** Where a floating island was dragged to, from where it was put down. */
const dragged = { x: 0, y: 0 };

/** Tells the island where the cursor is: hover, and the mascot's eyes follow it. */
function feelCursor() {
  const root = $<HTMLElement>("#root");
  island.onCursor(cursor.x - root.offsetLeft - dragged.x, cursor.y - root.offsetTop - dragged.y);
}

function placeCursor() {
  $<HTMLElement>("#demo-cursor").style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
  feelCursor();
}

async function moveTo(x: number, y: number, ms = 650) {
  $<HTMLElement>("#demo-cursor").style.opacity = "1";
  const from = { ...cursor };
  await tween(ms, (e) => {
    cursor.x = from.x + (x - from.x) * e;
    cursor.y = from.y + (y - from.y) * e;
    placeCursor();
  });
}

/** A press where the cursor is: it dips, a ring spreads, a tick. */
async function press() {
  const c = $<HTMLElement>("#demo-cursor");
  c.classList.add("press");
  const ring = document.createElement("div");
  ring.className = "ripple";
  ring.style.left = `${cursor.x + 4}px`;
  ring.style.top = `${cursor.y + 3}px`;
  $("#world-fx").append(ring);
  window.setTimeout(() => ring.remove(), 500);
  fx("tick");
  await wait(110);
  c.classList.remove("press");
}

/** Moves onto an element and clicks it (`click: false` only presses: the scene does the rest). */
async function click(el: Element | null, opts: { ms?: number; click?: boolean } = {}) {
  if (!el) {
    console.warn("demo: nothing to click");
    return;
  }
  const b = inWorld(el);
  await moveTo(b.x + b.w / 2, b.y + b.h / 2, opts.ms ?? 600);
  await press();
  if (opts.click !== false) (el as HTMLElement).click();
}

async function type(input: HTMLInputElement, text: string) {
  input.value = "";
  for (const ch of text) {
    input.value += ch;
    input.dispatchEvent(new Event("input"));
    fx("key");
    await wait(95);
  }
}

function button(scope: string, label: string): HTMLElement | null {
  const b = [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find((x) => x.textContent?.trim() === label) ?? null;
  if (!b) console.warn(`demo: no "${label}" button in ${scope}`);
  return b;
}

function titled(title: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`#island [title="${title}"]`);
  if (!el) console.warn(`demo: nothing titled "${title}"`);
  return el;
}

function choose(sel: HTMLSelectElement, value: string) {
  sel.value = value;
  sel.dispatchEvent(new Event("change"));
}

/** Opens the island from its ticker, the way a hand would. */
async function openIsland() {
  if (State.mode === "expanded") return;
  const pill = inWorld($("#island"));
  await moveTo(pill.x + pill.w / 2, pill.y + pill.h / 2, 650);
  await press();
  island.fsm.click();
  await wait(420);
}

// ── Captions, cards, effects ──────────────────────────────────────────────────

/** A caption; *starred words* are green. Each word rises in after the last. */
async function say(text: string | null) {
  const el = $<HTMLElement>("#demo-caption");
  if (el.classList.contains("on")) {
    el.classList.remove("on");
    await wait(180);
  }
  if (!text) return;
  el.replaceChildren();
  let em = false;
  text.split(" ").forEach((raw, i) => {
    const opens = raw.startsWith("*");
    const word = raw.replace(/\*/g, "");
    if (opens) em = true;
    const span = document.createElement("span");
    span.className = em ? "w em" : "w";
    span.style.setProperty("--i", String(Math.min(i, 12)));
    span.textContent = word;
    if (i > 0) el.append(" ");
    el.append(span);
    if (raw.endsWith("*") && raw.length > 1) em = false;
  });
  void el.offsetWidth;
  el.classList.add("on");
}

/** A glow around the frame: green for a win, red for a scare. */
function vignette(tone: "red" | "green", ms = 1100) {
  const el = $<HTMLElement>("#vignette");
  el.style.setProperty("--tone", tone === "red" ? "rgba(239, 68, 68, 0.55)" : "rgba(74, 222, 128, 0.45)");
  el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: ms, easing: "ease-out" });
}

/** The camera kicks: a squeeze, a burst, a settle. */
function punch() {
  $("#punch").animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(0.985)", offset: 0.15 },
      { transform: "scale(1.04)", offset: 0.45 },
      { transform: "scale(1)" },
    ],
    { duration: 700, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  );
}

/** The camera shakes, short and sharp. */
function shake() {
  const k = [0, -9, 8, -6, 5, -3, 2, 0];
  $("#punch").animate(
    k.map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 3 : -3}px)` })),
    { duration: 420, easing: "linear" },
  );
}

/** Confetti bursting from the island, in Candy's colours. */
function confetti() {
  const from = onStage($("#island"));
  const cx = from.x + from.w * 0.18;
  const cy = from.y + from.h * 0.45;
  const colours = ["#4ade80", "#22c55e", "#facc15", "#ffffff", "#38bdf8", "#f472b6"];
  for (let i = 0; i < 54; i++) {
    const p = document.createElement("i");
    p.className = "confetti";
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.background = colours[i % colours.length];
    $("#fx").append(p);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const power = 260 + Math.random() * 360;
    const dx = Math.cos(angle) * power;
    const dy = Math.sin(angle) * power;
    const spin = (Math.random() - 0.5) * 900;
    p.animate(
      [
        { transform: "translate(0, 0) rotate(0) scale(0.6)", opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) rotate(${spin * 0.5}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy + 420}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
      ],
      { duration: 1500 + Math.random() * 500, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
    ).onfinish = () => p.remove();
  }
}

/** The show/hide shortcut, pressed on screen. */
async function pressKeys() {
  const el = $<HTMLElement>("#demo-keys");
  el.replaceChildren();
  hotkeyLabel(DEFAULT_HOTKEY)
    .split(/\s*\+\s*/)
    .forEach((k, i) => {
      if (i > 0) el.append("+");
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      el.append(kbd);
    });
  el.classList.add("on");
  await wait(650);
  el.classList.add("down");
  fx("key");
  await wait(160);
  island.toggle();
  fx("rise");
  el.classList.remove("down");
  await wait(900);
  el.classList.remove("on");
}

/** A live Candy for the cards. */
function heroMascot(state: MascotState): { el: HTMLElement; mascot: Mascot } {
  const hero = document.createElement("div");
  hero.className = "hero";
  const mascot = new Mascot("mascot");
  mascot.use(manifest);
  mascot.setMood(state);
  hero.append(mascot.el);
  return { el: hero, mascot };
}

function card(pieces: (HTMLElement | string)[], extra?: HTMLElement) {
  const el = $<HTMLElement>("#demo-card");
  el.replaceChildren();
  pieces.forEach((p, i) => {
    const node = typeof p === "string" ? Object.assign(document.createElement("div"), { innerHTML: p }).firstElementChild! : p;
    (node as HTMLElement).style.setProperty("--i", String(i));
    el.append(node);
  });
  if (extra) el.append(extra);
  void el.offsetWidth;
  el.classList.add("on");
}

function titleCard(extra?: HTMLElement) {
  const { el, mascot } = heroMascot("happy");
  card([el, `<h1>${FULL_NAME}</h1>`, `<p>A tiny friend that watches your memecoins</p>`], extra);
  window.setTimeout(() => mascot.react("wave", 2400), 500);
}

/** The end card tries a few looks on, a beat apart, and keeps the last one. */
const LOOKS: { hat: string; face: string; skin: Skin; state: MascotState }[] = [
  { hat: "crown", face: "shades", skin: "mint", state: "cool" },
  { hat: "party", face: "heartglasses", skin: "rose", state: "love" },
  { hat: "headphones", face: "pixel", skin: "sky", state: "wave" },
];

function endCard() {
  const { el, mascot } = heroMascot("happy");
  card([
    el,
    `<h1>${FULL_NAME}</h1>`,
    `<p>Free and open source · Windows and Linux</p>`,
    `<div class="url">github.com/0xVendet4/trader-companion</div>`,
    `<p class="small">not financial advice</p>`,
  ]);
  LOOKS.forEach((look, i) =>
    window.setTimeout(() => {
      mascot.setOutfit(accessory(manifest, "outfits", look.hat));
      mascot.setFace(accessory(manifest, "faces", look.face));
      mascot.setFilter(skinFilter(look.skin, State.companion.customSkin));
      mascot.react(look.state, i === LOOKS.length - 1 ? 2400 : 900);
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      fx(i === LOOKS.length - 1 ? "sparkle" : "pop");
    }, 900 + i * 1300),
  );
}

function hideCard() {
  $("#demo-card").classList.remove("on");
}

/** Puts a floating island down with its ticker at (x, y) in the world. */
function floatAt(x: number, y: number) {
  const root = $<HTMLElement>("#root");
  root.style.transform = "";
  dragged.x = dragged.y = 0;
  root.style.left = `${x - 360}px`;
  root.style.top = `${y - 26}px`;
}

/**
 * Drags the floating island (cursor and all) by (dx, dy), the camera
 * tracking it most of the way: the desktop slides by behind it.
 */
async function drag(dx: number, dy: number, ms = 1300) {
  const pill = inWorld($("#island"));
  await moveTo(pill.x + pill.w * 0.62, pill.y + pill.h / 2, 600);
  const c = $<HTMLElement>("#demo-cursor");
  c.classList.add("hold");
  fx("tick");
  await wait(150);
  const root = $<HTMLElement>("#root");
  const from = { ...cursor };
  const start = shot;
  if (driftTimer != null) window.clearTimeout(driftTimer);
  driftTimer = null;
  fx("whoosh");
  await tween(ms, (e) => {
    dragged.x = dx * e;
    dragged.y = dy * e;
    root.style.transform = `translate(${dragged.x}px, ${dragged.y}px)`;
    cursor.x = from.x + dx * e;
    cursor.y = from.y + dy * e;
    placeCursor();
    frame({ ...start, x: start.x + dx * e * 0.7, y: start.y + dy * e * 0.7 }, 0, "linear");
  });
  shot = { ...start, x: start.x + dx * 0.7, y: start.y + dy * 0.7 };
  c.classList.remove("hold");
  fx("tick");
}

/** Picks where the island sits from its header, like the trader would. */
async function place(title: string) {
  await click(titled("Where the island sits"), { ms: 450 });
  await wait(220);
  await click(titled(title), { ms: 360 });
}

const mascotEl = () => document.querySelector("#island .mascot");
const CLOSE = SHOTS.island.s;

/**
 * A close-up `k` times nearer than the island shot. The upright frame is as
 * wide as the island already: there, it frames the whole island a little
 * closer, so a card's words stay on screen.
 */
function closeUp(el: Element | null, k: number, extra: Partial<Shot> = {}): Shot {
  if (!VERTICAL) return focusOn(el, CLOSE * k, extra);
  return focusOn($("#island"), CLOSE * (1 + (k - 1) * 0.2), { ...extra, r: (extra.r ?? 0) / 2 });
}

// ── Stills for the README (scripts/screenshots.mjs) ─────────────────────────

const STILLS = ["hero", "ticker", "alert", "search", "wallet", "discipline", "wardrobe", "sidebar", "share"] as const;
type Still = (typeof STILLS)[number];

/** What the screenshot takes: an area of the page, or an image of its own. */
type StillShot = { clip: { x: number; y: number; width: number; height: number } } | { png: string };

/** The page box of an element, with room around it. */
function boxOf(el: Element, pad: number): { x: number; y: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}

/** Sets one still up, waits for the island to settle, and says what to take. */
async function still(name: Still): Promise<StillShot> {
  const settle = () => wait(1300);
  State.events.length = 0;
  Companion.closeSearch();
  const field = document.querySelector<HTMLInputElement>('#island input[placeholder^="Search a token"]');
  if (field) field.value = "";
  $<HTMLElement>("#demo-cursor").style.opacity = "0";
  island.fsm.homeToPetitDelay = 600;
  const open = async (view: Parameters<Island["setView"]>[0]) => {
    island.setView(view);
    await settle();
  };
  switch (name) {
    case "hero":
      camera(SHOTS.wide, 0, { drift: false });
      await open("watchlist");
      return { clip: boxOf($("#stage"), 0) };
    case "ticker":
      camera(SHOTS.wide, 0, { drift: false });
      island.collapse();
      await settle();
      return { clip: boxOf($("#island"), 14) };
    case "alert":
      Companion.raise({ kind: "alert", id: "still-alert", ruleId: "still", address: CANDLE.key, title: "CANDLE +34.2% in 5 min", detail: "MC $5.6M · $0.005563 · liq $183K", tone: "up" });
      await wait(900);
      return { clip: boxOf($("#island"), 14) };
    case "search": {
      await open("watchlist");
      const input = document.querySelector<HTMLInputElement>('#island input[placeholder^="Search a token"]')!;
      input.value = "btc";
      State.search = { query: "btc", results: btcSearch(), loading: false, error: null };
      await open("watchlist");
      return { clip: boxOf($("#island"), 14) };
    }
    case "wallet":
      seedWallet();
      await open("positions");
      return { clip: boxOf($("#island"), 14) };
    case "discipline":
      await open("discipline");
      return { clip: boxOf($("#island"), 14) };
    case "wardrobe":
      Object.assign(State.companion, { outfit: "crown", face: "shades", skin: "mint", costume: "none" });
      island.applySettings();
      await open("wardrobe");
      return { clip: boxOf($("#island"), 14) };
    case "sidebar":
      State.settings.placement = "right";
      island.applySettings();
      camera(SHOTS.wide, 0, { drift: false });
      await open("watchlist");
      return { clip: boxOf($("#island"), 14) };
    case "share": {
      const blob = await island.recapImage();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { png: btoa(s) };
    }
  }
}

// ── Script ────────────────────────────────────────────────────────────────────

async function run() {
  (window as unknown as { __demoMusicAt: number }).__demoMusicAt = clock();

  // Title, in cinema bars.
  bars(true);
  titleCard();
  fx("rise");
  await wait(2600);

  // Establishing shot: the desktop, far and tilted, then the camera glides in.
  camera({ ...SHOTS.wide, s: SHOTS.wide.s * 0.8, r: -4, y: 430 }, 0, { drift: false });
  hideCard();
  await wait(300);
  camera(SHOTS.wide, 2800, { ease: "cubic-bezier(0.22, 1, 0.36, 1)" });
  island.launch();
  await say(`Meet *${MASCOT_NAME}.* It lives at the top of your screen`);
  // The cursor comes in; Candy watches it go by.
  await moveTo(900, 330, 1300);
  bars(false);
  await moveTo(400, 250, 1500);
  await moveTo(690, 200, 900);

  // Crane up to the ticker; the eyes still follow.
  camera(SHOTS.ticker, 1200);
  await say("Your watchlist, *always in view*");
  await moveTo(560, 80, 900);
  await moveTo(780, 70, 1100);
  await moveTo(650, 60, 600);

  // Open it.
  camera(SHOTS.island);
  await say("Market cap, volume, buys and sells, *5m · 1h · 24h*");
  await openIsland();
  await moveTo(cursor.x - 160, cursor.y + 120, 900);
  await wait(900);

  // Search: the real coin first, the fakes flagged.
  const input = document.querySelector<HTMLInputElement>('#island input[placeholder^="Search a token"]')!;
  await say("Search by name: the real *BTC* comes first…");
  await click(input, { click: false });
  await type(input, "btc");
  State.search = { query: "btc", results: btcSearch(), loading: false, error: null };
  island.setView("watchlist");
  fx("pop");
  await wait(450);
  const first = document.querySelector("#island .results .row");
  camera(closeUp(first, 1.45), 800);
  await wait(500);
  mark([first]);
  await wait(1500);
  await say("…fakes with made-up liquidity get flagged *⚠*");
  const suspects = [...document.querySelectorAll("#island .results .c-liq.suspect")];
  camera(closeUp(suspects[0], 1.7, { y: inWorld(suspects[0] ?? first!).y + 18 }), 700);
  await wait(450);
  mark(suspects);
  await wait(1900);
  Companion.closeSearch();
  input.value = "";
  island.setView("watchlist");
  camera(SHOTS.island, 800);

  // An alert.
  await say("Alerts on price, market cap, *% moves* and liquidity");
  await click(titled("Alerts"));
  await wait(400);
  camera(closeUp(document.querySelector("#island .alert-form"), 1.25), 800);
  const [tokenSel, kindSel, winSel] = [...document.querySelectorAll<HTMLSelectElement>(".alert-form select")];
  choose(tokenSel, CANDLE.key);
  choose(kindSel, "pctUp");
  // 5 minutes: DexScreener's own 5m change backs it from the start (a 15-minute
  // rule waits for 12 minutes of its own samples).
  choose(winSel, "5");
  const value = document.querySelector<HTMLInputElement>(".alert-form input")!;
  await click(value, { click: false });
  await type(value, "30");
  await click(button(".alert-form", "Create"));
  await wait(800);

  // Walk away: the island folds back into its ticker. Then CANDLE pumps.
  void say(null);
  camera(SHOTS.island, 900);
  island.fsm.homeToPetitDelay = 1;
  await moveTo(1120, 640, 700);
  await wait(1300);
  island.fsm.homeToPetitDelay = 9;
  await say("It tells you *the moment* something moves");
  // On the chart: the candles climb while the camera creeps in…
  camera(SHOTS.chart, 800);
  await wait(650);
  fx("riser");
  camera({ ...SHOTS.chart, s: SHOTS.chart.s * 1.15, x: SHOTS.chart.x + 40, y: SHOTS.chart.y - 40 }, 1500, { drift: false, ease: "cubic-bezier(0.5, 0, 0.75, 0)" });
  for (const step of [4, 6, 5, 8, 7, 9]) {
    pushCandle(step);
    live$.CANDLE.price *= 1 + step / 100;
    await wait(220);
  }
  live$.CANDLE.m5 = 34.2;
  live$.CANDLE.h1 = 48.9;
  // …and hits: a whip up to the island, where Candy is already celebrating.
  fx("impact");
  Companion.feed(quotes());
  camera(SHOTS.island, 380, { whip: true, drift: false, ease: "var(--ease-out)" });
  vignette("green");
  window.setTimeout(punch, 300);
  window.setTimeout(confetti, 380);
  window.setTimeout(() => fx("sparkle"), 450);
  await wait(500);
  camera(closeUp(mascotEl(), 1.5, { r: 2 }), 450, { ease: "var(--ease-out)" });
  await wait(1500);
  camera(SHOTS.island, 900);
  await wait(900);
  await click(button(".view.event", "OK"));
  await wait(600);

  // A rug: liquidity pulled on FROGE. A dutch angle and a shake.
  await say("…and when liquidity *gets pulled*");
  document.querySelector("#chart-title")!.textContent = "FROGE / SOL · 1m";
  seedChart();
  drawChart();
  await wait(700);
  pushCandle(-38);
  live$.FROGE.liq = 220_000;
  live$.FROGE.price *= 0.62;
  live$.FROGE.m5 = -38.4;
  Companion.feed(quotes());
  camera({ ...SHOTS.island, s: CLOSE * 1.15, r: -5 }, 260, { drift: false, ease: "var(--ease-out)" });
  shake();
  vignette("red");
  fx("impact");
  await wait(1700);
  camera(SHOTS.island, 900);
  await wait(800);
  await click(button(".view.event", "OK"));
  await wait(500);
  // The market calms down, and Candy with it: the rug's warning is let go.
  live$.FROGE.m5 = -1.2;
  live$.FROGE.h1 = -3.4;
  live$.CANDLE.m5 = 4.1;
  State.history[FROGE.key] = [];
  (Companion as unknown as { liqWarnings: Map<string, number> }).liqWarnings.clear();
  Companion.feed(quotes());

  // The trader's own wallet: a slow pan along a winning row.
  seedWallet();
  await say("Your wallet: entries, *PnL* and multiples, worked out for you");
  await openIsland();
  await click(titled("My wallet"));
  await wait(450);
  const top = document.querySelector("#island .view.positions .rows .row");
  camera(focusOn(top?.querySelector(".c-tok") ?? top, CLOSE * 1.5), 800, { drift: false });
  await wait(800);
  camera(focusOn(top?.querySelector(".c-x") ?? top, CLOSE * 1.5), 2200, { drift: false, ease: "cubic-bezier(0.45, 0, 0.55, 1)" });
  await wait(1400);
  mark([top?.querySelector(".c-x") ?? null], 1300);
  await wait(900);
  camera(SHOTS.island, 800);

  // The wardrobe, then a close-up on the new look.
  await say("Dress it up: *hats, faces, colours,* backgrounds");
  await click(titled("Wardrobe: hat, face, colour"));
  await wait(380);
  await click(titled("Crown"), { ms: 420 });
  await wait(300);
  await click(button(".wardrobe-head", "Face"), { ms: 380 });
  await click(titled("Shades"), { ms: 380 });
  await wait(300);
  await click(button(".wardrobe-head", "Colour"), { ms: 380 });
  await click(titled("Sky"), { ms: 380 });
  await wait(300);
  await click(button(".wardrobe-head", "Island"), { ms: 380 });
  await click(titled("Neon"), { ms: 380 });
  await wait(250);
  camera(focusOn(mascotEl(), CLOSE * 2.3), 700);
  fx("sparkle");
  await wait(1500);
  camera(SHOTS.island, 800);

  // Discipline: a loss, and Candy turns red (close-up).
  await say("Your own rules, and it *turns red* on a loss");
  await click(titled("Discipline"));
  await wait(400);
  const amount = document.querySelector<HTMLInputElement>(".log-bar input")!;
  await click(amount, { click: false });
  await type(amount, "1.2");
  await click(button(".log-bar", "− Loss"));
  vignette("red", 1400);
  fx("drop");
  // Over the cooldown card's own reaction: the red of a loss.
  window.setTimeout(() => island.feel("sad", "ouch…"), 250);
  await wait(200);
  camera(closeUp(mascotEl(), 2, { r: -2 }), 600, { ease: "var(--ease-out)" });
  await wait(1700);
  camera(SHOTS.island, 800);
  await wait(500);
  await click(button(".view.event", "Got it"));
  // The cooldown is waived and the day turns green again: Candy smiles.
  Companion.endCooldown();
  Companion.recordTrade(2.1, "", { quiet: true });
  await wait(400);

  // Share my day: the card comes up to the camera, the island falls back.
  await say("*Share my day:* a recap image for X or Telegram");
  await openIsland();
  await click(titled("Discipline"));
  await wait(300);
  await click(document.querySelector("#island a.share"), { click: false });
  fx("shutter");
  const share = $<HTMLElement>("#demo-share");
  const img = document.createElement("img");
  img.src = URL.createObjectURL(await island.recapImage());
  await new Promise((r) => (img.onload = r));
  share.replaceChildren(img);
  camera({ ...SHOTS.island, s: CLOSE * 0.85 }, 1200);
  share.classList.add("on");
  fx("whoosh");
  await wait(2900);
  share.classList.remove("on");
  await wait(250);

  // Where it sits: whip pans from edge to edge.
  await say("Put it *anywhere:* the top, the left or right edge…");
  camera(SHOTS.wide, 900);
  await place("Left edge");
  camera(SHOTS.left, 450, { whip: true });
  await wait(1400);
  await place("Right edge");
  camera(SHOTS.right, 450, { whip: true });
  await wait(1400);
  await say("…or *floating:* drag it wherever you like");
  await place("Floating: drag it anywhere");
  floatAt(520, 330);
  camera(floatShot(520, 330), 450, { whip: true });
  island.collapse();
  await wait(600);
  await drag(300, -110);
  await wait(400);

  // Minimize, and back.
  await say("*Minimize* it…");
  await openIsland();
  camera(floatShot(820, 360, VERTICAL ? 1.05 : 1.4), 700);
  await wait(350);
  const minimize = document.querySelector<HTMLElement>('#island [title^="Minimize"]');
  if (minimize) minimize.style.display = "";
  await click(minimize, { ms: 500 });
  fx("drop");
  await wait(900);
  await say("…your shortcut brings it *right back*");
  await moveTo(cursor.x + 120, cursor.y + 90, 500);
  await pressKeys();
  punch();
  await wait(1100);

  // The end: the camera dives into Candy, and the card comes up.
  void say(null);
  $<HTMLElement>("#demo-cursor").style.opacity = "0";
  camera(focusOn(mascotEl(), SHOTS.wide.s * 7), 650, { whip: true, drift: false, ease: "cubic-bezier(0.7, 0, 0.84, 0)" });
  await wait(450);
  bars(true);
  endCard();
  fx("rise");
  await wait(5200);
  (window as unknown as { __demoDone: boolean }).__demoDone = true;
}

async function main() {
  const root = document.getElementById("root");
  if (!root) return;
  if (VERTICAL) document.body.classList.add("vertical");
  // Sound plays only for a visitor who pressed play; the recorder renders it.
  Sound.setEnabled(false);
  Companion.persist = false;

  const settings = normalizeSettings(null);
  settings.autoCloseInterval = 9;
  settings.soundEnabled = false;
  settings.placement = "top";
  settings.floatY = 0.3;
  settings.companion.watchlist = TOKENS;
  settings.companion.discipline.dailyLossLimit = 3;
  settings.companion.log = { day: "", entries: [] };
  // A liquidity rule set up earlier, so the rug has something to fire.
  settings.companion.alerts = [{ id: "demo-liq", address: FROGE.address, kind: "liqDrop", value: 50, windowMin: 15, enabled: true }];
  State.settings = settings;

  fitStage();
  window.addEventListener("resize", fitStage);
  island = new Island(root, { followMouse: false });
  manifest = await loadManifest();
  island.useArt(manifest);
  // The end card's looks, loaded ahead: a hat must not arrive after its colour.
  for (const look of LOOKS) {
    for (const src of [accessory(manifest, "outfits", look.hat), accessory(manifest, "faces", look.face)]) {
      if (src) new Image().src = `/mascot/${src}`;
    }
  }
  island.applySettings();
  Companion.onEvent = (e) => island.showEvent(e);
  Companion.onFeeling = (state, line) => island.feel(state, line);
  Companion.recordTrade(0.8, "", { quiet: true });
  State.events.length = 0;

  seedChart();
  drawChart();
  Companion.feed(quotes());
  window.setInterval(() => {
    drift();
    Companion.feed(quotes());
    if (Math.random() < 0.5) pushCandle((Math.random() - 0.45) * 3);
  }, 1800);
  camera(SHOTS.wide, 0);
  placeCursor();

  // ?still freezes the page (the recorder encodes on it); ?record waits for
  // the recorder to start filming; ?autoplay starts at once, silently;
  // otherwise a visitor presses play, which also unlocks sound.
  if (params.has("still")) return;
  if (params.has("stills")) {
    // A day with a win and a loss behind it, for the discipline still.
    Companion.recordTrade(-0.4, "", { quiet: true });
    Companion.recordTrade(1.3, "", { quiet: true });
    Object.assign(window, { __demoStills: STILLS, __demoStill: still });
    return;
  }
  if (RECORD) {
    // Dark until the recorder starts filming: the video opens on the title.
    $("#demo-card").classList.add("on");
    Object.assign(window, { __demoGo: () => void run() });
    return;
  }
  if (AUTOPLAY) {
    void run();
    return;
  }
  const play = Object.assign(document.createElement("button"), { className: "play", type: "button", textContent: "▶ Watch the demo" });
  play.style.setProperty("--i", "3");
  titleCard(play);
  play.addEventListener("click", () => {
    live = liveAudio(DURATION_S);
    Sound.setEnabled(true);
    Sound.setVolume(0.1);
    Sound.resume();
    hideCard();
    window.setTimeout(() => void run(), 500);
  });
}

void main();
