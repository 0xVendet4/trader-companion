// Positions in the trader's own wallets, with no input but the wallet address.
// Pure: the companion hands in balances and prices, this hands back the book.
//
// The chain is never asked for a trade history (only balances are read, see
// src/wallets). A position's cost comes from what the balances do between two
// checks: an amount that grows was bought at the price of that moment, one
// that shrinks was sold at it. What a wallet already held when it was marked
// as the trader's starts at the price of that moment ("since tracking"); the
// trader can type the real entry over it. Transfers between their own wallets
// cancel out.

import { formatPct, formatPrice, formatUsd } from "../core/format";
import type { ActivityItem, Position, PositionAlerts, PositionBook } from "../core/state";

export interface WalletRead {
  address: string;
  /** Mint → amount, UI units. */
  holdings: Record<string, number>;
}

export interface PriceInfo {
  price: number;
  symbol: string;
}

export interface BookChange {
  mint: string;
  symbol: string;
  /** "tracked": already held when tracking began; "opened": a first buy seen. */
  side: "tracked" | "opened" | "bought" | "sold" | "closed";
  /** USD value of the amount that moved. */
  usd: number;
  /** Profit or loss taken by a sell, USD. */
  realizedUsd: number;
  /** On "closed": everything the position took, partial sells included. */
  totalRealizedUsd?: number;
  /** On "closed": its numbers started when tracking began. */
  fromTracking?: boolean;
}

/** A new holding worth less than this is dust or an airdropped spam token. */
const MIN_OPEN_USD = 1;
/** Moves smaller than this share of the position are fees or rounding. */
const NOISE = 0.001;

const total = (p: Position) => Object.values(p.amounts).reduce((s, a) => s + a, 0);

export const EMPTY_BOOK: PositionBook = { wallets: [], positions: {}, day: "", realizedToday: 0, activity: [] };
/** Activity entries kept. */
export const MAX_ACTIVITY = 60;

function clone(book: PositionBook): PositionBook {
  const positions: Record<string, Position> = {};
  for (const [m, p] of Object.entries(book.positions)) positions[m] = { ...p, amounts: { ...p.amounts }, alerted: [...p.alerted] };
  return { ...book, wallets: [...book.wallets], positions, activity: [...book.activity] };
}

/**
 * Applies a round of balance reads. `mine` is the current list of own wallets
 * (others drop out of the book); `reads` are the wallets read successfully
 * this round — a wallet that failed keeps its last amounts.
 */
