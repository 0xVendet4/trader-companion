// Candy's flourishes: confetti on a strong rise, a rain cloud on a strong
// drop, coins for a profitable sale, the wick lit or smoking… Each is played
// only now and then, never on every trigger (the user's call: "se não for
// sempre, é sim"): a chance per trigger and a quiet time after it plays. Pure:
// the island rolls the dice and plays what comes out.

import type { CompanionEvent } from "../core/state";

export type Flourish =
  | "flame"
  | "smoke"
  | "confetti"
  | "cloud"
  | "coins"
  | "tear"
  | "joyJump"
  | "shrink"
  | "yawn"
  | "boing"
  | "glance"
  | "fireworks";

interface Rule {
  /** The chance it plays when its moment comes (0–1). */
  chance: number;
  /** After it played, it stays quiet this long. */
  quietMs: number;
}

const MIN = 60_000;

export const FLOURISHES: Record<Flourish, Rule> = {
  flame: { chance: 0.5, quietMs: 10 * MIN },
  smoke: { chance: 0.7, quietMs: 10 * MIN },
  confetti: { chance: 0.45, quietMs: 15 * MIN },
  cloud: { chance: 0.45, quietMs: 15 * MIN },
  coins: { chance: 0.6, quietMs: 5 * MIN },
  tear: { chance: 0.35, quietMs: 20 * MIN },
  joyJump: { chance: 0.45, quietMs: 10 * MIN },
  shrink: { chance: 0.45, quietMs: 10 * MIN },
  yawn: { chance: 0.3, quietMs: 8 * MIN },
  boing: { chance: 0.35, quietMs: 2 * MIN },
  glance: { chance: 0.25, quietMs: 1 * MIN },
  fireworks: { chance: 0.8, quietMs: 60 * MIN },
};

/**
 * Whether a flourish plays now: its quiet time is over and the dice (`roll`,
 * 0–1) say yes. `last` remembers when each one last played, and is updated.
 */
export function shouldFlourish(kind: Flourish, last: Map<Flourish, number>, now: number, roll: number): boolean {
  const rule = FLOURISHES[kind];
  if (now - (last.get(kind) ?? -Infinity) < rule.quietMs) return false;
  if (roll >= rule.chance) return false;
  last.set(kind, now);
  return true;
}

/**
 * The flourishes an event could bring, the likeliest first; the island tries
 * them in order and plays at most one. A strong rise: confetti, a joy jump or
 * the wick lit; a strong drop: a rain cloud or a shrink; the loss limit or a
 * stop: the flame goes out in smoke; a green week (or month): fireworks.
 */
export function flourishesFor(e: CompanionEvent, totalOfWeek?: number): Flourish[] {
  switch (e.kind) {
    case "alert":
      if (e.tone === "up") return ["confetti", "joyJump", "flame"];
      if (e.tone === "down") return ["cloud", "shrink"];
      return [];
    case "lossLimit":
    case "maxTrades":
    case "tilt":
      return ["smoke"];
    case "weekRecap":
      return totalOfWeek != null && totalOfWeek > 0 ? ["fireworks"] : [];
    default:
      return [];
  }
}

/**
 * How big the wick's flame burns for the market's hour, from a little (0.7)
 * to big (1.5); null when nothing rises enough to light it.
 */
export function flameSize(hourPct: number | null): number | null {
  if (hourPct == null || !(hourPct >= 3)) return null;
  return Math.min(1.5, 0.7 + (hourPct - 3) / 25);
}
