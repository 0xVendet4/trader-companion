// The dance: while music plays on the PC, Candy bobs to a beat of its own (the
// OS says only that something plays, never its tempo). Pure and tested; the
// mascot applies the step each frame. Dancing along is Coucou's idea (MIT, ©
// Louis Raillé); the steps and the numbers are Candy's.

import type { MascotState } from "./mascot";

/** The beat Candy keeps, whatever plays. */
export const DANCE_BPM = 100;

/** Where the body is at a moment of the dance, about the foot of the wick: art units and radians. */
export interface DanceStep {
  dx: number;
  dy: number;
  rot: number;
  sx: number;
  sy: number;
}

const STILL: DanceStep = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 };

/**
 * One beat is a hop with a sway and a lean the same way; the landing squashes
 * the body a little. `level` (0–1) scales it all, so the dance can fade in and out.
 */
export function danceStep(t: number, level: number): DanceStep {
  if (level <= 0) return STILL;
  const beat = (t * DANCE_BPM) / 60;
  const sway = Math.sin(Math.PI * beat);
  const hop = Math.abs(sway);
  const land = Math.pow(1 - hop, 6);
  return {
    dx: 3.5 * sway * level,
    dy: -9 * hop * level,
    rot: 0.07 * sway * level,
    sx: 1 + 0.05 * land * level,
    sy: 1 - 0.07 * land * level,
  };
}

/** Moods that sit the dance out: an alarm, the stop sign, asleep or worn out, ill, upset, reeling. */
const SITS_OUT: ReadonlySet<MascotState> = new Set(["alert", "stop", "sleepy", "tired", "sick", "sad", "angry", "dizzy", "worried", "nervous"]);

export function dancesIn(state: MascotState): boolean {
  return !SITS_OUT.has(state);
}

/** The dance comes in over 0.3 s and fades out over 0.5 s. */
export function stepDanceLevel(level: number, dancing: boolean, dt: number): number {
  return dancing ? Math.min(1, level + dt / 0.3) : Math.max(0, level - dt / 0.5);
}
