// Accessories in pieces: the loose bits of a hat or a scarf (a pompom, a
// bunny's ears, a tassel, a scarf's ends), each its own picture turning about
// where it is attached, so they trail the hat's swing and Candy's hops. The
// manifest lists them by the accessory's path; the whole accessory stays a
// single picture too, for the wardrobe and for art that has no pieces.

/** A loose bit: its picture, where it is attached, and how it moves. */
export interface Piece {
  src: string;
  /** Where it is attached, in art units (the 128 canvas). */
  pivot: [number, number];
  /** How far it trails a turn of the head (default 1). */
  swing?: number;
  /** How far it turns on a hop (negative: the other way): ears flop out as he lands. */
  spread?: number;
  /** How far it bobs on a hop, art units. */
  bob?: number;
  /** Drawn under the rest of the accessory (a scarf's ends under the knot). */
  under?: boolean;
}

/** An accessory cut up: what stays put, and the loose bits. */
export interface Pieces {
  /** The rest of it; none when it is all loose bits (a bunny's ears). */
  base?: string;
  parts: Piece[];
}

/** The most a loose bit turns, radians. */
export const MAX_TURN = 0.8;

/** A loose bit's turn (radians) and bob (art units), from the two springs. */
export function pose(p: Piece, side: number, up: number): { angle: number; dy: number } {
  const a = (p.swing ?? 1) * side * 0.5 + (p.spread ?? 0) * up * 0.6;
  return { angle: Math.max(-MAX_TURN, Math.min(MAX_TURN, a)), dy: (p.bob ?? 0) * up };
}

/**
 * The loose bits' spring: looser than the hat's (stiffness 38, damping 3.2),
 * so they wobble on a little after it settles. Sub-stepped at 240 Hz so a slow
 * frame cannot fling them, and held within ±1.5. Returns position and velocity.
 */
export function dangle(y: number, v: number, target: number, dt: number): [number, number] {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    v += (38 * (target - y) - 3.2 * v) * h;
    y += v * h;
  }
  return [Math.max(-1.5, Math.min(1.5, y)), v];
}

/**
 * What pulls on them (−1…1): sideways, the hat's swing as it turns (they lag
 * behind it); up and down, how fast the top of the head moves (art units per
 * second, down positive) — they hang back as it rises and drop on as it stops.
 */
export function pulls(swingV: number, topV: number): { side: number; up: number } {
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  return { side: clamp(-swingV * 0.15), up: clamp(-topV / 70) };
}

/** Settled: close enough to rest that the drawing can stop. */
export function still(y: number, v: number): boolean {
  return Math.abs(y) <= 0.003 && Math.abs(v) <= 0.015;
}

/** The accessory's pieces, if the manifest cuts it up (well formed only). */
export function piecesOf(all: Record<string, Pieces> | undefined, src: string | null): Pieces | null {
  const p = src ? all?.[src] : undefined;
  if (!p || !Array.isArray(p.parts) || !p.parts.length) return null;
  const ok = p.parts.every((q) => typeof q.src === "string" && Array.isArray(q.pivot) && q.pivot.length === 2 && q.pivot.every(Number.isFinite));
  return ok ? p : null;
}
