// The end of the day: when Candy sums the day up on the island (a little board
// whose numbers count up), and what goes on that board. Pure: the island
// decides when to ask, src/views/event.ts animates it. The numbers come from
// the same input as the shareable card (src/share/recap.ts), so both agree.

import { formatDuration, formatPnl } from "../core/format";
import { t, tn } from "../core/i18n";
import type { JournalEntry, TradeEntry } from "../core/state";
import { todayKey } from "../discipline/discipline";
import { formatSignedUsd } from "../positions/positions";
import type { RecapInput } from "./recap";

/** Settings → "Day ends at": 22:00 unless the trader picks another time (or off). */
export const DAY_END_DEFAULT = "22:00";
/**
 * The choices offered: off (""), then every half hour from noon. The log
 * turns over at midnight, so a time in the small hours would find the new
 * day's empty log: the night is not offered.
 */
export const DAY_END_CHOICES: readonly string[] = [
  "",
  ...Array.from({ length: 24 }, (_, i) => `${String(12 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`),
];

/** The choices with the time kept in the file among them, when it is not one of them (an older build offered other times). */
export function dayEndChoices(current: string): string[] {
  if (DAY_END_CHOICES.includes(current) || dayEndMinutes(current) == null) return [...DAY_END_CHOICES];
  return [...DAY_END_CHOICES, current].sort((a, b) => (dayEndMinutes(a) ?? -1) - (dayEndMinutes(b) ?? -1));
}

/** "22:00" → 1320 (minutes into the day); "" or anything else → null (off). */
export function dayEndMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Why the recap plays: the session the trader set is over, the day's time came, or they asked to see it again. */
export type DayEndReason = "session" | "time" | "replay";

/**
 * The day's time waits for a quiet moment: this long after the last trade
 * was logged. A trade logged past the time (a day that had nothing to tell
 * at 22:00) would otherwise bring the recap up right behind its check-in,
 * mid-session.
 */
export const DAY_END_QUIET_MS = 5 * 60_000;

export interface DayEndCheck {
  now: Date;
  /** Settings → Day ends at: "HH:MM" local, or "" for off. */
  dayEndAt: string;
  /** The day (see todayKey) the recap last played for; "" for never. */
  shownFor: string;
  /** A trade today, or a position open: something to tell. */
  somethingToTell: boolean;
  /** When the last trade of the day was logged (ms); 0: none. The day's time waits DAY_END_QUIET_MS after it. */
  lastTradeAt: number;
  paused: boolean;
  /** When the session the trader set ends (ms); 0: none set. With one set, the day ends with it, whatever the time. */
  sessionEndAt: number;
}

/**
 * Whether the recap should play now, and why. Once per calendar day, only
 * when there is something to tell, never while paused (a session end reached
 * while paused waits for the unpause): at the session end the trader set, or
 * else at the day's time, once the last trade is a few minutes old.
 */
export function dayEndDue(c: DayEndCheck): "session" | "time" | null {
  if (c.paused || !c.somethingToTell) return null;
  if (c.shownFor === todayKey(c.now)) return null;
  if (c.sessionEndAt > 0) return c.now.getTime() >= c.sessionEndAt ? "session" : null;
  const at = dayEndMinutes(c.dayEndAt);
  if (at == null) return null;
  if (c.now.getHours() * 60 + c.now.getMinutes() < at) return null;
  return c.lastTradeAt > 0 && c.now.getTime() - c.lastTradeAt < DAY_END_QUIET_MS ? null : "time";
}

/**
 * How tall the card is (island rows, see Island.rowsFor): a row of three
 * tiles is worth three rows on the top island, two in the sidebar, where the
 * words already sit under the mascot.
 */
export function dayEndRows(stats: number, sidebar: boolean): number {
  const tileRows = Math.max(1, Math.ceil(stats / 3));
  return tileRows * (sidebar ? 2 : 3);
}

// ── The board ─────────────────────────────────────────────────────────────────

/** One number on the board: counted up from 0 to `value`, drawn by `format` on the way. */
export interface DayEndStat {
  label: string;
  value: number;
  format: (n: number) => string;
  tone: "up" | "down" | "flat";
  /** A line under the number: the trade's token, wins and losses. */
  sub?: string;
}

