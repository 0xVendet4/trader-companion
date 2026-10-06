import { describe, expect, it } from "vitest";
import type { AlertRule, Quote, Sample, WatchToken } from "../core/state";
import {
  changeOverWindow,
  evaluateRules,
  liquidityDrop,
  pushSample,
  type RuleMemory,
} from "./alerts";

const MIN = 60_000;
const T0 = 1_800_000_000_000;

const token: WatchToken = {
  key: "MINT",
  chainId: "solana",
  address: "MINT",
  symbol: "PIP",
  name: "Pip",
  pairAddress: "PAIR",
  dexId: "raydium",
  imageUrl: null,
};

function quote(over: Partial<Quote> = {}): Quote {
  return {
    address: "MINT",
    pairAddress: "PAIR",
    priceUsd: 0.001,
    marketCap: 1_000_000,
    liquidityUsd: 100_000,
    change: { m5: 0, h1: 0, h6: 0, h24: 0 },
    volume: { m5: 0, h1: 0, h6: 0, h24: 0 },
    txnsM5: { buys: 0, sells: 0 },
    updatedAt: T0,
    ...over,
  };
}

function rule(over: Partial<AlertRule>): AlertRule {
  return { id: "r1", address: "MINT", kind: "priceAbove", value: 0.002, windowMin: 5, enabled: true, ...over };
}

function run(r: AlertRule, q: Quote, now: number, memory: Map<string, RuleMemory>, history: Sample[] = []) {
  return evaluateRules([r], [token], { MINT: q }, { MINT: history }, memory, now);
}

describe("price and market cap rules", () => {
  it("fire once when the condition becomes true, then re-arm after it clears", () => {
    const mem = new Map<string, RuleMemory>();
    const r = rule({ kind: "priceAbove", value: 0.002 });

    expect(run(r, quote({ priceUsd: 0.0015 }), T0, mem)).toHaveLength(0);
    expect(run(r, quote({ priceUsd: 0.0021 }), T0 + MIN, mem)).toHaveLength(1);
    // Still above: no repeat.
    expect(run(r, quote({ priceUsd: 0.0025 }), T0 + 2 * MIN, mem)).toHaveLength(0);
    // Drops below, then crosses again after the cool-down.
    expect(run(r, quote({ priceUsd: 0.0019 }), T0 + 3 * MIN, mem)).toHaveLength(0);
    expect(run(r, quote({ priceUsd: 0.0022 }), T0 + 5 * MIN, mem)).toHaveLength(1);
  });

  it("respect the cool-down when a price flickers around the target", () => {
    const mem = new Map<string, RuleMemory>();
    const r = rule({ kind: "priceAbove", value: 0.002 });
    expect(run(r, quote({ priceUsd: 0.0021 }), T0, mem)).toHaveLength(1);
    expect(run(r, quote({ priceUsd: 0.0019 }), T0 + 20_000, mem)).toHaveLength(0);
    expect(run(r, quote({ priceUsd: 0.0021 }), T0 + 40_000, mem)).toHaveLength(0);
  });

  it("fire on the first check when the condition already holds", () => {
    const mem = new Map<string, RuleMemory>();
    const fired = run(rule({ kind: "mcapAbove", value: 500_000 }), quote(), T0, mem);
    expect(fired).toHaveLength(1);
    expect(fired[0].title).toBe("PIP crossed $500K market cap");
    expect(fired[0].tone).toBe("up");
  });

  it("ignore disabled rules and tokens without a quote", () => {
    const mem = new Map<string, RuleMemory>();
    expect(run(rule({ enabled: false, value: 0.0001 }), quote(), T0, mem)).toHaveLength(0);
    expect(evaluateRules([rule({ value: 0.0001 })], [token], {}, {}, mem, T0)).toHaveLength(0);
  });

  it("never read a missing price as zero", () => {
    const mem = new Map<string, RuleMemory>();
    expect(run(rule({ kind: "priceBelow", value: 0.001 }), quote({ priceUsd: 0 }), T0, mem)).toHaveLength(0);
  });
});

