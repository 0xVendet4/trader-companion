// The daily recap card: the day in a few tiles, with the mascot, ready to post
// on X or Telegram. Pure: what goes on the card is decided here from plain
// numbers; src/share/card.ts only draws it. Money can be hidden: then only
// signs, counts and percentages are left.
//
// Lines describe what happened in the data. They never suggest a trade.

import { formatPct, formatPnl } from "../core/format";
import { formatSignedUsd } from "../positions/positions";

export interface RecapInput {
  /** "Mon 5 Oct". */
  date: string;
  hideMoney: boolean;
  trades: { count: number; wins: number; losses: number; total: number; unit: string };
  /** The trader set a loss limit or a trade cap. */
  hasRules: boolean;
  stopped: boolean;
  positions: { count: number; openPnl: number; cost: number; realizedToday: number } | null;
  topMover: { symbol: string; pct: number } | null;
  fearGreed: { value: number; label: string } | null;
}

export interface RecapTile {
  label: string;
  value: string;
  sub?: string;
  tone: "up" | "down" | "flat";
}

export interface Recap {
  title: string;
  /** A day's card, or the week's (the Monday one). */
  kind?: "day" | "week";
  date: string;
  /** What the mascot says in its bubble. */
  headline: string;
  tiles: RecapTile[];
  mood: "celebrate" | "idle" | "worried" | "stop";
}

const tone = (n: number): RecapTile["tone"] => (n > 0 ? "up" : n < 0 ? "down" : "flat");

export function buildRecap(r: RecapInput, title: string): Recap {
  const tiles: RecapTile[] = [];
  const t = r.trades;

  if (t.count > 0) {
    const rate = Math.round((t.wins / t.count) * 100);
    tiles.push({ label: "Trades", value: `${t.count}`, sub: `${t.wins}W · ${t.losses}L · ${rate}% win rate`, tone: "flat" });
    tiles.push({
      label: "Day PnL",
      value: r.hideMoney ? (t.total > 0 ? "Green day" : t.total < 0 ? "Red day" : "Flat") : formatPnl(t.total, t.unit),
      tone: tone(t.total),
    });
  } else {
    tiles.push({ label: "Trades", value: "0", sub: "Watched, didn't chase", tone: "flat" });
  }

  const p = r.positions;
  if (p && p.count > 0) {
    const pct = p.cost > 0 ? (p.openPnl / p.cost) * 100 : null;
    tiles.push({
      label: "Open positions",
      value: r.hideMoney ? formatPct(pct) : formatSignedUsd(p.openPnl),
      sub: r.hideMoney ? `${p.count} token${p.count === 1 ? "" : "s"}` : `${formatPct(pct)} · ${p.count} token${p.count === 1 ? "" : "s"}`,
      tone: tone(p.openPnl),
    });
  }
  if (p && Math.abs(p.realizedToday) >= 0.01) {
    tiles.push({
      label: "Taken today",
      value: r.hideMoney ? (p.realizedToday > 0 ? "In profit" : "At a loss") : formatSignedUsd(p.realizedToday),
      tone: tone(p.realizedToday),
    });
  }

  if (r.topMover) {
    tiles.push({ label: "Top mover (24h)", value: `${r.topMover.symbol} ${formatPct(r.topMover.pct)}`, sub: "on my watchlist", tone: tone(r.topMover.pct) });
  }
  if (r.hasRules) {
    tiles.push(
      r.stopped
        ? { label: "Discipline", value: "Stopped on time", sub: "Loss limit reached", tone: "flat" }
        : { label: "Discipline", value: "Rules kept ✓", tone: "up" },
    );
  }
  if (r.fearGreed) tiles.push({ label: "Fear & Greed", value: `${r.fearGreed.value}`, sub: r.fearGreed.label, tone: "flat" });

  // The day in one line, from the numbers.
  const day = t.count > 0 ? t.total : (p?.realizedToday ?? 0) + (p?.openPnl ?? 0);
  let headline: string;
  let mood: Recap["mood"];
  if (r.stopped) {
    headline = "Rules are rules. Stopped on time.";
    mood = "stop";
  } else if (t.count === 0 && !(p && p.count > 0)) {
    headline = "Quiet day. Watched, waited.";
    mood = "idle";
  } else if (day > 0) {
    headline = "Green day! 🎉";
    mood = "celebrate";
  } else if (day < 0) {
    headline = "Red day. Tomorrow's another one.";
    mood = "worried";
  } else {
    headline = "Flat day. Capital kept.";
    mood = "idle";
  }

  return { title, date: r.date, headline, tiles: tiles.slice(0, 6), mood };
}

