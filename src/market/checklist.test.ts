import { describe, expect, it } from "vitest";
import type { Quote, SafetyReport } from "../core/state";
import { CHECK_IDS, checklistFor, checklistSummary, stopWaiting } from "./checklist";

const NOW = 1_800_000_000_000;

const quote = (over: Partial<Quote> = {}): Quote => ({
  address: "MINT",
  pairAddress: "PAIR",
  priceUsd: 0.001,
  marketCap: 1_000_000,
  liquidityUsd: 80_000,
  change: { m5: 0, h1: 0, h6: 0, h24: 0 },
  volume: { m5: 0, h1: 0, h6: 0, h24: 0 },
  txnsM5: { buys: 0, sells: 0 },
  updatedAt: NOW,
  pairCreatedAt: NOW - 3 * 86_400_000,
  ...over,
});

const report = (over: Partial<SafetyReport> = {}): SafetyReport => ({ level: "low", score: 1, lpLockedPct: 100, risks: [], fetchedAt: NOW, ...over });

const states = (items: ReturnType<typeof checklistFor>) => Object.fromEntries(items.map((i) => [i.id, i.state]));

describe("checklist", () => {
  it("has every line, in order", () => {
    expect(checklistFor(quote(), report(), NOW).map((i) => i.id)).toEqual(CHECK_IDS);
  });

  it("reads a clean token as fine", () => {
    expect(Object.values(states(checklistFor(quote(), report(), NOW)))).toEqual(["ok", "ok", "ok", "ok", "ok", "ok"]);
  });

  it("flags what RugCheck and DexScreener flag", () => {
    const risky = report({
      lpLockedPct: 12,
      risks: [
        { name: "Mint Authority still enabled", value: "", level: "danger" },
        { name: "Top 10 holders high ownership", value: "62%", level: "warn" },
      ],
    });
    const s = states(checklistFor(quote({ pairCreatedAt: NOW - 20 * 60_000, suspectLiquidity: true }), risky, NOW));
    expect(s).toEqual({ mint: "warn", freeze: "ok", lp: "warn", holders: "warn", age: "warn", liquidity: "warn" });
  });

  it("says what is still unknown", () => {
    const loading = states(checklistFor(undefined, undefined, NOW));
    expect(new Set(Object.values(loading))).toEqual(new Set(["unknown"]));
    expect(checklistFor(quote(), null, NOW)[0].detail).toContain("check it yourself");
    expect(checklistFor(quote({ liquidityUsd: 4_000 }), report(), NOW).at(-1)!.state).toBe("warn");
  });

  it("waits on RugCheck only while it loads", () => {
    const waiting = (s: SafetyReport | null | undefined) => checklistFor(quote(), s, NOW).filter((i) => i.waiting).map((i) => i.id);
    expect(waiting(undefined)).toEqual(["mint", "freeze", "lp", "holders"]);
    expect(waiting(null)).toEqual([]);
    expect(waiting(report())).toEqual([]);
    const gaveUp = stopWaiting(checklistFor(quote(), undefined, NOW));
    expect(gaveUp.some((i) => i.waiting)).toBe(false);
    expect(gaveUp[0]).toMatchObject({ state: "unknown", detail: "RugCheck didn't answer: check it yourself" });
    // What DexScreener says stays as it was.
    expect(gaveUp.at(-1)!.state).toBe("ok");
  });
});

describe("checklist summary", () => {
  it("says nothing was flagged on a clean token", () => {
    const s = checklistSummary(checklistFor(quote(), report(), NOW), "Candy");
    expect(s).toMatchObject({ ok: 6, warn: 0, unknown: 0, tone: "ok", say: "nothing flagged!" });
    expect(s.line).toBe("Candy checked 6: nothing flagged.");
  });

  it("names the lines worth a look", () => {
    const risky = report({ risks: [{ name: "Top 10 holders high ownership", value: "62%", level: "warn" }] });
    const s = checklistSummary(checklistFor(quote({ pairCreatedAt: NOW - 20 * 60_000 }), risky, NOW), "Candy");
    expect(s).toMatchObject({ ok: 4, warn: 2, tone: "warn", say: "2 to look at" });
    expect(s.line).toBe("Candy checked 6: 4 look fine, 2 worth a closer look (top holders, age).");
  });

  it("counts what he couldn't check", () => {
    const s = checklistSummary(stopWaiting(checklistFor(quote(), undefined, NOW)), "Candy");
    expect(s).toMatchObject({ ok: 2, warn: 0, unknown: 4, tone: "unknown", say: "4 I couldn't check" });
    expect(s.line).toBe("Candy checked 6: 2 look fine, 4 he couldn't check.");
  });

  it("never tells anyone to buy or sell", () => {
    const all = [report(), report({ lpLockedPct: 5 }), null, undefined].map((r) => checklistSummary(checklistFor(quote({ liquidityUsd: 900 }), r, NOW), "Candy"));
    for (const s of all) expect(`${s.line} ${s.say}`).not.toMatch(/\b(buy|sell|ape|enter|safe)\b/i);
  });
});