export function updateBook(
  prev: PositionBook,
  mine: string[],
  reads: WalletRead[],
  prices: Record<string, PriceInfo>,
  now: number,
  day: string,
): { book: PositionBook; changes: BookChange[] } {
  const book = clone(prev);
  const changes: BookChange[] = [];
  if (book.day !== day) {
    book.day = day;
    book.realizedToday = 0;
  }

  // Wallets no longer marked as the trader's: their share leaves, unrealized.
  const gone = book.wallets.filter((w) => !mine.includes(w));
  if (gone.length) {
    for (const [mint, p] of Object.entries(book.positions)) {
      const before = total(p);
      for (const w of gone) delete p.amounts[w];
      const after = total(p);
      if (after <= 0) delete book.positions[mint];
      else if (after < before) p.costUsd *= after / before;
    }
    book.wallets = book.wallets.filter((w) => mine.includes(w));
  }

  // Per mint: what wallets already counted moved (netted, so a transfer
  // between own wallets is no trade), and what newly counted wallets bring.
  const delta: Record<string, number> = {};
  const baseline: Record<string, number> = {};
  const nextAmounts: Record<string, Record<string, number>> = {};
  for (const r of reads.filter((x) => mine.includes(x.address))) {
    const isNew = !book.wallets.includes(r.address);
    const mints = new Set(Object.keys(r.holdings));
    for (const [mint, p] of Object.entries(book.positions)) if (p.amounts[r.address] != null) mints.add(mint);
    for (const mint of mints) {
      const old = book.positions[mint]?.amounts[r.address] ?? 0;
      const neu = r.holdings[mint] ?? 0;
      if (isNew) baseline[mint] = (baseline[mint] ?? 0) + neu;
      else delta[mint] = (delta[mint] ?? 0) + (neu - old);
      (nextAmounts[mint] ??= {})[r.address] = neu;
    }
    if (isNew) book.wallets.push(r.address);
  }

  for (const mint of Object.keys(nextAmounts)) {
    const info = prices[mint];
    const price = info && Number.isFinite(info.price) && info.price > 0 ? info.price : null;
    let p = book.positions[mint];
    const held = p ? total(p) : 0;
    const b = baseline[mint] ?? 0;
    const d = delta[mint] ?? 0;
    const after = held + b + d;

    if (!p) {
      // Unpriced, or worth nothing: not a position.
      if (price == null || after * price < MIN_OPEN_USD) continue;
      p = { mint, symbol: info.symbol, amounts: {}, costUsd: 0, realizedUsd: 0, openedAt: now, fromTracking: b > 0, alerted: [] };
      book.positions[mint] = p;
      changes.push({ mint, symbol: p.symbol, side: b > 0 && d <= 0 ? "tracked" : "opened", usd: after * price, realizedUsd: 0 });
    } else if (info?.symbol) {
      p.symbol = info.symbol;
    }

    for (const [w, a] of Object.entries(nextAmounts[mint])) {
      if (a > 0) p.amounts[w] = a;
      else delete p.amounts[w];
    }

    if (price != null) {
      if (b > 0) {
        p.costUsd += b * price;
        p.fromTracking = true;
      }
      const noise = Math.max(held, after) * NOISE;
      if (d > noise) {
        p.costUsd += d * price;
        p.alerted = [];
        if (held > 0) changes.push({ mint, symbol: p.symbol, side: "bought", usd: d * price, realizedUsd: 0 });
      } else if (d < -noise && held > 0) {
        const sold = Math.min(held, -d);
        const removed = p.costUsd * (sold / held);
        const realized = sold * price - removed;
        p.costUsd -= removed;
        p.realizedUsd += realized;
        book.realizedToday += realized;
        const closed = total(p) <= 0;
        changes.push({
          mint,
          symbol: p.symbol,
          side: closed ? "closed" : "sold",
          usd: sold * price,
          realizedUsd: realized,
          ...(closed ? { totalRealizedUsd: p.realizedUsd, fromTracking: p.fromTracking } : {}),
        });
      }
    }

    if (total(p) <= 0) delete book.positions[mint];
  }
  // The activity log: every change, as seen, the newest kept.
  for (const c of changes) {
    book.activity.push({
      t: now,
      mint: c.mint,
      symbol: c.symbol,
      side: c.side,
      usd: c.usd,
      realizedUsd: c.side === "closed" ? (c.totalRealizedUsd ?? c.realizedUsd) : c.realizedUsd,
    });
  }
  if (book.activity.length > MAX_ACTIVITY) book.activity.splice(0, book.activity.length - MAX_ACTIVITY);
  return { book, changes };
}

/** One wallet sale as the discipline log counts it, in the journal's unit. */
export interface WalletTrade {
  pnl: number;
  partial: boolean;
  /** On a close: what the whole position took. */
  tradePnl?: number;
  /** On a close: its journal line. */
  note?: string;
}

/**
 * The day's log entries for wallet sales: a part sold counts its profit; a
 * close counts its last sale's profit, as one trade judged by what the whole
 * position took (the parts sold before are already in). Null when the unit is
 * SOL and SOL has no price yet: try again after the next poll.
 */
export function walletTrades(changes: BookChange[], unit: "SOL" | "USD", solUsd: number | null): WalletTrade[] | null {
  const sales = changes.filter((c) => c.side === "sold" || (c.side === "closed" && c.totalRealizedUsd != null));
  if (sales.length === 0) return [];
  if (unit === "SOL" && !(solUsd && solUsd > 0)) return null;
  const conv = (usd: number) => Math.round((unit === "SOL" ? usd / solUsd! : usd) * 1e4) / 1e4;
  return sales.map((c) => {
    if (c.side === "sold") return { pnl: conv(c.realizedUsd), partial: true };
    const total = c.totalRealizedUsd!;
    const since = c.fromTracking ? ", since tracking" : "";
    return { pnl: conv(c.realizedUsd), partial: false, tradePnl: conv(total), note: `Auto: ${c.symbol} closed (${formatSignedUsd(total)}${since})` };
  });
}

