// The My wallet tab's numbers, worked out from the positions: the order the
// rows go in, each token's share of the wallet, how far a position has come
// toward the trader's target (or the next level), and the activity grouped by
// day. Pure, so it is tested; the tab only draws what comes out.

import { currentLang, t } from "../core/i18n";
import type { ActivityItem, Position } from "../core/state";
import type { PositionStats } from "./positions";

export type PositionSort = "value" | "pnl" | "pct" | "x";
export const POSITION_SORTS: readonly PositionSort[] = ["value", "pnl", "pct", "x"];

export interface Held {
  p: Position;
  price: number;
  s: PositionStats;
}

/** Biggest first, by value, profit, % or multiple; an unknown % or multiple last. */
export function sortHeld<T extends Held>(list: T[], by: PositionSort): T[] {
  const key = (x: T): number => {
    switch (by) {
      case "value":
        return x.s.valueUsd;
      case "pnl":
        return x.s.pnlUsd;
      case "pct":
        return x.s.pnlPct ?? -Infinity;
      case "x":
        return x.s.multiple ?? -Infinity;
    }
  };
  return [...list].sort((a, b) => key(b) - key(a));
}

export interface Slice {
  key: string;
  symbol: string;
  value: number;
  /** 0–1 of the wallet. */
  share: number;
}

/** A wallet's coin (SOL, ETH, BNB) and what it is worth. */
export interface NativeValue {
  symbol: string;
  value: number;
}

/**
 * Each token's share of the wallet, the wallet's coins (SOL, ETH, BNB)
 * included, biggest first: the `max` largest, then the rest together as
 * "Others". Nothing in it: none. A number is the SOL value alone.
 */
export function allocation(list: Held[], natives: number | NativeValue[], max = 5): Slice[] {
  const parts = list.map((x) => ({ key: x.p.mint, symbol: x.p.symbol, value: Math.max(0, x.s.valueUsd) }));
  // The same coin on two chains (ETH on Ethereum and Base) is one slice.
  const coins = new Map<string, number>();
  for (const n of typeof natives === "number" ? [{ symbol: "SOL", value: natives }] : natives) {
    if (n.value > 0) coins.set(n.symbol, (coins.get(n.symbol) ?? 0) + n.value);
  }
  for (const [symbol, value] of coins) parts.push({ key: symbol, symbol, value });
  const total = parts.reduce((s, x) => s + x.value, 0);
  if (!(total > 0)) return [];
  parts.sort((a, b) => b.value - a.value);
  const top = parts.slice(0, max);
  const rest = parts.slice(max).reduce((s, x) => s + x.value, 0);
  if (rest > 0) top.push({ key: "others", symbol: t("Others"), value: rest });
  return top.map((x) => ({ ...x, share: x.value / total }));
}

/** How far a position has come: toward the trader's target or stop, or the next multiple level. */
export interface Progress {
  /** 0–1 along the way. */
  frac: number;
  /** "target"/"stop": the trader's own; "level": the next multiple alert. */
  kind: "target" | "stop" | "level";
  label: string;
  /** For "level": the multiple it leads to (3 for 3x). */
  level?: number;
}

/**
 * Below the entry with a stop set: the way down to the stop. Otherwise, with a
 * target: the way from the entry up to it. Otherwise the way from the last
 * multiple level passed (1x at the start) to the next one. Null when none of
 * that applies (no cost, or past every level).
 */
export function progressOf(x: Held, levels: number[]): Progress | null {
  const { p, price, s } = x;
  const entry = s.entry;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (p.stop && price < entry && entry > p.stop) return { frac: clamp((entry - price) / (entry - p.stop)), kind: "stop", label: t("to your stop") };
  if (p.target && p.target > entry) return { frac: clamp((price - entry) / (p.target - entry)), kind: "target", label: t("to your target") };
  if (s.multiple == null) return null;
  const ups = [...levels].filter((l) => l > 1).sort((a, b) => a - b);
  const next = ups.find((l) => l > s.multiple!);
  if (next == null) return null;
  const prev = [1, ...ups].filter((l) => l <= s.multiple!).pop() ?? 1;
  return { frac: clamp((s.multiple - prev) / (next - prev)), kind: "level", label: t("to {level}x", { level: next }), level: next };
}

/** The activity, newest first, under one heading per day ("Today", "Yesterday", "Mon 6"). */
export function byDay(items: ActivityItem[], now = new Date()): { label: string; items: ActivityItem[] }[] {
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = dayStart(now);
  const groups: { label: string; items: ActivityItem[] }[] = [];
  for (const a of [...items].sort((x, y) => y.t - x.t)) {
    const d = new Date(a.t);
    const start = dayStart(d);
    const label =
      start === today
        ? t("Today")
        : start === today - 86_400_000
          ? t("Yesterday")
          : `${d.toLocaleDateString(currentLang(), { weekday: "short" })} ${d.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }
  return groups;
}

/** The ticker's line for a buy or sell just seen in the trader's own wallet. */
export function ownFeedLine(c: { symbol: string; side: ActivityItem["side"]; usd: number }, usd: (n: number) => string): { text: string; tone: "up" | "down" } | null {
  const p = { symbol: c.symbol, usd: usd(c.usd) };
  switch (c.side) {
    case "opened":
      return { text: t("You bought {symbol} · {usd}", p), tone: "up" };
    case "bought":
      return { text: t("You bought more {symbol} · {usd}", p), tone: "up" };
    case "sold":
      return { text: t("You sold some {symbol} · {usd}", p), tone: "down" };
    case "closed":
      return { text: t("You sold all your {symbol} · {usd}", p), tone: "down" };
    default:
      return null;
  }
}
