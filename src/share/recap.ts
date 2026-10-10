// The daily recap card: the day in a few tiles, with the mascot, ready to post
// on X or Telegram. Pure: what goes on the card is decided here from plain
// numbers; src/share/card.ts only draws it. Money can be hidden: then only
// signs, counts and percentages are left.
//
// Lines describe what happened in the data. They never suggest a trade.

import { formatPct, formatPnl } from "../core/format";
import { currentLang, t, tn } from "../core/i18n";
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
  /** A day's card, the week's (the Monday one) or the month's (the 1st). */
  kind?: "day" | "week" | "month";
  date: string;
  /** What the mascot says in its bubble. */
  headline: string;
  tiles: RecapTile[];
  mood: "celebrate" | "idle" | "worried" | "stop";
}

const tone = (n: number): RecapTile["tone"] => (n > 0 ? "up" : n < 0 ? "down" : "flat");

export function buildRecap(r: RecapInput, title: string): Recap {
  const tiles: RecapTile[] = [];
  const tr = r.trades;

  if (tr.count > 0) {
    const rate = Math.round((tr.wins / tr.count) * 100);
    tiles.push({ label: t("Trades"), value: `${tr.count}`, sub: t("{wins}W · {losses}L · {rate}% win rate", { wins: tr.wins, losses: tr.losses, rate }), tone: "flat" });
    tiles.push({
      label: t("Day PnL"),
      value: r.hideMoney ? (tr.total > 0 ? t("Green day") : tr.total < 0 ? t("Red day") : t("Flat")) : formatPnl(tr.total, tr.unit),
      tone: tone(tr.total),
    });
  } else {
    tiles.push({ label: t("Trades"), value: "0", sub: t("Watched, didn't chase"), tone: "flat" });
  }

  const p = r.positions;
  if (p && p.count > 0) {
    const pct = p.cost > 0 ? (p.openPnl / p.cost) * 100 : null;
    tiles.push({
      label: t("Open positions"),
      value: r.hideMoney ? formatPct(pct) : formatSignedUsd(p.openPnl),
      sub: r.hideMoney ? tn(p.count, "{n} token", "{n} tokens") : tn(p.count, "{pct} · {n} token", "{pct} · {n} tokens", { pct: formatPct(pct) }),
      tone: tone(p.openPnl),
    });
  }
  if (p && Math.abs(p.realizedToday) >= 0.01) {
    tiles.push({
      label: t("Taken today"),
      value: r.hideMoney ? (p.realizedToday > 0 ? t("In profit") : t("At a loss")) : formatSignedUsd(p.realizedToday),
      tone: tone(p.realizedToday),
    });
  }

  if (r.topMover) {
    tiles.push({ label: t("Top mover (24h)"), value: `${r.topMover.symbol} ${formatPct(r.topMover.pct)}`, sub: t("on my watchlist"), tone: tone(r.topMover.pct) });
  }
  if (r.hasRules) {
    tiles.push(
      r.stopped
        ? { label: t("Discipline"), value: t("Stopped on time"), sub: t("Loss limit reached"), tone: "flat" }
        : { label: t("Discipline"), value: t("Rules kept ✓"), tone: "up" },
    );
  }
  // The index's own words ("Greed"…), marked in market/sentiment.ts.
  if (r.fearGreed) tiles.push({ label: t("Fear & Greed"), value: `${r.fearGreed.value}`, sub: t(r.fearGreed.label), tone: "flat" });

  // The day in one line, from the numbers.
  const day = tr.count > 0 ? tr.total : (p?.realizedToday ?? 0) + (p?.openPnl ?? 0);
  let headline: string;
  let mood: Recap["mood"];
  if (r.stopped) {
    headline = t("Rules are rules. Stopped on time.");
    mood = "stop";
  } else if (tr.count === 0 && !(p && p.count > 0)) {
    headline = t("Quiet day. Watched, waited.");
    mood = "idle";
  } else if (day > 0) {
    headline = t("Green day! 🎉");
    mood = "celebrate";
  } else if (day < 0) {
    headline = t("Red day. Tomorrow's another one.");
    mood = "worried";
  } else {
    headline = t("Flat day. Capital kept.");
    mood = "idle";
  }

  return { title, date: r.date, headline, tiles: tiles.slice(0, 6), mood };
}

// Dates: in English as Candy has always written them ("Mon 5 Oct", "September
// 2026"), whatever the system locale; in any other language as that language
// writes them (Intl), so no day or month name is translated by hand.
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const english = () => currentLang() === "en";
const local = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(currentLang(), o);

/** "Mon 5 Oct" in Candy's language. */
export function recapDate(d: Date): string {
  return english() ? `${EN_DAYS[d.getDay()]} ${d.getDate()} ${EN_MONTHS[d.getMonth()]}` : local(d, { weekday: "short", day: "numeric", month: "short" });
}

/** "Mon", in Candy's language. */
const weekday = (d: Date) => (english() ? EN_DAYS[d.getDay()] : local(d, { weekday: "short" }));

/** "5 Oct", in Candy's language. */
const dayMonth = (d: Date) => (english() ? `${d.getDate()} ${EN_MONTHS[d.getMonth()]}` : local(d, { day: "numeric", month: "short" }));