/**
 * The wallet's history was read for a position. `costUsd` is what it found
 * (see history.ts), or null when the history did not settle it: the estimate
 * stays, and it is not read again.
 */
export function applyHistory(book: PositionBook, mint: string, costUsd: number | null): PositionBook {
  if (!book.positions[mint]) return book;
  const next = clone(book);
  const p = next.positions[mint];
  p.historyChecked = true;
  if (costUsd != null && costUsd > 0) {
    p.costUsd = costUsd;
    p.fromTracking = false;
    p.fromHistory = true;
    p.alerted = [];
  }
  return next;
}

/** Positions whose entry is still the price when tracking began. */
export function needsHistory(book: PositionBook): Position[] {
  return Object.values(book.positions).filter((p) => p.fromTracking && !p.historyChecked);
}

/** The amount a position holds, across the trader's wallets. */
export function heldAmount(p: Position): number {
  return total(p);
}

/** The trader typed their real entry price: the cost follows it. */
export function setEntry(book: PositionBook, mint: string, entryPrice: number): PositionBook {
  const p = book.positions[mint];
  if (!p || !(entryPrice > 0)) return book;
  const next = clone(book);
  const q = next.positions[mint];
  q.costUsd = total(q) * entryPrice;
  q.fromTracking = false;
  q.fromHistory = false;
  q.historyChecked = true;
  q.alerted = [];
  return next;
}

export interface PositionStats {
  amount: number;
  valueUsd: number;
  costUsd: number;
  /** Average entry price. */
  entry: number;
  pnlUsd: number;
  pnlPct: number | null;
  /** Value over cost: 2 is a 2x. */
  multiple: number | null;
}

export function positionStats(p: Position, price: number): PositionStats {
  const amount = total(p);
  const valueUsd = amount * price;
  const pnlUsd = valueUsd - p.costUsd;
  return {
    amount,
    valueUsd,
    costUsd: p.costUsd,
    entry: amount > 0 ? p.costUsd / amount : 0,
    pnlUsd,
    pnlPct: p.costUsd > 0 ? (pnlUsd / p.costUsd) * 100 : null,
    multiple: p.costUsd > 0 ? valueUsd / p.costUsd : null,
  };
}

/** Where a position's numbers start from, in words. */
export function sinceWords(p: Position): string {
  return p.fromTracking ? "since tracking began" : "from your entry";
}

/** Where a position's entry comes from, for a tooltip. */
export function entrySource(p: Position): string {
  if (p.fromTracking) return "Price when tracking began (held before): click to type your real entry";
  if (p.fromHistory) return "From your wallet's transactions (paid in SOL, valued at today's SOL price)";
  return "Price when the buy showed up in your balance, or the one you typed";
}

export interface LevelHit {
  key: string;
  title: string;
  detail: string;
  tone: "up" | "down";
}

/**
 * Alert levels crossed since last time, at most one up and one down: the
 * furthest one, with the nearer ones marked as passed so they never fire
 * late. Returns the hits and the position's new `alerted` list.
 */
export function crossedLevels(p: Position, price: number, levels: PositionAlerts): { hits: LevelHit[]; alerted: string[] } {
  const s = positionStats(p, price);
  const alerted = [...p.alerted];
  const hits: LevelHit[] = [];
  if (!levels.enabled || s.multiple == null || s.pnlPct == null) return { hits, alerted };
  const detail = `Value ${formatUsd(s.valueUsd)} · avg entry ${formatPrice(s.entry)} · now ${formatPrice(price)}`;

  const ups = [...levels.ups].sort((a, b) => a - b).filter((m) => s.multiple! >= m);
  const newUp = ups.filter((m) => !alerted.includes(`x${m}`));
  if (newUp.length) {
    const top = newUp[newUp.length - 1];
    for (const m of ups) if (!alerted.includes(`x${m}`)) alerted.push(`x${m}`);
    hits.push({ key: `x${top}`, title: `${p.symbol} ${formatMultiple(top)} ${sinceWords(p)}`, detail, tone: "up" });
  }

  const downs = [...levels.downs].sort((a, b) => b - a).filter((d) => s.pnlPct! <= d);
  const newDown = downs.filter((d) => !alerted.includes(String(d)));
  if (newDown.length) {
    for (const d of downs) if (!alerted.includes(String(d))) alerted.push(String(d));
    hits.push({ key: String(newDown[newDown.length - 1]), title: `${p.symbol} ${formatPct(s.pnlPct)} ${sinceWords(p)}`, detail, tone: "down" });
  }
  return { hits, alerted };
}