describe("windowed rules", () => {
  const history = (points: [number, number][]): Sample[] =>
    points.map(([m, price]) => ({ t: T0 + m * MIN, price, mcap: null, liq: 100_000 }));

  it("measure the change over the window from our own samples", () => {
    const h = history([[0, 1], [5, 1.1], [10, 1.2], [15, 1.5]]);
    expect(changeOverWindow(h, T0 + 15 * MIN, 15)).toBeCloseTo(50);
    expect(changeOverWindow(h, T0 + 15 * MIN, 5)).toBeCloseTo((1.5 / 1.2 - 1) * 100);
  });

  it("refuse a window the samples do not cover yet", () => {
    const h = history([[0, 1], [1, 1.5]]);
    expect(changeOverWindow(h, T0 + MIN, 15)).toBeNull();
  });

  it("fall back to DexScreener's 5-minute change on a fresh start", () => {
    const mem = new Map<string, RuleMemory>();
    const fired = run(rule({ kind: "pctUp", value: 20, windowMin: 5 }), quote({ change: { m5: 25, h1: 0, h6: 0, h24: 0 } }), T0, mem);
    expect(fired).toHaveLength(1);
    expect(fired[0].title).toBe("PIP +25.0% in 5 min");
  });

  it("fire a drop rule on a fall, not on a rise", () => {
    const mem = new Map<string, RuleMemory>();
    const r = rule({ kind: "pctDown", value: 20, windowMin: 5 });
    expect(run(r, quote({ change: { m5: 30, h1: 0, h6: 0, h24: 0 } }), T0, mem)).toHaveLength(0);
    expect(run(r, quote({ change: { m5: -30, h1: 0, h6: 0, h24: 0 } }), T0 + MIN, mem)).toHaveLength(1);
  });

  it("measure a liquidity drop from the window's highest reading", () => {
    const h: Sample[] = [
      { t: T0, price: 1, mcap: null, liq: 100_000 },
      { t: T0 + MIN, price: 1, mcap: null, liq: 120_000 },
      { t: T0 + 2 * MIN, price: 1, mcap: null, liq: 30_000 },
    ];
    expect(liquidityDrop(h, T0 + 2 * MIN, 10)).toBeCloseTo(75);
    const mem = new Map<string, RuleMemory>();
    const fired = run(rule({ kind: "liqDrop", value: 50, windowMin: 10 }), quote({ liquidityUsd: 30_000 }), T0 + 2 * MIN, mem, h);
    expect(fired).toHaveLength(1);
    expect(fired[0].tone).toBe("warn");
  });
});

describe("pushSample", () => {
  it("drops samples older than the history window", () => {
    let h: Sample[] = [];
    h = pushSample(h, { t: T0, price: 1, mcap: null, liq: 1 });
    h = pushSample(h, { t: T0 + 70 * MIN, price: 2, mcap: null, liq: 1 });
    expect(h).toHaveLength(1);
    expect(h[0].price).toBe(2);
  });

  it("skips an identical cached reading", () => {
    let h: Sample[] = [];
    h = pushSample(h, { t: T0, price: 1, mcap: null, liq: 1 });
    h = pushSample(h, { t: T0 + 10_000, price: 1, mcap: null, liq: 1 });
    expect(h).toHaveLength(1);
  });
});

describe("primeRule", () => {
  it("lets a rule saved before launch stay quiet while its condition still holds", async () => {
    const { primeRule } = await import("./alerts");
    const mem = new Map<string, RuleMemory>();
    const r = rule({ kind: "priceAbove", value: 0.0005 });
    primeRule(r, quote(), [], mem, T0);
    expect(run(r, quote(), T0 + MIN, mem)).toHaveLength(0);
    // It still fires on the next real crossing.
    expect(run(r, quote({ priceUsd: 0.0004 }), T0 + 2 * MIN, mem)).toHaveLength(0);
    expect(run(r, quote({ priceUsd: 0.0006 }), T0 + 6 * MIN, mem)).toHaveLength(1);
  });
});
