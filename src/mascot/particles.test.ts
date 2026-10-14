import { describe, expect, it } from "vitest";
import { alpha, CANDY_TOP, spawn, step, type Particle } from "./particles";

/** A fixed random source: the same sequence every run. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("particles", () => {
  it("staggers a burst and starts it over the head", () => {
    const ps = spawn("heart", 4, seeded());
    expect(ps).toHaveLength(4);
    expect(ps.map((p) => p.age)).toEqual([0, -0.12, -0.24, -0.36]);
    for (const p of ps) {
      expect(p.y).toBeLessThanOrEqual(CANDY_TOP.y + 6);
      expect(Math.abs(p.x - CANDY_TOP.x)).toBeLessThanOrEqual(CANDY_TOP.w * 0.4);
      expect(p.vy).toBeLessThan(0);
    }
  });

  it("rises then fades, and dies at the end of its life", () => {
    const [p] = spawn("star", 1, seeded(7));
    const y0 = p.y;
    let ps: Particle[] = [p];
    for (let i = 0; i < 30; i++) ps = step(ps, 1 / 60);
    expect(ps).toHaveLength(1);
    expect(p.y).toBeLessThan(y0);
    expect(alpha(p)).toBe(1);
    while (ps.length) ps = step(ps, 1 / 60);
    expect(p.age).toBeGreaterThanOrEqual(p.life);
  });

  it("does not move a particle that is still waiting its turn", () => {
    const ps = spawn("spark", 2, seeded(3));
    const late = ps[1];
    const { x, y } = late;
    step(ps, 0.05);
    expect(late.x).toBe(x);
    expect(late.y).toBe(y);
    expect(alpha(late)).toBe(0);
  });

  it("sends one check straight up from the middle of the head", () => {
    const [c] = spawn("check", 1, () => 0.9);
    expect(c).toMatchObject({ kind: "check", x: CANDY_TOP.x, vx: 0, rot: 0, size: 1 });
    const [later] = step([c], 0.5);
    expect(later.y).toBeLessThan(CANDY_TOP.y - 4);
    expect(later.x).toBe(CANDY_TOP.x);
  });

  it("drops the sweat down the cheek", () => {
    const [p] = spawn("sweat", 1, seeded(5));
    expect(p.x).toBeGreaterThan(CANDY_TOP.x);
    let ps = [p];
    for (let i = 0; i < 20; i++) ps = step(ps, 1 / 60);
    expect(p.vy).toBeGreaterThan(10);
    expect(p.y).toBeGreaterThan(CANDY_TOP.y + 6);
  });

  it("lights the wick where the art has it, and smoke rises from there", () => {
    const at = { ...CANDY_TOP, wick: { x: 64, y: 10 } };
    const [flame] = spawn("flame", 1, seeded(2), at);
    expect(flame).toMatchObject({ x: 64, y: 10, vx: 0, vy: 0 });
    step([flame], 0.5);
    expect(flame.y).toBe(10);
    const smoke = spawn("smoke", 3, seeded(4), at);
    let ps = smoke;
    for (let i = 0; i < 60; i++) ps = step(ps, 1 / 60);
    for (const p of smoke) expect(p.y).toBeLessThan(10);
  });

  it("drops confetti, coins and rain; sends notes and z's up", () => {
    const fall = (kind: Parameters<typeof spawn>[0]) => {
      const [p] = spawn(kind, 1, seeded(9));
      let ps = [p];
      for (let i = 0; i < 70 && ps.length; i++) ps = step(ps, 1 / 60);
      return p.vy;
    };
    expect(fall("confetti")).toBeGreaterThan(-60);
    expect(fall("coin")).toBeGreaterThan(fall("note"));
    expect(fall("rain")).toBeGreaterThan(0);
    const [note] = spawn("note", 1, seeded(1));
    expect(note.vy).toBeLessThan(0);
  });

  it("laughs a 'ha' off one side of the head, then the other, each rising and slowing", () => {
    const ps = spawn("ha", 4, seeded(5));
    expect(ps.map((p) => Math.sign(p.x - CANDY_TOP.x))).toEqual([1, -1, 1, -1]);
    expect(ps.map((p) => p.age)).toEqual([0, -0.24, -0.48, -0.72].map((a) => expect.closeTo(a, 6)));
    const [p] = ps;
    const vy0 = p.vy;
    expect(vy0).toBeLessThan(0);
    step([p], 0.2);
    expect(p.vy).toBeGreaterThan(vy0);
    expect(p.life).toBeLessThan(1.3);
  });

  it("fades in over the first 15 % and out over the last 30 %", () => {
    const p: Particle = { kind: "z", x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, rot: 0, size: 1 };
    expect(alpha(p)).toBe(0);
    p.age = 0.075;
    expect(alpha(p)).toBeCloseTo(0.5);
    p.age = 0.5;
    expect(alpha(p)).toBe(1);
    p.age = 0.85;
    expect(alpha(p)).toBeCloseTo(0.5);
  });
});
