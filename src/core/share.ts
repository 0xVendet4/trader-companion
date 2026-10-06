// Sharing a watchlist as a link: the tokens ride in the URL, so a friend opens
// the web preview with the same list. Only public addresses — nothing else
// from the settings ever goes into a link. Solana tokens are their bare mint;
// other chains are "chain:address" (bsc:0x…).

import type { WatchToken } from "./state";
import { MAX_WATCHLIST } from "./state";
import { EVM_ADDRESS, SOLANA_ADDRESS, isChain, isEvm } from "../market/chains";

/** Where shared links point: the public web preview. */
export const SHARE_BASE = "https://trader-companion-demo.vercel.app";

export function shareEntry(t: Pick<WatchToken, "chainId" | "address">): string {
  return t.chainId === "solana" ? t.address : `${t.chainId}:${t.address}`;
}

export function shareUrl(entries: string[], base = SHARE_BASE): string {
  return `${base.replace(/\/$/, "")}/?list=${entries.slice(0, MAX_WATCHLIST).join(",")}`;
}

function validEntry(part: string): boolean {
  if (SOLANA_ADDRESS.test(part)) return true;
  const [chain, address] = part.split(":");
  return isChain(chain) && isEvm(chain) && EVM_ADDRESS.test(address ?? "");
}

/** Entries from a shared link, a query string, or a pasted comma list. */
export function parseShared(input: string): string[] {
  let raw = input.trim();
  try {
    const url = new URL(raw, "https://x.invalid");
    const list = url.searchParams.get("list");
    if (list != null) raw = list;
  } catch {
    /* not a URL: treat it as a plain list */
  }
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    if (validEntry(part) && !out.includes(part)) out.push(part);
    if (out.length >= MAX_WATCHLIST) break;
  }
  return out;
}
