import { describe, expect, it } from "vitest";
import {
  CHART_INTERVALS,
  CHART_TTL_MAX,
  chartCandles,
  chartDrawing,
  chartRequest,
  chartStats,
  chartTtl,
  foldCandles,
  geckoNetwork,
  isChartInterval,
  parseOhlcv,
  validPool,
  type Candle,
} from "./chart";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);

/** Candles every `stepMs` from T0, prices climbing one per candle. */
function series(n: number, stepMs: number, from = T0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ t: from + i * stepMs, o: 10 + i, h: 11 + i, l: 9.5 + i, c: 10.5 + i, v: 100 }));
}

// Shaped like GeckoTerminal's answer: newest first, seconds, prices in USD.
const ANSWER = {
  data: {
    id: "x",
    type: "ohlcv_request_response",
    attributes: {
      ohlcv_list: [
        [1760356800, 0.0051, 0.0053, 0.005, 0.0052, 12345.6],
        [1760355900, 0.005, 0.0051, 0.0049, 0.0051, 9876.5],
        [1760355000, "0.0049", "0.0050", "0.0048", "0.0050", "100"],
        [1760354100, 0.0048, 0.0047, 0.0049, 0.0049, 10],
        ["bad", 1, 1, 1, 1, 1],
        [1760353200, -1, 1, 1, 1, 1],
        [1760355000, 0.0049, 0.0052, 0.0048, 0.0051, 100],
        null,
        [1760352300],
      ],
    },
  },
};

describe("ohlcv parsing", () => {
  it("reads the documented answer oldest first, skipping what is not a candle", () => {
    const c = parseOhlcv(ANSWER);
    expect(c.map((x) => x.t / 1000)).toEqual([1760354100, 1760355000, 1760355900, 1760356800]);
    expect(c[3]).toEqual({ t: 1760356800_000, o: 0.0051, h: 0.0053, l: 0.005, c: 0.0052, v: 12345.6 });
    // Numbers as strings are read; a duplicate start keeps the later row.
    expect(c[1].h).toBe(0.0052);
    // A wick shorter than its body is stretched to it.
    expect(c[0].h).toBe(0.0049);
    expect(c[0].l).toBe(0.0048);
  });

  it("takes the bare list Rust hands back, and nothing else", () => {
    expect(parseOhlcv(ANSWER.data.attributes.ohlcv_list)).toHaveLength(4);
    expect(parseOhlcv({ data: {} })).toEqual([]);
    expect(parseOhlcv("nope")).toEqual([]);
    expect(parseOhlcv(null)).toEqual([]);
  });
});

describe("intervals", () => {
  it("asks the API for what it serves and folds the rest from finer candles", () => {
    expect(chartRequest("1m")).toEqual({ timeframe: "minute", aggregate: 1, fold: 1, limit: 100 });
    expect(chartRequest("15m")).toEqual({ timeframe: "minute", aggregate: 15, fold: 1, limit: 100 });
    expect(chartRequest("30m")).toEqual({ timeframe: "minute", aggregate: 15, fold: 2, limit: 200 });
    expect(chartRequest("4h")).toEqual({ timeframe: "hour", aggregate: 4, fold: 1, limit: 100 });
    expect(chartRequest("8h")).toEqual({ timeframe: "hour", aggregate: 4, fold: 2, limit: 200 });
    expect(chartRequest("12h")).toEqual({ timeframe: "hour", aggregate: 12, fold: 1, limit: 100 });
    expect(chartRequest("24h")).toEqual({ timeframe: "day", aggregate: 1, fold: 1, limit: 100 });
    for (const i of CHART_INTERVALS) expect(chartRequest(i).limit).toBeLessThanOrEqual(1000);
  });

  it("knows its own names", () => {
    expect(isChartInterval("15m")).toBe(true);
    expect(isChartInterval("2h")).toBe(false);
    expect(isChartInterval(15)).toBe(false);
  });

  it("keeps a chart for one candle, never under half a minute nor over five", () => {
    expect(chartTtl("1m")).toBe(MIN);
    expect(chartTtl("5m")).toBe(5 * MIN);
    // The forming candle of a long chart follows the price within minutes.
    expect(chartTtl("15m")).toBe(CHART_TTL_MAX);
    expect(chartTtl("12h")).toBe(CHART_TTL_MAX);
    expect(chartTtl("24h")).toBe(CHART_TTL_MAX);
    for (const i of CHART_INTERVALS) {
      expect(chartTtl(i)).toBeGreaterThanOrEqual(30_000);
      expect(chartTtl(i)).toBeLessThanOrEqual(CHART_TTL_MAX);
    }
  });

  it("maps chains to GeckoTerminal networks", () => {
    expect(geckoNetwork("solana")).toBe("solana");
    expect(geckoNetwork("bsc")).toBe("bsc");
    expect(geckoNetwork("ethereum")).toBe("eth");
    expect(geckoNetwork("base")).toBe("base");
    expect(geckoNetwork("robinhood")).toBeNull();
  });

  it("accepts only a pool address shaped for its network", () => {
    expect(validPool("solana", "DemoPairCandLe11111111111111111111111111111")).toBe(true);
    expect(validPool("solana", "0x" + "a".repeat(40))).toBe(false);
    expect(validPool("solana", "short")).toBe(false);
    expect(validPool("solana", "DemoPair0OIl1111111111111111111111111111111")).toBe(false);
    expect(validPool("eth", "0x" + "Ab".repeat(20))).toBe(true);
    expect(validPool("bsc", "0x" + "g".repeat(40))).toBe(false);
    expect(validPool("base", "0x" + "a".repeat(40))).toBe(true);
    expect(validPool("eth", "/../x")).toBe(false);
    expect(validPool("polygon", "0x" + "a".repeat(40))).toBe(false);
  });
});