export function formatMultiple(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(1)}x`;
}

/** A signed USD amount: "+$1.2K", "−$340". */
export function formatSignedUsd(v: number): string {
  return `${v >= 0 ? "+" : "−"}${formatUsd(Math.abs(v))}`;
}

/** Parses "2, 3x, 5" or "-30%, 50" into sorted levels. Downs come out negative. */
export function parseLevels(text: string, kind: "up" | "down"): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[\s,;]+/)) {
    const n = Number(part.replace(/[x%+−-]/gi, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (kind === "up" && n > 1 && n <= 1000) out.add(Math.round(n * 10) / 10);
    if (kind === "down" && n < 100) out.add(-Math.round(n));
  }
  return [...out].sort((a, b) => (kind === "up" ? a - b : b - a)).slice(0, 8);
}

// ── Saved-file repair ─────────────────────────────────────────────────────────

const num = (v: unknown, dflt = 0) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);

export function normalizeBook(raw: Partial<PositionBook> | null | undefined): PositionBook {
  const r = raw ?? {};
  const positions: Record<string, Position> = {};
  if (r.positions && typeof r.positions === "object") {
    for (const [mint, p] of Object.entries(r.positions)) {
      if (!p || typeof p !== "object") continue;
      const amounts: Record<string, number> = {};
      for (const [w, a] of Object.entries(p.amounts ?? {})) if (num(a) > 0) amounts[w] = num(a);
      if (Object.keys(amounts).length === 0) continue;
      positions[mint] = {
        mint,
        symbol: typeof p.symbol === "string" ? p.symbol : "?",
        amounts,
        costUsd: Math.max(0, num(p.costUsd)),
        realizedUsd: num(p.realizedUsd),
        openedAt: num(p.openedAt, Date.now()),
        fromTracking: p.fromTracking !== false,
        alerted: Array.isArray(p.alerted) ? p.alerted.filter((x) => typeof x === "string") : [],
        historyChecked: p.historyChecked === true,
        fromHistory: p.fromHistory === true,
      };
    }
  }
  const SIDES = new Set(["tracked", "opened", "bought", "sold", "closed"]);
  const activity: ActivityItem[] = Array.isArray(r.activity)
    ? r.activity
        .filter((a) => a && typeof a.mint === "string" && SIDES.has(a.side))
        .map((a) => ({
          t: num(a.t),
          mint: a.mint,
          symbol: typeof a.symbol === "string" ? a.symbol : "?",
          side: a.side,
          usd: num(a.usd),
          realizedUsd: num(a.realizedUsd),
          ...(typeof a.id === "string" ? { id: a.id } : {}),
          ...(a.history === true ? { history: true } : {}),
          ...(a.costUnknown === true ? { costUnknown: true } : {}),
        }))
        .slice(-MAX_ACTIVITY)
    : [];
  return {
    wallets: Array.isArray(r.wallets) ? r.wallets.filter((w) => typeof w === "string") : [],
    positions,
    day: typeof r.day === "string" ? r.day : "",
    realizedToday: num(r.realizedToday),
    activity,
  };
}

export function normalizeLevels(raw: Partial<PositionAlerts> | null | undefined): PositionAlerts {
  const r = raw ?? {};
  const list = (v: unknown, kind: "up" | "down", dflt: number[]) =>
    Array.isArray(v) ? parseLevels(v.map((x) => String(Math.abs(Number(x)))).join(","), kind) : dflt;
  return {
    enabled: r.enabled !== false,
    ups: list(r.ups, "up", [2, 3, 5, 10]),
    downs: list(r.downs, "down", [-30, -50]),
  };
}
