// Sharing a watchlist: its token addresses as a plain list, which a friend
// pastes into Import (Settings → Watchlist). No site in between, and only
// public addresses — nothing else from the settings is ever shared. Solana
// tokens are their bare mint; other chains are "chain:address" (bsc:0x…).
// Links from older versions (…?list=) still import.

import type { WatchToken } from "./state";
import { MAX_WATCHLIST } from "./state";
import { EVM_ADDRESS, SOLANA_ADDRESS, isChain, isEvm } from "../market/chains";


export function shareEntry(t: Pick<WatchToken, "chainId" | "address">): string {
  return t.chainId === "solana" ? t.address : `${t.chainId}:${t.address}`;
}

/** The list to copy: up to a full watchlist, comma-separated. */
export function shareText(entries: string[]): string {
  return entries.slice(0, MAX_WATCHLIST).join(", ");
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
