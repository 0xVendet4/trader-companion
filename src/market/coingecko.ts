// CoinGecko's public price API (no key, CORS open), for what DexScreener can't
// say about a major coin: its own market cap and 24 h volume (see majors.ts).
// It is sent the CoinGecko ids of the majors on the watchlist, nothing else.

import type { MajorMarket } from "./majors";

const API = "https://api.coingecko.com/api/v3/simple/price";

/** Market caps move slowly, and the keyless API allows a few calls a minute. */
export const COINGECKO_TTL_MS = 3 * 60_000;

/** The subset of /simple/price this app reads, by CoinGecko id. */
export type SimplePrice = Record<string, { usd_market_cap?: number | null; usd_24h_vol?: number | null } | undefined>;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/** Each id's market cap and 24 h volume; an id CoinGecko left out stays out. */
export function toMarkets(ids: string[], body: SimplePrice): Record<string, MajorMarket> {
  const out: Record<string, MajorMarket> = {};
  for (const id of ids) {
    const r = body[id];
    if (r) out[id] = { marketCap: num(r.usd_market_cap), volume24h: num(r.usd_24h_vol) };
  }
  return out;
}

export async function fetchMarkets(ids: string[], signal?: AbortSignal): Promise<Record<string, MajorMarket>> {
  if (ids.length === 0) return {};
  const url = `${API}?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);
  return toMarkets(ids, (await res.json()) as SimplePrice);
}
