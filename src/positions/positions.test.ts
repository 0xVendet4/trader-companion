import { describe, expect, it } from "vitest";
import { EMPTY_BOOK, crossedLevels, normalizeBook, parseLevels, positionStats, setEntry, updateBook, walletTrades } from "./positions";

const A = "WalletA";
const B = "WalletB";
const BONK = "BonkMint";
const px = (price: number, symbol = "BONK") => ({ [BONK]: { price, symbol } });
const DAY = "2026-10-05";

describe("updateBook", () => {
  it("starts what a wallet already holds at the price of that moment", () => {
    const { book, changes } = updateBook(EMPTY_BOOK, [A], [{ address: A, holdings: { [BONK]: 1000 } }], px(0.01), 1, DAY);
    const p = book.positions[BONK];
    expect(p.costUsd).toBeCloseTo(10);
    expect(p.fromTracking).toBe(true);
    expect(changes[0].side).toBe("tracked");
    expect(book.activity).toMatchObject([{ side: "tracked", symbol: "BONK", usd: 10 }]);
    expect(book.wallets).toEqual([A]);
  });

  it("prices a buy and a sell between checks, average cost", () => {
    let { book } = updateBook(EMPTY_BOOK, [A], [{ address: A, holdings: {} }], {}, 1, DAY);
    ({ book } = updateBook(book, [A], [{ address: A, holdings: { [BONK]: 1000 } }], px(0.01), 2, DAY));
    expect(book.positions[BONK].fromTracking).toBe(false);
    expect(book.positions[BONK].costUsd).toBeCloseTo(10);
    // Price doubles, sell half: 500 × 0.02 = 10 in, cost out 5 → +5 realized.
    const r = updateBook(book, [A], [{ address: A, holdings: { [BONK]: 500 } }], px(0.02), 3, DAY);
    expect(r.changes[0]).toMatchObject({ side: "sold", realizedUsd: 5 });
    expect(r.book.positions[BONK].costUsd).toBeCloseTo(5);
    expect(r.book.realizedToday).toBeCloseTo(5);
    // Sell the rest at the same price: closed, +5 more.
    const c = updateBook(r.book, [A], [{ address: A, holdings: {} }], px(0.02), 4, DAY);
    expect(c.changes[0].side).toBe("closed");
    expect(c.book.positions[BONK]).toBeUndefined();
    expect(c.book.realizedToday).toBeCloseTo(10);
    expect(c.book.activity.map((a) => a.side)).toEqual(["opened", "sold", "closed"]);
    expect(c.book.activity[2].realizedUsd).toBeCloseTo(10);
  });

  it("a transfer between own wallets is no trade", () => {
    let { book } = updateBook(EMPTY_BOOK, [A, B], [{ address: A, holdings: { [BONK]: 1000 } }, { address: B, holdings: {} }], px(0.01), 1, DAY);
    const r = updateBook(book, [A, B], [{ address: A, holdings: {} }, { address: B, holdings: { [BONK]: 1000 } }], px(0.05), 2, DAY);
    book = r.book;
    expect(r.changes).toEqual([]);
    expect(book.positions[BONK].costUsd).toBeCloseTo(10);
    expect(book.positions[BONK].amounts).toEqual({ [B]: 1000 });
  });

  it("ignores dust and unpriced spam", () => {
    const { book } = updateBook(EMPTY_BOOK, [A], [{ address: A, holdings: { [BONK]: 10, Spam: 1e9 } }], px(0.01), 1, DAY);
    expect(book.positions).toEqual({});
  });

  it("a failed read keeps the last amounts", () => {
    let { book } = updateBook(EMPTY_BOOK, [A], [{ address: A, holdings: { [BONK]: 1000 } }], px(0.01), 1, DAY);
    ({ book } = updateBook(book, [A], [], px(0.02), 2, DAY));
    expect(book.positions[BONK].amounts[A]).toBe(1000);
  });

  it("drops a wallet that is no longer the trader's", () => {
    let { book } = updateBook(EMPTY_BOOK, [A, B], [{ address: A, holdings: { [BONK]: 1000 } }, { address: B, holdings: { [BONK]: 1000 } }], px(0.01), 1, DAY);
    ({ book } = updateBook(book, [A], [], {}, 2, DAY));
    expect(book.positions[BONK].costUsd).toBeCloseTo(10);
    expect(book.wallets).toEqual([A]);
  });

  it("starts each day's realized total at zero", () => {
    const book = { ...EMPTY_BOOK, day: "2026-10-04", realizedToday: 50 };
    expect(updateBook(book, [], [], {}, 1, DAY).book.realizedToday).toBe(0);
  });
});

