// Discipline helpers: the rules are the trader's own (set in Settings); the
// mascot only reminds them. Pure helpers first, then the small runner that
// checks the clock.

import { formatPnl } from "../core/format";
import type { DisciplineRules, JournalEntry, TradeEntry, TradeLog } from "../core/state";

/** Local calendar day, YYYY-MM-DD. */
export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** The log for today: yesterday's entries are dropped at midnight. */
export function currentLog(log: TradeLog, now = new Date()): TradeLog {
  const day = todayKey(now);
  return log.day === day ? log : { day, entries: [] };
}

export interface DaySummary {
  count: number;
  total: number;
  wins: number;
  losses: number;
}

/**
 * The day: every entry's profit adds up (a part sold too); trades, wins and
 * losses count whole trades only, a closed position by what it took in all.
 */
export function summarize(log: TradeLog): DaySummary {
  let total = 0;
  let count = 0;
  let wins = 0;
  let losses = 0;
  for (const e of log.entries) {
    total += e.pnl;
    if (e.partial) continue;
    count++;
    const result = e.tradePnl ?? e.pnl;
    if (result > 0) wins++;
    else if (result < 0) losses++;
  }
  return { count, total, wins, losses };
}

export function lossLimitReached(rules: DisciplineRules, summary: DaySummary): boolean {
  return rules.dailyLossLimit > 0 && summary.total <= -rules.dailyLossLimit;
}

/** Share of today's loss limit already used, 0–1 (0 when there is no limit). */
export function lossLimitUsed(rules: DisciplineRules, summary: DaySummary): number {
  if (rules.dailyLossLimit <= 0 || summary.total >= 0) return 0;
  return Math.min(1, -summary.total / rules.dailyLossLimit);
}

export interface TradeOutcome {
  log: TradeLog;
  /** Logging this trade crossed the loss limit. */
  hitLossLimit: boolean;
  /** This trade is exactly the maximum allowed for the day. */
  hitMaxTrades: boolean;
  /** A cool-down should start now (the trade was a loss). */
  startCooldown: boolean;
  /** This loss makes the streak the tilt rule watches for (rules.tiltLosses in a row). */
  hitTilt: boolean;
}

/** Adds a trade to today's log and reports which rules it trips. */
export function logTrade(
  rules: DisciplineRules,
  log: TradeLog,
  pnl: number,
  now = new Date(),
  extra: Omit<TradeEntry, "t" | "pnl"> = {},
): TradeOutcome {
  const today = currentLog(log, now);
  const before = summarize(today);
  const entry: TradeEntry = { t: now.getTime(), pnl, ...extra };
  const next: TradeLog = { day: today.day, entries: [...today.entries, entry].sort((a, b) => a.t - b.t) };
  const after = summarize(next);
  const whole = !extra.partial;
  return {
    log: next,
    hitLossLimit: !lossLimitReached(rules, before) && lossLimitReached(rules, after),
    hitMaxTrades: whole && rules.maxTradesPerDay > 0 && after.count === rules.maxTradesPerDay,
    startCooldown: whole && (extra.tradePnl ?? pnl) < 0 && rules.cooldownMin > 0,
    hitTilt: whole && rules.tiltLosses > 0 && lossStreak(next) === rules.tiltLosses && lossStreak(today) < rules.tiltLosses,
  };
}

/** Losing trades in a row at the end of the day so far (whole trades; a part sold neither breaks nor adds to it). */
export function lossStreak(log: TradeLog): number {
  let n = 0;
  for (let i = log.entries.length - 1; i >= 0; i--) {
    const e = log.entries[i];
    if (e.partial) continue;
    if ((e.tradePnl ?? e.pnl) < 0) n++;
    else break;
  }
  return n;
}

/** The header's pill: the day against the trader's own limits. */
export interface DayPill {
  text: string;
  /** "stop": a limit is reached; "warn": close to one (70% of the loss, or the last trade allowed). */
  tone: "ok" | "warn" | "stop";
  title: string;
}

/** Null when there is nothing to show: no limit set and no trade yet. */
export function dayPill(rules: DisciplineRules, s: DaySummary): DayPill | null {
  const lossLimit = rules.dailyLossLimit > 0;
  const maxTrades = rules.maxTradesPerDay > 0;
  if (!lossLimit && !maxTrades && s.count === 0 && s.total === 0) return null;
  // Short: the header is crowded. The tooltip says it in full.
  const parts = [lossLimit ? `${formatPnl(s.total, "").trim()}/${rules.dailyLossLimit}` : formatPnl(s.total, rules.unit)];
  const title = [`Today: ${formatPnl(s.total, rules.unit)}, ${s.count} trade${s.count === 1 ? "" : "s"}`];
  if (lossLimit) title.push(`Loss limit: ${formatPnl(-rules.dailyLossLimit, rules.unit)}`);
  if (maxTrades) {
    parts.push(`${s.count}/${rules.maxTradesPerDay}`);
    title.push(`Max trades: ${rules.maxTradesPerDay}`);
  } else if (s.count) parts.push(`${s.count}t`);
  const used = lossLimitUsed(rules, s);
  const tone: DayPill["tone"] =
    used >= 1 || (maxTrades && s.count >= rules.maxTradesPerDay)
      ? "stop"
      : used >= 0.7 || (maxTrades && s.count === rules.maxTradesPerDay - 1)
        ? "warn"
        : "ok";
  return { text: parts.join(" · "), tone, title: title.join("\n") };
}

