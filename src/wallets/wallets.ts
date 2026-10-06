// Wallet tracking by public address — read-only, never a key.
//
// Balances come from Solana's public RPC (through Rust in the app, through a
// tiny proxy on the website: the public RPC refuses calls made straight from
// a web page). A "buy" or "sell" is a balance that went up or down between
// two checks; that needs no transaction parsing, so no paid data provider.

import { Bridge } from "../core/bridge";

const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022 (newer pump.fun tokens)
];

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isAddress(s: string): boolean {
  return ADDRESS_RE.test(s.trim());
}

interface ParsedAccount {
  pubkey: string;
  account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } };
}

/** SOL, every non-zero token balance by mint, and the token accounts holding them. */
export async function readWallet(
  address: string,
): Promise<{ sol: number; holdings: Record<string, number>; accounts: Record<string, string[]> }> {
  const balance = await Bridge.rpc<{ value: number }>("getBalance", [address]);
  const holdings: Record<string, number> = {};
  const accounts: Record<string, string[]> = {};
  for (const programId of TOKEN_PROGRAMS) {
    const res = await Bridge.rpc<{ value: ParsedAccount[] }>("getTokenAccountsByOwner", [
      address,
      { programId },
      { encoding: "jsonParsed" },
    ]);
    for (const acc of res.value ?? []) {
      const info = acc.account?.data?.parsed?.info;
      const amount = info?.tokenAmount?.uiAmount ?? 0;
      if (info && amount > 0) {
        holdings[info.mint] = (holdings[info.mint] ?? 0) + amount;
        if (typeof acc.pubkey === "string") (accounts[info.mint] ??= []).push(acc.pubkey);
      }
    }
  }
  return { sol: (balance.value ?? 0) / 1e9, holdings, accounts };
}

export interface HoldingChange {
  mint: string;
  from: number;
  to: number;
}

/**
 * What changed between two checks. Moves smaller than `threshold` (a share of
 * the position) are noise — fees, rounding, rebasing — and are ignored.
 */
export function diffHoldings(
  prev: Record<string, number>,
  next: Record<string, number>,
  threshold = 0.05,
): { bought: HoldingChange[]; sold: HoldingChange[] } {
  const bought: HoldingChange[] = [];
  const sold: HoldingChange[] = [];
  for (const mint of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const from = prev[mint] ?? 0;
    const to = next[mint] ?? 0;
    if (to > from && (from === 0 || (to - from) / from >= threshold)) bought.push({ mint, from, to });
    if (to < from && (to === 0 || (from - to) / from >= threshold)) sold.push({ mint, from, to });
  }
  return { bought, sold };
}