/** "Mon 5 Oct" in English, whatever the system locale. */
export function recapDate(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

// ── The week ──────────────────────────────────────────────────────────────────

/** A Monday-to-Monday stretch of local days. */
export interface WeekRange {
  /** Monday 00:00 (ms). */
  from: number;
  /** The Monday after, 00:00 (ms): not included. */
  to: number;
  /** "28 Sep – 4 Oct". */
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** This week (Monday to now), or the one before it, as local days. */
export function weekRange(now: Date, which: "this" | "last"): WeekRange {
  const sinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday - (which === "last" ? 7 : 0));
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const label = `${monday.getDate()} ${MONTHS[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  return { from: monday.getTime(), to: next.getTime(), label };
}

export interface WeekInput {
  range: WeekRange;
  hideMoney: boolean;
  unit: string;
  /** The journal's trades (whatever range: those inside it count), with the check-in's answer when there was one. */
  trades: { t: number; pnl: number; plan?: "yes" | "partly" | "no" }[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The week's card: what it took, the trades, the green days, the best day and trade. */
export function buildWeekRecap(w: WeekInput, title: string): Recap & { total: number; count: number } {
  const inside = w.trades.filter((x) => x.t >= w.range.from && x.t < w.range.to);
  const byDay = new Map<number, number>();
  for (const x of inside) {
    const d = new Date(x.t);
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    byDay.set(key, (byDay.get(key) ?? 0) + x.pnl);
  }
  const total = inside.reduce((s, x) => s + x.pnl, 0);
  const wins = inside.filter((x) => x.pnl > 0).length;
  const losses = inside.filter((x) => x.pnl < 0).length;
  const green = [...byDay.values()].filter((v) => v > 0).length;
  const money = (n: number) => (w.hideMoney ? (n > 0 ? "In profit" : n < 0 ? "At a loss" : "Flat") : formatPnl(n, w.unit));
  const tiles: RecapTile[] = [];
  if (inside.length) {
    tiles.push({ label: "Week PnL", value: w.hideMoney ? (total > 0 ? "Green week" : total < 0 ? "Red week" : "Flat") : formatPnl(total, w.unit), tone: tone(total) });
    tiles.push({ label: "Trades", value: `${inside.length}`, sub: `${wins}W · ${losses}L · ${Math.round((wins / inside.length) * 100)}% win rate`, tone: "flat" });
    tiles.push({ label: "Green days", value: `${green} of ${byDay.size}`, sub: "days with trades", tone: green * 2 >= byDay.size ? "up" : "down" });
    // The check-ins: how often the plan was followed.
    const answered = inside.filter((x) => x.plan);
    if (answered.length) {
      const yes = answered.filter((x) => x.plan === "yes").length;
      const partly = answered.filter((x) => x.plan === "partly").length;
      tiles.push({ label: "Plan followed", value: `${yes} of ${answered.length}`, sub: partly ? `${partly} partly` : "trades checked in", tone: yes * 2 >= answered.length ? "up" : "down" });
    }
    const [bestDay, bestPnl] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    tiles.push({ label: "Best day", value: DAY_NAMES[new Date(bestDay).getDay()], sub: money(bestPnl), tone: tone(bestPnl) });
    const best = Math.max(...inside.map((x) => x.pnl));
    const worst = Math.min(...inside.map((x) => x.pnl));
    if (best > 0) tiles.push({ label: "Best trade", value: money(best), tone: "up" });
    if (worst < 0) tiles.push({ label: "Biggest loss", value: money(worst), tone: "down" });
  } else {
    tiles.push({ label: "Trades", value: "0", sub: "A week of watching", tone: "flat" });
  }
  let headline: string;
  let mood: Recap["mood"];
  if (!inside.length) {
    headline = "Quiet week. Patience is a position.";
    mood = "idle";
  } else if (total > 0) {
    headline = "Green week! 🎉";
    mood = "celebrate";
  } else if (total < 0) {
    headline = "Red week. A fresh one starts now.";
    mood = "worried";
  } else {
    headline = "Flat week. Capital kept.";
    mood = "idle";
  }
  return { title, kind: "week", date: w.range.label, headline, tiles: tiles.slice(0, 6), mood, total, count: inside.length };
}

/**
 * The Monday card is due: it is Monday (or later in a week whose card hasn't
 * come), last week had trades, and its card hasn't been shown (`seen` holds
 * the last week shown, by its Monday's ms).
 */
export function weekRecapDue(now: Date, seen: number, trades: { t: number }[]): WeekRange | null {
  const last = weekRange(now, "last");
  if (seen >= last.from) return null;
  return trades.some((x) => x.t >= last.from && x.t < last.to) ? last : null;
}
