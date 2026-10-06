// The trader's recent trades, read from their wallet's own transactions when
// the wallet is added. Tracking only sees what happens from then on, so the
// Activity list would start empty; this fills it with the trades already done
// (buys, sells, closes and what each took), and round trips that opened and
// closed in that window go to the journal. Pure bookkeeping first; the small
// fetcher at the end goes through Bridge.rpc (two read-only calls).
//
// Values are in SOL at today's SOL price, like history.ts: the profit memecoin
// traders count is the one in SOL.

import { Bridge } from "../core/bridge";
import type { ActivityItem } from "../core/state";
import { TX_VERSION, USDC, WSOL, txDelta, type ParsedTx } from "./history";

/** Transactions read: the most the RPC proxies allow in one call. */
export const WALLET_HISTORY_LIMIT = 50;

/** Below this, a token change is dust. */
const EPS = 1e-9;
/** SOL or USDC moves smaller than this are fees, not a price paid. */
const MIN_SOL = 0.002;
const MIN_USD = 0.1;

/** One token bought with (or sold for) SOL or USDC, in one transaction. */
export interface Swap {
  /** The transaction's signature. */
  id: string;
  t: number;
  mint: string;
  /** Change in the token amount: up on a buy, down on a sell. */
  token: number;
  sol: number;
  usd: number;
}

/** The one token a transaction swapped for SOL / USDC, or back; null for anything else. */
export function txSwap(tx: ParsedTx | null, owner: string, id: string): Swap | null {
  const meta = tx?.meta;
  if (!tx || !meta || meta.err != null) return null;
  const mints = new Set(
    [...(meta.preTokenBalances ?? []), ...(meta.postTokenBalances ?? [])]
      .filter((b) => b.owner === owner && b.mint !== WSOL && b.mint !== USDC)
      .map((b) => b.mint),
  );
  const moved: Swap[] = [];
  for (const mint of mints) {
    const d = txDelta(tx, owner, mint);
    if (d && Math.abs(d.token) > EPS) moved.push({ id, t: d.t, mint, token: d.token, sol: d.sol, usd: d.usd });
  }
  // Token for token, or several at once: not a trade this can price.
  if (moved.length !== 1) return null;
  const s = moved[0];
  const paid = s.token > 0 && (s.sol < -MIN_SOL || s.usd < -MIN_USD);
  const got = s.token < 0 && (s.sol > MIN_SOL || s.usd > MIN_USD);
  return paid || got ? s : null;
}

export interface ClosedTrip {
  id: string;
  t: number;
  mint: string;
  symbol: string;
  pnlSol: number;
  pnlUsd: number;
}

/** What one sale took by itself (a close's Activity entry shows the whole position's). */
export interface SaleTake {
  id: string;
  t: number;
  usd: number;
}

/**
 * The swaps as Activity entries, oldest first, and the round trips that both
 * opened and closed among them. A token sold with no buy seen before it was
 * held before the window: its sales show, but what they took is unknown.
 */
