// DexScreener public API — no key, CORS open, 300 requests/minute on the token,
// pair and search endpoints. One request covers up to 30 tokens of one chain,
// so a full watchlist polled every 10 s stays far below the limit.
//
// https://docs.dexscreener.com/api/reference

import type { Quote, TrendingItem, WatchToken } from "../core/state";
import {
  ALL_CHAINS,
  CHAINS,
  EVM_ADDRESS,
  EVM_POOL_ID,
  SOLANA_ADDRESS,
  isChain,
  isEvm,
  tokenKey,
  type ChainId,
} from "./chains";

const API = "https://api.dexscreener.com";
const BATCH = 30;
const SEARCH_RESULTS = 8;

/** The subset of a DexScreener pair this app reads. */
export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  /** The base token's price in quote-token units. */
  priceNative?: string;
  marketCap?: number;
  fdv?: number;
  /** usd: both sides in USD as reported; base / quote: each side in token units. */
  liquidity?: { usd?: number; base?: number; quote?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: Partial<Record<"m5" | "h1" | "h6" | "h24", { buys?: number; sells?: number }>>;
  info?: { imageUrl?: string };
  pairCreatedAt?: number;
}

/** A token on a chain — what the token endpoint is asked about. */
export interface TokenRef {
  chainId: ChainId;
  address: string;
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal, headers: { Accept: "application/json" } });
  if (res.status === 429) throw new Error("DexScreener rate limit hit, slowing down");
  if (!res.ok) throw new Error(`DexScreener returned ${res.status}`);
  return (await res.json()) as T;
}

const sameAddress = (chainId: ChainId, a: string, b: string) =>
  isEvm(chainId) ? a.toLowerCase() === b.toLowerCase() : a === b;

/**
 * Liquidity backed by the quote side (SOL, USDC, WETH, BNB…): the real money a
 * seller can take out. DexScreener's figure counts both sides at market price,
 * so a pool of a token nobody trades — priced off itself — can report a billion
 * dollars while holding a dollar of WETH. Search for "pump" and the top result
 * was exactly that. In a healthy pool both sides are about equal, so twice the
 * quote side matches the reported figure; for a fake it collapses to pennies.
 */
export function backedLiquidity(p: DexPair): number {
  const reported = p.liquidity?.usd ?? 0;
  const quoteAmount = p.liquidity?.quote;
  const priceUsd = Number(p.priceUsd);
  const priceNative = Number(p.priceNative);
  if (!(quoteAmount != null && quoteAmount >= 0) || !(priceUsd > 0) || !(priceNative > 0)) return reported;
  const quoteUsd = priceUsd / priceNative; // what one quote token is worth
  return Math.min(reported, 2 * quoteAmount * quoteUsd);
}

/** Reported liquidity far above what backs it: the signature of a fake pool. */
export function suspectLiquidity(p: DexPair): boolean {
  const reported = p.liquidity?.usd ?? 0;
  return reported > 50_000 && backedLiquidity(p) * 10 < reported;
}

const liq = backedLiquidity;

/** The pair a token is best quoted from: the most liquid one where it is the base. */
export function bestPairFor(chainId: ChainId, address: string, pairs: DexPair[]): DexPair | null {
  let best: DexPair | null = null;
  for (const p of pairs) {
    if (p.chainId !== chainId || !p.baseToken || !sameAddress(chainId, p.baseToken.address, address)) continue;
    if (!best || liq(p) > liq(best)) best = p;
  }
  return best;
}

export function toQuote(key: string, p: DexPair, now = Date.now()): Quote {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    address: key,
    pairAddress: p.pairAddress,
    priceUsd: Number(p.priceUsd ?? 0) || 0,
    marketCap: p.marketCap ?? p.fdv ?? null,
    liquidityUsd: p.liquidity?.usd == null ? null : backedLiquidity(p),
    suspectLiquidity: suspectLiquidity(p),
    change: {
      m5: n(p.priceChange?.m5),
      h1: n(p.priceChange?.h1),
      h6: n(p.priceChange?.h6),
      h24: n(p.priceChange?.h24),
    },
    volume: { m5: n(p.volume?.m5), h1: n(p.volume?.h1), h6: n(p.volume?.h6), h24: n(p.volume?.h24) },
    txnsM5: { buys: n(p.txns?.m5?.buys), sells: n(p.txns?.m5?.sells) },
    txns: {
      m5: { buys: n(p.txns?.m5?.buys), sells: n(p.txns?.m5?.sells) },
      h1: { buys: n(p.txns?.h1?.buys), sells: n(p.txns?.h1?.sells) },
      h6: { buys: n(p.txns?.h6?.buys), sells: n(p.txns?.h6?.sells) },
      h24: { buys: n(p.txns?.h24?.buys), sells: n(p.txns?.h24?.sells) },
    },
    updatedAt: now,
  };
}

