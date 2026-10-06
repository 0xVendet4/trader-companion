import { describe, expect, it } from "vitest";
import { FIRST_REST_MS, REST_MS, learn, mintsToPrice, type PricingMemory } from "./pricing";

const memory = (): PricingMemory => ({ known: new Set(), resting: new Map() });
const many = (n: number, prefix = "dust") => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, 1]));
const none = (mints: string[]) => Object.fromEntries(mints.map((m) => [m, "none" as const]));

describe("mintsToPrice", () => {
  it("puts positions, trades and moved amounts first, whatever the wallet holds", () => {
    const holdings = { ...many(3000), REAL: 5, NEW: 1 };
    const prev = { ...many(3000), REAL: 5, GONE: 9 };
    const got = mintsToPrice({ held: ["POS"], traded: ["SWAP"], holdings, prev, memory: memory(), now: 0, limit: 10 });
    expect(got.slice(0, 4)).toEqual(["POS", "SWAP", "GONE", "NEW"]);
    expect(got).toHaveLength(10);
  });

  it("prices known tokens every check and works through the unknown ones a batch at a time", () => {
    const m = memory();
    const holdings = { ...many(100), REAL: 5 };
    m.known.add("REAL");
    const first = mintsToPrice({ held: [], traded: [], holdings, prev: holdings, memory: m, now: 0, limit: 30 });
    expect(first[0]).toBe("REAL");
    // None of the batch had a pair: they rest, and the next check moves on.
    learn(m, { ...none(first.slice(1)), REAL: "real" }, 0);
    const second = mintsToPrice({ held: [], traded: [], holdings, prev: holdings, memory: m, now: 60_000, limit: 30 });
    expect(second[0]).toBe("REAL");
    expect(second.slice(1).some((x) => first.includes(x))).toBe(false);
  });

  it("brings a resting token back when its amount moves or its rest is over", () => {
    const m = memory();
    learn(m, { SPAM: "junk" }, 0);
    const still = { SPAM: 1 };
    expect(mintsToPrice({ held: [], traded: [], holdings: still, prev: still, memory: m, now: 1, limit: 10 })).toEqual([]);
    expect(mintsToPrice({ held: [], traded: [], holdings: { SPAM: 2 }, prev: still, memory: m, now: 1, limit: 10 })).toEqual(["SPAM"]);
    expect(mintsToPrice({ held: [], traded: [], holdings: still, prev: still, memory: m, now: REST_MS + 1, limit: 10 })).toEqual(["SPAM"]);
  });

  it("gets to tokens never priced before retrying ones whose rest is over", () => {
    const m = memory();
    learn(m, { OLD: "none" }, 0);
    const holdings = { OLD: 1, FRESH: 1 };
    expect(mintsToPrice({ held: [], traded: [], holdings, prev: holdings, memory: m, now: FIRST_REST_MS, limit: 1 })).toEqual(["FRESH"]);
    expect(mintsToPrice({ held: [], traded: [], holdings, prev: holdings, memory: m, now: FIRST_REST_MS, limit: 2 })).toEqual(["FRESH", "OLD"]);
  });

  it("on a wallet's first read, prices what it can without treating everything as moved", () => {
    const got = mintsToPrice({ held: [], traded: [], holdings: many(50), prev: null, memory: memory(), now: 0, limit: 20 });
    expect(got).toHaveLength(20);
  });
});

describe("learn", () => {
  it("retries a token with no pair soon, then less and less often; junk rests the longest", () => {
    const m = memory();
    learn(m, { NEW: "none", SPAM: "junk" }, 0);
    expect(m.resting.get("NEW")?.until).toBe(FIRST_REST_MS);
    expect(m.resting.get("SPAM")?.until).toBe(REST_MS);
    learn(m, { NEW: "none" }, 0);
    expect(m.resting.get("NEW")?.until).toBe(FIRST_REST_MS * 6);
    for (let i = 0; i < 5; i++) learn(m, { NEW: "none" }, 0);
    expect(m.resting.get("NEW")?.until).toBe(REST_MS);
  });

  it("remembers real pairs, and a token can change sides", () => {
    const m = memory();
    learn(m, { A: "real", B: "none" }, 1000);
    expect(m.known.has("A")).toBe(true);
    learn(m, { A: "junk", B: "real" }, 2000);
    expect(m.known.has("A")).toBe(false);
    expect(m.resting.has("B")).toBe(false);
    expect(m.known.has("B")).toBe(true);
  });
});
