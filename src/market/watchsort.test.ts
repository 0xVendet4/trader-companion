import { describe, expect, it } from "vitest";
import type { WatchSortKey, WatchToken } from "../core/state";
import { nextSort, sortWatchlist } from "./watchsort";

const tok = (symbol: string, pinned = false): WatchToken => ({
  key: symbol,
  chainId: "solana",
  address: symbol,
  symbol,
  name: symbol,
  pairAddress: "p",
  dexId: "raydium",
  imageUrl: null,
  ...(pinned ? { pinned: true } : {}),
});

const m5: Record<string, number | null> = { A: 3, B: -2, C: 12, D: null, E: 7 };
const metric = (t: WatchToken, by: WatchSortKey) => (by === "token" ? t.symbol : m5[t.symbol] ?? null);
const order = (list: WatchToken[]) => list.map((t) => t.symbol).join("");

describe("watchlist order", () => {
  const list = [tok("C"), tok("A"), tok("D"), tok("B"), tok("E")];

  it("keeps the trader's order when unsorted, pinned tokens first", () => {
    expect(order(sortWatchlist(list, null, metric))).toBe("CADBE");
    expect(order(sortWatchlist([tok("C"), tok("A"), tok("B", true)], null, metric))).toBe("BCA");
  });

  it("sorts by a column either way, with no reading last", () => {
    expect(order(sortWatchlist(list, { by: "m5", desc: true }, metric))).toBe("CEABD");
    expect(order(sortWatchlist(list, { by: "m5", desc: false }, metric))).toBe("BAECD");
    expect(order(sortWatchlist(list, { by: "token", desc: false }, metric))).toBe("ABCDE");
  });

  it("sorts inside the pinned group and the rest separately", () => {
    const withPins = [tok("A"), tok("B", true), tok("C"), tok("E", true)];
    expect(order(sortWatchlist(withPins, { by: "m5", desc: true }, metric))).toBe("EBCA");
  });

  it("steps a column head through both ways, then off", () => {
    expect(nextSort(null, "m5")).toEqual({ by: "m5", desc: true });
    expect(nextSort({ by: "m5", desc: true }, "m5")).toEqual({ by: "m5", desc: false });
    expect(nextSort({ by: "m5", desc: false }, "m5")).toBeNull();
    expect(nextSort({ by: "m5", desc: true }, "token")).toEqual({ by: "token", desc: false });
    expect(nextSort({ by: "token", desc: false }, "token")).toEqual({ by: "token", desc: true });
  });
});
