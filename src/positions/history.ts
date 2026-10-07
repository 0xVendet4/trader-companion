// A position's real entry, from the wallet's own transactions — read-only RPC
// calls (a token account's latest signatures, then each transaction). Pure
// parsing first; the small fetcher at the end goes through Bridge.rpc.
//
// A buy is a transaction where the trader's token amount went up and their SOL
// (or wrapped SOL, or USDC) went down; a sell, the other way round. A token
// that came in with nothing paid (a transfer, an airdrop) has no known cost.
// What a buy cost in SOL is valued at today's SOL price: the profit shown is
// the one in SOL, the way memecoin traders count it.

import { Bridge } from "../core/bridge";

export const WSOL = "So11111111111111111111111111111111111111112";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
/**
 * The newest transaction format the reader understands. Solana has version 1
 * transactions; asking for less makes the RPC refuse every one of them.
 * Mirrors rpc_params in src-tauri/src/lib.rs.
 */
export const TX_VERSION = 1;

/** Signatures read per token account: enough for a memecoin position. */
export const HISTORY_LIMIT = 40;

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: { uiAmount: number | null; uiAmountString?: string };
}

/** The parts of a jsonParsed getTransaction answer this reads. */
export interface ParsedTx {
  blockTime?: number | null;
  meta?: {
    err?: unknown;
    preBalances?: number[];
    postBalances?: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
  } | null;
  transaction?: { message?: { accountKeys?: ({ pubkey: string } | string)[] } };
}

/** What one transaction did to the trader, for one token. */
export interface TxDelta {
  t: number;
  /** Token amount before the transaction (UI units). */
  before: number;
  /** Change in the token amount. */
  token: number;
  /** Change in SOL (native and wrapped), token-account rent left out. */
  sol: number;
  /** Change in USDC. */
  usd: number;
}

const ui = (b: TokenBalance) => Number(b.uiTokenAmount?.uiAmountString ?? b.uiTokenAmount?.uiAmount ?? 0) || 0;

function ownedSum(list: TokenBalance[] | undefined, owner: string, mint: string): number {
  return (list ?? []).filter((b) => b.owner === owner && b.mint === mint).reduce((s, b) => s + ui(b), 0);
}

/** One transaction's effect on `owner` for `mint`; null when it failed or is unreadable. */
export function txDelta(tx: ParsedTx | null, owner: string, mint: string): TxDelta | null {
  const meta = tx?.meta;
  const keys = tx?.transaction?.message?.accountKeys;
  if (!tx || !meta || meta.err != null || !keys || !meta.preBalances || !meta.postBalances) return null;
  const pubkeys = keys.map((k) => (typeof k === "string" ? k : k.pubkey));
  const me = pubkeys.indexOf(owner);
  if (me < 0) return null;

  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];
  const before = ownedSum(pre, owner, mint);
  const token = ownedSum(post, owner, mint) - before;

  // The trader's lamports, plus rent: opening a token account parks ~0.002
  // SOL in it and closing one gives it back. That is no price paid.
  let lamports = (meta.postBalances[me] ?? 0) - (meta.preBalances[me] ?? 0);
  const ownAccounts = new Set([...pre, ...post].filter((b) => b.owner === owner).map((b) => b.accountIndex));
  for (const i of ownAccounts) {
    const was = meta.preBalances[i] ?? 0;
    const now = meta.postBalances[i] ?? 0;
    const wrapped = (pre.find((b) => b.accountIndex === i)?.mint ?? post.find((b) => b.accountIndex === i)?.mint) === WSOL;
    if (wrapped) continue; // wrapped SOL is counted below, as SOL
    if (was === 0 && now > 0) lamports += now;
    if (was > 0 && now === 0) lamports -= was;
  }
  const sol = lamports / 1e9 + (ownedSum(post, owner, WSOL) - ownedSum(pre, owner, WSOL));
  const usd = ownedSum(post, owner, USDC) - ownedSum(pre, owner, USDC);
  return { t: (tx.blockTime ?? 0) * 1000, before, token, sol, usd };
}

export interface HistoryEntry {
  /** Amount held at the end of the history. */
  amount: number;
  /** Part of it with no known cost (held before the history, or sent in). */
  unknown: number;
  /** What the rest cost, in SOL and in USD (USDC buys). */
  costSol: number;
  costUsd: number;
}

/** Below this, a change is dust. */
const EPS = 1e-9;

/**
 * Average cost of what is held, walking the trades oldest first. A sell or a
 * transfer out takes its share of the cost (and of the unknown part) away.
 */
export function entryFromHistory(deltas: TxDelta[]): HistoryEntry {
  const list = [...deltas].sort((a, b) => a.t - b.t);
  let amount = list[0]?.before ?? 0;
  let unknown = amount;
  let costSol = 0;
  let costUsd = 0;
  for (const d of list) {
    if (d.token > EPS) {
      const paidSol = d.sol < -EPS ? -d.sol : 0;
      const paidUsd = d.usd < -EPS ? -d.usd : 0;
      if (paidSol > 0 || paidUsd > 0) {
        costSol += paidSol;
        costUsd += paidUsd;
      } else {
        unknown += d.token;
      }
      amount += d.token;
    } else if (d.token < -EPS && amount > EPS) {
      const keep = Math.max(0, 1 + d.token / amount);
      costSol *= keep;
      costUsd *= keep;
      unknown *= keep;
      amount = Math.max(0, amount + d.token);
    }
  }
  return { amount, unknown: Math.min(unknown, amount), costSol, costUsd };
}

/**
 * The cost in USD of `amount` held now, from its history; null when the
 * history does not add up to it (older trades than the window, a missed
 * transaction) or knows too little. `estimate` prices the unknown part.
 */
export function historyCost(h: HistoryEntry, amount: number, solUsd: number, estimate: number): number | null {
  if (!(amount > 0) || !(solUsd > 0)) return null;
  if (Math.abs(h.amount - amount) / amount > 0.02) return null;
  if (h.unknown / amount > 0.5) return null;
  const share = amount / h.amount;
  return (h.costSol * solUsd + h.costUsd) * share + h.unknown * share * estimate;
}

// ── Fetching (read-only RPC) ──────────────────────────────────────────────────

const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Every trade of `owner` in `mint` seen through its token accounts, newest
 * HISTORY_LIMIT per account. Gentle with the public RPC: one call at a time.
 */
export async function fetchDeltas(owner: string, mint: string, accounts: string[]): Promise<TxDelta[]> {
  const seen = new Set<string>();
  const out: TxDelta[] = [];
  for (const account of accounts) {
    const sigs = await Bridge.rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [account, { limit: HISTORY_LIMIT }]);
    for (const s of sigs ?? []) {
      if (s.err != null || seen.has(s.signature)) continue;
      seen.add(s.signature);
      await pause(200);
      const tx = await Bridge.rpc<ParsedTx | null>("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: TX_VERSION }]);
      const d = txDelta(tx, owner, mint);
      if (d && (Math.abs(d.token) > EPS)) out.push(d);
    }
  }
  return out;
}
