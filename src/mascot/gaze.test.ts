import { describe, expect, it } from "vitest";
import { NEUTRAL_GAZE, fidgetDelay, gazeAt, pickFidget } from "./gaze";

describe("gazeAt", () => {
  it("looks straight ahead right under the cursor", () => {
    expect(gazeAt(100, 50, 102, 51)).toEqual(NEUTRAL_GAZE);
  });

  it("points the eyes at the cursor, further the further it is", () => {
    const near = gazeAt(100, 50, 160, 50);
    const far = gazeAt(100, 50, 700, 50);
    expect(near.x).toBeGreaterThan(0);
    expect(far.x).toBeGreaterThan(near.x);
    expect(far.x).toBe(1);
    expect(gazeAt(100, 50, -500, 50).x).toBe(-1);
  });

  it("looks down at a cursor below, never past the edge", () => {
    const g = gazeAt(100, 50, 100, 900);
    expect(g).toEqual({ x: 0, y: 1 });
    const d = gazeAt(100, 50, 900, 900);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(1.01);
  });
});

describe("fidgets", () => {
  it("waits 9 to 18 s between moves", () => {
    expect(fidgetDelay(0)).toBe(9000);
    expect(fidgetDelay(0.999)).toBeLessThan(18000);
  });

  it("keeps still when the mood is serious", () => {
    expect(pickFidget("stop", 0.3)).toBeNull();
    expect(pickFidget("shocked", 0.3)).toBeNull();
  });

  it("yawns when sleepy, moves when idle", () => {
    expect(pickFidget("sleepy", 0.2)?.say).toBe("*yawn*");
    expect(pickFidget("idle", 0)).not.toBeNull();
  });
});
