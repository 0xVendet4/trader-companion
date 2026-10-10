// Little things that fly off the mascot: hearts for a cuddle, stars and sparks
// for a win, a drop of sweat, a z, a green check for a token swallowed. Pure: positions are art units (the body sits
// in a 128-unit box, see rig.ts), the caller steps them each frame and paint.ts
// draws them. The motion follows Coucou's Mochi engine (MIT, © Louis Raillé).

export type ParticleKind = "heart" | "star" | "spark" | "sweat" | "z" | "check";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds alive; negative while it waits its turn (a burst is staggered). */
  age: number;
  life: number;
  rot: number;
  size: number;
}

/** Where a burst starts: the top of the body, as its box says. */
export interface Origin {
  /** The body's middle. */
  x: number;
  /** The body's top edge. */
  y: number;
  w: number;
}

export const CANDY_TOP: Origin = { x: 64, y: 24, w: 72 };

/** Sweat falls; the rest drifts up a little slower each moment. */
const GRAVITY: Record<ParticleKind, number> = { heart: 8, star: 8, spark: 10, sweat: 120, z: 4, check: 6 };

/**
 * `n` particles of a kind, each starting a little after the one before so a
 * burst reads as a flurry. `rand` is the caller's random source (tests pass a
 * fixed one).
 */
export function spawn(kind: ParticleKind, n: number, rand: () => number, at: Origin = CANDY_TOP): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const p: Particle = { kind, x: at.x, y: at.y, vx: 0, vy: 0, age: 0 - i * 0.12, life: 1.4 + rand() * 0.5, rot: rand() * 6, size: 0.85 + rand() * 0.5 };
    if (kind === "sweat") {
      // From the temple, rolling off the cheek.
      p.x = at.x + at.w * 0.47;
      p.y = at.y + 6;
      p.vx = 6 + rand() * 6;
      p.vy = 10;
      p.life = 0.9;
    } else if (kind === "check") {
      // One check, straight up from the top of the head, slowing as it goes.
      p.x = at.x;
      p.y = at.y - 4;
      p.vx = 0;
      p.vy = -18;
      p.rot = 0;
      p.size = 1;
      p.life = 1.3;
    } else if (kind === "z") {
      // Off to the side, climbing.
      p.x = at.x + at.w * 0.36 + rand() * 8;
      p.y = at.y + 2;
      p.vx = 8 + rand() * 8;
      p.vy = -(18 + rand() * 12);
      p.life = 1.6 + rand() * 0.4;
    } else {
      // Up from the head, spread across it; the canvas has only ~56 units of
      // room above the body, so they fade before they leave it.
      p.x = at.x + (rand() - 0.5) * at.w * 0.8;
      p.y = at.y - 2 + rand() * 8;
      p.vx = (rand() - 0.5) * 30;
      p.vy = -(22 + rand() * 18);
    }
    out.push(p);
  }
  return out;
}

/** Moves every particle `dt` seconds on; returns the ones still alive. */
export function step(particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.age += dt;
    if (p.age >= p.life) continue;
    if (p.age >= 0) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += GRAVITY[p.kind] * dt;
    }
    alive.push(p);
  }
  return alive;
}

/** 0 while it waits, fading in over the first 15 % of its life and out over the last 30 %. */
export function alpha(p: Particle): number {
  if (p.age < 0) return 0;
  const k = p.age / p.life;
  if (k < 0.15) return k / 0.15;
  if (k > 0.7) return Math.max(0, (1 - k) / 0.3);
  return 1;
}

/** The little sway each one has as it drifts, radians. */
export const sway = (p: Particle) => Math.sin(p.rot + Math.max(0, p.age) * 3) * 0.3;
