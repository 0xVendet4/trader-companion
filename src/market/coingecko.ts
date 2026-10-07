// CoinGecko's public API (no key, CORS open), for what DexScreener can't say
// about a major coin: which coins are the largest right now, and each one's
// own market cap, 24 h volume and rank (see majors.ts). It is sent CoinGecko
// ids only, nothing about the user.

import { EVM_ADDRESS, SOLANA_ADDRESS, type ChainId } from "./chains";
import type { TokenRef } from "./dexscreener";
import type { Coin } from "./majors";

const API = "https://api.coingecko.com/api/v3";

/** Market caps move slowly, and the keyless API allows a few calls a minute. */
export const COINGECKO_TTL_MS = 3 * 60_000;
/** The order of the largest coins moves slower still. */
export const TOP_TTL_MS = 60 * 60_000;
/** How deep the list is read, so that MAJOR_COUNT coins are left once the dollars and copies are out. */
const TOP_DEPTH = 100;

/** CoinGecko's ids are lower-case words and dashes; anything else is not sent anywhere. */
export const COINGECKO_ID = /^[a-z0-9-]{1,80}$/;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The coins of a /coins/markets answer that can be read; the rest is dropped. */
export function toCoins(body: unknown): Coin[] {
  if (!Array.isArray(body)) return [];
  const out: Coin[] = [];
  for (const r of body as Record<string, unknown>[]) {
    const id = text(r?.id, 80);
    const symbol = text(r?.symbol, 20);
    const name = text(r?.name, 60);
    if (!id || !COINGECKO_ID.test(id) || !symbol || !name) continue;
    out.push({
      id,
      symbol: symbol.toUpperCase(),
      name,
      rank: num(r.market_cap_rank),
      priceUsd: num(r.current_price),
      marketCap: num(r.market_cap),
      volume24h: num(r.total_volume),
    });
  }
  return out;
}

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  return res.json();
}

/** The largest coins by market cap, largest first. */
export async function fetchTop(signal?: AbortSignal): Promise<Coin[]> {
  return toCoins(await get(`/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${TOP_DEPTH}&page=1`, signal));
}

/** These coins' market data, by id; an id CoinGecko left out stays out. */
export async function fetchCoins(ids: string[], signal?: AbortSignal): Promise<Record<string, Coin>> {
  const valid = [...new Set(ids)].filter((id) => COINGECKO_ID.test(id));
  if (valid.length === 0) return {};
  const coins = toCoins(await get(`/coins/markets?vs_currency=usd&ids=${valid.join(",")}&per_page=250`, signal));
  return Object.fromEntries(coins.map((c) => [c.id, c]));
}

/** CoinGecko's names for the chains Candy reads. */
const PLATFORMS: Record<string, ChainId> = { ethereum: "ethereum", "binance-smart-chain": "bsc", solana: "solana" };

/** A coin's contracts on the chains Candy reads, from its CoinGecko record ("platforms"). */
export function toContracts(body: unknown): TokenRef[] {
  const platforms = (body as { platforms?: unknown } | null)?.platforms;
  if (!platforms || typeof platforms !== "object") return [];
  const out: TokenRef[] = [];
  for (const [platform, address] of Object.entries(platforms as Record<string, unknown>)) {
    const chainId = PLATFORMS[platform];
    if (!chainId || typeof address !== "string") continue;
    if (chainId === "solana" ? SOLANA_ADDRESS.test(address) : EVM_ADDRESS.test(address)) out.push({ chainId, address });
  }
  return out;
}

/** Where a coin is a token on the chains Candy reads (UNI on Ethereum…); none for a chain's own coin. */
export async function fetchContracts(id: string, signal?: AbortSignal): Promise<TokenRef[]> {
  if (!COINGECKO_ID.test(id)) return [];
  const flags = "localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false";
  return toContracts(await get(`/coins/${id}?${flags}`, signal));
}
