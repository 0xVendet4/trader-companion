/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { bestPairFor, extractAddress, parseInput, toQuote, type DexPair } from "./dexscreener";
import { nativeCoins, tokenKey } from "./chains";
import { AXIOM_REFERRAL_URL, RPC_KEY_SITES, terminalLabel, tokenUrl } from "./links";
import { sortTrending } from "./trending";
import type { TrendingItem } from "../core/state";

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const PAIR = "5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9";
const EVM = "0xB7C0007ab75350c582d5eAb1862b872B5cF53F0C";
const POOL = "0x7f8271c1a7a6a434f33b0babc15bf2980a0dcb4196848b4f7e789a7fd73a5350";

describe("parseInput", () => {
  it("reads a bare Solana address", () => {
    expect(extractAddress(`  ${BONK} `)).toBe(BONK);
    expect(parseInput(BONK)).toEqual({ kind: "address", address: BONK, chainId: "solana", isPool: false });
  });

  it("reads trading-terminal and explorer links, with their chain", () => {
    expect(extractAddress(`https://gmgn.ai/sol/token/${BONK}`)).toBe(BONK);
    expect(extractAddress(`https://gmgn.ai/sol/token/abc_${BONK}?ref=x`)).toBe(BONK);
    expect(extractAddress(`https://axiom.trade/meme/${PAIR}`)).toBe(PAIR);
    expect(extractAddress(`https://dexscreener.com/solana/${PAIR.toLowerCase()}`)).toBe(PAIR.toLowerCase());
    expect(parseInput(`https://gmgn.ai/bsc/token/${EVM}`)).toMatchObject({ address: EVM, chainId: "bsc" });
    expect(parseInput(`https://etherscan.io/token/${EVM}`)).toMatchObject({ address: EVM, chainId: "ethereum" });
    expect(parseInput(`https://dexscreener.com/robinhood/${POOL}`)).toMatchObject({ address: POOL, chainId: "robinhood", isPool: true });
  });

  it("leaves an EVM address's chain open when nothing names it", () => {
    expect(parseInput(EVM)).toEqual({ kind: "address", address: EVM, chainId: null, isPool: false });
    expect(parseInput(POOL)).toMatchObject({ chainId: null, isPool: true });
  });

  it("treats anything else as a search", () => {
    expect(parseInput("pump")).toEqual({ kind: "query", query: "pump" });
    expect(parseInput("$BONK")).toEqual({ kind: "query", query: "BONK" });
    expect(extractAddress("WIF")).toBeNull();
  });
});

describe("tokenKey", () => {
  it("keeps Solana keys as bare mints and namespaces EVM chains", () => {
    expect(tokenKey("solana", BONK)).toBe(BONK);
    expect(tokenKey("bsc", EVM)).toBe(`bsc:${EVM.toLowerCase()}`);
    expect(tokenKey("ethereum", EVM)).not.toBe(tokenKey("bsc", EVM));
  });

  it("lists each native coin once", () => {
    expect(nativeCoins(["robinhood", "ethereum", "solana"]).map((n) => n.symbol)).toEqual(["SOL", "ETH"]);
    expect(nativeCoins(["bsc"]).map((n) => n.symbol)).toEqual(["BNB"]);
  });
});

describe("bestPairFor", () => {
  const pair = (address: string, liq: number, chainId = "solana"): DexPair => ({
    chainId,
    dexId: "raydium",
    pairAddress: `${address}-${liq}`,
    baseToken: { address, name: "x", symbol: "X" },
    quoteToken: { address: "SOL", symbol: "SOL" },
    liquidity: { usd: liq },
  });

  it("picks the most liquid pair on the chain where the token is the base", () => {
    const best = bestPairFor("solana", BONK, [pair(BONK, 10), pair(BONK, 500), pair("OTHER", 9999), pair(BONK, 9999, "ethereum")]);
    expect(best?.pairAddress).toBe(`${BONK}-500`);
  });

  it("ignores checksum casing on EVM chains", () => {
    expect(bestPairFor("bsc", EVM.toLowerCase(), [pair(EVM, 5, "bsc")])).not.toBeNull();
  });

  it("maps a pair to a quote, falling back from market cap to FDV", () => {
    const q = toQuote(BONK, { ...pair(BONK, 1), priceUsd: "0.000003924", fdv: 348_757_067, priceChange: { m5: -0.04, h1: 2 } }, 7);
    expect(q.priceUsd).toBeCloseTo(0.000003924);
    expect(q.marketCap).toBe(348_757_067);
    expect(q.change).toEqual({ m5: -0.04, h1: 2, h6: 0, h24: 0 });
    expect(q.updatedAt).toBe(7);
  });
});

