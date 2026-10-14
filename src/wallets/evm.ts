// EVM wallets (Ethereum, BSC, Base) by public address — read-only, never a key.
//
// One 0x address is followed on the three chains at once. Each chain's public
// RPC is asked for the native balance (eth_getBalance), the balance of every
// token the app watches on that chain (eth_call balanceOf) and, when a
// position was held before tracking or a followed wallet is first read, the
// Transfer logs of those tokens over the last LOG_SPAN blocks (eth_getLogs).
// Four read-only calls, their params rebuilt in Rust (evm_rpc in lib.rs; the
// dev server's /api/evm/<chain> proxy in a browser). Pure parsing first; the
// small fetchers at the end go through Bridge.evmRpc, one call at a time.

import { Bridge } from "../core/bridge";
import type { Sample } from "../core/state";
import { EVM_ADDRESS, tokenKey, type EvmChain } from "../market/chains";
import type { TxDelta } from "../positions/history";

/** Transfer(address indexed from, address indexed to, uint256 value). */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** balanceOf(address) and decimals(), the two calls made to a token contract. */
export const BALANCE_OF_SELECTOR = "0x70a08231";
export const DECIMALS_SELECTOR = "0x313ce567";
/** How far back the Transfer logs go, in blocks (mirrors MAX_LOG_SPAN in lib.rs). */
export const LOG_SPAN = 2000;
/** Most tokens, and every one whose decimals() can't be read. */
export const DEFAULT_DECIMALS = 18;
/** About how long a block takes, per chain, to date a log by its block number. */
export const BLOCK_SECONDS: Record<EvmChain, number> = { ethereum: 12, bsc: 0.75, base: 2 };
/** What each chain pays gas in. */
export const NATIVE_SYMBOL: Record<EvmChain, "ETH" | "BNB"> = { ethereum: "ETH", bsc: "BNB", base: "ETH" };
/** A price sample this far from a transfer's moment still prices it. */
export const PRICE_TOLERANCE_MS = 15 * 60_000;

/** An address as a 32-byte topic or call argument: 24 zero bytes, then the address, lower case. */
export function padAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.toLowerCase().replace(/^0x/, "")}`;
}

/** The calldata of balanceOf(wallet). */
export function balanceOfCalldata(wallet: string): string {
  return `${BALANCE_OF_SELECTOR}${padAddress(wallet).slice(2)}`;
}

/** A 0x quantity (a balance, a block number) as a number, scaled by `decimals`; 0 for anything unreadable. */
export function hexToAmount(hex: unknown, decimals = DEFAULT_DECIMALS): number {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex)) return 0;
  if (hex.length <= 2) return 0;
  const raw = BigInt(hex);
  const d = Number.isFinite(decimals) ? Math.max(0, Math.min(77, Math.floor(decimals))) : DEFAULT_DECIMALS;
  const unit = 10n ** BigInt(d);
  const whole = raw / unit;
  const frac = raw % unit;
  // Up to 15 digits of the fraction, which is all a number keeps.
  const fracDigits = d === 0 ? "" : frac.toString().padStart(d, "0").slice(0, 15);
  return Number(`${whole}${fracDigits ? `.${fracDigits}` : ""}`);
}

/** A block number or a small integer from 0x hex. */
export function hexToInt(hex: unknown): number {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(hex)) return 0;
  return Number(BigInt(hex));
}

export function toHex(n: number): string {
  return `0x${Math.max(0, Math.floor(n)).toString(16)}`;
}

/** The last `span` blocks up to `latest`, as the RPC wants them. */
export function blockRange(latest: number, span = LOG_SPAN): { fromBlock: string; toBlock: string } {
  const to = Math.max(0, Math.floor(latest));
  return { fromBlock: toHex(Math.max(0, to - span + 1)), toBlock: toHex(to) };
}

/** The decimals() answer, or the default when the contract has none to give. */
export function parseDecimals(hex: unknown): number {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(hex)) return DEFAULT_DECIMALS;
  const n = Number(BigInt(hex));
  return n >= 0 && n <= 36 ? n : DEFAULT_DECIMALS;
}

/** One Transfer of a watched token, as a log says it. */
export interface Transfer {
  /** The token contract, lower case. */
  token: string;
  from: string;
  to: string;
  /** In the token's units. */
  amount: number;
  block: number;
  /** The log's place in its block, to order two in the same block. */
  index: number;
  txHash: string;
}

/** The parts of an eth_getLogs entry this reads. */
interface RawLog {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  logIndex?: string;
  transactionHash?: string;
  removed?: boolean;
}

/** The Transfer logs in an eth_getLogs answer; anything that is not one is skipped. */
export function parseTransferLogs(logs: unknown, decimals: number): Transfer[] {
  if (!Array.isArray(logs)) return [];
  const out: Transfer[] = [];
  for (const raw of logs as RawLog[]) {
    if (!raw || typeof raw !== "object" || raw.removed) continue;
    const topics = raw.topics;
    if (!Array.isArray(topics) || topics.length < 3 || topics[0] !== TRANSFER_TOPIC) continue;
    if (typeof raw.address !== "string" || !EVM_ADDRESS.test(raw.address)) continue;
    const from = topicAddress(topics[1]);
    const to = topicAddress(topics[2]);
    if (!from || !to) continue;
    const amount = hexToAmount(raw.data, decimals);
    out.push({
      token: raw.address.toLowerCase(),
      from,
      to,
      amount,
      block: hexToInt(raw.blockNumber),
      index: hexToInt(raw.logIndex),
      txHash: typeof raw.transactionHash === "string" ? raw.transactionHash : "",
    });
  }
  return out.sort((a, b) => a.block - b.block || a.index - b.index);
}

function topicAddress(topic: unknown): string | null {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40).toLowerCase()}`;
}

