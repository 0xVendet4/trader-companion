// Where a click on a token goes. Every host here must also be listed in
// ALLOWED_HOSTS in src-tauri/src/lib.rs, or Rust will refuse to open it.
// A terminal that does not list a token's chain falls back to DexScreener.

import type { Terminal, WatchToken } from "../core/state";
import { CHAINS, type ChainId } from "./chains";

type Linkable = Pick<WatchToken, "chainId" | "address" | "pairAddress">;

const dexscreener = (t: Linkable) => `https://dexscreener.com/${t.chainId}/${t.pairAddress}`;

/**
 * The developer's GMGN invite code. GMGN token links carry it as a prefix:
 * gmgn.ai/{chain}/token/{code}_{address}. Said in the settings.
 */
export const GMGN_REFERRAL = "KtvxEtPr";

/**
 * The developer's Axiom invite link. Axiom applies an invite when an account
 * is made through it (token pages take none), so the settings offer it next
 * to the Axiom choice.
 */
export const AXIOM_REFERRAL_URL = "https://axiom.trade/@vendett4";

/**
 * The developer's Based Bot referral code. Its referral route takes a token
 * page after it: basedbot.app/r/{code}/token/{chain}/{address} keeps the code
 * and opens the token, as GMGN's prefix does.
 */
export const BASEDBOT_REFERRAL = "GuyFawk3s";

export const TERMINALS: Record<Terminal, { label: string; url: (t: Linkable) => string }> = {
  gmgn: {
    label: "GMGN",
    url: (t) => {
      const slug = CHAINS[t.chainId]?.gmgn;
      return slug ? `https://gmgn.ai/${slug}/token/${GMGN_REFERRAL}_${t.address}` : dexscreener(t);
    },
  },
  axiom: {
    label: "Axiom",
    // Axiom token pages are keyed by the pair (pool) address, not the mint.
    url: (t) => (CHAINS[t.chainId]?.axiom ? `https://axiom.trade/meme/${t.pairAddress}` : dexscreener(t)),
  },
  basedbot: {
    label: "Based Bot",
    url: (t) => {
      const slug = CHAINS[t.chainId]?.basedbot;
      return slug ? `https://basedbot.app/r/${BASEDBOT_REFERRAL}/token/${slug}/${t.address}` : dexscreener(t);
    },
  },
  dexscreener: {
    label: "DexScreener",
    url: dexscreener,
  },
};

export function tokenUrl(terminal: Terminal, token: Linkable): string {
  return (TERMINALS[terminal] ?? TERMINALS.gmgn).url(token);
}

/** The terminal a token actually opens on (DexScreener when the chosen one lacks its chain). */
export function terminalLabel(terminal: Terminal, token: Linkable): string {
  const url = tokenUrl(terminal, token);
  return url.startsWith("https://dexscreener.com/") ? "DexScreener" : (TERMINALS[terminal] ?? TERMINALS.gmgn).label;
}

/** Each chain's explorer, for a wallet's address page. Every host is in ALLOWED_HOSTS. */
const EXPLORERS: Partial<Record<ChainId, { label: string; url: (address: string) => string }>> = {
  solana: { label: "Solscan", url: (a) => `https://solscan.io/account/${a}` },
  ethereum: { label: "Etherscan", url: (a) => `https://etherscan.io/address/${a}` },
  bsc: { label: "BscScan", url: (a) => `https://bscscan.com/address/${a}` },
  base: { label: "BaseScan", url: (a) => `https://basescan.org/address/${a}` },
};

/** A wallet's page on its chain's explorer; null for a chain without one here. */
export function explorerLink(chainId: ChainId, address: string): { label: string; url: string } | null {
  const e = EXPLORERS[chainId];
  return e ? { label: e.label, url: e.url(address) } : null;
}

/**
 * Where a trader gets a free Solana RPC key, offered next to the RPC setting
 * and when the public RPC is busy. Both hosts are in ALLOWED_HOSTS.
 */
export const RPC_KEY_SITES: { label: string; url: string }[] = [
  { label: "Helius", url: "https://dashboard.helius.dev/" },
  { label: "Alchemy", url: "https://dashboard.alchemy.com/" },
];
