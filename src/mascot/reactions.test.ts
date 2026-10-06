import { describe, expect, it } from "vitest";
import type { Quote, WatchToken } from "../core/state";
import { POKES, STREAK_MS, nextStreak, pokeReaction, topMoverFact, type PokeContext } from "./reactions";

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

const q = (address: string, h24: number): Quote => ({
  address,
  pairAddress: `${address}-pair`,
  priceUsd: 1,
  marketCap: 1,
  liquidityUsd: 1,
  change: { m5: 0, h1: 0, h6: 0, h24 },
  volume: { m5: 0, h1: 0, h6: 0, h24: 0 },
  txnsM5: { buys: 0, sells: 0 },
  updatedAt: 0,
});

const ctx = (over: Partial<PokeContext>): PokeContext => ({ streak: 1, mood: "idle", lastPoke: -1, random: 0, fact: null, ...over });

describe("poke streaks", () => {
  it("counts clicks closer than STREAK_MS", () => {
    expect(nextStreak(0, -Infinity, 1000)).toBe(1);
    expect(nextStreak(1, 1000, 1000 + STREAK_MS)).toBe(2);
    expect(nextStreak(4, 1000, 1000 + STREAK_MS + 1)).toBe(1);
  });

  it("escalates at the milestones", () => {
    expect(pokeReaction(ctx({ streak: 2 })).reaction.state).toBe("wave");
    expect(pokeReaction(ctx({ streak: 3 })).reaction.say).toBe("wheee!");
    expect(pokeReaction(ctx({ streak: 5 })).reaction.state).toBe("dizzy");
    expect(pokeReaction(ctx({ streak: 8 })).reaction.state).toBe("angry");
    expect(pokeReaction(ctx({ streak: 8 })).reaction.special).toBe("annoyed");
    expect(pokeReaction(ctx({ streak: 12 })).reaction.special).toBe("costume");
  });

  it("a streak wins over the mood", () => {
    expect(pokeReaction(ctx({ streak: 3, mood: "sleepy" })).reaction.say).toBe("wheee!");
  });
});

describe("single pokes", () => {
  it("never repeats the last poke", () => {
    const first = pokeReaction(ctx({ random: 0 }));
    expect(first.poke).toBe(0);
    const again = pokeReaction(ctx({ random: 0, lastPoke: first.poke }));
    expect(again.poke).not.toBe(first.poke);
  });

  it("reacts to the moment", () => {
    expect(pokeReaction(ctx({ mood: "sleepy" })).reaction.say).toBe("huh? I'm up!");
    expect(pokeReaction(ctx({ mood: "tired" })).reaction.state).toBe("tired");
    expect(pokeReaction(ctx({ mood: "happy", random: 0.1 })).reaction.state).toBe("celebrate");
  });

  it("mentions a fact now and then", () => {
    const fact = { text: "BONK +12.0% today", up: true };
    expect(pokeReaction(ctx({ fact, random: 0.6 })).reaction.say).toBe(fact.text);
    expect(pokeReaction(ctx({ fact, random: 0.9 })).reaction.say).not.toBe(fact.text);
  });

  it("never tells anyone to buy or sell", () => {
    const lines = POKES.map((p) => p.say);
    for (let s = 1; s <= 12; s++) {
      for (const mood of ["idle", "sleepy", "stop", "tired", "worried", "celebrate", "happy"] as const) {
        lines.push(pokeReaction(ctx({ streak: s, mood })).reaction.say);
      }
    }
    for (const l of lines) expect(l).not.toMatch(/\b(buy|sell|ape|dump)\b/i);
  });
});

describe("topMoverFact", () => {
  it("picks the biggest 24h move either way", () => {
    const tokens = [tok("WIF"), tok("BONK")];
    expect(topMoverFact(tokens, { WIF: q("WIF", 4), BONK: q("BONK", -12) })).toEqual({ text: "BONK −12.0% today", up: false });
  });

  it("stays quiet without quotes or with a flat watchlist", () => {
    expect(topMoverFact([tok("WIF")], {})).toBeNull();
    expect(topMoverFact([tok("WIF")], { WIF: q("WIF", 0.3) })).toBeNull();
  });

  it("shortens long symbols", () => {
    const long = tok("AVERYLONGSYMBOLNAME");
    expect(topMoverFact([long], { [long.key]: q(long.key, 20) })?.text).toBe("AVERYLONGSY… +20.0% today");
  });
});