/** About when a block was mined, from how many blocks ago it was. */
export function blockTime(block: number, latest: number, now: number, secondsPerBlock: number): number {
  return now - Math.max(0, latest - block) * secondsPerBlock * 1000;
}

/** The price sample nearest to `t`, within the tolerance; null when the history has none there. */
export function priceNear(samples: Sample[] | undefined, t: number, tolerance = PRICE_TOLERANCE_MS): number | null {
  let best: Sample | null = null;
  for (const s of samples ?? []) {
    if (Math.abs(s.t - t) > tolerance) continue;
    if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  }
  return best && best.price > 0 ? best.price : null;
}

/**
 * The wallet's transfers of one token as trades, for entryFromHistory
 * (positions/history.ts): a transfer in is a buy at the token's price at that
 * moment (from the price history the app keeps for the alerts; unknown when
 * it has no sample near enough), a transfer out a sell. What was already
 * held when the window starts (what is held now, less what came in, plus
 * what went out) has no known cost.
 */
export function transfersToDeltas(
  transfers: Transfer[],
  wallet: string,
  heldNow: number,
  latest: number,
  now: number,
  secondsPerBlock: number,
  priceAt: (t: number) => number | null,
): TxDelta[] {
  const me = wallet.toLowerCase();
  const list = [...transfers].filter((x) => x.from === me || x.to === me).sort((a, b) => a.block - b.block || a.index - b.index);
  let start = heldNow;
  for (const x of list) start += x.to === me ? -x.amount : x.amount;
  let before = Math.max(0, start);
  const out: TxDelta[] = [];
  for (const x of list) {
    const t = blockTime(x.block, latest, now, secondsPerBlock);
    const incoming = x.to === me;
    const price = incoming ? priceAt(t) : null;
    out.push({ t, before, token: incoming ? x.amount : -x.amount, sol: 0, usd: incoming && price ? -x.amount * price : 0 });
    before = Math.max(0, before + (incoming ? x.amount : -x.amount));
  }
  return out;
}

/** A followed wallet's newest transfer among the watched tokens, as its last move. */
export function lastTransfer(
  transfers: Transfer[],
  wallet: string,
  symbols: Record<string, string>,
  holdings: Record<string, number>,
  chain: EvmChain,
  latest: number,
  now: number,
): { side: "bought" | "sold" | "sold all"; symbol: string; t: number } | null {
  const me = wallet.toLowerCase();
  const mine = transfers.filter((x) => (x.from === me || x.to === me) && x.amount > 0);
  if (mine.length === 0) return null;
  const last = mine.reduce((a, b) => (b.block > a.block || (b.block === a.block && b.index > a.index) ? b : a));
  const key = tokenKey(chain, last.token);
  const symbol = symbols[key] ?? `${last.token.slice(0, 6)}…`;
  const t = blockTime(last.block, latest, now, BLOCK_SECONDS[chain]);
  if (last.to === me) return { side: "bought", symbol, t };
  return { side: (holdings[key] ?? 0) > 0 ? "sold" : "sold all", symbol, t };
}

// ── Fetching (read-only RPC) ──────────────────────────────────────────────────

/** A token to read the balance of, with its decimals. */
export interface TokenRef {
  address: string;
  decimals: number;
}

/**
 * The wallet's native coin and its balance of each token, on one chain.
 * Holdings are keyed by token key (chain:address); zero balances are left out.
 */
export async function readEvmWallet(wallet: string, chain: EvmChain, tokens: TokenRef[]): Promise<{ native: number; holdings: Record<string, number> }> {
  const native = hexToAmount(await Bridge.evmRpc<string>(chain, "eth_getBalance", [wallet]), 18);
  const holdings: Record<string, number> = {};
  for (const tok of tokens) {
    const hex = await Bridge.evmRpc<string>(chain, "eth_call", [{ to: tok.address, data: balanceOfCalldata(wallet) }]);
    const amount = hexToAmount(hex, tok.decimals);
    if (amount > 0) holdings[tokenKey(chain, tok.address)] = amount;
  }
  return { native, holdings };
}

/** A token's decimals(), read once; the default when the contract has none. */
export async function readDecimals(chain: EvmChain, token: string): Promise<number> {
  try {
    return parseDecimals(await Bridge.evmRpc<string>(chain, "eth_call", [{ to: token, data: DECIMALS_SELECTOR }]));
  } catch {
    return DEFAULT_DECIMALS;
  }
}

/** The chain's latest block number. */
export async function latestBlock(chain: EvmChain): Promise<number> {
  return hexToInt(await Bridge.evmRpc<string>(chain, "eth_blockNumber", []));
}

/**
 * The wallet's transfers of one token over the last LOG_SPAN blocks up to
 * `latest`: those it sent, then those it received (two calls: a log filter
 * matches one topic position at a time), one call at a time.
 */
export async function fetchTransfers(chain: EvmChain, wallet: string, token: string, decimals: number, latest: number): Promise<Transfer[]> {
  const range = blockRange(latest);
  const me = padAddress(wallet);
  const out: Transfer[] = [];
  for (const topics of [
    [TRANSFER_TOPIC, me, null],
    [TRANSFER_TOPIC, null, me],
  ]) {
    const logs = await Bridge.evmRpc<unknown>(chain, "eth_getLogs", [{ address: token, ...range, topics }]);
    out.push(...parseTransferLogs(logs, decimals));
  }
  return out.sort((a, b) => a.block - b.block || a.index - b.index);
}
