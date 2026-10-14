// The chart that opens when the pointer rests on a token's row: candles from
// GeckoTerminal's public OHLCV API (no key), by the token's pool. The API
// serves minute candles in 1, 5 and 15, hour candles in 1, 4 and 12, and day
// candles: 30 m and 8 h are folded here from the finer ones. Pure, and tested;
// the fetching lives in src/market/charts.ts, the drawing in
// src/views/chart-popover.ts.

import type { ChainId } from "./chains";

/** One candle: its start (ms), open, high, low, close and volume. */
export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export const CHART_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "8h", "12h", "24h"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];
export const DEFAULT_CHART_INTERVAL: ChartInterval = "15m";

const MIN = 60_000;
const HOUR = 60 * MIN;
export const INTERVAL_MS: Record<ChartInterval, number> = {
  "1m": MIN,
  "5m": 5 * MIN,
  "15m": 15 * MIN,
  "30m": 30 * MIN,
  "1h": HOUR,
  "4h": 4 * HOUR,
  "8h": 8 * HOUR,
  "12h": 12 * HOUR,
  "24h": 24 * HOUR,
};

export function isChartInterval(v: unknown): v is ChartInterval {
  return typeof v === "string" && (CHART_INTERVALS as readonly string[]).includes(v);
}

/** Candles on screen at once. */
export const CHART_CANDLES = 100;

export type GeckoTimeframe = "day" | "hour" | "minute";

/** What to ask the API for an interval, and how many of its candles make one of ours. */
export interface ChartRequest {
  timeframe: GeckoTimeframe;
  aggregate: number;
  /** Candles to ask for: `fold` times what is shown. */
  limit: number;
  /** API candles per shown candle (1: as served). */
  fold: number;
}

const SERVED: Record<ChartInterval, [GeckoTimeframe, number, number]> = {
  "1m": ["minute", 1, 1],
  "5m": ["minute", 5, 1],
  "15m": ["minute", 15, 1],
  "30m": ["minute", 15, 2],
  "1h": ["hour", 1, 1],
  "4h": ["hour", 4, 1],
  "8h": ["hour", 4, 2],
  "12h": ["hour", 12, 1],
  "24h": ["day", 1, 1],
};

export function chartRequest(interval: ChartInterval, candles = CHART_CANDLES): ChartRequest {
  const [timeframe, aggregate, fold] = SERVED[interval];
  return { timeframe, aggregate, fold, limit: Math.min(1000, candles * fold) };
}

/** GeckoTerminal's network id for a chain; null where it has none (Robinhood). */
export function geckoNetwork(chain: ChainId): string | null {
  switch (chain) {
    case "solana":
      return "solana";
    case "bsc":
      return "bsc";
    case "ethereum":
      return "eth";
    case "base":
      return "base";
    default:
      return null;
  }
}

const BASE58_POOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_POOL = /^0x[0-9a-fA-F]{40}$/;

/** A pool address with the shape its network uses (the same check Rust makes before fetching). */
export function validPool(network: string, pool: string): boolean {
  return network === "solana" ? BASE58_POOL.test(pool) : network === "bsc" || network === "eth" || network === "base" ? EVM_POOL.test(pool) : false;
}

/** A chart is never kept longer than this: the forming candle of a 12 h or 24 h chart follows the price within minutes. */
export const CHART_TTL_MAX = 5 * MIN;

/** How long a fetched chart stays good: one candle, never under 30 s nor over CHART_TTL_MAX. */
export function chartTtl(interval: ChartInterval): number {
  return Math.max(30_000, Math.min(CHART_TTL_MAX, INTERVAL_MS[interval]));
}

const MAX_ROWS = 1000;

/**
 * Reads the API's answer: {"data":{"attributes":{"ohlcv_list":[[seconds, o, h, l, c, v], …]}}},
 * newest first. Rows that do not look like a candle are skipped; the result is
 * oldest first.
 */
export function parseOhlcv(json: unknown): Candle[] {
  const list = ohlcvList(json);
  if (!Array.isArray(list)) return [];
  const out: Candle[] = [];
  for (const row of list.slice(0, MAX_ROWS)) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [t, o, h, l, c, v = 0] = row.map((x) => (typeof x === "string" ? Number(x) : x)) as unknown[];
    const nums = [t, o, h, l, c, v];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const [sec, open, high, low, close, vol] = nums as number[];
    if (sec <= 0 || open <= 0 || close <= 0 || high <= 0 || low <= 0) continue;
    // A wick never shorter than the body: rounding in the feed is forgiven.
    out.push({ t: sec * 1000, o: open, h: Math.max(high, open, close), l: Math.min(low, open, close), c: close, v: Math.max(0, vol) });
  }
  out.sort((a, b) => a.t - b.t);
  // The same start twice: keep the last one given.
  return out.filter((c, i) => i === out.length - 1 || out[i + 1].t !== c.t);
}