describe("tokenUrl", () => {
  const sol = { chainId: "solana" as const, address: BONK, pairAddress: PAIR };
  const bsc = { chainId: "bsc" as const, address: EVM, pairAddress: "0xpair" };
  const hood = { chainId: "robinhood" as const, address: EVM, pairAddress: POOL };

  it("opens GMGN by mint and Axiom / DexScreener by pair", () => {
    expect(tokenUrl("gmgn", sol)).toBe(`https://gmgn.ai/sol/token/KtvxEtPr_${BONK}`);
    // The app reads its own GMGN links back (a shared link pasted into the field).
    expect(extractAddress(tokenUrl("gmgn", sol))).toBe(BONK);
    expect(tokenUrl("axiom", sol)).toBe(`https://axiom.trade/meme/${PAIR}`);
    expect(tokenUrl("dexscreener", sol)).toBe(`https://dexscreener.com/solana/${PAIR}`);
  });

  it("uses GMGN's chain paths and falls back to DexScreener where a terminal lacks the chain", () => {
    expect(tokenUrl("gmgn", bsc)).toBe(`https://gmgn.ai/bsc/token/KtvxEtPr_${EVM}`);
    expect(tokenUrl("axiom", bsc)).toBe("https://dexscreener.com/bsc/0xpair");
    expect(tokenUrl("gmgn", hood)).toBe(`https://dexscreener.com/robinhood/${POOL}`);
    expect(terminalLabel("gmgn", hood)).toBe("DexScreener");
  });
});

describe("sortTrending", () => {
  const item = (sym: string, vol: number, mc: number, liq: number, age: number): TrendingItem => ({
    token: { key: sym, chainId: "solana", address: sym, symbol: sym, name: sym, pairAddress: sym, dexId: "x", imageUrl: null },
    quote: {
      address: sym,
      pairAddress: sym,
      priceUsd: 1,
      marketCap: mc,
      liquidityUsd: liq,
      change: { m5: 0, h1: 0, h6: 0, h24: 0 },
      volume: { m5: vol, h1: vol * 10, h6: 0, h24: 0 },
      txnsM5: { buys: 0, sells: 0 },
      updatedAt: 0,
    },
    boost: 0,
    pairCreatedAt: age,
  });
  const list = [item("A", 5, 300, 20, 1), item("B", 50, 100, 30, 3), item("C", 1, 200, 90, 2)];
  const order = (by: Parameters<typeof sortTrending>[1]) => sortTrending(list, by, "m5").map((x) => x.token.symbol).join("");

  it("sorts by volume, market cap, liquidity or newest", () => {
    expect(order("volume")).toBe("BAC");
    expect(order("mcap")).toBe("ACB");
    expect(order("liquidity")).toBe("CBA");
    expect(order("newest")).toBe("BCA");
  });
});

describe("backedLiquidity", () => {
  // Real numbers from a search for "pump": a fake PUMP on Ethereum and the real one on Solana.
  const fake: DexPair = {
    chainId: "ethereum",
    dexId: "uniswap",
    pairAddress: "0xfake",
    baseToken: { address: EVM, name: "Pump.fun", symbol: "PUMP" },
    quoteToken: { address: "0xweth", symbol: "WETH" },
    priceUsd: "2.06",
    priceNative: "0.000759",
    liquidity: { usd: 1_032_807_676, quote: 0.0004099 },
  };
  const real: DexPair = {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: PAIR,
    baseToken: { address: BONK, name: "Pump", symbol: "PUMP" },
    quoteToken: { address: "usdc", symbol: "USDC" },
    priceUsd: "0.002988",
    priceNative: "0.002988",
    liquidity: { usd: 28_000_308, quote: 13_982_694 },
  };

  it("sees through a pool priced off itself", async () => {
    const { backedLiquidity, suspectLiquidity } = await import("./dexscreener");
    expect(backedLiquidity(fake)).toBeLessThan(5);
    expect(suspectLiquidity(fake)).toBe(true);
  });

  it("leaves a healthy pool's liquidity as reported", async () => {
    const { backedLiquidity, suspectLiquidity } = await import("./dexscreener");
    // Both sides of a healthy pool are nearly equal: within 1% of the reported figure.
    expect(Math.abs(backedLiquidity(real) - 28_000_308) / 28_000_308).toBeLessThan(0.01);
    expect(suspectLiquidity(real)).toBe(false);
  });

  it("quotes a token from its real pool, not the inflated one", () => {
    expect(bestPairFor("ethereum", EVM, [fake, { ...fake, pairAddress: "0xreal", liquidity: { usd: 400_000, quote: 70 } }])?.pairAddress).toBe("0xreal");
  });
});

describe("referral links", () => {
  it("are on hosts the app may open", () => {
    expect(new URL(AXIOM_REFERRAL_URL).host).toBe("axiom.trade");
    expect(new URL(tokenUrl("gmgn", { chainId: "solana", address: "So11111111111111111111111111111111111111112", pairAddress: "p" })).host).toBe("gmgn.ai");
  });
});

describe("free RPC key sites", () => {
  it("are https pages on hosts Rust lets the app open", async () => {
    const { readFileSync } = await import("node:fs");
    const lib = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");
    const allowed = lib.slice(lib.indexOf("const ALLOWED_HOSTS"), lib.indexOf("];", lib.indexOf("const ALLOWED_HOSTS")));
    for (const site of RPC_KEY_SITES) {
      const url = new URL(site.url);
      expect(url.protocol).toBe("https:");
      expect(allowed).toContain(`"${url.host}"`);
    }
  });
});
