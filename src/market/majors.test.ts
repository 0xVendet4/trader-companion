import { describe, expect, it } from "vitest";
import type { Quote } from "../core/state";
import { EVM_ADDRESS, SOLANA_ADDRESS, isEvm, tokenKey } from "./chains";
import { toCoins, toContracts } from "./coingecko";
import type { DexPair } from "./dexscreener";
import {
  KNOWN,
  asMajor,
  knownTracker,
  liveMajors,
  majorFor,
  majorOf,
  majorToken,
  searchMajors,
  trackingPair,
  type Coin,
} from "./majors";

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

const coin = (rank: number, symbol: string, name: string, priceUsd: number | null = 1.5): Coin => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  symbol,
  name,
  rank,
  priceUsd,
  marketCap: 1e9,
  volume24h: 1e8,
});

/** A pool quoted in a dollar: `backed` is the real money on its quote side. */
const pair = (chainId: string, symbol: string, address: string, priceUsd: number, backed: number, reported = backed): DexPair => ({
  chainId,
  dexId: "pancakeswap",
  pairAddress: `pair-${address}`,
  baseToken: { address, name: symbol, symbol },
  quoteToken: { address: "usdt", symbol: "USDT" },
  priceUsd: String(priceUsd),
  priceNative: String(priceUsd),
  liquidity: { usd: reported, quote: backed / 2 },
});

const BSC_XRP = "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE";
const SUI_ON_BSC = "0x0000000000000000000000000000000000005151";

