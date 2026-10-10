import { describe, expect, it } from "vitest";
import type { AlertRule, Quote, Sample, WatchToken } from "../core/state";
import {
  MILESTONE_COOLDOWN_MS,
  SELL_PRESSURE_COOLDOWN_MS,
  VOLUME_ALERT_COOLDOWN_MS,
  changeOverWindow,
  crossedMilestone,
  milestoneAlert,
  sellPressure,
  sellPressureAlerts,
  evaluateRules,
  isMuted,
  liquidityDrop,
  liveMutes,
  pushSample,
  volumeAlerts,
  volumeSurge,
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

describe("volume surges", () => {
  it("compares the last 5 minutes with the rest of the hour", () => {
    // 50K in 5 min, 110K in the other 55: 10K a slot, so 5x.
    expect(volumeSurge(quote({ volume: { m5: 50_000, h1: 160_000, h6: 0, h24: 0 } }))).toBeCloseTo(5);
    expect(volumeSurge(quote({ volume: { m5: 5_000, h1: 6_000, h6: 0, h24: 0 } }))).toBeNull(); // dust
    expect(volumeSurge(quote({ volume: { m5: 50_000, h1: 50_000, h6: 0, h24: 0 } }))).toBeNull(); // nothing else in the hour
    expect(volumeSurge(quote({ major: true, volume: { m5: 50_000, h1: 160_000, h6: 0, h24: 0 } }))).toBeNull();
  });

  it("fires once per token, then waits", () => {
    const hot = quote({ volume: { m5: 50_000, h1: 160_000, h6: 0, h24: 0 }, change: { m5: -4, h1: 0, h6: 0, h24: 0 } });
    const last = new Map<string, number>();
    const first = volumeAlerts([token], { MINT: hot }, 4, last, T0);
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe("PIP volume 5x the hour's pace");
    expect(first[0].tone).toBe("down");
    expect(volumeAlerts([token], { MINT: hot }, 4, last, T0 + MIN)).toHaveLength(0);
    expect(volumeAlerts([token], { MINT: hot }, 4, last, T0 + VOLUME_ALERT_COOLDOWN_MS)).toHaveLength(1);
    expect(volumeAlerts([token], { MINT: hot }, 6, new Map(), T0)).toHaveLength(0);
    expect(volumeAlerts([token], { MINT: hot }, 0, new Map(), T0)).toHaveLength(0);
  });

  it("keeps a token quiet while muted, and forgets old mutes", () => {
    expect(isMuted({ MINT: T0 + MIN }, "MINT", T0)).toBe(true);
    expect(isMuted({ MINT: T0 - 1 }, "MINT", T0)).toBe(false);
    expect(liveMutes({ A: T0 + 1, B: T0 - 1 }, T0)).toEqual({ A: T0 + 1 });
  });
});

describe("market-cap milestones", () => {
  it("names the highest one passed going up, the lowest one lost going down", () => {
    expect(crossedMilestone(900_000, 1_100_000)).toEqual({ level: 1e6, up: true });
    expect(crossedMilestone(900_000, 12_000_000)).toEqual({ level: 10e6, up: true });
    expect(crossedMilestone(6_000_000, 800_000)).toEqual({ level: 1e6, up: false });
    expect(crossedMilestone(1_200_000, 4_000_000)).toBeNull();
    expect(crossedMilestone(null, 2_000_000)).toBeNull();
  });

  it("fires on the crossing, once an hour per level, never for a major coin", () => {
    const last = new Map<string, number>();
    const up = milestoneAlert(token, quote({ marketCap: 4_800_000 }), quote({ marketCap: 5_100_000, change: { m5: 0, h1: 8, h6: 0, h24: 0 } }), last, T0);
    expect(up?.title).toBe("PIP passed $5M market cap");
    expect(up?.tone).toBe("up");
    // Back under and over again within the hour: quiet.
    expect(milestoneAlert(token, quote({ marketCap: 4_900_000 }), quote({ marketCap: 5_050_000 }), last, T0 + 10 * MIN)).toBeNull();
    expect(milestoneAlert(token, quote({ marketCap: 4_900_000 }), quote({ marketCap: 5_050_000 }), last, T0 + MILESTONE_COOLDOWN_MS)).not.toBeNull();
    expect(milestoneAlert(token, quote({ marketCap: 1_100_000 }), quote({ marketCap: 950_000 }), last, T0)?.title).toBe("PIP fell below $1M market cap");
    expect(milestoneAlert(token, undefined, quote({ marketCap: 5_100_000 }), new Map(), T0)).toBeNull();
    expect(milestoneAlert(token, quote({ major: true, marketCap: 4e6 }), quote({ major: true, marketCap: 6e6 }), new Map(), T0)).toBeNull();
  });
});

describe("sell pressure", () => {
  const heavy = quote({ txnsM5: { buys: 12, sells: 48 }, change: { m5: -7, h1: 0, h6: 0, h24: 0 } });

  it("reads sells per buy, only with enough trades", () => {
    expect(sellPressure(heavy)).toBe(4);
    expect(sellPressure(quote({ txnsM5: { buys: 3, sells: 12 } }))).toBeNull();
    expect(sellPressure(quote({ major: true, txnsM5: { buys: 12, sells: 48 } }))).toBeNull();
  });

  it("fires once per token per half hour, and not when off", () => {
    const last = new Map<string, number>();
    const first = sellPressureAlerts([token], { MINT: heavy }, true, last, T0);
    expect(first.map((f) => f.title)).toEqual(["PIP: 48 sells and 12 buys in 5 min"]);
    expect(sellPressureAlerts([token], { MINT: heavy }, true, last, T0 + MIN)).toHaveLength(0);
    expect(sellPressureAlerts([token], { MINT: heavy }, true, last, T0 + SELL_PRESSURE_COOLDOWN_MS)).toHaveLength(1);
    expect(sellPressureAlerts([token], { MINT: heavy }, false, new Map(), T0)).toHaveLength(0);
    expect(sellPressureAlerts([token], { MINT: quote({ txnsM5: { buys: 30, sells: 50 } }) }, true, new Map(), T0)).toHaveLength(0);
  });

  it("states what happened, never what to do", () => {
    const all = [...sellPressureAlerts([token], { MINT: heavy }, true, new Map(), T0), milestoneAlert(token, quote({ marketCap: 9e5 }), quote({ marketCap: 2e6 }), new Map(), T0)!];
    for (const a of all) expect(`${a.title} ${a.detail}`).not.toMatch(/\b(buy now|sell now|exit|take profit|ape)\b/i);
  });
});
