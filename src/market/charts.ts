// Fetching the hover chart's candles (the pure parts are in chart.ts): one
// request per pool and candle size, kept for a candle's length, shared between
// popovers asking at once, and held off for a minute when GeckoTerminal says
// too many (429). The page never builds the URL: Rust (chart.rs) or the dev
// server's proxy does, from these checked parts.

import { Bridge } from "../core/bridge";
import { State } from "../core/state";
import { chartCandles, chartRequest, chartTtl, geckoNetwork, parseOhlcv, validPool, type Candle, type ChartInterval } from "./chart";
import type { ChainId } from "./chains";

/** After a 429, no chart is asked for this long. */
export const CHART_BUSY_MS = 60_000;

export type ChartLoad =
  | { kind: "ok"; candles: Candle[] }
  /** GeckoTerminal has no charts for this chain (Robinhood). */
  | { kind: "nochain" }
  /** The token has no pool address yet (a held token the market has not quoted). */
  | { kind: "nopool" }
  /** Too many requests a minute ago or less. */
  | { kind: "busy" }
  | { kind: "error"; message: string };

/** The key under which a chart is kept in State.charts. */
export function chartKey(chain: ChainId, pool: string, interval: ChartInterval): string {
  return `${chain}|${pool}|${interval}`;
}

/** The candles kept for a pool and size, when they are still good. */
export function cachedChart(chain: ChainId, pool: string, interval: ChartInterval, now = Date.now()): Candle[] | null {
  const c = State.charts[chartKey(chain, pool, interval)];
  return c && now - c.fetchedAt < chartTtl(interval) ? c.candles : null;
}

const inFlight = new Map<string, Promise<ChartLoad>>();

/**
 * A pool's chart: what is kept when it is still good, else fetched. Two
 * popovers asking for the same chart share one request. The caller decides
 * whether it still wants the answer (a popover closed meanwhile ignores it).
 */
export function loadChart(chain: ChainId, pool: string, interval: ChartInterval): Promise<ChartLoad> {
  const network = geckoNetwork(chain);
  if (!network) return Promise.resolve({ kind: "nochain" });
  if (!pool) return Promise.resolve({ kind: "nopool" });
  if (!validPool(network, pool)) return Promise.resolve({ kind: "error", message: "pool" });
  const cached = cachedChart(chain, pool, interval);
  if (cached) return Promise.resolve({ kind: "ok", candles: cached });
  if (Date.now() < State.chartBusyUntil) return Promise.resolve({ kind: "busy" });
  const key = chartKey(chain, pool, interval);
  const going = inFlight.get(key);
  if (going) return going;
  const p = fetchChart(network, key, interval).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function fetchChart(network: string, key: string, interval: ChartInterval): Promise<ChartLoad> {
  const pool = key.split("|")[1];
  const req = chartRequest(interval);
  try {
    const json = await Bridge.ohlcv(network, pool, req.timeframe, req.aggregate, req.limit);
    const candles = chartCandles(parseOhlcv(json), interval);
    State.charts[key] = { candles, fetchedAt: Date.now() };
    return { kind: "ok", candles };
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/\bbusy\b|429/i.test(message)) {
      State.chartBusyUntil = Date.now() + CHART_BUSY_MS;
      return { kind: "busy" };
    }
    return { kind: "error", message };
  }
}
