import { describe, expect, it } from "vitest";
import type { Quote, WatchToken } from "../core/state";
import { SETTLE_MOVE_MS, SETTLE_MS, computeMood, moodKey, settleMood, type MoodInput } from "./mood";

const tok = (symbol: string): WatchToken => ({
  key: symbol,
  chainId: "solana",
  address: symbol,
  symbol,
  name: symbol,
  pairAddress: `${symbol}-pair`,
  dexId: "raydium",
  imageUrl: null,
});

const q = (address: string, m5: number, h1: number, volM5 = 10_000): Quote => ({
  address,
  pairAddress: `${address}-pair`,
  priceUsd: 1,
  marketCap: 1,
  liquidityUsd: 1,
  change: { m5, h1, h6: 0, h24: 0 },
  volume: { m5: volM5, h1: 0, h6: 0, h24: 0 },
  txnsM5: { buys: 0, sells: 0 },
  updatedAt: 0,
});

function input(over: Partial<MoodInput>): MoodInput {
  return {
    tokens: [tok("WIF"), tok("BONK")],
    quotes: {},
    status: "ok",
    paused: false,
    stopped: false,
    coolingDown: false,
    liquidityWarnings: new Set(),
    ...over,
  };
}

describe("computeMood", () => {
  it("puts the trader's own loss limit above everything", () => {
    expect(computeMood(input({ stopped: true, quotes: { WIF: q("WIF", 40, 40) } })).state).toBe("stop");
  });

  it("asks for a token when the watchlist is empty", () => {
    expect(computeMood(input({ tokens: [] })).state).toBe("idle");
    expect(computeMood(input({ tokens: [] })).text.length).toBeLessThan(40); // fits the 2-line caption
  });

  it("is confused when DexScreener does not answer", () => {
    expect(computeMood(input({ status: "error" })).state).toBe("confused");
  });

  it("celebrates or panics on a big 5-minute move", () => {
    const up = computeMood(input({ quotes: { WIF: q("WIF", 22, 0), BONK: q("BONK", 1, 0) } }));
    expect(up.state).toBe("celebrate");
    expect(up.text).toContain("WIF");
    const down = computeMood(input({ quotes: { WIF: q("WIF", 2, 0), BONK: q("BONK", -30, 0) } }));
    expect(down.state).toBe("shocked");
    expect(down.text).toContain("BONK");
  });

  it("follows the average 1-hour trend", () => {
    expect(computeMood(input({ quotes: { WIF: q("WIF", 1, 8), BONK: q("BONK", 1, 4) } })).state).toBe("happy");
    expect(computeMood(input({ quotes: { WIF: q("WIF", 1, -8), BONK: q("BONK", 1, -4) } })).state).toBe("worried");
  });

  it("is bored when nothing moves (sleep is for the night and the pause)", () => {
    expect(computeMood(input({ quotes: { WIF: q("WIF", 0.1, 0, 10), BONK: q("BONK", 0, 0, 10) } })).state).toBe("bored");
  });

  it("flags a liquidity warning before market moves", () => {
    const mood = computeMood(input({ quotes: { WIF: q("WIF", 30, 0) }, liquidityWarnings: new Set(["WIF"]) }));
    expect(mood.state).toBe("shocked");
    expect(mood.text).toContain("liquidity");
  });
});

describe("mood: own positions", () => {
  const pos = (symbol: string, multiple: number, fromTracking = false) => ({ symbol, multiple, pnlPct: (multiple - 1) * 100, fromTracking });

  it("celebrates a position at 2x, saying where the numbers start", () => {
    const m = computeMood(input({ quotes: { WIF: q("WIF", 0, 0), BONK: q("BONK", 0, 0) }, positions: [pos("POPCAT", 2.37)] }));
    expect(m).toEqual({ state: "celebrate", text: "Your POPCAT: 2.3x from entry!", lasting: "position", subject: "POPCAT" });
  });

  it("worries about a deep drawdown before celebrating", () => {
    const m = computeMood(input({ quotes: { WIF: q("WIF", 0, 0) }, positions: [pos("POPCAT", 3), pos("BOME", 0.6, true)] }));
    expect(m).toEqual({ state: "worried", text: "Your BOME: −40.0% since tracking.", lasting: "position", subject: "BOME" });
  });

  it("speaks up even with an empty watchlist", () => {
    expect(computeMood(input({ tokens: [], positions: [pos("POPCAT", 2)] })).state).toBe("celebrate");
  });

  it("lets a big 5-minute move and the loss limit come first", () => {
    const quotes = { WIF: q("WIF", 22, 0) };
    expect(computeMood(input({ quotes, positions: [pos("POPCAT", 2)] })).text).toContain("WIF");
    expect(computeMood(input({ stopped: true, positions: [pos("POPCAT", 2)] })).state).toBe("stop");
  });

  it("stays out of it between the levels", () => {
    expect(computeMood(input({ quotes: { WIF: q("WIF", 0, 0, 0) }, positions: [pos("POPCAT", 1.5)] })).state).not.toBe("celebrate");
  });
});

