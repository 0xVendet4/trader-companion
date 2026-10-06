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
