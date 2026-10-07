import { describe, expect, it } from "vitest";
import type { Quote } from "../core/state";
import { EVM_ADDRESS, SOLANA_ADDRESS, isEvm, tokenKey } from "./chains";
import { toMarkets } from "./coingecko";
import { MAJORS, asMajor, majorFor, majorToken, searchMajors } from "./majors";

const quote = (over: Partial<Quote> = {}): Quote => ({
  address: "k",
  pairAddress: "p",
  priceUsd: 83_000,
  marketCap: 9_600_000_000,
  liquidityUsd: 29_800_000,
  change: { m5: 0.1, h1: -0.5, h6: -1, h24: -3.7 },
  volume: { m5: 1, h1: 2, h6: 3, h24: 31_000_000 },
  txnsM5: { buys: 5, sells: 7 },
  txns: { m5: { buys: 5, sells: 7 }, h1: { buys: 1, sells: 1 }, h6: { buys: 1, sells: 1 }, h24: { buys: 1, sells: 1 } },
  updatedAt: 0,
  ...over,
});

describe("majors", () => {
  it("lists each coin once, with a valid address on its chain", () => {
    const symbols = MAJORS.map((m) => m.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(new Set(MAJORS.map((m) => tokenKey(m.chainId, m.address))).size).toBe(MAJORS.length);
    for (const m of MAJORS) {
      expect(isEvm(m.chainId) ? EVM_ADDRESS.test(m.address) : SOLANA_ADDRESS.test(m.address), m.symbol).toBe(true);
    }
  });

  it("knows a major by its tracking token, whatever the address's case", () => {
    expect(majorFor({ chainId: "ethereum", address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" })?.symbol).toBe("BTC");
    expect(majorFor({ key: "So11111111111111111111111111111111111111112" })?.symbol).toBe("SOL");
    expect(majorFor({ chainId: "solana", address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" })).toBeNull();
  });

  it("finds majors by symbol or name, never by a partial ticker", () => {
    expect(searchMajors("btc").map((m) => m.symbol)).toEqual(["BTC"]);
    expect(searchMajors("$DOGE").map((m) => m.symbol)).toEqual(["DOGE"]);
    expect(searchMajors("bitcoin").map((m) => m.symbol)).toEqual(["BTC"]);
    expect(searchMajors("shiba").map((m) => m.symbol)).toEqual(["SHIB"]);
    expect(searchMajors("bt")).toEqual([]);
    expect(searchMajors("pump")).toEqual([]);
  });

  it("names a major after the coin, not its tracking token", () => {
    const btc = MAJORS[0];
    const t = majorToken(btc, { pairAddress: "pair", dexId: "uniswap", imageUrl: null });
    expect(t).toMatchObject({ symbol: "BTC", name: "Bitcoin", chainId: "ethereum", pairAddress: "pair" });
    expect(t.key).toBe(tokenKey("ethereum", btc.address));
  });

  it("shows the coin's own market cap and volume, and none of the pool's numbers", () => {
    const q = asMajor(quote(), { marketCap: 1.66e12, volume24h: 3.8e10 });
    expect(q).toMatchObject({ major: true, priceUsd: 83_000, marketCap: 1.66e12, liquidityUsd: null, txns: undefined });
    expect(q.change).toEqual(quote().change);
    expect(q.volume).toEqual({ m5: 0, h1: 0, h6: 0, h24: 3.8e10 });
    // CoinGecko not in yet: no market cap rather than the wrapped token's.
    expect(asMajor(quote(), undefined).marketCap).toBeNull();
  });
});

describe("CoinGecko", () => {
  it("reads each id's market cap and volume, and leaves out what it didn't send", () => {
    const body = { bitcoin: { usd: 83007, usd_market_cap: 1.667e12, usd_24h_vol: 3.82e10 }, dogecoin: { usd_market_cap: null } };
    expect(toMarkets(["bitcoin", "dogecoin", "ripple"], body)).toEqual({
      bitcoin: { marketCap: 1.667e12, volume24h: 3.82e10 },
      dogecoin: { marketCap: null, volume24h: null },
    });
  });
});
