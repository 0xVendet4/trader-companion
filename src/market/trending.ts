// Trending tokens: DexScreener's most boosted tokens ("Hot") and its newest
// token profiles ("New") on the chains the user follows, priced with the same
// token endpoint as the watchlist, then sorted by the user's choice. Boosts are
// paid promotion — the list shows what is being pushed, not what is good.

import type { Timeframe, TrendingItem, TrendingSort } from "../core/state";
import { isChain, tokenKey, type ChainId } from "./chains";
import { fetchPairs, getJson, toQuote, toWatchToken } from "./dexscreener";

interface Listing {
  chainId: string;
  tokenAddress: string;
  icon?: string;
  totalAmount?: number;
}

/** Per list, across all chosen chains. */
const PER_LIST = 24;

export async function fetchTrending(
  chains: ChainId[],
  signal?: AbortSignal,
): Promise<{ hot: TrendingItem[]; fresh: TrendingItem[] }> {
  const [boosts, profiles] = await Promise.all([
    getJson<Listing[]>("/token-boosts/top/v1", signal),
    getJson<Listing[]>("/token-profiles/latest/v1", signal),
  ]);
  const pick = (list: Listing[]) => {
    const seen = new Set<string>();
    return (Array.isArray(list) ? list : [])
      .filter((x): x is Listing & { chainId: ChainId } => isChain(x.chainId) && chains.includes(x.chainId))
      .filter((x) => {
        const k = tokenKey(x.chainId, x.tokenAddress);
        return !seen.has(k) && !!seen.add(k);
      })
      .slice(0, PER_LIST);
  };
  const hot = pick(boosts);
  const fresh = pick(profiles);
  const pairs = await fetchPairs(
    [...hot, ...fresh].map((x) => ({ chainId: x.chainId, address: x.tokenAddress })),
    signal,
  );
  const now = Date.now();

  const toItems = (list: (Listing & { chainId: ChainId })[]): TrendingItem[] =>
    list.flatMap((x) => {
      const key = tokenKey(x.chainId, x.tokenAddress);
      const pair = pairs[key];
      if (!pair) return [];
      const token = toWatchToken(pair);
      if (!token.imageUrl && x.icon) token.imageUrl = x.icon;
      return [{ token, quote: toQuote(key, pair, now), boost: x.totalAmount ?? 0, pairCreatedAt: pair.pairCreatedAt ?? null }];
    });

  return { hot: toItems(hot), fresh: toItems(fresh) };
}

/** Sorts a trending list: by volume (in the timeframe), market cap, liquidity, or newest pair first. */
export function sortTrending(items: TrendingItem[], by: TrendingSort, frame: Timeframe): TrendingItem[] {
  const value = (x: TrendingItem): number => {
    switch (by) {
      case "volume":
        return x.quote?.volume[frame] ?? 0;
      case "mcap":
        return x.quote?.marketCap ?? 0;
      case "liquidity":
        return x.quote?.liquidityUsd ?? 0;
      case "newest":
        return x.pairCreatedAt ?? 0;
    }
  };
  return [...items].sort((a, b) => value(b) - value(a));
}
