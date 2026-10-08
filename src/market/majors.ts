// Major coins on the watchlist: BTC, ETH, SOL, DOGE… They are not DEX tokens,
// so each is priced from a liquid token that tracks it on a supported chain
// (wrapped BTC on Ethereum, Binance-Peg DOGE on BSC…): DexScreener gives its
// price, its 5m/1h/24h moves and the chart, like any token. What it can't give
// is the coin's own market cap and volume — a wrapped token's are a sliver of
// the coin's — so those come from CoinGecko (see coingecko.ts), with its rank.
//
// Which coins are majors is live: CoinGecko's largest by market cap right now,
// less the dollars, the gold and the wrapped or staked copies of another coin
// (liveMajors). Each is priced from KNOWN's token when it has one, else from a
// token that is provably the coin: the same symbol, at the coin's price, with
// real money behind it (trackingPair), or the contract CoinGecko gives for it.
// A copycat sharing the ticker has neither the price nor the money. A coin no
// token tracks on these chains (Stellar, Sui…) can't be priced, so it isn't
// offered. Without CoinGecko, KNOWN stands in. Pure, like the rest of
// src/market's logic.

import type { ChainId } from "./chains";
import { isChain, tokenKey } from "./chains";
import { backedLiquidity, suspectLiquidity, type DexPair } from "./dexscreener";
import type { Quote, WatchToken } from "../core/state";

export interface Major {
  symbol: string;
  name: string;
  /** The token that tracks it, on a chain DexScreener covers. */
  chainId: ChainId;
  address: string;
  /** CoinGecko's id, for the coin's own market cap, 24 h volume and rank. */
  coingecko: string;
  /** The coin's logo (its tracking token rarely has one), when CoinGecko gave it. */
  image?: string | null;
}

/** A coin on CoinGecko's market list, as Candy reads it. */
export interface Coin {
  id: string;
  /** Upper case, as tickers are shown. */
  symbol: string;
  name: string;
  /** By market cap, CoinGecko's own count (its dollars included). */
  rank: number | null;
  priceUsd: number | null;
  marketCap: number | null;
  volume24h: number | null;
  /** Its logo, on CoinGecko's image host only (see coingecko.ts). */
  image: string | null;
}

/** How many of CoinGecko's largest coins, the dollars and copies left out, are majors. */
export const MAJOR_COUNT = 30;

/** Tracking tokens checked by hand on DexScreener (liquidity) and CoinGecko (price) on 2026-10-07. */
export const KNOWN: readonly Major[] = [
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

const KNOWN_BY_KEY = new Map(KNOWN.map((m) => [tokenKey(m.chainId, m.address), m]));
const KNOWN_BY_ID = new Map(KNOWN.map((m) => [m.coingecko, m]));

/** A known tracking token (WBTC is BTC), by its key. */
export function knownMajor(key: string): Major | null {
  return KNOWN_BY_KEY.get(key) ?? null;
}

/** KNOWN's tracking token for a coin, under the coin's name and logo today. */
export function knownTracker(c: Pick<Coin, "id" | "symbol" | "name"> & Partial<Pick<Coin, "image">>): Major | null {
  const m = KNOWN_BY_ID.get(c.id);
  return m ? { ...m, symbol: c.symbol, name: c.name, image: c.image ?? null } : null;
}

/**
 * The CoinGecko id of the coin a watchlist token stands for: a major added from
 * a search carries it; one saved before that is known by its tracking token.
 */
export function majorFor(t: Pick<WatchToken, "key"> & Partial<Pick<WatchToken, "coingecko">>): string | null {
  return t.coingecko ?? KNOWN_BY_KEY.get(t.key)?.coingecko ?? null;
}

const PEGGED = /usd|dollar|euro|\beur\b|gold|xau/i;
const COPY = /wrapped|staked|bridged|binance-peg|\bpeg\b/i;

/**
 * The majors in CoinGecko's list: its largest coins, less those pegged to a
 * currency or to gold, and the copies of a larger coin, by name ("Wrapped
 * Bitcoin", "Lido Staked Ether") or by ticker (WETH, BTCB, JitoSOL).
 */
export function liveMajors(coins: readonly Coin[], count = MAJOR_COUNT): Coin[] {
  const kept: Coin[] = [];
  const ranked = [...coins].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  for (const c of ranked) {
    if (kept.length >= count) break;
    const sym = c.symbol.toLowerCase();
    if (PEGGED.test(`${c.name} ${c.symbol}`) || sym === "dai" || COPY.test(c.name)) continue;
    const copies = kept.some((k) => {
      const of = k.symbol.toLowerCase();
      return of.length >= 3 && sym.length > of.length && (sym.startsWith(of) || sym.endsWith(of));
    });
    if (!copies) kept.push(c);
  }
  return kept;
}

/** Coins a search means: by symbol ("btc", "$btc") or a word of the name ("bitcoin", "shiba"). */
export function searchMajors<T extends { symbol: string; name: string }>(query: string, list: readonly T[]): T[] {
  const q = query.trim().replace(/^\$/, "").toLowerCase();
  if (q.length < 2) return [];
  return list.filter(
    (m) => m.symbol.toLowerCase() === q || m.name.toLowerCase() === q || (q.length >= 3 && m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))),
  );
}