describe("stats and levels", () => {
  const { book } = updateBook(EMPTY_BOOK, [A], [{ address: A, holdings: { [BONK]: 1000 } }], px(0.01), 1, DAY);
  const p = book.positions[BONK];
  const levels = { enabled: true, ups: [2, 3, 5], downs: [-30, -50] };

  it("computes value, PnL and multiple", () => {
    expect(positionStats(p, 0.025)).toMatchObject({ valueUsd: 25, pnlUsd: 15, multiple: 2.5 });
  });

  it("reports the furthest level crossed, once", () => {
    const r = crossedLevels(p, 0.035, levels);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].title).toBe("BONK 3x since tracking began");
    expect(r.alerted).toEqual(["x2", "x3"]);
    expect(crossedLevels({ ...p, alerted: r.alerted }, 0.035, levels).hits).toEqual([]);
  });

  it("reports drawdowns from the entry, and says so after a typed entry", () => {
    const typed = setEntry(book, BONK, 0.02).positions[BONK];
    const r = crossedLevels(typed, 0.0125, levels);
    expect(r.hits[0]).toMatchObject({ tone: "down", title: "BONK −37.5% from your entry" });
  });

  it("stays quiet when alerts are off", () => {
    expect(crossedLevels(p, 1, { ...levels, enabled: false }).hits).toEqual([]);
  });

  it("parses what the trader types", () => {
    expect(parseLevels("2x, 5, 3x, 0.5, 1", "up")).toEqual([2, 3, 5]);
    expect(parseLevels("-30%, 50 , 120", "down")).toEqual([-30, -50]);
  });

  it("repairs a saved book", () => {
    expect(normalizeBook({ positions: { X: { amounts: { [A]: -1 } } } } as never).positions).toEqual({});
    expect(normalizeBook(null)).toEqual({ wallets: [], positions: {}, day: "", realizedToday: 0, activity: [] });
  });
});

describe("walletTrades", () => {
  it("counts a part sold by its profit, and a close as one trade judged by the whole position", () => {
    let { book } = updateBook(EMPTY_BOOK, [A], [{ address: A, holdings: {} }], {}, 1, DAY);
    ({ book } = updateBook(book, [A], [{ address: A, holdings: { [BONK]: 1000 } }], px(0.01), 2, DAY));
    const half = updateBook(book, [A], [{ address: A, holdings: { [BONK]: 500 } }], px(0.02), 3, DAY);
    expect(walletTrades(half.changes, "USD", 150)).toEqual([{ pnl: 5, partial: true }]);
    const rest = updateBook(half.book, [A], [{ address: A, holdings: {} }], px(0.03), 4, DAY);
    expect(walletTrades(rest.changes, "USD", 150)).toEqual([{ pnl: 10, partial: false, tradePnl: 15, note: "Auto: BONK closed (+$15)" }]);
    expect(walletTrades(rest.changes, "SOL", 150)).toEqual([{ pnl: 0.0667, partial: false, tradePnl: 0.1, note: "Auto: BONK closed (+$15)" }]);
  });

  it("waits for a SOL price, and has nothing to count for buys", () => {
    const closed = [{ mint: BONK, symbol: "BONK", side: "closed" as const, usd: 1, realizedUsd: -3, totalRealizedUsd: -3, fromTracking: true }];
    expect(walletTrades(closed, "SOL", null)).toBeNull();
    expect(walletTrades(closed, "USD", null)).toEqual([{ pnl: -3, partial: false, tradePnl: -3, note: "Auto: BONK closed (−$3, since tracking)" }]);
    expect(walletTrades([{ ...closed[0], side: "opened" }], "SOL", null)).toEqual([]);
  });
});