export function toWatchToken(p: DexPair): WatchToken {
  const chainId = isChain(p.chainId) ? p.chainId : "solana";
  return {
    key: tokenKey(chainId, p.baseToken.address),
    chainId,
    address: p.baseToken.address,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    imageUrl: p.info?.imageUrl ?? null,
  };
}

/** The best pair of every token that has one, keyed by token key. */
export async function fetchPairs(refs: TokenRef[], signal?: AbortSignal): Promise<Record<string, DexPair>> {
  const out: Record<string, DexPair> = {};
  // One request per chain (and per 30 tokens), all at once: a multichain
  // watchlist costs one round trip, not one per chain.
  const jobs: Promise<void>[] = [];
  for (const chainId of ALL_CHAINS) {
    const addresses = [...new Set(refs.filter((r) => r.chainId === chainId).map((r) => r.address))];
    for (let i = 0; i < addresses.length; i += BATCH) {
      const chunk = addresses.slice(i, i + BATCH);
      jobs.push(
        getJson<DexPair[]>(`/tokens/v1/${chainId}/${chunk.join(",")}`, signal).then((pairs) => {
          const list = Array.isArray(pairs) ? pairs : [];
          for (const a of chunk) {
            const best = bestPairFor(chainId, a, list);
            if (best) out[tokenKey(chainId, a)] = best;
          }
        }),
      );
    }
  }
  await Promise.all(jobs);
  return out;
}

/** Quotes for every token that has a pair, keyed by token key. */
export async function fetchQuotes(refs: TokenRef[], signal?: AbortSignal): Promise<Record<string, Quote>> {
  const now = Date.now();
  const pairs = await fetchPairs(refs, signal);
  const out: Record<string, Quote> = {};
  for (const [key, p] of Object.entries(pairs)) out[key] = toQuote(key, p, now);
  return out;
}

/** Wrapped SOL: its best pair (SOL/USDC) prices SOL itself. */
export const SOL_MINT = CHAINS.solana.native.address;

/** Wrapped BTC on Ethereum: its deepest pool prices BTC for the header. */
export const WBTC = { chainId: "ethereum" as const, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" };

// ── Reading what the user typed ───────────────────────────────────────────────

export type ParsedInput =
  | { kind: "address"; address: string; chainId: ChainId | null; isPool: boolean }
  | { kind: "query"; query: string };

/** GMGN's chain segments. */
const GMGN_CHAINS: Record<string, ChainId> = { sol: "solana", bsc: "bsc", eth: "ethereum" };

/** Explorers whose token pages name the chain by their host. */
const EXPLORERS: Record<string, ChainId> = {
  "solscan.io": "solana",
  "pump.fun": "solana",
  "etherscan.io": "ethereum",
  "bscscan.com": "bsc",
};

const ANY_ADDRESS = /0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function classify(address: string, chainId: ChainId | null, isPool = false): ParsedInput {
  if (EVM_POOL_ID.test(address)) return { kind: "address", address, chainId, isPool: true };
  if (EVM_ADDRESS.test(address)) return { kind: "address", address, chainId: chainId && isEvm(chainId) ? chainId : null, isPool };
  return { kind: "address", address, chainId: "solana", isPool };
}

/**
 * What the user pasted: an address (Solana or EVM, bare or inside a GMGN /
 * Axiom / DexScreener / explorer link, with the chain when the link names it)
 * or, failing that, words to search for.
 */
export function parseInput(input: string): ParsedInput {
  const text = input.trim();
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");
    const seg = url.pathname.split("/").filter(Boolean);
    if (host === "dexscreener.com" && isChain(seg[0]) && seg[1]) return classify(seg[1], seg[0], true);
    if (host === "gmgn.ai" && GMGN_CHAINS[seg[0]] && seg[2]) return classify(seg[2].replace(/^.*_/, ""), GMGN_CHAINS[seg[0]]);
    if (host === "axiom.trade" && seg[0] === "meme" && seg[1]) return classify(seg[1], "solana", true);
    if (EXPLORERS[host]) {
      const found = url.pathname.match(ANY_ADDRESS);
      if (found) return classify(found[found.length - 1], EXPLORERS[host]);
    }
  } catch {
    /* not a URL */
  }
  const found = text.match(ANY_ADDRESS);
  if (found) return classify(found[found.length - 1], null);
  return { kind: "query", query: text.replace(/^\$/, "") };
}

