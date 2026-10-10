// The watchlist's order: pinned tokens first, then the trader's own order or a
// column (value, volume, 5m…). Pure; the list view hands in how to read each
// column, since what "value" and "volume" mean follows its own settings.

import type { WatchSort, WatchSortKey, WatchToken } from "../core/state";

/** A column's reading for a token: a number, the symbol for "token", or null when there is none. */
export type SortMetric = (t: WatchToken, by: WatchSortKey) => number | string | null;

/**
 * The list in the order to show it. Pinned tokens come first, in their own
 * order; within each group the sort applies, tokens with no reading go last
 * whatever the direction, and ties keep the trader's order.
 */
export function sortWatchlist(tokens: WatchToken[], sort: WatchSort | null, metric: SortMetric): WatchToken[] {
  const indexed = tokens.map((t, i) => ({ t, i, v: sort ? metric(t, sort.by) : null }));
  indexed.sort((a, b) => {
    if (!!a.t.pinned !== !!b.t.pinned) return a.t.pinned ? -1 : 1;
    if (!sort) return a.i - b.i;
    if (a.v == null || b.v == null) return a.v == null && b.v == null ? a.i - b.i : a.v == null ? 1 : -1;
    const c = typeof a.v === "string" || typeof b.v === "string" ? String(a.v).localeCompare(String(b.v)) : a.v - b.v;
    return (sort.desc ? -c : c) || a.i - b.i;
  });
  return indexed.map((x) => x.t);
}

/**
 * A click on a column head: that column (biggest first for numbers, A to Z for
 * the name), then the other way, then back to the trader's own order.
 */
export function nextSort(current: WatchSort | null, by: WatchSortKey): WatchSort | null {
  const first = by !== "token";
  if (!current || current.by !== by) return { by, desc: first };
  if (current.desc === first) return { by, desc: !first };
  return null;
}
