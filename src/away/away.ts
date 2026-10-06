// "While you were away": when the trader comes back to the screen after a
// while, Candy sums up what changed. Pure: the island hands in a snapshot
// taken before they left, one taken now, and the alerts raised in between.
// Lines state what happened in the data, nothing more.

import { formatDuration, formatPct } from "../core/format";
import { formatSignedUsd } from "../positions/positions";

/** No cursor movement for this long, then movement: the trader came back. */
export const AWAY_MS = 15 * 60_000;
/** A snapshot is refreshed at most this often while the trader is around. */
export const SNAPSHOT_EVERY_MS = 60_000;
/** Moves smaller than this are not worth a mention. */
const MOVE_PCT = 5;

export interface Snapshot {
  t: number;
  /** Token key → its symbol and price. */
  prices: Record<string, { symbol: string; price: number }>;
  /** The trader's own wallet: value of the positions and their open profit. */
  positions: { value: number; pnl: number } | null;
}

export interface SeenEvent {
  t: number;
  title: string;
  /** A followed wallet bought or sold. */
  wallet: boolean;
}

export interface AwaySummary {
  /** "1h 20m". */
  away: string;
  lines: string[];
}

export function awaySummary(before: Snapshot, now: Snapshot, events: SeenEvent[]): AwaySummary | null {
  const lines: string[] = [];

  const moves = Object.entries(now.prices)
    .map(([key, q]) => {
      const was = before.prices[key];
      return was && was.price > 0 ? { symbol: q.symbol, pct: (q.price / was.price - 1) * 100 } : null;
    })
    .filter((m): m is { symbol: string; pct: number } => m != null && Math.abs(m.pct) >= MOVE_PCT)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 3);
  if (moves.length) lines.push(`Moves: ${moves.map((m) => `${m.symbol} ${formatPct(m.pct)}`).join(", ")}`);

  if (before.positions && now.positions) {
    const d = now.positions.pnl - before.positions.pnl;
    if (Math.abs(d) >= 1) lines.push(`Your wallet: ${formatSignedUsd(d)} on open positions`);
  }

  const since = events.filter((e) => e.t >= before.t);
  const alerts = since.filter((e) => !e.wallet);
  const walletMoves = since.filter((e) => e.wallet);
  if (alerts.length === 1) lines.push(`1 alert: ${alerts[0].title}`);
  else if (alerts.length > 1) lines.push(`${alerts.length} alerts, last: ${alerts[alerts.length - 1].title}`);
  if (walletMoves.length) {
    const shown = walletMoves.slice(-2).map((e) => e.title).join("; ");
    lines.push(walletMoves.length > 2 ? `${shown} (+${walletMoves.length - 2} more)` : shown);
  }

  if (lines.length === 0) return null;
  return { away: formatDuration(now.t - before.t), lines: lines.slice(0, 4) };
}