export function tradesFromSwaps(
  swaps: Swap[],
  symbols: Record<string, string>,
  solUsd: number,
): { activity: ActivityItem[]; closed: ClosedTrip[]; taken: SaleTake[] } {
  interface Open {
    amount: number;
    costSol: number;
    costUsd: number;
    known: boolean;
    realizedSol: number;
    realizedUsd: number;
  }
  const open = new Map<string, Open>();
  const activity: ActivityItem[] = [];
  const closed: ClosedTrip[] = [];
  const taken: SaleTake[] = [];
  for (const s of [...swaps].sort((a, b) => a.t - b.t)) {
    const symbol = symbols[s.mint] ?? `${s.mint.slice(0, 4)}…`;
    let p = open.get(s.mint);
    if (s.token > 0) {
      const paidSol = Math.max(0, -s.sol);
      const paidUsd = Math.max(0, -s.usd);
      const fresh = !p || p.amount <= EPS;
      if (!p || fresh) {
        p = { amount: 0, costSol: 0, costUsd: 0, known: true, realizedSol: 0, realizedUsd: 0 };
        open.set(s.mint, p);
      }
      p.amount += s.token;
      p.costSol += paidSol;
      p.costUsd += paidUsd;
      activity.push({ t: s.t, mint: s.mint, symbol, side: fresh ? "opened" : "bought", usd: paidSol * solUsd + paidUsd, realizedUsd: 0, id: s.id, history: true });
      continue;
    }
    const sold = -s.token;
    const gotSol = Math.max(0, s.sol);
    const gotUsd = Math.max(0, s.usd);
    if (!p || p.amount <= EPS) {
      // Held before the window: no cost known.
      p = { amount: sold, costSol: 0, costUsd: 0, known: false, realizedSol: 0, realizedUsd: 0 };
      open.set(s.mint, p);
    } else if (sold > p.amount * 1.02) {
      // More sold than seen bought: part of it came before the window.
      p.known = false;
      p.amount = sold;
    }
    const before = p.amount;
    const share = Math.min(1, sold / before);
    const costSol = p.costSol * share;
    const costUsd = p.costUsd * share;
    p.realizedSol += gotSol - costSol;
    p.realizedUsd += gotUsd - costUsd;
    p.costSol -= costSol;
    p.costUsd -= costUsd;
    p.amount = Math.max(0, before - sold);
    const done = p.amount <= before * 1e-4;
    const sale = (gotSol - costSol) * solUsd + (gotUsd - costUsd);
    const took = done ? p.realizedSol * solUsd + p.realizedUsd : sale;
    if (p.known) taken.push({ id: s.id, t: s.t, usd: sale });
    activity.push({
      t: s.t,
      mint: s.mint,
      symbol,
      side: done ? "closed" : "sold",
      usd: gotSol * solUsd + gotUsd,
      realizedUsd: p.known ? took : 0,
      id: s.id,
      history: true,
      ...(p.known ? {} : { costUnknown: true }),
    });
    if (done) {
      if (p.known) {
        closed.push({
          id: s.id,
          t: s.t,
          mint: s.mint,
          symbol,
          pnlSol: p.realizedSol + (solUsd > 0 ? p.realizedUsd / solUsd : 0),
          pnlUsd: p.realizedSol * solUsd + p.realizedUsd,
        });
      }
      open.delete(s.mint);
    }
  }
  return { activity, closed, taken };
}

/** Left over after a sale, under this share of what was swapped: dust, not a holding. */
const DUST = 0.01;

/**
 * What the own wallet's swaps between two balance reads add to what the
 * balances show (`before` and `after`: its token amounts at the two reads).
 * - A token held at neither read but swapped in between was bought and sold
 *   in the gap, and the balances never see it: its round trips come back as
 *   Activity, closed trips and what each sale took, as for the history.
 * - A token the balances do see move gets the price it really traded at in
 *   the gap (when it was only bought, or only sold), not the market price at
 *   the read.
 */
export function gapTrades(
  swaps: Swap[],
  before: Record<string, number>,
  after: Record<string, number>,
  symbols: Record<string, string>,
  solUsd: number,
): { activity: ActivityItem[]; closed: ClosedTrip[]; taken: SaleTake[]; fills: Record<string, number> } {
  const byMint = new Map<string, Swap[]>();
  for (const s of swaps) {
    const list = byMint.get(s.mint) ?? [];
    list.push(s);
    byMint.set(s.mint, list);
  }
  const flips: Swap[] = [];
  const fills: Record<string, number> = {};
  for (const [mint, list] of byMint) {
    const dust = Math.max(...list.map((s) => Math.abs(s.token))) * DUST;
    if ((before[mint] ?? 0) <= dust && (after[mint] ?? 0) <= dust) {
      flips.push(...list);
      continue;
    }
    // Bought and sold in the same gap: no single price fits, the market's stays.
    if (list.some((s) => s.token > 0) && list.some((s) => s.token < 0)) continue;
    const tokens = list.reduce((sum, s) => sum + Math.abs(s.token), 0);
    const usd = list.reduce((sum, s) => sum + Math.abs(s.sol) * solUsd + Math.abs(s.usd), 0);
    if (tokens > 0 && usd > 0) fills[mint] = usd / tokens;
  }
  const { activity, closed, taken } = tradesFromSwaps(flips, symbols, solUsd);
  // Seen live, not read from the history.
  for (const a of activity) delete a.history;
  return { activity, closed, taken, fills };
}