// ── The week ──────────────────────────────────────────────────────────────────

/** A Monday-to-Monday stretch of local days, or a calendar month (`period`). */
export interface WeekRange {
  /** Monday 00:00 (ms), or the month's 1st. */
  from: number;
  /** The Monday after, 00:00 (ms), or the next month's 1st: not included. */
  to: number;
  /** "28 Sep – 4 Oct", "September 2026". */
  label: string;
  /** Missing: a week. */
  period?: "week" | "month";
}

/** This month (the 1st to now), or the one before it, as local days. */
export function monthRange(now: Date, which: "this" | "last"): WeekRange {
  const first = new Date(now.getFullYear(), now.getMonth() - (which === "last" ? 1 : 0), 1);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const label = english() ? `${EN_MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}` : local(first, { month: "long", year: "numeric" });
  return { from: first.getTime(), to: next.getTime(), label, period: "month" };
}

/**
 * The month's card is due: the month has turned, last month had trades, and
 * its card hasn't been shown (`seen`: the last month shown, by its 1st's ms).
 */
export function monthRecapDue(now: Date, seen: number, trades: { t: number }[]): WeekRange | null {
  const last = monthRange(now, "last");
  if (seen >= last.from) return null;
  return trades.some((x) => x.t >= last.from && x.t < last.to) ? last : null;
}

/** This week (Monday to now), or the one before it, as local days. */
export function weekRange(now: Date, which: "this" | "last"): WeekRange {
  const sinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday - (which === "last" ? 7 : 0));
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const label = `${dayMonth(monday)} – ${dayMonth(sunday)}`;
  return { from: monday.getTime(), to: next.getTime(), label };
}

export interface WeekInput {
  range: WeekRange;
  hideMoney: boolean;
  unit: string;
  /** The journal's trades (whatever range: those inside it count), with the check-in's answer when there was one. */
  trades: { t: number; pnl: number; plan?: "yes" | "partly" | "no" }[];
}

/** The week's card (or the month's): what it took, the trades, the green days, the best day and trade. */
export function buildWeekRecap(w: WeekInput, title: string): Recap & { total: number; count: number } {
  const month = w.range.period === "month";
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
  const money = (n: number) => (w.hideMoney ? (n > 0 ? t("In profit") : n < 0 ? t("At a loss") : t("Flat")) : formatPnl(n, w.unit));
  const tiles: RecapTile[] = [];
  if (inside.length) {
    const result = total > 0 ? (month ? t("Green month") : t("Green week")) : total < 0 ? (month ? t("Red month") : t("Red week")) : t("Flat");
    tiles.push({ label: month ? t("Month PnL") : t("Week PnL"), value: w.hideMoney ? result : formatPnl(total, w.unit), tone: tone(total) });
    tiles.push({
      label: t("Trades"),
      value: `${inside.length}`,
      sub: t("{wins}W · {losses}L · {rate}% win rate", { wins, losses, rate: Math.round((wins / inside.length) * 100) }),
      tone: "flat",
    });
    tiles.push({ label: t("Green days"), value: t("{n} of {total}", { n: green, total: byDay.size }), sub: t("days with trades"), tone: green * 2 >= byDay.size ? "up" : "down" });
    // The check-ins: how often the plan was followed.
    const answered = inside.filter((x) => x.plan);
    if (answered.length) {
      const yes = answered.filter((x) => x.plan === "yes").length;
      const partly = answered.filter((x) => x.plan === "partly").length;
      tiles.push({
        label: t("Plan followed"),
        value: t("{n} of {total}", { n: yes, total: answered.length }),
        sub: partly ? tn(partly, "{n} partly", "{n} partly") : t("trades checked in"),
        tone: yes * 2 >= answered.length ? "up" : "down",
      });
    }
    const [bestDay, bestPnl] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    const day = new Date(bestDay);
    tiles.push({ label: t("Best day"), value: month ? dayMonth(day) : weekday(day), sub: money(bestPnl), tone: tone(bestPnl) });
    const best = Math.max(...inside.map((x) => x.pnl));
    const worst = Math.min(...inside.map((x) => x.pnl));
    if (best > 0) tiles.push({ label: t("Best trade"), value: money(best), tone: "up" });
    if (worst < 0) tiles.push({ label: t("Biggest loss"), value: money(worst), tone: "down" });
  } else {
    tiles.push({ label: t("Trades"), value: "0", sub: month ? t("A month of watching") : t("A week of watching"), tone: "flat" });
  }
  let headline: string;
  let mood: Recap["mood"];
  if (!inside.length) {
    headline = month ? t("Quiet month. Patience is a position.") : t("Quiet week. Patience is a position.");
    mood = "idle";
  } else if (total > 0) {
    headline = month ? t("Green month! 🎉") : t("Green week! 🎉");
    mood = "celebrate";
  } else if (total < 0) {
    headline = month ? t("Red month. A fresh one starts now.") : t("Red week. A fresh one starts now.");
    mood = "worried";
  } else {
    headline = month ? t("Flat month. Capital kept.") : t("Flat week. Capital kept.");
    mood = "idle";
  }
  return { title, kind: month ? "month" : "week", date: w.range.label, headline, tiles: tiles.slice(0, 6), mood, total, count: inside.length };
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
