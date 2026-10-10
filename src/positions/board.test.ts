import { describe, expect, it } from "vitest";
import type { ActivityItem, Position } from "../core/state";
import { allocation, byDay, ownFeedLine, progressOf, sortHeld, type Held } from "./board";
import { positionStats } from "./positions";

const pos = (mint: string, amount: number, cost: number, over: Partial<Position> = {}): Position => ({
  mint,
  symbol: mint,
  amounts: { W: amount },
  costUsd: cost,
  realizedUsd: 0,
  openedAt: 0,
  fromTracking: false,
  alerted: [],
  ...over,
});

const held = (p: Position, price: number): Held => ({ p, price, s: positionStats(p, price) });

describe("wallet board", () => {
  // A: 100 → 250 (2.5x). B: 100 → 60 (−40%). C: 1000 → 1100 (+10%, the biggest).
  const a = held(pos("A", 100, 100), 2.5);
  const b = held(pos("B", 100, 100), 0.6);
  const c = held(pos("C", 1000, 1000), 1.1);

  it("sorts by value, profit, % and multiple", () => {
    expect(sortHeld([a, b, c], "value").map((x) => x.p.mint)).toEqual(["C", "A", "B"]);
    expect(sortHeld([a, b, c], "pnl").map((x) => x.p.mint)).toEqual(["A", "C", "B"]);
    expect(sortHeld([a, b, c], "pct").map((x) => x.p.mint)).toEqual(["A", "C", "B"]);
    expect(sortHeld([a, b, c], "x").map((x) => x.p.mint)).toEqual(["A", "C", "B"]);
  });

  it("shares the wallet out, SOL included, the small ones together", () => {
    const slices = allocation([a, b, c], 90, 2);
    expect(slices.map((s) => s.symbol)).toEqual(["C", "A", "Others"]);
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
    expect(slices[0].share).toBeCloseTo(1100 / 1500);
    expect(allocation([], 0)).toEqual([]);
  });

  it("measures the way to the target, the stop, or the next level", () => {
    // Entry 1, now 1.5, target 3: a quarter of the way.
    expect(progressOf(held(pos("T", 100, 100, { target: 3 }), 1.5), [2, 3])).toMatchObject({ kind: "target", frac: 0.25 });
    // Entry 1, now 0.8, stop 0.5: 40% of the way down.
    expect(progressOf(held(pos("S", 100, 100, { stop: 0.5 }), 0.8), [2])!.frac).toBeCloseTo(0.4);
    // No goals: 2.5x is halfway from 2x to 3x.
    expect(progressOf(a, [2, 3, 5])).toMatchObject({ kind: "level", frac: 0.5, label: "to 3x" });
    expect(progressOf(a, [2])).toBeNull();
  });

  it("groups the activity by day, newest first", () => {
    const now = new Date(2026, 9, 10, 15);
    const item = (t: Date, symbol: string): ActivityItem => ({ t: t.getTime(), mint: symbol, symbol, side: "bought", usd: 1, realizedUsd: 0 });
    const groups = byDay([item(new Date(2026, 9, 9, 9), "Y"), item(new Date(2026, 9, 10, 9), "T1"), item(new Date(2026, 9, 10, 14), "T2"), item(new Date(2026, 9, 5, 9), "M")], now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Mon 5"]);
    expect(groups[0].items.map((i) => i.symbol)).toEqual(["T2", "T1"]);
  });
});

describe("live feed", () => {
  it("says what the wallet just did, in a line", () => {
    const usd = (n: number) => `$${n}`;
    expect(ownFeedLine({ symbol: "BONK", side: "opened", usd: 400 }, usd)).toEqual({ text: "You bought BONK · $400", tone: "up" });
    expect(ownFeedLine({ symbol: "BONK", side: "closed", usd: 900 }, usd)?.tone).toBe("down");
    expect(ownFeedLine({ symbol: "BONK", side: "tracked", usd: 1 }, usd)).toBeNull();
  });
});
