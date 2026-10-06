// Where the mascot's eyes look, and what it does when nobody pokes it. Pure: the
// island hands in positions, the mood and a random pick.

import type { MascotState, Motion } from "./mascot";

export interface Gaze {
  /** Where the eyes point, −1 (left / up) to 1 (right / down). */
  x: number;
  y: number;
}

export const NEUTRAL_GAZE: Gaze = { x: 0, y: 0 };

/** Beyond this distance (px) the eyes are at the edge of their travel. */
const REACH = 220;

/**
 * The eyes of a mascot at (mx, my) on a cursor at (cx, cy). Close by they
 * move a little, further away all the way; right under the cursor they look
 * straight ahead.
 */
export function gazeAt(mx: number, my: number, cx: number, cy: number): Gaze {
  const vx = cx - mx;
  const vy = cy - my;
  const dist = Math.hypot(vx, vy);
  if (!Number.isFinite(dist) || dist < 6) return NEUTRAL_GAZE;
  const pull = Math.min(1, dist / REACH);
  const round = (n: number) => Math.round(n * 100) / 100 || 0;
  return { x: round((vx / dist) * pull), y: round((vy / dist) * pull) };
}

/** The cursor came this close (px) from further away: the mascot notices. */
export const NOTICE_PX = 80;

export interface Fidget {
  motion: Motion;
  /** Optional short line; most fidgets are silent. */
  say?: string;
  ms: number;
  wink?: boolean;
}

const FIDGETS: Fidget[] = [
  { motion: "flip", ms: 900 }, // a look around
  { motion: "squish", ms: 1100 }, // a stretch
  { motion: "hop", ms: 1000 },
  { motion: "wiggle", ms: 1300 },
  { motion: "sway", say: "♪", ms: 2200 },
  { motion: "none", ms: 400, wink: true },
];

/** How long between two fidgets, ms. */
export function fidgetDelay(random: number): number {
  return 9000 + Math.floor(random * 9000);
}

/** A small idle move that fits the mood; null when the mood should stay still. */
export function pickFidget(mood: MascotState, random: number): Fidget | null {
  if (mood === "stop" || mood === "shocked" || mood === "alert") return null;
  if (mood === "sleepy" || mood === "tired") return random < 0.5 ? { motion: "droop", say: "*yawn*", ms: 1800 } : null;
  return FIDGETS[Math.floor(random * FIDGETS.length) % FIDGETS.length];
}