/** The address in pasted text, or null when it is a name to search for. */
export function extractAddress(input: string): string | null {
  const p = parseInput(input);
  return p.kind === "address" ? p.address : null;
}

/**
 * Turns an address into a token. With the chain known, asks that chain (as a
 * token, then as a pair). An EVM address with no chain is looked up on every
 * chain, preferring the ones the user follows.
 */
export async function resolveAddress(
  p: Extract<ParsedInput, { kind: "address" }>,
  preferred: ChainId[] = ALL_CHAINS,
  signal?: AbortSignal,
): Promise<WatchToken | null> {
  if (p.chainId && !p.isPool) {
    const pairs = await getJson<DexPair[]>(`/tokens/v1/${p.chainId}/${p.address}`, signal);
    const best = bestPairFor(p.chainId, p.address, Array.isArray(pairs) ? pairs : []);
    if (best) return toWatchToken(best);
  }
  if (p.chainId) {
    const byPair = await getJson<{ pairs?: DexPair[] | null }>(`/latest/dex/pairs/${p.chainId}/${p.address}`, signal);
    const pair = byPair.pairs?.find((x) => x.chainId === p.chainId);
    if (pair) return toWatchToken(pair);
    if (p.chainId === "solana") return null;
  }
  // An EVM address (or pool id) on an unknown chain: search finds it on any chain.
  const found = await getJson<{ pairs?: DexPair[] | null }>(`/latest/dex/search?q=${encodeURIComponent(p.address)}`, signal);
  const matches = (found.pairs ?? []).filter(
    (x) =>
      isChain(x.chainId) &&
      (x.pairAddress.toLowerCase() === p.address.toLowerCase() || x.baseToken.address.toLowerCase() === p.address.toLowerCase()),
  );
  const rank = (x: DexPair) => (preferred.includes(x.chainId as ChainId) ? 1e15 : 0) + liq(x);
  matches.sort((a, b) => rank(b) - rank(a));
  return matches[0] ? toWatchToken(matches[0]) : null;
}

/**
 * Searches by name or ticker on the given chains. Returns one entry per token
 * (its pair with the most backed liquidity), real money first, then volume —
 * copycats share a popular token's name but rarely its money, so the real one
 * tends to lead. The user always picks; nothing is added on a name alone.
 */
export async function searchTokens(query: string, chains: ChainId[], signal?: AbortSignal): Promise<TrendingItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const best = new Map<string, DexPair>();
  for (const p of await searchPairs(q, signal)) {
    if (!isChain(p.chainId) || !chains.includes(p.chainId) || !p.baseToken) continue;
    const key = tokenKey(p.chainId, p.baseToken.address);
    const prev = best.get(key);
    if (!prev || liq(p) > liq(prev)) best.set(key, p);
  }
  const now = Date.now();
  const score = (p: DexPair) => liq(p) + (p.volume?.h24 ?? 0) / 100;
  return [...best.entries()]
    .sort((a, b) => score(b[1]) - score(a[1]))
    .slice(0, SEARCH_RESULTS)
    .map(([key, p]) => ({ token: toWatchToken(p), quote: toQuote(key, p, now), boost: 0, pairCreatedAt: p.pairCreatedAt ?? null }));
}

/** DexScreener's search as it answers: up to 30 pairs, every chain. */
export async function searchPairs(query: string, signal?: AbortSignal): Promise<DexPair[]> {
  const found = await getJson<{ pairs?: DexPair[] | null }>(`/latest/dex/search?q=${encodeURIComponent(query.trim())}`, signal);
  return found.pairs ?? [];
}

/** Solana base58 check, re-exported for callers that only need it. */
export { SOLANA_ADDRESS };