/** Activity with the history merged in: no entry twice, oldest first, the newest `max` kept. */
export function mergeActivity(current: ActivityItem[], incoming: ActivityItem[], max: number): ActivityItem[] {
  const ids = new Set(current.filter((a) => a.id).map((a) => a.id));
  const merged = [...current, ...incoming.filter((a) => !a.id || !ids.has(a.id))];
  return merged.sort((a, b) => a.t - b.t).slice(-max);
}

// ── Fetching (read-only RPC) ──────────────────────────────────────────────────

const pause = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * One transaction, with one retry: the public RPC is shared and refuses
 * bursts. undefined: still refused after the retry (null is a transaction
 * the RPC doesn't have).
 */
async function readTx(signature: string): Promise<ParsedTx | null | undefined> {
  const params = [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: TX_VERSION }];
  try {
    return await Bridge.rpc<ParsedTx | null>("getTransaction", params);
  } catch {
    await pause(1500);
    return Bridge.rpc<ParsedTx | null>("getTransaction", params).catch(() => undefined);
  }
}

/**
 * The wallet's recent swaps, from its latest WALLET_HISTORY_LIMIT
 * transactions, and how many of them could not be read. One call at a time:
 * the public RPC is shared and refuses bursts. No pause between calls (a page
 * in the background has its timers slowed to a crawl): each call's own round
 * trip spaces them.
 */
export async function fetchSwaps(
  owner: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ swaps: Swap[]; failed: number }> {
  const sigs = await Bridge.rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [owner, { limit: WALLET_HISTORY_LIMIT }]);
  const list = (sigs ?? []).filter((x) => x.err == null);
  const swaps: Swap[] = [];
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    const sig = list[i].signature;
    const tx = await readTx(sig);
    if (tx === undefined) failed++;
    const swap = txSwap(tx ?? null, owner, sig);
    if (swap) swaps.push(swap);
    onProgress?.(i + 1, list.length);
  }
  return { swaps, failed };
}

/** Signatures looked at on each check of an own wallet: a minute of busy trading. */
const LIVE_LIMIT = 25;

/**
 * The own wallet's swaps confirmed from `since` to `until` (ms) and not in
 * `seen`, oldest first, read one call at a time. `upTo` is where the next
 * check starts: `until`, or the time of a transaction the RPC refused (read
 * again next time). Signatures read are added to `seen`.
 */
export async function fetchNewSwaps(
  owner: string,
  since: number,
  until: number,
  seen: Set<string>,
): Promise<{ swaps: Swap[]; upTo: number }> {
  const sigs = await Bridge.rpc<{ signature: string; err: unknown; blockTime?: number | null }[]>("getSignaturesForAddress", [
    owner,
    { limit: LIVE_LIMIT },
  ]);
  const fresh = (sigs ?? [])
    .filter((x) => x.err == null && x.blockTime != null && !seen.has(x.signature))
    .filter((x) => x.blockTime! * 1000 >= since && x.blockTime! * 1000 <= until)
    .reverse();
  const swaps: Swap[] = [];
  for (const x of fresh) {
    const tx = await readTx(x.signature);
    if (tx === undefined) return { swaps, upTo: x.blockTime! * 1000 };
    seen.add(x.signature);
    const swap = txSwap(tx, owner, x.signature);
    if (swap) swaps.push(swap);
  }
  return { swaps, upTo: until };
}