export interface DayEndInput {
  /** As the recap card has it (src/share/recap.ts). */
  trades: RecapInput["trades"];
  positions: RecapInput["positions"];
  /** Today's log: the whole trades decide the best and the worst. */
  entries: TradeEntry[];
  /** The journal: a typed trade's note names it on the board (matched by its time). */
  journal?: JournalEntry[];
  /** How long the session has run (ms). */
  sessionMs: number;
}

const tone = (n: number): DayEndStat["tone"] => (n > 0 ? "up" : n < 0 ? "down" : "flat");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** A note's start, as far as a tile shows: so many characters, cut at a word. */
const NOTE_LABEL_MAX = 18;
function noteStart(note: string): string {
  const s = note.trim().replace(/\s+/g, " ");
  if (s.length <= NOTE_LABEL_MAX) return s;
  const cut = s.slice(0, NOTE_LABEL_MAX);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > NOTE_LABEL_MAX / 2 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/** A whole trade's label under its amount: its token (a wallet trade), else the start of its journal note (a typed one), else when it closed. */
function tradeLabel(e: TradeEntry, journal: JournalEntry[] | undefined): string {
  if (e.symbol) return e.symbol;
  const note = journal?.find((j) => j.t === e.t)?.note.trim();
  if (note) return noteStart(note);
  return clock(e.t);
}

/**
 * The board's numbers, in reading order: the day's PnL, the trades (with the
 * win rate), the best and the worst trade, the time in session. A day with no
 * trade but positions open shows what they are worth instead.
 */
export function dayEndStats(i: DayEndInput): DayEndStat[] {
  const out: DayEndStat[] = [];
  const tr = i.trades;
  const unit = tr.unit;
  const money = (n: number) => formatPnl(n, unit);
  if (tr.count > 0 || i.entries.length > 0) {
    out.push({ label: t("Day PnL"), value: tr.total, format: money, tone: tone(tr.total) });
  } else if (i.positions && i.positions.count > 0) {
    out.push({
      label: t("Open positions"),
      value: i.positions.openPnl,
      format: formatSignedUsd,
      tone: tone(i.positions.openPnl),
      sub: tn(i.positions.count, "{n} token", "{n} tokens"),
    });
  }
  out.push({
    label: t("Trades"),
    value: tr.count,
    format: (n) => String(Math.round(n)),
    tone: "flat",
    sub: tr.count > 0 ? t("{wins}W / {losses}L", { wins: tr.wins, losses: tr.losses }) : undefined,
  });
  if (tr.count > 0) {
    const rate = Math.round((tr.wins / tr.count) * 100);
    out.push({ label: t("Win rate"), value: rate, format: (n) => `${Math.round(n)}%`, tone: rate >= 50 ? "up" : "down" });
  }
  // The whole trades, by what each took (a closed position by its whole result).
  const whole = i.entries.filter((e) => !e.partial).map((e) => ({ e, pnl: e.tradePnl ?? e.pnl }));
  if (whole.length > 0) {
    const best = whole.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    out.push({ label: t("Best trade"), value: best.pnl, format: money, tone: tone(best.pnl), sub: tradeLabel(best.e, i.journal) });
    if (whole.length > 1) {
      const worst = whole.reduce((a, b) => (b.pnl < a.pnl ? b : a));
      out.push({ label: t("Worst trade"), value: worst.pnl, format: money, tone: tone(worst.pnl), sub: tradeLabel(worst.e, i.journal) });
    }
  }
  out.push({ label: t("In session"), value: Math.max(0, i.sessionMs), format: formatDuration, tone: "flat" });
  return out;
}

/** The count-up: how far along (0–1) a number is at `ms` after the board came up, each a beat after the one before. */
export const COUNT_STAGGER_MS = 140;
export const COUNT_MS = 650;
export function countProgress(index: number, ms: number): number {
  const k = (ms - index * COUNT_STAGGER_MS) / COUNT_MS;
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  // Ease out: fast first, settling on the number.
  return 1 - (1 - k) ** 3;
}

/** When the last number has settled: the finale (confetti or the oof) can play. */
export const countDoneAt = (count: number) => Math.max(0, count - 1) * COUNT_STAGGER_MS + COUNT_MS;