describe("mood: settling", () => {
  const green = { state: "happy" as const, text: "Watchlist is green: +6.0% avg (1h).", lasting: "trend" as const };

  it("shows a lasting mood's face, then settles into neutral with the same caption", () => {
    expect(settleMood(green, 0, SETTLE_MS - 1).state).toBe("happy");
    expect(settleMood(green, 0, SETTLE_MS)).toEqual({ ...green, state: "idle" });
  });

  it("never settles a mood that asks for attention", () => {
    const stop = { state: "stop" as const, text: "Daily loss limit hit." };
    expect(settleMood(stop, 0, SETTLE_MS * 10).state).toBe("stop");
  });

  it("keeps the clock when only the numbers change, restarts it for a new reason or token", () => {
    expect(moodKey(green)).toBe(moodKey({ ...green, text: "Watchlist is green: +9.1% avg (1h)." }));
    expect(moodKey(green)).not.toBe(moodKey({ ...green, state: "worried" }));
    const pos = (t: string, subject: string) => ({ state: "celebrate" as const, text: t, lasting: "position" as const, subject });
    expect(moodKey(pos("Your BONK: 2.1x from entry!", "BONK"))).toBe(moodKey(pos("Your BONK: 2.4x from entry!", "BONK")));
    expect(moodKey(pos("Your BONK: 2.1x from entry!", "BONK"))).not.toBe(moodKey(pos("Your WIF: 2.1x from entry!", "WIF")));
  });

  it("a big 5-minute drop flashes for 10 s, deeper or not, then settles", () => {
    const at = (m5: number) => computeMood(input({ quotes: { WIF: q("WIF", 0, 0), BONK: q("BONK", m5, 0) } }));
    const first = at(-20);
    const deeper = at(-30);
    expect(first.state).toBe("shocked");
    expect(moodKey(first)).toBe(moodKey(deeper));
    expect(settleMood(deeper, 0, SETTLE_MOVE_MS - 1).state).toBe("shocked");
    expect(settleMood(deeper, 0, SETTLE_MOVE_MS)).toMatchObject({ state: "idle", text: deeper.text });
    expect(SETTLE_MOVE_MS).toBe(10_000);
  });

  it("a liquidity drop settles too", () => {
    const m = computeMood(input({ quotes: { WIF: q("WIF", 0, 0) }, liquidityWarnings: new Set(["WIF"]) }));
    expect(m.state).toBe("shocked");
    expect(settleMood(m, 0, SETTLE_MS).state).toBe("idle");
  });
});

describe("mood: more feelings", () => {
  const vol = (address: string, m5: number, h1: number): Quote => ({ ...q(address, 1, 0), volume: { m5, h1, h6: 0, h24: 0 } });

  it("focuses on a volume spike, the biggest one", () => {
    const m = computeMood(input({ quotes: { WIF: vol("WIF", 60_000, 120_000), BONK: vol("BONK", 30_000, 120_000) } }));
    expect(m).toMatchObject({ state: "focused", subject: "WIF", lasting: "move" });
    expect(m.text).toBe("WIF volume is heating up: 6x the hour's pace.");
  });

  it("ignores spikes on dust volume", () => {
    expect(computeMood(input({ quotes: { WIF: vol("WIF", 5_000, 1_200) } })).state).not.toBe("focused");
  });

  it("gets nervous in extreme fear, when nothing else is going on", () => {
    const calm = { WIF: q("WIF", 1, 0) };
    expect(computeMood(input({ quotes: calm, fearGreed: 15 }))).toMatchObject({ state: "nervous", text: "Extreme fear in crypto: 15/100." });
    expect(computeMood(input({ quotes: calm, fearGreed: 45 })).state).not.toBe("nervous");
    expect(computeMood(input({ quotes: { WIF: q("WIF", 1, 9) }, fearGreed: 15 })).state).toBe("happy");
  });
});

describe("mood: and six more", () => {
  it("gets dizzy when a token swings hard both ways", () => {
    const m = computeMood(input({ quotes: { WIF: q("WIF", -9, 12), BONK: q("BONK", 1, 0) } }));
    expect(m).toMatchObject({ state: "dizzy", subject: "WIF", lasting: "move" });
    expect(m.text).toBe("WIF is all over the place: +12.0% 1h, −9.0% 5m.");
    expect(computeMood(input({ quotes: { WIF: q("WIF", 9, 12) } })).state).not.toBe("dizzy");
  });

  it("feels sick in a rough hour, worse than worried", () => {
    expect(computeMood(input({ quotes: { WIF: q("WIF", 1, -20), BONK: q("BONK", 1, -12) } })).state).toBe("sick");
    expect(computeMood(input({ quotes: { WIF: q("WIF", 1, -8), BONK: q("BONK", 1, -4) } })).state).toBe("worried");
  });

  it("gets excited in extreme greed", () => {
    expect(computeMood(input({ quotes: { WIF: q("WIF", 1, 0) }, fearGreed: 84 }))).toMatchObject({ state: "excited", text: "Extreme greed in crypto: 84/100." });
  });
});