describe("majors", () => {
  it("knows each coin once, with a valid address on its chain", () => {
    const ids = KNOWN.map((m) => m.coingecko);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(KNOWN.map((m) => tokenKey(m.chainId, m.address))).size).toBe(KNOWN.length);
    for (const m of KNOWN) {
      expect(isEvm(m.chainId) ? EVM_ADDRESS.test(m.address) : SOLANA_ADDRESS.test(m.address), m.symbol).toBe(true);
    }
  });

  it("knows a major by the id it was added with, or by a known tracking token", () => {
    expect(majorFor({ key: "bsc:0xabc", coingecko: "sui" })).toBe("sui");
    expect(majorFor({ key: tokenKey("ethereum", "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599") })).toBe("bitcoin");
    expect(majorFor({ key: "So11111111111111111111111111111111111111112" })).toBe("solana");
    expect(majorFor({ key: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" })).toBeNull();
  });

  it("takes the largest coins, without the dollars, the gold or another coin's copies", () => {
    const list = [
      coin(1, "BTC", "Bitcoin"),
      coin(2, "ETH", "Ethereum"),
      coin(3, "USDT", "Tether"),
      coin(4, "BNB", "BNB"),
      coin(6, "USDC", "USDC"),
      coin(7, "SOL", "Solana"),
      coin(8, "STETH", "Lido Staked Ether"),
      coin(9, "WBTC", "Wrapped Bitcoin"),
      coin(10, "WETH", "WETH"),
      coin(11, "BTCB", "Binance Bitcoin"),
      coin(12, "JITOSOL", "Jito Staked SOL"),
      coin(13, "DAI", "Dai"),
      coin(14, "XAUT", "Tether Gold"),
      coin(15, "M", "MemeCore"),
      coin(16, "MNT", "Mantle"),
      coin(17, "BUIDL", "BlackRock USD Institutional Digital Liquidity Fund"),
      coin(18, "HYPE", "Hyperliquid"),
    ];
    expect(liveMajors(list).map((c) => c.symbol)).toEqual(["BTC", "ETH", "BNB", "SOL", "M", "MNT", "HYPE"]);
    expect(liveMajors([...list].reverse(), 3).map((c) => c.symbol)).toEqual(["BTC", "ETH", "BNB"]);
  });

  it("finds coins by symbol or name, never by a partial ticker", () => {
    const list = [coin(1, "BTC", "Bitcoin"), coin(12, "DOGE", "Dogecoin"), coin(22, "BCH", "Bitcoin Cash"), coin(38, "SHIB", "Shiba Inu")];
    expect(searchMajors("btc", list).map((m) => m.symbol)).toEqual(["BTC"]);
    expect(searchMajors("$DOGE", list).map((m) => m.symbol)).toEqual(["DOGE"]);
    expect(searchMajors("bitcoin", list).map((m) => m.symbol)).toEqual(["BTC", "BCH"]);
    expect(searchMajors("shiba", list).map((m) => m.symbol)).toEqual(["SHIB"]);
    expect(searchMajors("bt", list)).toEqual([]);
    expect(searchMajors("pump", KNOWN)).toEqual([]);
  });

  it("prices a coin from the token at its price with real money, never a copycat", () => {
    const xrp = coin(5, "XRP", "XRP", 1.42);
    const real = pair("bsc", "XRP", BSC_XRP, 1.41, 3_000_000);
    const pairs = [
      pair("solana", "XRP", "4LfyphdTrarWmuBXaCy4FngUUnLTX33QiwySh6gkCDMM", 1.39, 20, 1_400_000_000), // fake pool
      pair("bsc", "XRP", "0x0000000000000000000000000000000000000001", 0.02, 5_000_000), // another price
      pair("xrpl", "XRP", "native", 1.42, 90_000_000), // a chain Candy doesn't read
      pair("bsc", "XRP", "0x0000000000000000000000000000000000000002", 1.42, 50_000), // too thin
      pair("ethereum", "XRPX", "0x0000000000000000000000000000000000000003", 1.42, 9_000_000), // another ticker
      real,
    ];
    expect(trackingPair(xrp, pairs)).toBe(real);
    expect(majorOf(xrp, real)).toEqual({ symbol: "XRP", name: "XRP", chainId: "bsc", address: BSC_XRP, coingecko: "xrp" });
    expect(trackingPair(xrp, pairs.slice(0, 5))).toBeNull();
    // Its wrapped ticker counts; a contract CoinGecko named, any ticker.
    expect(trackingPair(coin(1, "BTC", "Bitcoin", 83_000), [pair("ethereum", "WBTC", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 82_900, 9e7)])).not.toBeNull();
    expect(trackingPair(coin(26, "UNI", "Uniswap", 7.84), [pair("ethereum", "Uni", "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 7.84, 150_000)], true)).not.toBeNull();
    // No price from CoinGecko: nothing to check against.
    expect(trackingPair(coin(5, "XRP", "XRP", null), [real])).toBeNull();
  });

  it("names a known coin as CoinGecko does today", () => {
    expect(knownTracker({ id: "the-open-network", symbol: "GRAM", name: "Gram" })).toMatchObject({ symbol: "GRAM", name: "Gram", chainId: "ethereum" });
    expect(knownTracker({ id: "sui", symbol: "SUI", name: "Sui" })).toBeNull();
  });

  it("names a major after the coin, not its tracking token, and keeps its id", () => {
    const btc = KNOWN[0];
    const t = majorToken(btc, { pairAddress: "pair", dexId: "uniswap", imageUrl: null });
    expect(t).toMatchObject({ symbol: "BTC", name: "Bitcoin", chainId: "ethereum", pairAddress: "pair", coingecko: "bitcoin" });
    expect(t.key).toBe(tokenKey("ethereum", btc.address));
    expect(majorToken({ symbol: "SUI", name: "Sui", chainId: "bsc", address: SUI_ON_BSC, coingecko: "sui" }, null).coingecko).toBe("sui");
  });

  it("shows the coin's own market cap, volume and rank, and none of the pool's numbers", () => {
    const q = asMajor(quote(), { ...coin(1, "BTC", "Bitcoin"), marketCap: 1.66e12, volume24h: 3.8e10 });
    expect(q).toMatchObject({ major: true, rank: 1, priceUsd: 83_000, marketCap: 1.66e12, liquidityUsd: null, txns: undefined });
    expect(q.change).toEqual(quote().change);
    expect(q.volume).toEqual({ m5: 0, h1: 0, h6: 0, h24: 3.8e10 });
    // CoinGecko not in yet: no market cap rather than the wrapped token's.
    expect(asMajor(quote(), undefined)).toMatchObject({ marketCap: null, rank: null });
  });
});

describe("CoinGecko", () => {
  it("reads the coins it can, and drops the rest", () => {
    const body = [
      { id: "bitcoin", symbol: "btc", name: "Bitcoin", market_cap_rank: 1, current_price: 83007, market_cap: 1.667e12, total_volume: 3.82e10 },
      { id: "dogecoin", symbol: "doge", name: "Dogecoin", market_cap_rank: 12, current_price: 0.088, market_cap: null, total_volume: null },
      { id: "Bad Id/../x", symbol: "x", name: "X" },
      { id: "nameless", symbol: "n" },
    ];
    expect(toCoins(body)).toEqual([
      { id: "bitcoin", symbol: "BTC", name: "Bitcoin", rank: 1, priceUsd: 83007, marketCap: 1.667e12, volume24h: 3.82e10 },
      { id: "dogecoin", symbol: "DOGE", name: "Dogecoin", rank: 12, priceUsd: 0.088, marketCap: null, volume24h: null },
    ]);
    expect(toCoins({ error: "rate limited" })).toEqual([]);
  });

  it("reads a coin's contracts on the chains Candy reads", () => {
    const body = {
      platforms: {
        ethereum: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        "binance-smart-chain": "not an address",
        solana: "",
        "polygon-pos": "0xb33eaad8d922b1083446dc23f610c2567fb5180f",
        "": "",
      },
    };
    expect(toContracts(body)).toEqual([{ chainId: "ethereum", address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" }]);
    expect(toContracts({ platforms: { stellar: "" } })).toEqual([]);
    expect(toContracts(null)).toEqual([]);
  });
});