describe("folding", () => {
  it("makes 30 m candles from pairs of 15 m ones", () => {
    const fine = series(4, 15 * MIN);
    const out = foldCandles(fine, 30 * MIN);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ t: T0, o: 10, h: 12, l: 9.5, c: 11.5, v: 200 });
    expect(out[1]).toEqual({ t: T0 + 30 * MIN, o: 12, h: 14, l: 11.5, c: 13.5, v: 200 });
  });

  it("aligns spans to the clock and keeps the newest partial one", () => {
    // Starts at :15, so the first span holds one candle; the last span is still forming.
    const fine = series(4, 15 * MIN, T0 + 15 * MIN);
    const out = foldCandles(fine, 30 * MIN);
    expect(out.map((c) => c.t)).toEqual([T0, T0 + 30 * MIN, T0 + 60 * MIN]);
    expect(out[0]).toEqual({ ...fine[0], t: T0 });
    expect(out[2]).toEqual({ ...fine[3], t: T0 + 60 * MIN });
  });

  it("leaves a gap as a gap", () => {
    const fine = [...series(2, 15 * MIN), ...series(2, 15 * MIN, T0 + 2 * 60 * MIN)];
    const out = foldCandles(fine, 30 * MIN);
    expect(out.map((c) => c.t)).toEqual([T0, T0 + 120 * MIN]);
    expect(out[1].v).toBe(200);
  });

  it("folds 8 h candles from 4 h ones, in any order given", () => {
    // From 08:00 UTC, where an 8 h span starts.
    const fine = series(6, 4 * 60 * MIN, Date.UTC(2026, 9, 13, 8)).reverse();
    const out = foldCandles(fine, 8 * 60 * MIN);
    expect(out).toHaveLength(3);
    expect(out[0].o).toBe(10);
    expect(out[2].c).toBe(15.5);
  });

  it("shows the newest hundred after folding", () => {
    const fine = series(250, 15 * MIN);
    const shown = chartCandles(fine, "30m");
    expect(shown).toHaveLength(100);
    expect(shown[99].t).toBe(T0 + 248 * 15 * MIN);
    expect(chartCandles(fine, "15m")).toHaveLength(100);
    expect(chartCandles(series(5, MIN), "1m")).toHaveLength(5);
  });
});

describe("stats and drawing", () => {
  it("sums a chart up: open to close, high and low", () => {
    const s = chartStats(series(3, MIN))!;
    expect(s.open).toBe(10);
    expect(s.close).toBe(12.5);
    expect(s.changePct).toBeCloseTo(25);
    expect(s.high).toBe(13);
    expect(s.low).toBe(9.5);
    expect(chartStats([])).toBeNull();
  });

  it("places candles left to right inside the box, the last price marked", () => {
    const d = chartDrawing(series(4, MIN), 300, 100)!;
    expect(d.candles).toHaveLength(4);
    const xs = d.candles.map((c) => c.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (const c of d.candles) {
      expect(c.x - c.w / 2).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w / 2).toBeLessThanOrEqual(300);
      expect(c.wickTop).toBeLessThanOrEqual(c.bodyTop);
      expect(c.wickBottom).toBeGreaterThanOrEqual(c.bodyTop + c.bodyH);
      expect(c.wickTop).toBeGreaterThanOrEqual(0);
      expect(c.wickBottom).toBeLessThanOrEqual(100);
      expect(c.up).toBe(true);
    }
    expect(d.lastPrice).toBe(13.5);
    // Higher price, smaller y: the last close sits above the first open.
    expect(d.lastY).toBeLessThan(d.candles[0].bodyTop);
    expect(d.top).toBeGreaterThan(14);
    expect(d.bottom).toBeLessThan(9.5);
  });

  it("gives a flat candle a body a pixel tall, and a flat chart a band", () => {
    const flat: Candle[] = [{ t: T0, o: 1, h: 1, l: 1, c: 1, v: 0 }];
    const d = chartDrawing(flat, 100, 50)!;
    expect(d.candles[0].bodyH).toBe(1);
    expect(d.candles[0].up).toBe(true);
    expect(d.lastY).toBeGreaterThan(0);
    expect(d.lastY).toBeLessThan(50);
    expect(chartDrawing([], 100, 50)).toBeNull();
  });

  it("colours a falling candle down", () => {
    const d = chartDrawing([{ t: T0, o: 2, h: 2.5, l: 0.5, c: 1, v: 0 }], 100, 50)!;
    expect(d.candles[0].up).toBe(false);
  });
});