/** The list itself, from the full answer or from the bare list Rust hands back. */
function ohlcvList(json: unknown): unknown {
  if (Array.isArray(json)) return json;
  const data = (json as { data?: { attributes?: { ohlcv_list?: unknown } } } | null)?.data;
  return data?.attributes?.ohlcv_list;
}

/**
 * Candles folded into wider ones of `spanMs`, by the start of each span
 * (aligned to the epoch, as the API's own are). A gap leaves no empty candle;
 * a span with only some of its candles (the newest, still forming, or one
 * next to a gap) is made from what there is.
 */
export function foldCandles(candles: Candle[], spanMs: number): Candle[] {
  if (spanMs <= 0) return candles;
  const out: Candle[] = [];
  for (const c of [...candles].sort((a, b) => a.t - b.t)) {
    const start = Math.floor(c.t / spanMs) * spanMs;
    const last = out[out.length - 1];
    if (last && last.t === start) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
      last.v += c.v;
    } else out.push({ t: start, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v });
  }
  return out;
}

/** The candles an interval shows, from what the API served for it: folded when needed, the newest `count` kept. */
export function chartCandles(served: Candle[], interval: ChartInterval, count = CHART_CANDLES): Candle[] {
  const req = chartRequest(interval, count);
  const all = req.fold > 1 ? foldCandles(served, INTERVAL_MS[interval]) : served;
  return all.slice(Math.max(0, all.length - count));
}

export interface ChartStats {
  open: number;
  close: number;
  /** Close against the first candle's open, in %. */
  changePct: number;
  high: number;
  low: number;
}

/** The header's numbers: open → close over the chart, and its high and low. */
export function chartStats(candles: Candle[]): ChartStats | null {
  if (candles.length === 0) return null;
  const open = candles[0].o;
  const close = candles[candles.length - 1].c;
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (c.h > high) high = c.h;
    if (c.l < low) low = c.l;
  }
  return { open, close, changePct: open > 0 ? (close / open - 1) * 100 : 0, high, low };
}

export interface CandleShape {
  /** The candle's centre. */
  x: number;
  /** The body's width. */
  w: number;
  /** The wick, top to bottom. */
  wickTop: number;
  wickBottom: number;
  /** The body, top and height (at least one pixel, so a flat candle still shows). */
  bodyTop: number;
  bodyH: number;
  up: boolean;
}

export interface ChartDrawing {
  candles: CandleShape[];
  /** The last close's height, for the dotted line across the chart. */
  lastY: number;
  lastPrice: number;
  /** The price at the top and bottom edges. */
  top: number;
  bottom: number;
}

/**
 * Where each candle goes in a w×h box: the newest at the right, the box's
 * height spanning the chart's low to high with a little room. Pure: the
 * canvas only draws what this says.
 */
export function chartDrawing(candles: Candle[], w: number, h: number, pad = 3): ChartDrawing | null {
  const stats = chartStats(candles);
  if (!stats || w <= 0 || h <= 0) return null;
  const n = candles.length;
  const slot = (w - 2 * pad) / n;
  const bodyW = Math.max(1, Math.min(slot * 0.7, 9));
  let span = stats.high - stats.low;
  // Every price the same: a thin band in the middle.
  if (span <= 0) span = stats.high * 0.02 || 1;
  const top = stats.high + span * 0.04;
  const bottom = Math.max(0, stats.low - span * 0.04);
  const range = top - bottom || 1;
  const y = (p: number) => pad + ((top - p) / range) * (h - 2 * pad);
  const shapes = candles.map((c, i): CandleShape => {
    const x = pad + slot * (i + 0.5);
    const bodyTop = y(Math.max(c.o, c.c));
    const bodyH = Math.max(1, y(Math.min(c.o, c.c)) - bodyTop);
    return { x, w: bodyW, wickTop: y(c.h), wickBottom: y(c.l), bodyTop, bodyH, up: c.c >= c.o };
  });
  const lastPrice = candles[n - 1].c;
  return { candles: shapes, lastY: y(lastPrice), lastPrice, top, bottom };
}
