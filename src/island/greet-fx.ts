// The arrival's backdrop: white streaks rushing down while Candy falls into
// the island, then one ring of dots bursting out as he lands. Drawn on its own
// canvas for under two seconds, then nothing runs. Adapted from Coucou's
// greeting (MIT, © Louis Raillé): same seeded streaks and ring.

interface Streak {
  x: number;
  speed: number;
  len: number;
  thick: number;
  alpha: number;
  t0: number;
}

interface Dot {
  a: number;
  j: number;
  s: number;
  al: number;
}

/** Seeded (seed 7, as Coucou's) so every arrival looks the same. */
const FX = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const streaks: Streak[] = Array.from({ length: 70 }, () => ({
    x: rnd(),
    speed: 400 + rnd() * 300,
    len: 6 + rnd() * 16,
    thick: 1 + rnd() * 0.5,
    alpha: 0.25 + rnd() * 0.55,
    t0: rnd() * 0.35,
  }));
  const ring: Dot[] = Array.from({ length: 90 }, () => ({ a: rnd() * Math.PI * 2, j: (rnd() - 0.5) * 0.22, s: 0.7 + rnd() * 0.9, al: 0.45 + rnd() * 0.55 }));
  return { streaks, ring };
})();

const RING_AT = 0.45;
const RING_FOR = 1.35;
export const ARRIVAL_FX_S = RING_AT + RING_FOR;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Draws the backdrop `t` seconds in, the ring centred on (cx, cy), in CSS pixels. */
export function drawArrivalFx(c: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, t: number) {
  c.clearRect(0, 0, w, h);
  if (t < 0.55) {
    const fade = 1 - seg(t, 0.4, 0.55);
    for (const s of FX.streaks) {
      if (t < s.t0) continue;
      const bottom = (t - s.t0) * s.speed;
      if (bottom <= 0) continue;
      c.strokeStyle = `rgba(255,255,255,${s.alpha * fade})`;
      c.lineWidth = s.thick;
      c.beginPath();
      c.moveTo(s.x * w, Math.max(0, bottom - s.len));
      c.lineTo(s.x * w, Math.min(h, bottom));
      c.stroke();
    }
  }
  const k = seg(t, RING_AT, RING_AT + RING_FOR);
  if (k > 0 && k < 1) {
    const rx = 14 + (Math.max(w, 300) * 0.6 - 14) * easeOut(k);
    const ry = rx * 0.34;
    const fade = (1 - k) * (k < 0.08 ? k / 0.08 : 1);
    for (const d of FX.ring) {
      const r = 1 + d.j;
      c.fillStyle = `rgba(255,255,255,${d.al * fade})`;
      c.fillRect(cx + Math.cos(d.a) * rx * r, cy + Math.sin(d.a) * ry * r, d.s, d.s);
    }
  }
}

/** Plays the backdrop once on `canvas`, sized to it; resolves when done. Nothing keeps running after. */
export function playArrivalFx(canvas: HTMLCanvasElement, cx: number, cy: number): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const c = canvas.getContext("2d");
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const start = performance.now();
  const frame = () => {
    const t = (performance.now() - start) / 1000;
    drawArrivalFx(c, w, h, cx, cy, t);
    if (t < ARRIVAL_FX_S) requestAnimationFrame(frame);
    else c.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(frame);
}
