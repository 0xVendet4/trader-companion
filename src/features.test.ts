// Tests for the second batch of features: safety badge, mini chart, wallet
// moves, share links, journal, shortcut matching and the new mood rules.

import { describe, expect, it } from "vitest";
import type { JournalEntry, Quote } from "./core/state";
import { matches } from "./core/hotkey";
import { parseShared, shareText } from "./core/share";
import { journalCsv, weekStats } from "./discipline/discipline";
import { toSafety } from "./market/safety";
import { relativeStrength, sparkPair, sparkPath, sparkSeries } from "./market/sparkline";
import { computeMood } from "./mood/mood";
import { diffHoldings } from "./wallets/wallets";

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

const quote = (over: Partial<Quote> = {}): Quote => ({
  address: BONK,
  pairAddress: "p",
  priceUsd: 2,
  marketCap: 1e6,
  liquidityUsd: 1e5,
  change: { m5: 0, h1: 0, h6: 0, h24: 0 },
  volume: { m5: 10_000, h1: 0, h6: 0, h24: 0 },
  txnsM5: { buys: 0, sells: 0 },
  updatedAt: 0,
  ...over,
});

describe("toSafety", () => {
  it("rates by RugCheck's own risk levels", () => {
    expect(toSafety({ risks: [] , lpLockedPct: 99 }).level).toBe("low");
    expect(toSafety({ risks: [{ name: "Low liquidity", level: "warn" }] }).level).toBe("medium");
    expect(toSafety({ risks: [{ name: "Freeze Authority still enabled", level: "danger" }] }).level).toBe("high");
  });

  it("treats mostly unlocked liquidity as a risk on its own", () => {
    expect(toSafety({ risks: [], lpLockedPct: 12 }).level).toBe("medium");
  });

  it("survives a malformed response", () => {
    const r = toSafety({ risks: null, lpLockedPct: null });
    expect(r).toMatchObject({ level: "low", score: 0, lpLockedPct: null, risks: [] });
  });
});

describe("sparkline", () => {
  it("reconstructs past prices from DexScreener's change figures", () => {
    const pts = sparkSeries(quote({ change: { m5: 0, h1: 100, h6: 0, h24: 0 } }), [], 1e12);
    const hourAgo = pts.find((p) => p.age === 3_600_000);
    expect(hourAgo?.price).toBeCloseTo(1); // +100% in an hour → it was half
    expect(pts.at(-1)).toEqual({ age: 0, price: 2 });
  });

  it("draws a line that knows which way it went", () => {
    const up = sparkPath(sparkSeries(quote({ change: { m5: 1, h1: 5, h6: 10, h24: 40 } }), [], 1e12), 56, 18);
    expect(up?.up).toBe(true);
    const down = sparkPath(sparkSeries(quote({ change: { m5: -1, h1: -5, h6: -10, h24: -40 } }), [], 1e12), 56, 18);
    expect(down?.up).toBe(false);
    expect(sparkPath([], 56, 18)).toBeNull();
  });
});

describe("diffHoldings", () => {
  it("reports new positions, top-ups and exits, ignoring dust moves", () => {
    const { bought, sold } = diffHoldings({ A: 100, B: 50, C: 10 }, { A: 100.5, B: 80, D: 5 });
    expect(bought.map((b) => b.mint).sort()).toEqual(["B", "D"]); // A moved 0.5%: noise
    expect(sold).toEqual([{ mint: "C", from: 10, to: 0 }]);
  });
});

describe("share links", () => {
  it("round-trips a watchlist through a pasted list", () => {
    const text = shareText([BONK, WIF]);
    expect(text).toBe(`${BONK}, ${WIF}`);
    expect(parseShared(text)).toEqual([BONK, WIF]);
  });

  it("still imports links shared by older versions", () => {
    expect(parseShared(`https://example.com/?list=${BONK},${WIF}`)).toEqual([BONK, WIF]);
    expect(parseShared(`?list=${BONK}`)).toEqual([BONK]);
  });

  it("keeps only valid, unique addresses", () => {
    expect(parseShared(`${BONK}, nope, ${BONK} <script>`)).toEqual([BONK]);
    expect(parseShared("")).toEqual([]);
  });
});

