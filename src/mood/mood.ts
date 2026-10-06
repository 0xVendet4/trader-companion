// What the mascot feels, from the watchlist, the trader's own positions and
// the trade log. Pure function: the island calls it after every poll and every
// logged trade.

import { formatPct } from "../core/format";
import type { MarketStatus, Quote, WatchToken } from "../core/state";
import type { MascotState } from "../mascot/mascot";

/** A 5-minute move this size on any token takes over the mood. */
export const BIG_MOVE_M5 = 15;
/** Average 1-hour change across the watchlist that reads as "green" or "red". */
export const TREND_H1 = 5;
/** Below this 5-minute move everywhere, with little volume, the market is asleep. */
const QUIET_M5 = 0.5;
const QUIET_VOLUME_M5 = 500;

export interface MoodInput {
  tokens: WatchToken[];
  quotes: Record<string, Quote>;
  status: MarketStatus;
  paused: boolean;
  /** Today's loss limit has been reached. */
  stopped: boolean;
  /** A post-loss cool-down is running. */
  coolingDown: boolean;
  /** Addresses whose liquidity alert fired recently. */
  liquidityWarnings: Set<string>;
  /** Local hour, 0–23. */
  hour?: number;
  nightSleep?: boolean;
  /** SOL itself, when the mascot should react to it. */
  sol?: Quote | null;
  /** The trader's own positions (see src/positions), priced. */
  positions?: PositionMood[];
  /** The crypto Fear & Greed index (0–100), when the header shows it. */
  fearGreed?: number | null;
}

/** 5-minute volume this many times the hour's 5-minute average: a spike. */
export const VOLUME_SPIKE_X = 3;
/** …and at least this much, so dust tokens don't count. */
const VOLUME_SPIKE_MIN = 20_000;
/** At or below this, the Fear & Greed index reads "extreme fear". */
export const EXTREME_FEAR = 20;
/** At or above this, "extreme greed". */
export const EXTREME_GREED = 80;
/** The watchlist's 1-hour average this far down: a rough hour. */
export const ROUGH_H1 = -15;
/** Both the 5-minute and the 1-hour move this big, opposite ways: whipsaw. */
export const WHIPSAW_PCT = 8;

/** The watchlist token swinging hardest both ways (up in the hour, down in 5 min, or the reverse). */
export function whipsaw(quoted: { t: WatchToken; q: Quote }[]): { t: WatchToken; q: Quote } | null {
  let best: { t: WatchToken; q: Quote; size: number } | null = null;
  for (const { t, q } of quoted) {
    const { m5, h1 } = q.change;
    if (Math.abs(m5) < WHIPSAW_PCT || Math.abs(h1) < WHIPSAW_PCT || Math.sign(m5) === Math.sign(h1)) continue;
    const size = Math.abs(m5) + Math.abs(h1);
    if (!best || size > best.size) best = { t, q, size };
  }
  return best && { t: best.t, q: best.q };
}

/** The watchlist token whose 5-minute volume jumped the most, if any did. */
export function volumeSpike(quoted: { t: WatchToken; q: Quote }[]): { t: WatchToken; ratio: number } | null {
  let best: { t: WatchToken; ratio: number } | null = null;
  for (const { t, q } of quoted) {
    const avg = q.volume.h1 / 12;
    if (!(avg > 0) || q.volume.m5 < VOLUME_SPIKE_MIN) continue;
    const ratio = q.volume.m5 / avg;
    if (ratio >= VOLUME_SPIKE_X && (!best || ratio > best.ratio)) best = { t, ratio };
  }
  return best;
}

export interface PositionMood {
  symbol: string;
  /** Value over cost: 2 is a 2x. */
  multiple: number | null;
  pnlPct: number | null;
  /** Numbers start from when tracking began, not a real entry. */
  fromTracking: boolean;
}

/** A position this far up, or down, from its entry colours the mood. */
export const POSITION_UP_X = 2;
export const POSITION_DOWN_PCT = -30;

/** The trader's own positions: the deepest drawdown first, then the best run. */
function positionMood(list: PositionMood[] | undefined): Mood | null {
  if (!list?.length) return null;
  const since = (p: PositionMood) => (p.fromTracking ? "since tracking" : "from entry");
  const down = list
    .filter((p) => p.pnlPct != null && p.pnlPct <= POSITION_DOWN_PCT)
    .sort((a, b) => a.pnlPct! - b.pnlPct!)[0];
  if (down) return { state: "worried", text: `Your ${down.symbol}: ${formatPct(down.pnlPct)} ${since(down)}.`, lasting: "position", subject: down.symbol };
  const up = list.filter((p) => p.multiple != null && p.multiple >= POSITION_UP_X).sort((a, b) => b.multiple! - a.multiple!)[0];
  if (up) return { state: "celebrate", text: `Your ${up.symbol}: ${(Math.floor(up.multiple! * 10) / 10).toFixed(1)}x ${since(up)}!`, lasting: "position", subject: up.symbol };
  return null;
}

/** Local hours (from 1 am to before 6 am) when the mascot dozes off. */
const NIGHT_FROM = 1;
const NIGHT_TO = 6;
/** SOL moving this much in an hour colours the mood when the watchlist is calm. */
export const SOL_MOVE_H1 = 3;

export interface Mood {
  state: MascotState;
  text: string;
  /**
   * A market mood (a big move, a liquidity drop, the watchlist's trend, SOL,
   * the trader's position): its face shows when it starts, then settles
   * (see settleMood). Moods without it (loss limit, pause, sleep, cooldown,
   * no data) stay as long as their reason.
   */
  lasting?: "move" | "liquidity" | "trend" | "sol" | "position";
  /** The token it is about: another token restarts the face. */
  subject?: string;
}

