// The mini chart on each watchlist row: the last 24 hours, drawn from
// DexScreener's own change figures (24h, 6h, 1h, 5m back) plus every price the
// app has sampled itself in the last hour. Time runs on a log scale, so the
// last hour gets as much room as the 23 before it.

import type { Quote, Sample } from "../core/state";

export interface SparkPoint {
  /** Milliseconds before now. */
  age: number;
  price: number;
}

const DAY = 24 * 3_600_000;

export function sparkSeries(quote: Quote, history: Sample[], now: number): SparkPoint[] {
  const p = quote.priceUsd;
  if (!(p > 0)) return [];
  const back = (pct: number, age: number): SparkPoint | null => {
    const v = p / (1 + pct / 100);
    return Number.isFinite(v) && v > 0 ? { age, price: v } : null;
  };
  const points: SparkPoint[] = [
    back(quote.change.h24, DAY),
    back(quote.change.h6, 6 * 3_600_000),
    back(quote.change.h1, 3_600_000),
    back(quote.change.m5, 5 * 60_000),
  ].filter((x): x is SparkPoint => x != null);
  // Our own samples only add detail inside the last hour (and before the 5 m mark).
  for (const s of history) {
    const age = now - s.t;
    if (age > 0 && age < 55 * 60_000 && s.price > 0) points.push({ age, price: s.price });
  }
  points.push({ age: 0, price: p });
  return points.sort((a, b) => b.age - a.age);
}

/** 0 at 24 h ago, 1 at now, on a log scale of minutes. */
function xOf(age: number): number {
  const minutes = Math.min(DAY, Math.max(0, age)) / 60_000;
  return 1 - Math.log1p(minutes) / Math.log1p(DAY / 60_000);
}

/** SVG polyline points for a w×h box, and whether the line ends higher. */
export function sparkPath(points: SparkPoint[], w: number, h: number): { d: string; up: boolean } | null {
  if (points.length < 2) return null;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || hi * 0.01 || 1;
  const pad = 1.5;
  const d = points
    .map((p) => `${(xOf(p.age) * (w - 2 * pad) + pad).toFixed(1)},${(pad + (1 - (p.price - lo) / span) * (h - 2 * pad)).toFixed(1)}`)
    .join(" ");
  return { d, up: points[points.length - 1].price >= points[0].price };
}
