// Little things that fly off the mascot: hearts for a cuddle, stars and sparks
// for a win, a drop of sweat, a z, a green check for a token swallowed;
// confetti, coins, music notes, fireworks, a rain cloud, a tear, the wick's
// flame and its smoke. Pure: positions are art units (the body sits in a
// 128-unit box, see rig.ts), the caller steps them each frame and paint.ts
// draws them. The motion follows Coucou's Mochi engine (MIT, © Louis Raillé).

export type ParticleKind =
  | "heart"
  | "star"
  | "spark"
  | "sweat"
  | "z"
  | "check"
  | "dots"
  | "confetti"
  | "coin"
  | "note"
  | "firework"
  | "cloud"
  | "rain"
  | "tear"
  | "smoke"
  | "flame";

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
  /** The tip of the wick, where a flame sits and smoke rises (a candle's art has one). */
  wick?: { x: number; y: number };
}

export const CANDY_TOP: Origin = { x: 64, y: 24, w: 72 };

/** Sweat, rain, coins and confetti fall; the rest drifts up a little slower each moment. */
const GRAVITY: Record<ParticleKind, number> = {
  heart: 8,
  star: 8,
  spark: 10,
  sweat: 120,
  z: 4,
  check: 6,
  dots: 3,
  confetti: 70,
  coin: 150,
  note: 4,
  firework: 40,
  cloud: 0,
  rain: 170,
  tear: 60,
  smoke: -4,
  flame: 0,
};

/** Where the wick's tip is when the art has no wick: just over the middle of the head. */
const wickTip = (at: Origin) => at.wick ?? { x: at.x, y: at.y - 6 };

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
    } else if (kind === "z" || kind === "note" || kind === "dots") {
      // Off to the side, climbing: a z asleep, a note while dancing, "…" bored.
      const side = kind === "note" && rand() < 0.5 ? -1 : 1;
      p.x = at.x + side * (at.w * 0.36 + rand() * 8);
      p.y = at.y + 2;
      p.vx = side * (8 + rand() * 8);
      p.vy = -(18 + rand() * 12);
      p.life = 1.6 + rand() * 0.4;
      p.age = 0 - i * 0.35;
    } else if (kind === "confetti" || kind === "firework") {
      // A pop of pieces off the head, out in every direction, then falling (confetti) or fading (a firework's sparks).
      const a = -Math.PI / 2 + (rand() - 0.5) * (kind === "firework" ? Math.PI * 2 : Math.PI * 1.3);
      const speed = kind === "firework" ? 40 + rand() * 20 : 45 + rand() * 35;
      p.x = at.x + (rand() - 0.5) * 10;
      p.y = kind === "firework" ? at.y - 30 : at.y - 2;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.age = kind === "firework" ? 0 - Math.floor(i / 12) * 0.5 : 0 - i * 0.02;
      p.life = kind === "firework" ? 0.9 + rand() * 0.3 : 1.5 + rand() * 0.5;
    } else if (kind === "coin") {
      // Popped up from the head, spinning, falling past it.
      p.x = at.x + (rand() - 0.5) * at.w * 0.6;
      p.y = at.y - 2;
      p.vx = (rand() - 0.5) * 40;
      p.vy = -(55 + rand() * 25);
      p.life = 1.3;
      p.age = 0 - i * 0.1;
    } else if (kind === "cloud") {
      // A little grey cloud hanging over the head.
      p.x = at.x;
      p.y = at.y - 26;
      p.vx = (rand() - 0.5) * 4;
      p.life = 2.6;
      p.size = 1;
    } else if (kind === "rain") {
      // Drops from under the cloud.
      p.x = at.x + (rand() - 0.5) * 26;
      p.y = at.y - 20;
      p.vx = 0;
      p.vy = 20;
      p.life = 0.55;
      p.age = 0.2 - i * 0.22;
    } else if (kind === "tear") {
      // Out of an eye, down the cheek.
      p.x = at.x + (rand() < 0.5 ? -1 : 1) * at.w * 0.18;
      p.y = at.y + 30;
      p.vx = 0;
      p.vy = 4;
      p.life = 1.4;
      p.size = 0.9;
    } else if (kind === "smoke") {
      // Puffs off the wick, rising and spreading.
      const tip = wickTip(at);
      p.x = tip.x + (rand() - 0.5) * 3;
      p.y = tip.y - 2;
      p.vx = (rand() - 0.5) * 8;
      p.vy = -(14 + rand() * 6);
      p.life = 1.8 + rand() * 0.4;
      p.age = 0 - i * 0.25;
    } else if (kind === "flame") {
      // Sits on the wick and flickers; `size` is how big it burns.
      const tip = wickTip(at);
      p.x = tip.x;
      p.y = tip.y;
      p.life = 2.6;
      p.size = 1;
      p.age = 0;
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
      // Confetti and smoke slow down sideways, as paper and air do.
      if (p.kind === "confetti" || p.kind === "smoke") p.vx *= 1 - Math.min(1, dt * 1.5);
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