describe("journal", () => {
  const now = new Date(2026, 9, 5, 15, 0);
  const at = (daysAgo: number, pnl: number, note = ""): JournalEntry => ({
    id: String(Math.random()),
    t: new Date(2026, 9, 5 - daysAgo, 12, 0).getTime(),
    pnl,
    note,
  });

  it("sums the last 7 days and ignores older trades", () => {
    const w = weekStats([at(0, 1), at(0, -0.5), at(3, 2), at(9, 100)], now);
    expect(w.days).toHaveLength(7);
    expect(w.days.at(-1)).toMatchObject({ label: "Today", pnl: 0.5, count: 2 });
    expect(w.total).toBeCloseTo(2.5);
    expect(w.count).toBe(3);
    expect(w.winRate).toBeCloseTo(2 / 3);
    expect(w.best).toBe(2);
    expect(w.worst).toBe(-0.5);
  });

  it("exports CSV that a spreadsheet cannot turn into a formula", () => {
    const csv = journalCsv([at(1, -1, '=HYPERLINK("x")'), at(0, 0.5, "good, clean")], "SOL");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("date,time,pnl,unit,note,plan");
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain(`"good, clean"`);
  });
});

describe("hotkey", () => {
  const ev = (over: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string; key: string }>) => ({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    code: "",
    key: "",
    ...over,
  });

  it("matches the exact combination only", () => {
    expect(matches("CommandOrControl+Shift+Space", ev({ ctrlKey: true, shiftKey: true, code: "Space", key: " " }))).toBe(true);
    expect(matches("CommandOrControl+Shift+Space", ev({ ctrlKey: true, code: "Space", key: " " }))).toBe(false);
    expect(matches("CommandOrControl+Alt+T", ev({ ctrlKey: true, altKey: true, key: "t" }))).toBe(true);
    expect(matches("", ev({ ctrlKey: true }))).toBe(false);
  });
});

describe("mood: night and SOL", () => {
  const base = {
    tokens: [{ key: BONK, chainId: "solana" as const, address: BONK, symbol: "BONK", name: "", pairAddress: "", dexId: "", imageUrl: null }],
    quotes: { [BONK]: quote({ change: { m5: 1, h1: 0, h6: 0, h24: 0 } }) },
    status: "ok" as const,
    paused: false,
    stopped: false,
    coolingDown: false,
    liquidityWarnings: new Set<string>(),
  };

  it("dozes off late at night, unless something big moves", () => {
    expect(computeMood({ ...base, hour: 3, nightSleep: true }).state).toBe("sleepy");
    expect(computeMood({ ...base, hour: 3, nightSleep: false }).state).not.toBe("sleepy");
    const pump = { ...base.quotes, [BONK]: quote({ change: { m5: 25, h1: 0, h6: 0, h24: 0 } }) };
    expect(computeMood({ ...base, quotes: pump, hour: 3, nightSleep: true }).state).toBe("celebrate");
  });

  it("a setting saved when the mascot still reacted to SOL is dropped", async () => {
    const { normalizeSettings } = await import("./core/state");
    const s = normalizeSettings({ companion: { reactToSol: true } } as never);
    expect("reactToSol" in s.companion).toBe(false);
  });
});

describe("multichain upgrade", () => {
  it("reads a watchlist saved before chains existed as Solana, with the same keys", async () => {
    const { normalizeSettings } = await import("./core/state");
    const s = normalizeSettings({
      companion: { watchlist: [{ address: BONK, symbol: "BONK", name: "Bonk", pairAddress: "p", dexId: "d", imageUrl: null }] },
    } as never);
    expect(s.companion.watchlist[0]).toMatchObject({ chainId: "solana", key: BONK });
    expect(s.companion.chains).toEqual(["solana"]);
  });

  it("shares tokens from other chains as chain:address", async () => {
    const { shareEntry } = await import("./core/share");
    const evm = "0xB7C0007ab75350c582d5eAb1862b872B5cF53F0C";
    const text = shareText([shareEntry({ chainId: "solana", address: BONK }), shareEntry({ chainId: "bsc", address: evm })]);
    expect(parseShared(text)).toEqual([BONK, `bsc:${evm}`]);
    expect(parseShared(`solana:${evm}, mars:${evm}`)).toEqual([]); // EVM address on Solana, unknown chain
  });
});

