import { describe, expect, it } from "vitest";
import { dangle, MAX_TURN, piecesOf, pose, pulls, still, type Pieces } from "./pieces";

describe("loose bits", () => {
  it("turn with the swing, spread with a hop, and bob", () => {
    expect(pose({ src: "a", pivot: [0, 0] }, 0.4, 0)).toEqual({ angle: 0.2, dy: 0 });
    const left = pose({ src: "l", pivot: [0, 0], swing: 0, spread: -0.7 }, 0, 1);
    const right = pose({ src: "r", pivot: [0, 0], swing: 0, spread: 0.7 }, 0, 1);
    expect(left.angle).toBeLessThan(0);
    expect(right.angle).toBeCloseTo(-left.angle);
    expect(pose({ src: "p", pivot: [0, 0], bob: 1.5 }, 0, -1).dy).toBe(-1.5);
  });

  it("never turn past the limit", () => {
    const { angle } = pose({ src: "a", pivot: [0, 0], swing: 9, spread: 9 }, 1.5, 1.5);
    expect(angle).toBe(MAX_TURN);
  });

  it("wobble past the hat and settle back, even over slow frames", () => {
    let y = 0;
    let v = 0;
    let peak = 0;
    for (let i = 0; i < 10; i++) [y, v] = dangle(y, v, 1, 1 / 60);
    for (let i = 0; i < 600; i++) {
      [y, v] = dangle(y, v, 0, 1 / 60);
      peak = Math.min(peak, y);
    }
    expect(peak).toBeLessThan(-0.05);
    expect(still(y, v)).toBe(true);
    // One 50 ms frame does not fling it.
    [y, v] = dangle(0, 40, 0, 0.05);
    expect(Math.abs(y)).toBeLessThanOrEqual(1.5);
  });

  it("lag behind the hat's swing and the head's rise", () => {
    expect(pulls(4, 0).side).toBeLessThan(0);
    expect(pulls(0, -50).up).toBeGreaterThan(0);
    expect(pulls(-100, 1000)).toEqual({ side: 1, up: -1 });
  });

  it("read only well formed pieces from the manifest", () => {
    const all: Record<string, Pieces> = {
      "outfits/beanie.svg": { base: "outfits/beanie/base.svg", parts: [{ src: "outfits/beanie/pompom.svg", pivot: [64, 12] }] },
      "outfits/bad.svg": { parts: [{ src: "x.svg", pivot: [1] as unknown as [number, number] }] },
      "outfits/empty.svg": { parts: [] },
    };
    expect(piecesOf(all, "outfits/beanie.svg")?.parts).toHaveLength(1);
    expect(piecesOf(all, "outfits/bad.svg")).toBeNull();
    expect(piecesOf(all, "outfits/empty.svg")).toBeNull();
    expect(piecesOf(all, "outfits/cap.svg")).toBeNull();
    expect(piecesOf(undefined, "outfits/beanie.svg")).toBeNull();
    expect(piecesOf(all, null)).toBeNull();
  });
});