/** How long a market mood shows its face before Candy goes back to neutral. */
export const SETTLE_MS = 3 * 60_000;
/** A 5-minute move is news, not a state: its face is a flash. */
export const SETTLE_MOVE_MS = 10_000;

/**
 * The face to show for a mood that started at `since`: a market mood settles
 * into the neutral face after a while (the caption keeps saying why).
 */
export function settleMood(mood: Mood, since: number, now: number): Mood {
  const left = settlesIn(mood, since, now);
  return left == null || left > 0 ? mood : { ...mood, state: "idle" };
}

/** Ms until a market mood settles (0 or less: settled); null if it never does. */
export function settlesIn(mood: Mood, since: number, now: number): number | null {
  if (!mood.lasting) return null;
  return since + (mood.lasting === "move" ? SETTLE_MOVE_MS : SETTLE_MS) - now;
}

/** Same condition and token, numbers aside: a new key restarts the settle clock. */
export function moodKey(mood: Mood): string {
  return `${mood.state}:${mood.lasting ?? ""}:${mood.subject ?? ""}`;
}

export function computeMood(input: MoodInput): Mood {
  if (input.stopped) return { state: "stop", text: "Daily loss limit hit. Tomorrow's another day." };
  if (input.paused) return { state: "sleepy", text: "Paused. Use the tray icon to resume." };
  const own = positionMood(input.positions);
  if (input.tokens.length === 0) return own ?? { state: "idle", text: "Add a token below and I'll watch it." };
  if (input.status === "error") return { state: "confused", text: "DexScreener isn't answering. Retrying…" };

  const quoted = input.tokens
    .map((t) => ({ t, q: input.quotes[t.key] }))
    .filter((x): x is { t: WatchToken; q: Quote } => x.q != null);
  if (quoted.length === 0) return own ?? { state: "idle", text: "Fetching prices…" };

  const warned = quoted.find((x) => input.liquidityWarnings.has(x.t.key));
  if (warned) return { state: "shocked", text: `${warned.t.symbol} liquidity dropped. Heads up.`, lasting: "liquidity", subject: warned.t.key };

  if (input.coolingDown) return { state: "tired", text: "Post-loss cooldown. Breathe." };

  // The biggest 5-minute mover, either way.
  let mover = quoted[0];
  for (const x of quoted) if (Math.abs(x.q.change.m5) > Math.abs(mover.q.change.m5)) mover = x;
  if (mover.q.change.m5 >= BIG_MOVE_M5) {
    return { state: "celebrate", text: `${mover.t.symbol} ${formatPct(mover.q.change.m5)} in 5 min!`, lasting: "move", subject: mover.t.key };
  }
  if (mover.q.change.m5 <= -BIG_MOVE_M5) {
    return { state: "shocked", text: `${mover.t.symbol} ${formatPct(mover.q.change.m5)} in 5 min.`, lasting: "move", subject: mover.t.key };
  }

  // Up and down at once: the world is spinning.
  const swing = whipsaw(quoted);
  if (swing) {
    return {
      state: "dizzy",
      text: `${swing.t.symbol} is all over the place: ${formatPct(swing.q.change.h1)} 1h, ${formatPct(swing.q.change.m5)} 5m.`,
      lasting: "move",
      subject: swing.t.key,
    };
  }

  // A volume spike: something is going on, eyes on it.
  const spike = volumeSpike(quoted);
  if (spike) {
    return {
      state: "focused",
      text: `${spike.t.symbol} volume is heating up: ${Math.round(spike.ratio)}x the hour's pace.`,
      lasting: "move",
      subject: spike.t.key,
    };
  }

  // Late at night only a big move (above) wakes it up.
  if (input.nightSleep && input.hour != null && input.hour >= NIGHT_FROM && input.hour < NIGHT_TO) {
    return { state: "sleepy", text: "It's late. Sleep is part of the strategy." };
  }

  // The trader's own money comes before the watchlist's average.
  if (own) return own;

  const avgH1 = quoted.reduce((s, x) => s + x.q.change.h1, 0) / quoted.length;
  if (avgH1 <= ROUGH_H1) return { state: "sick", text: `Rough hour: watchlist ${formatPct(avgH1)} avg (1h).`, lasting: "trend" };
  if (avgH1 >= TREND_H1) return { state: "happy", text: `Watchlist is green: ${formatPct(avgH1)} avg (1h).`, lasting: "trend" };
  if (avgH1 <= -TREND_H1) return { state: "worried", text: `Watchlist is red: ${formatPct(avgH1)} avg (1h).`, lasting: "trend" };

  const sol = input.sol;
  if (sol && sol.change.h1 >= SOL_MOVE_H1) return { state: "happy", text: `SOL ${formatPct(sol.change.h1)} in the last hour. Good vibes.`, lasting: "sol" };
  if (sol && sol.change.h1 <= -SOL_MOVE_H1) return { state: "worried", text: `SOL ${formatPct(sol.change.h1)} in the last hour. Careful out there.`, lasting: "sol" };

  if (input.fearGreed != null && input.fearGreed >= EXTREME_GREED) {
    return { state: "excited", text: `Extreme greed in crypto: ${input.fearGreed}/100.`, lasting: "trend" };
  }
  if (input.fearGreed != null && input.fearGreed <= EXTREME_FEAR) {
    return { state: "nervous", text: `Extreme fear in crypto: ${input.fearGreed}/100.`, lasting: "trend" };
  }

  const quiet = quoted.every(
    (x) => Math.abs(x.q.change.m5) < QUIET_M5 && x.q.volume.m5 < QUIET_VOLUME_M5,
  );
  if (quiet) return { state: "bored", text: "Market's quiet. Nothing moving…", lasting: "trend" };

  return { state: "idle", text: "Watching the market." };
}
