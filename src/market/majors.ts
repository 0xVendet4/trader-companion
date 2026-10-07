// Major coins on the watchlist: BTC, ETH, SOL, DOGE… They are not DEX tokens,
// so each is priced from a fixed, liquid token that tracks it on a supported
// chain (wrapped BTC on Ethereum, Binance-Peg DOGE on BSC…): DexScreener gives
// its price, its 5m/1h/24h moves and the chart, like any token. What it can't
// give is the coin's own market cap and volume — a wrapped token's are a sliver
// of the coin's — so those come from CoinGecko (see coingecko.ts).
//
// The list is curated by address on purpose: typing "btc" finds this BTC first,
// never one of the copycats that share the ticker. Pure, like the rest of
// src/market's logic.

import type { ChainId } from "./chains";
import { tokenKey } from "./chains";
import type { Quote, WatchToken } from "../core/state";

export interface Major {
  symbol: string;
  name: string;
  /** The token that tracks it, on a chain DexScreener covers. */
  chainId: ChainId;
  address: string;
  /** CoinGecko's id, for the coin's own market cap and 24 h volume. */
  coingecko: string;
}

/** Checked on DexScreener (liquidity) and CoinGecko (price) on 2026-10-07. */
export const MAJORS: readonly Major[] = [
  { symbol: "BTC", name: "Bitcoin", chainId: "ethereum", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", coingecko: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", chainId: "ethereum", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", coingecko: "ethereum" },
  { symbol: "SOL", name: "Solana", chainId: "solana", address: "So11111111111111111111111111111111111111112", coingecko: "solana" },
  { symbol: "BNB", name: "BNB", chainId: "bsc", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", coingecko: "binancecoin" },
  { symbol: "XRP", name: "XRP", chainId: "bsc", address: "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", coingecko: "ripple" },
  { symbol: "DOGE", name: "Dogecoin", chainId: "bsc", address: "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", coingecko: "dogecoin" },
  { symbol: "ADA", name: "Cardano", chainId: "bsc", address: "0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", coingecko: "cardano" },
  { symbol: "TRX", name: "TRON", chainId: "bsc", address: "0xCE7de646e7208a4Ef112cb6ed5038FA6cC6b12e3", coingecko: "tron" },
  { symbol: "AVAX", name: "Avalanche", chainId: "bsc", address: "0x1CE0c2827e2eF14D5C4f29a091d735A204794041", coingecko: "avalanche-2" },
  { symbol: "LINK", name: "Chainlink", chainId: "ethereum", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", coingecko: "chainlink" },
  { symbol: "DOT", name: "Polkadot", chainId: "bsc", address: "0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402", coingecko: "polkadot" },
  { symbol: "LTC", name: "Litecoin", chainId: "bsc", address: "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94", coingecko: "litecoin" },
  { symbol: "TON", name: "Toncoin", chainId: "ethereum", address: "0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1", coingecko: "the-open-network" },
  { symbol: "SHIB", name: "Shiba Inu", chainId: "ethereum", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", coingecko: "shiba-inu" },
  { symbol: "PEPE", name: "Pepe", chainId: "ethereum", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", coingecko: "pepe" },
];

const BY_KEY = new Map(MAJORS.map((m) => [tokenKey(m.chainId, m.address), m]));

/** The major coin a token stands for, if it is one of them. */
export function majorFor(t: Pick<WatchToken, "key"> | { chainId: ChainId; address: string }): Major | null {
  const key = "key" in t ? t.key : tokenKey(t.chainId, t.address);
  return BY_KEY.get(key) ?? null;
}

/** Majors a search means: its symbol ("btc", "$btc") or a word of its name ("bitcoin", "shiba"). */
export function searchMajors(query: string): Major[] {
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  if (q.length < 2) return [];
  return MAJORS.filter(
    (m) => m.symbol.toLowerCase() === q || m.name.toLowerCase() === q || (q.length >= 3 && m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))),
  );
}

/** The watchlist entry for a major: its own name and symbol, priced from its tracking token. */
export function majorToken(m: Major, from: Pick<WatchToken, "pairAddress" | "dexId" | "imageUrl"> | null): WatchToken {
  return {
    key: tokenKey(m.chainId, m.address),
    chainId: m.chainId,
    address: m.address,
    symbol: m.symbol,
    name: m.name,
    pairAddress: from?.pairAddress ?? "",
    dexId: from?.dexId ?? "",
    imageUrl: from?.imageUrl ?? null,
  };
}

/** A major's market cap and 24 h volume, from CoinGecko. */
export interface MajorMarket {
  marketCap: number | null;
  volume24h: number | null;
}

/**
 * A major's quote: DexScreener's price and moves, with the coin's own market
 * cap and 24 h volume (null until CoinGecko answers). The tracking pool's
 * liquidity, trades and short-frame volume say nothing about the coin: gone.
 */
export function asMajor(q: Quote, market: MajorMarket | undefined): Quote {
  const none = { buys: 0, sells: 0 };
  return {
    ...q,
    marketCap: market?.marketCap ?? null,
    liquidityUsd: null,
    suspectLiquidity: false,
    volume: { m5: 0, h1: 0, h6: 0, h24: market?.volume24h ?? 0 },
    txnsM5: none,
    txns: undefined,
    major: true,
  };
}