/**
 * How much to put in so that being stopped out loses `riskPct` of the bank:
 * bank × risk ÷ stop. Null until all three make sense; never more than the bank.
 */
export function positionSize(bank: number, riskPct: number, stopPct: number): { size: number; risk: number } | null {
  if (!(bank > 0) || !(riskPct > 0) || !(stopPct > 0) || riskPct > 100 || stopPct > 100) return null;
  const risk = (bank * riskPct) / 100;
  return { size: Math.min(bank, risk / (stopPct / 100)), risk };
}

/** One square of the green and red days grid. */
export interface GridDay {
  day: string;
  pnl: number;
  count: number;
  /** After today: drawn empty. */
  future: boolean;
}

/**
 * The journal as weeks of days, oldest week first, each Monday to Sunday,
 * ending with the current week: what each day took and how many trades.
 */
export function dayGrid(journal: JournalEntry[], weeks: number, now = new Date()): GridDay[][] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday - (weeks - 1) * 7);
  const out: GridDay[][] = [];
  const byDay = new Map<string, GridDay>();
  for (let w = 0; w < weeks; w++) {
    const col: GridDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const cell = { day: todayKey(date), pnl: 0, count: 0, future: date > today };
      byDay.set(cell.day, cell);
      col.push(cell);
    }
    out.push(col);
  }
  for (const e of journal) {
    const cell = byDay.get(todayKey(new Date(e.t)));
    if (!cell) continue;
    cell.pnl += e.pnl;
    cell.count++;
  }
  return out;
}

/** The last trade typed in today, if any (wallet entries are not undone). */
export function lastTypedTrade(log: TradeLog, now = new Date()): TradeEntry | null {
  return currentLog(log, now).entries.filter((e) => !e.auto).at(-1) ?? null;
}

/** Removes the last trade typed in today (a typo in the amount). */
export function undoLastTrade(log: TradeLog, now = new Date()): TradeLog {
  const today = currentLog(log, now);
  const last = lastTypedTrade(today, now);
  return { day: today.day, entries: today.entries.filter((e) => e !== last) };
}

/** Milliseconds until the next break reminder, or null when breaks are off. */
export function nextBreakIn(rules: DisciplineRules, lastBreakAt: number, now: number): number | null {
  if (rules.breakEveryMin <= 0) return null;
  return lastBreakAt + rules.breakEveryMin * 60_000 - now;
}

// ── Journal ───────────────────────────────────────────────────────────────────

export interface WeekStats {
  /** The last 7 local days, oldest first. */
  days: { day: string; label: string; pnl: number; count: number }[];
  total: number;
  count: number;
  wins: number;
  losses: number;
  /** Share of winning trades, 0–1 (0 with no trades). */
  winRate: number;
  best: number;
  worst: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function weekStats(journal: JournalEntry[], now = new Date()): WeekStats {
  const days: WeekStats["days"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({ day: todayKey(d), label: i === 0 ? "Today" : WEEKDAYS[d.getDay()], pnl: 0, count: 0 });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  let wins = 0;
  let losses = 0;
  let best = 0;
  let worst = 0;
  for (const e of journal) {
    const d = byDay.get(todayKey(new Date(e.t)));
    if (!d) continue;
    d.pnl += e.pnl;
    d.count++;
    if (e.pnl > 0) wins++;
    else if (e.pnl < 0) losses++;
    best = Math.max(best, e.pnl);
    worst = Math.min(worst, e.pnl);
  }
  const count = days.reduce((s, d) => s + d.count, 0);
  const total = days.reduce((s, d) => s + d.pnl, 0);
  return { days, total, count, wins, losses, winRate: count ? wins / count : 0, best, worst };
}

/** The whole journal as CSV, oldest first, ready for a spreadsheet. */
export function journalCsv(journal: JournalEntry[], unit: string): string {
  // A note starting with = + - @ would run as a formula in Excel: keep it text.
  const esc = (raw: string) => {
    const s = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const rows = [...journal]
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const d = new Date(e.t);
      return [todayKey(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`, String(e.pnl), unit, esc(e.note ?? ""), e.plan ?? ""].join(",");
    });
  return ["date,time,pnl,unit,note,plan", ...rows].join("\n") + "\n";
}