/** Real money a tracking token's pool needs for its price to mean something. */
export const MIN_TRACKING_LIQUIDITY = 100_000;
/** How far a tracking token's price may sit from the coin's (CoinGecko lags a little). */
const PRICE_TOLERANCE = 0.03;

/** A pair whose base token trades at the coin's price, with real money behind it. */
export function pricedLike(c: Pick<Coin, "priceUsd">, p: DexPair): boolean {
  const price = Number(p.priceUsd);
  if (!c.priceUsd || !(price > 0) || Math.abs(price / c.priceUsd - 1) > PRICE_TOLERANCE) return false;
  return !suspectLiquidity(p) && backedLiquidity(p) >= MIN_TRACKING_LIQUIDITY;
}

/**
 * The token that tracks a coin among DexScreener pairs: on a chain Candy
 * reads, with the coin's ticker (or its wrapped one, WBTC), priced like it;
 * the most liquid wins. `anySymbol` for pairs of a contract CoinGecko named.
 */
export function trackingPair(c: Coin, pairs: readonly DexPair[], anySymbol = false): DexPair | null {
  const S = c.symbol.toUpperCase();
  let best: DexPair | null = null;
  for (const p of pairs) {
    if (!isChain(p.chainId) || !p.baseToken) continue;
    const b = p.baseToken.symbol.toUpperCase();
    if (!anySymbol && b !== S && b !== `W${S}`) continue;
    if (!pricedLike(c, p)) continue;
    if (!best || backedLiquidity(p) > backedLiquidity(best)) best = p;
  }
  return best;
}

/** The major a tracking pair makes of a coin. */
export function majorOf(c: Coin, p: DexPair): Major | null {
  if (!isChain(p.chainId)) return null;
  return { symbol: c.symbol, name: c.name, chainId: p.chainId, address: p.baseToken.address, coingecko: c.id, image: c.image };
}

/** The watchlist entry for a major: its own name, symbol and logo, priced from its tracking token. */
export function majorToken(m: Major, from: Pick<WatchToken, "pairAddress" | "dexId" | "imageUrl"> | null): WatchToken {
  return {
    key: tokenKey(m.chainId, m.address),
    chainId: m.chainId,
    address: m.address,
    symbol: m.symbol,
    name: m.name,
    pairAddress: from?.pairAddress ?? "",
    dexId: from?.dexId ?? "",
    imageUrl: m.image ?? from?.imageUrl ?? null,
    coingecko: m.coingecko,
  };
}

/**
 * A major's quote: DexScreener's price and moves, with the coin's own market
 * cap, 24 h volume and rank (null until CoinGecko answers). The tracking
 * pool's liquidity, trades and short-frame volume say nothing about the coin:
 * gone.
 */
export function asMajor(q: Quote, coin: Coin | undefined): Quote {
  const none = { buys: 0, sells: 0 };
  return {
    ...q,
    marketCap: coin?.marketCap ?? null,
    liquidityUsd: null,
    suspectLiquidity: false,
    volume: { m5: 0, h1: 0, h6: 0, h24: coin?.volume24h ?? 0 },
    txnsM5: none,
    txns: undefined,
    major: true,
    rank: coin?.rank ?? null,
  };
}
