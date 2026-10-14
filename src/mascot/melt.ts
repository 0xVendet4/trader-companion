// Candy is a candle: on a strong drop his wax runs down his body, and it firms
// up again as the price comes back. Pure: the island hands in the price that
// counts (the trader's biggest position, else the first token on the
// watchlist) and the stage he is at; paint.ts draws the drips.

import type { MascotState } from "./mascot";

/** What a quote needs for this: its 5-minute and 1-hour moves, in %. */
export interface Mover {
  change: { m5: number; h1: number };
}

export type MeltStage = 0 | 1 | 2 | 3;

/** The drop (%, the worse of 5 min and 1 h) that brings each stage: a little, more, a lot. */
export const MELT_AT = [-15, -25, -40] as const;
/**
 * A stage holds until the price is back this many points above its line: a
 * price hovering at -15% doesn't make him melt and firm up every poll.
 */
export const MELT_HOLD = 7;
/** How far the drips have run at each stage (0–1; paint.ts → drawMelt draws each stage at these levels). */
export const MELT_LEVELS: Record<MeltStage, number> = { 0: 0, 1: 1 / 3, 2: 2 / 3, 3: 1 };

/** The drop that counts on a quote: the worse of its 5-minute and 1-hour moves; null without numbers. */
export function meltDrop(q: Mover | null | undefined): number | null {
  if (!q) return null;
  const moves = [q.change.m5, q.change.h1].filter((v) => typeof v === "number" && Number.isFinite(v));
  return moves.length ? Math.min(...moves) : null;
}

/** The stage a drop reaches on its own, with no history. */
function reached(drop: number): MeltStage {
  let s: MeltStage = 0;
  MELT_AT.forEach((line, i) => {
    if (drop <= line) s = (i + 1) as MeltStage;
  });
  return s;
}

/**
 * The stage to show now, from the one shown before and the drop: deeper at
 * once, back up only once the price has recovered MELT_HOLD points past the
 * stage's line. No numbers: he firms up.
 */
export function meltStage(prev: MeltStage, drop: number | null): MeltStage {
  if (drop == null || !Number.isFinite(drop)) return 0;
  const now = reached(drop);
  if (now >= prev) return now;
  let keep = prev;
  while (keep > now && drop > MELT_AT[keep - 1] + MELT_HOLD) keep = (keep - 1) as MeltStage;
  return keep;
}

/** Faces that smile (the calm one too, see the art): they read wrong on a melting candle. */
const SMILING: ReadonlySet<MascotState> = new Set(["idle", "happy", "celebrate", "excited", "proud", "love", "cool", "relieved", "wave"]);

/**
 * The face he wears while melting: the market's mood, except a smiling one
 * (the rest of the watchlist may be up while his own price falls hard), which
 * turns nervous, and worried at the deepest stage.
 */
export function meltMood(mood: MascotState, stage: MeltStage): MascotState {
  if (stage === 0 || !SMILING.has(mood)) return mood;
  return stage >= 3 ? "worried" : "nervous";
}

/**
 * The price Candy melts for: the trader's biggest position (`held`, biggest
 * first), or without one, the first token on the watchlist (a pinned one
 * first, as the list shows them) that has a quote.
 */
export function meltSubject<T extends { pinned?: boolean }>(
  held: (Mover | null | undefined)[],
  watchlist: readonly T[],
  quoteOf: (t: T) => Mover | null | undefined,
): Mover | null {
  const own = held.find((q) => q != null);
  if (own) return own;
  const ordered = [...watchlist.filter((t) => t.pinned), ...watchlist.filter((t) => !t.pinned)];
  for (const t of ordered) {
    const q = quoteOf(t);
    if (q) return q;
  }
  return null;
}
