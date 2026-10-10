import { describe, expect, it } from "vitest";
import type { DisciplineRules, JournalEntry, TradeLog } from "../core/state";
import {
  currentLog,
  dayGrid,
  dayPill,
  lastTypedTrade,
  logTrade,
  lossLimitUsed,
  lossStreak,
  nextBreakIn,
  positionSize,
  summarize,
  todayKey,
  undoLastTrade,
} from "./discipline";

const rules: DisciplineRules = {
  breakEveryMin: 90,
  dailyLossLimit: 3,
  maxTradesPerDay: 3,
  cooldownMin: 10,
  tiltLosses: 3,
  tiltBreakMin: 30,
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

describe("tilt", () => {
  it("counts the losses in a row, a part sold aside", () => {
    const log: TradeLog = { day: todayKey(day), entries: [{ t: 1, pnl: -1 }, { t: 2, pnl: 2 }, { t: 3, pnl: -1 }, { t: 4, pnl: 0.5, partial: true }, { t: 5, pnl: -2 }] };
    expect(lossStreak(log)).toBe(2);
    expect(lossStreak({ day: "", entries: [] })).toBe(0);
  });

  it("flags the loss that makes the streak, once", () => {
    const loose = { ...rules, dailyLossLimit: 0, maxTradesPerDay: 0 };
    let log: TradeLog = { day: todayKey(day), entries: [] };
    const hits = [-1, -1, -1, -1].map((pnl) => {
      const out = logTrade(loose, log, pnl, day);
      log = out.log;
      return out.hitTilt;
    });
    expect(hits).toEqual([false, false, true, false]);
    expect(logTrade({ ...loose, tiltLosses: 0 }, { day: todayKey(day), entries: [{ t: 1, pnl: -1 }, { t: 2, pnl: -1 }] }, -1, day).hitTilt).toBe(false);
  });
});

describe("day pill", () => {
  it("shows the day against the limits, amber close to one and red on it", () => {
    expect(dayPill({ ...rules, dailyLossLimit: 0, maxTradesPerDay: 0 }, { count: 0, total: 0, wins: 0, losses: 0 })).toBeNull();
    const ok = dayPill(rules, { count: 1, total: -1, wins: 0, losses: 1 })!;
    expect(ok.text).toBe("−1.00/3 · 1/3");
    expect(ok.tone).toBe("ok");
    expect(dayPill(rules, { count: 2, total: 0.5, wins: 2, losses: 0 })!.tone).toBe("warn");
    expect(dayPill(rules, { count: 1, total: -2.2, wins: 0, losses: 1 })!.tone).toBe("warn");
    expect(dayPill(rules, { count: 1, total: -3, wins: 0, losses: 1 })!.tone).toBe("stop");
    expect(dayPill(rules, { count: 3, total: 1, wins: 3, losses: 0 })!.tone).toBe("stop");
    expect(dayPill({ ...rules, dailyLossLimit: 0, maxTradesPerDay: 0 }, { count: 2, total: 0.4, wins: 1, losses: 1 })!.text).toBe("+0.40 SOL · 2t");
  });
});

describe("position size", () => {
  it("risks the chosen share of the bank at the stop", () => {
    expect(positionSize(10, 2, 20)).toEqual({ size: 1, risk: 0.2 });
    expect(positionSize(10, 5, 2)!.size).toBe(10); // never more than the bank
    expect(positionSize(0, 2, 20)).toBeNull();
    expect(positionSize(10, 2, 0)).toBeNull();
  });
});

describe("days grid", () => {
  it("lays the journal out in weeks, Monday first, ending this week", () => {
    const wed = new Date(2026, 9, 7, 12); // a Wednesday
    const journal: JournalEntry[] = [
      { id: "a", t: new Date(2026, 9, 6, 10).getTime(), pnl: 1.5, note: "" },
      { id: "b", t: new Date(2026, 9, 6, 15).getTime(), pnl: -0.5, note: "" },
      { id: "c", t: new Date(2026, 8, 29, 9).getTime(), pnl: -2, note: "" },
    ];
    const grid = dayGrid(journal, 2, wed);
    expect(grid).toHaveLength(2);
    expect(grid[1][0].day).toBe("2026-10-05");
    expect(grid[0][0].day).toBe("2026-09-28");
    expect(grid[1][1]).toEqual({ day: "2026-10-06", pnl: 1, count: 2, future: false });
    expect(grid[0][1].pnl).toBe(-2);
    expect(grid[1][3].future).toBe(true);
    expect(grid[1][2].future).toBe(false);
  });
});
