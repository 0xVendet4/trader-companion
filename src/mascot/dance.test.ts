import { describe, expect, it } from "vitest";
import { DANCE_BPM, danceStep, dancesIn, stepDanceLevel } from "./dance";

describe("the dance", () => {
  it("hops up on the beat and squashes on the landing", () => {
    const beat = 60 / DANCE_BPM;
    const top = danceStep(beat / 2, 1);
    expect(top.dy).toBeLessThan(-8);
    expect(top.sx).toBeCloseTo(1, 1);
    expect(top.sy).toBeCloseTo(1, 1);
    const landing = danceStep(beat, 1);
    expect(landing.dy).toBeCloseTo(0, 5);
    expect(landing.sx).toBeGreaterThan(1);
    expect(landing.sy).toBeLessThan(1);
  });

  it("stays upright: no sway or lean to the sides, and nothing at level 0", () => {
    for (let t = 0; t < 2; t += 0.05) {
      const s = danceStep(t, 1);
      expect(s.dx).toBe(0);
      expect(s.rot).toBe(0);
    }
    expect(danceStep(0.1, 0)).toEqual({ dx: 0, dy: 0, rot: 0, sx: 1, sy: 1 });
    expect(danceStep(0.1, 0.5).dy).toBeCloseTo(danceStep(0.1, 1).dy / 2);
  });

  it("fades in over 0.3 s and out over 0.5 s", () => {
    let level = 0;
    for (let i = 0; i < 18; i++) level = stepDanceLevel(level, true, 1 / 60);
    expect(level).toBe(1);
    for (let i = 0; i < 15; i++) level = stepDanceLevel(level, false, 1 / 60);
    expect(level).toBeCloseTo(0.5, 1);
    for (let i = 0; i < 20; i++) level = stepDanceLevel(level, false, 1 / 60);
    expect(level).toBe(0);
  });

  it("sits out the moods that would not dance", () => {
    expect(dancesIn("idle")).toBe(true);
    expect(dancesIn("happy")).toBe(true);
    expect(dancesIn("celebrate")).toBe(true);
    for (const s of ["alert", "stop", "sleepy", "sick", "sad"] as const) expect(dancesIn(s), s).toBe(false);
  });
});
