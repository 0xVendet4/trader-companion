import { describe, expect, it } from "vitest";
import { MELT_LEVELS, meltDrop, meltMood, meltStage, meltSubject, type MeltStage, type Mover } from "./melt";

const q = (h1: number, m5 = 0): Mover => ({ change: { m5, h1 } });

describe("melting on a strong drop", () => {
  it("reads the worse of the 5-minute and the hour's move", () => {
    expect(meltDrop(q(-18, 2))).toBe(-18);
    expect(meltDrop(q(4, -16))).toBe(-16);
    expect(meltDrop(null)).toBeNull();
    expect(meltDrop({ change: { m5: Number.NaN, h1: -20 } })).toBe(-20);
    expect(meltDrop({ change: { m5: Number.NaN, h1: Number.NaN } })).toBeNull();
  });

  it("melts more the harder it falls", () => {
    expect(meltStage(0, -5)).toBe(0);
    expect(meltStage(0, -14.9)).toBe(0);
    expect(meltStage(0, -15)).toBe(1);
    expect(meltStage(0, -26)).toBe(2);
    expect(meltStage(0, -55)).toBe(3);
    expect(meltStage(1, -41)).toBe(3);
  });

  it("firms up only once the price has really come back (no flicker)", () => {
    // Hovering just above the line: still melting.
    expect(meltStage(1, -12)).toBe(1);
    expect(meltStage(1, -8.5)).toBe(1);
    // Back past the line and the margin: firm again.
    expect(meltStage(1, -7.9)).toBe(0);
    expect(meltStage(1, 3)).toBe(0);
    // A partial recovery takes one stage back at a time.
    expect(meltStage(3, -36)).toBe(3);
    expect(meltStage(3, -32)).toBe(2);
    expect(meltStage(3, -20)).toBe(2);
    expect(meltStage(3, -17)).toBe(1);
    expect(meltStage(2, -2)).toBe(0);
  });

  it("firms up when the numbers go", () => {
    expect(meltStage(2, null)).toBe(0);
    expect(meltStage(3, Number.NaN)).toBe(0);
  });

  it("follows a crash and its recovery, poll after poll", () => {
    let s: MeltStage = 0;
    const seen: MeltStage[] = [];
    for (const drop of [-3, -16, -14, -16, -28, -45, -38, -30, -19, -12, -9, -6, -2]) {
      s = meltStage(s, drop);
      seen.push(s);
    }
    expect(seen).toEqual([0, 1, 1, 1, 2, 3, 3, 2, 2, 1, 1, 0, 0]);
  });

  it("draws longer drips at each stage", () => {
    expect(MELT_LEVELS[0]).toBe(0);
    expect(MELT_LEVELS[1]).toBeLessThan(MELT_LEVELS[2]);
    expect(MELT_LEVELS[2]).toBeLessThan(MELT_LEVELS[3]);
    expect(MELT_LEVELS[3]).toBe(1);
  });
});

describe("the price Candy melts for", () => {
  const list = [
    { symbol: "A", quote: q(-2) },
    { symbol: "B", quote: q(-30) },
    { symbol: "C", quote: q(-50), pinned: true },
  ];
  const quoteOf = (t: { quote: Mover | null }) => t.quote;

  it("is the trader's biggest position first", () => {
    const big = q(-20);
    expect(meltSubject([big, q(-60)], list, quoteOf)).toBe(big);
    // An unpriced position is skipped.
    expect(meltSubject([null, big], list, quoteOf)).toBe(big);
  });

  it("else the first token on the watchlist, a pinned one first", () => {
    expect(meltSubject([], list, quoteOf)).toBe(list[2].quote);
    expect(meltSubject([], list.slice(0, 2), quoteOf)).toBe(list[0].quote);
    // Still loading: the next one with a price.
    const loading: { quote: Mover | null; pinned?: boolean }[] = [{ quote: null }, { quote: list[1].quote }];
    expect(meltSubject([], loading, quoteOf)).toBe(list[1].quote);
    expect(meltSubject([], [], quoteOf)).toBeNull();
  });

  it("never smiles while melting: a smiling face turns nervous, worried at the deepest", () => {
    expect(meltMood("happy", 0)).toBe("happy");
    expect(meltMood("idle", 0)).toBe("idle");
    expect(meltMood("idle", 1)).toBe("nervous");
    expect(meltMood("happy", 1)).toBe("nervous");
    expect(meltMood("excited", 2)).toBe("nervous");
    expect(meltMood("celebrate", 3)).toBe("worried");
    // Faces that already fit, or say something else, stay.
    for (const mood of ["worried", "shocked", "sleepy", "sad", "bored", "angry"] as const) expect(meltMood(mood, 2), mood).toBe(mood);
  });
});
