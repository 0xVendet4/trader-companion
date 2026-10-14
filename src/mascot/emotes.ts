// Emotes: a right-click on Candy opens a small menu of things to do on the spot
// (dance, wave, laugh, spin), each played once. The island draws the menu and
// the mascot plays the emote (Mascot.emote); this is the pure part: the list,
// where the menu opens and how the arrow keys walk it.

import { N_ } from "../core/i18n";
import type { SoundName } from "../core/sound";

export const EMOTES = ["dance", "wave", "laugh", "spin"] as const;
export type Emote = (typeof EMOTES)[number];

/** What each one is called in the menu (N_: t(label) where shown) and the sound it plays. */
export const EMOTE_INFO: Record<Emote, { label: string; sound: SoundName }> = {
  dance: { label: N_("Dance"), sound: "tada" },
  wave: { label: N_("Wave"), sound: "greet" },
  laugh: { label: N_("Laugh"), sound: "squeak" },
  spin: { label: N_("Spin"), sound: "whee" },
};

export function isEmote(v: unknown): v is Emote {
  return typeof v === "string" && (EMOTES as readonly string[]).includes(v);
}

export interface MenuSpot {
  left: number;
  top: number;
  /** Which side of Candy it opened on. */
  side: "right" | "left";
  /** How far down the menu Candy's middle is: where its little tail points. */
  tail: number;
}

/**
 * Where the menu opens, in the island's own pixels: beside Candy (`at`: his
 * middle and the radius of his body), to his right, or to his left when the
 * island has no room there, level with him, and always inside the island
 * (`box`), whose window takes no clicks outside it.
 */
export function menuSpot(
  at: { x: number; y: number; r: number },
  menu: { w: number; h: number },
  box: { w: number; h: number },
  gap = 6,
  margin = 6,
): MenuSpot {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  let side: MenuSpot["side"] = "right";
  let left = at.x + at.r + gap;
  if (left + menu.w > box.w - margin) {
    const other = at.x - at.r - gap - menu.w;
    if (other >= margin) {
      side = "left";
      left = other;
    } else left = clamp(left, margin, box.w - margin - menu.w);
  }
  const top = clamp(at.y - menu.h / 2, margin, box.h - margin - menu.h);
  const tail = clamp(at.y - top, 12, menu.h - 12);
  return { left, top, side, tail };
}

/** The item the arrow keys move to: `dir` 1 down, −1 up, wrapping; from none (−1), the first or the last. */
export function stepItem(index: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  if (index < 0 || index >= count) return dir > 0 ? 0 : count - 1;
  return (index + dir + count) % count;
}
