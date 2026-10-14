// A nap in a little bed: with the PC idle and the market calm, Candy now and
// then lies down in a bed in the island, eyes shut, z's drifting off, and
// wakes up when the trader comes back (a stretch and a yawn) or when
// something happens (a startled hop). Not every idle stretch: one roll of the
// dice per idle period, and a quiet time after a nap (flourish.ts → "nap").
// Pure: the island hands in what it sees.

import type { CompanionEvent } from "../core/state";
import type { MascotState } from "./mascot";

/** No mouse move for this long (see the island's away watch): the PC is idle. */
export const NAP_IDLE_MS = 10 * 60_000;

/** Moods calm enough to nap through: nothing notable, a quiet market, asleep or paused. */
const CALM: ReadonlySet<MascotState> = new Set(["idle", "bored", "sleepy"]);

export interface NapScene {
  /** Settings → Nap in a little bed. */
  enabled: boolean;
  /** The market's mood, under any settled face (a red watchlist settles to the neutral face, it is not calm). */
  mood: MascotState;
  /** He melts on a strong drop (melt.ts). */
  melting: boolean;
  /** An alert card waits, or an alert on the ticker has not been seen yet. */
  waiting: boolean;
  /** He can't lie down here: the island is hidden, he is out on the desktop, dancing, or in the wardrobe. */
  busy: boolean;
}

/** How a nap ends: the trader came back (a stretch), something happened (a startled hop), or quietly. */
export type Wake = "back" | "startled" | "quiet";

/** The market and the island let him nap. */
export function calmForNap(s: NapScene): boolean {
  return s.enabled && !s.busy && !s.waiting && !s.melting && CALM.has(s.mood);
}

/** The idle period is long enough and the scene calm: time to roll the dice for a nap. */
export function napDue(idleMs: number, s: NapScene): boolean {
  return idleMs >= NAP_IDLE_MS && calmForNap(s);
}

/**
 * How an event that comes in while he naps wakes him: the "while you were
 * away" card means the trader is back (a stretch and a yawn, as when the
 * mouse moves); anything else is news (a startled hop).
 */
export function wakeFor(kind: CompanionEvent["kind"]): Wake {
  return kind === "away" ? "back" : "startled";
}

/** While he naps: what wakes him, or null to sleep on. */
export function napEnds(s: NapScene): Wake | null {
  if (!s.enabled || s.busy) return "quiet";
  if (s.waiting || s.melting || !CALM.has(s.mood)) return "startled";
  return null;
}
