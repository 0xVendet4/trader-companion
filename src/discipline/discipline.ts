// Discipline helpers: the rules are the trader's own (set in Settings); the
// mascot only reminds them. Pure helpers first, then the small runner that
// checks the clock.

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
  };
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
      return [todayKey(d), `${pad(d.getHours())}:${pad(d.getMinutes())}`, String(e.pnl), unit, esc(e.note ?? "")].join(",");
    });
  return ["date,time,pnl,unit,note", ...rows].join("\n") + "\n";
}