describe("following is an option", () => {
  it("is off for a new install, and stays on for whoever already followed wallets", async () => {
    const { normalizeSettings } = await import("./core/state");
    expect(normalizeSettings(null).companion.following).toBe(false);
    const w = (mine: boolean) => ({ address: "x" + mine, label: "w", mine, baselineUsd: null, addedAt: 1 });
    expect(normalizeSettings({ companion: { wallets: [w(false)] } } as never).companion.following).toBe(true);
    expect(normalizeSettings({ companion: { wallets: [w(true)] } } as never).companion.following).toBe(false);
    expect(normalizeSettings({ companion: { wallets: [w(false)], following: false } } as never).companion.following).toBe(false);
  });
});

describe("hover chart's candle size", () => {
  it("is 15 m until the trader picks one, and only one the chart has", async () => {
    const { normalizeSettings } = await import("./core/state");
    expect(normalizeSettings(null).companion.chartInterval).toBe("15m");
    expect(normalizeSettings({ companion: {} } as never).companion.chartInterval).toBe("15m");
    expect(normalizeSettings({ companion: { chartInterval: "4h" } } as never).companion.chartInterval).toBe("4h");
    expect(normalizeSettings({ companion: { chartInterval: "2h" } } as never).companion.chartInterval).toBe("15m");
    expect(normalizeSettings({ companion: { chartInterval: 15 } } as never).companion.chartInterval).toBe("15m");
  });
});

describe("EVM wallets", () => {
  it("reads wallets saved before them as Solana, and gives a 0x wallet all three chains", async () => {
    const { normalizeSettings } = await import("./core/state");
    const evm = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
    const sol = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
    const s = normalizeSettings({
      companion: {
        wallets: [
          { address: sol, label: "old", mine: true, baselineUsd: null, addedAt: 1 },
          { address: evm, label: "evm", mine: false, baselineUsd: null, addedAt: 1, family: "evm", chains: ["bsc", "mars"] },
          { address: evm.toLowerCase(), label: "all", mine: false, baselineUsd: null, addedAt: 1, family: "evm" },
          { label: "no address" },
        ],
      },
    } as never);
    expect(s.companion.wallets.map((w) => [w.family, w.chains])).toEqual([
      ["solana", undefined],
      ["evm", ["bsc"]],
      ["evm", ["ethereum", "bsc", "base"]],
    ]);
  });
});

describe("relative strength", () => {
  it("measures a token against its chain's coin", () => {
    expect(relativeStrength(10, 10)).toBeCloseTo(0);
    expect(relativeStrength(32, 10)).toBeCloseTo(20);
    expect(relativeStrength(-5, 5)).toBeCloseTo(-9.52, 1);
    expect(relativeStrength(5, -100)).toBeNull();
  });

  it("draws the token and the coin on one % scale", () => {
    const pts = (a: number, b: number) => [{ age: 86_400_000, price: a }, { age: 0, price: b }];
    const pair = sparkPair(pts(1, 2), pts(100, 110), 56, 18)!;
    expect(pair.up).toBe(true);
    // Both start at 0%: the same left point.
    expect(pair.token.split(" ")[0]).toBe(pair.coin.split(" ")[0]);
    // +100% ends at the top, +10% near the bottom.
    expect(Number(pair.token.split(" ")[1].split(",")[1])).toBeLessThan(Number(pair.coin.split(" ")[1].split(",")[1]));
    expect(sparkPair(pts(1, 2).slice(0, 1), pts(1, 2), 56, 18)).toBeNull();
  });
});
