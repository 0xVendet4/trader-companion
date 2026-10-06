import { describe, expect, it } from "vitest";
import type { DisciplineRules, TradeLog } from "../core/state";
import { currentLog, lastTypedTrade, logTrade, lossLimitUsed, nextBreakIn, summarize, todayKey, undoLastTrade } from "./discipline";

const rules: DisciplineRules = {
  breakEveryMin: 90,
  dailyLossLimit: 3,
  maxTradesPerDay: 3,
  cooldownMin: 10,
  unit: "SOL",
};

const day = new Date(2026, 9, 4, 14, 0);

describe("trade log", () => {
  it("starts a new day at midnight", () => {
    const old: TradeLog = { day: "2026-10-03", entries: [{ t: 0, pnl: -5 }] };
    expect(currentLog(old, day)).toEqual({ day: todayKey(day), entries: [] });
  });

  it("reports the loss limit only on the trade that crosses it", () => {
    let log: TradeLog = { day: todayKey(day), entries: [] };
    let out = logTrade(rules, log, -2, day);
    expect(out.hitLossLimit).toBe(false);
    expect(out.startCooldown).toBe(true);
    log = out.log;
    out = logTrade(rules, log, -1.5, day);
    expect(out.hitLossLimit).toBe(true);
    log = out.log;
    out = logTrade({ ...rules, maxTradesPerDay: 0 }, log, -1, day);
    expect(out.hitLossLimit).toBe(false);
  });

  it("flags the trade that reaches the daily maximum", () => {
    let log: TradeLog = { day: todayKey(day), entries: [] };
    const hits = [1, 1, 1, 1].map((pnl) => {
      const out = logTrade(rules, log, pnl, day);
      log = out.log;
      return out.hitMaxTrades;
    });
    expect(hits).toEqual([false, false, true, false]);
  });

  it("does not start a cool-down after a win", () => {
    const out = logTrade(rules, { day: "", entries: [] }, 0.4, day);
    expect(out.startCooldown).toBe(false);
  });

  it("adds a part sold to the day's profit without counting it as a trade", () => {
    let log: TradeLog = { day: todayKey(day), entries: [] };
    let out = logTrade(rules, log, -1, day, { partial: true, auto: true });
    expect(out.startCooldown).toBe(false);
    expect(out.hitMaxTrades).toBe(false);
    log = out.log;
    // The close: its last sale's profit, judged by the whole position.
    out = logTrade(rules, log, 2.5, day, { tradePnl: 1.5, auto: true });
    expect(summarize(out.log)).toEqual({ count: 1, total: 1.5, wins: 1, losses: 0 });
    // A loss on the whole position cools down, whatever the last sale took.
    expect(logTrade(rules, log, 0.2, day, { tradePnl: -0.8 }).startCooldown).toBe(true);
  });

  it("undoes only a trade typed in", () => {
    const log: TradeLog = { day: todayKey(day), entries: [{ t: 1, pnl: 1 }, { t: 2, pnl: -2, auto: true }] };
    expect(lastTypedTrade(log, day)?.t).toBe(1);
    expect(undoLastTrade(log, day).entries).toEqual([{ t: 2, pnl: -2, auto: true }]);
  });

  it("summarises and undoes", () => {
    const log: TradeLog = { day: todayKey(day), entries: [{ t: 1, pnl: 1 }, { t: 2, pnl: -2.5 }] };
    expect(summarize(log)).toEqual({ count: 2, total: -1.5, wins: 1, losses: 1 });
    expect(lossLimitUsed(rules, summarize(log))).toBeCloseTo(0.5);
    expect(undoLastTrade(log, day).entries).toHaveLength(1);
  });
});

describe("breaks", () => {
  it("counts down to the next break, or says breaks are off", () => {
    expect(nextBreakIn(rules, 0, 30 * 60_000)).toBe(60 * 60_000);
    expect(nextBreakIn({ ...rules, breakEveryMin: 0 }, 0, 0)).toBeNull();
  });
});
