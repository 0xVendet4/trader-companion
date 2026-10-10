import { describe, expect, it } from "vitest";
import { buildRecap, buildWeekRecap, monthRange, monthRecapDue, recapDate, weekRange, weekRecapDue, type RecapInput } from "./recap";

const base: RecapInput = {
  date: "Mon 5 Oct",
  hideMoney: false,
  trades: { count: 4, wins: 3, losses: 1, total: 2.5, unit: "SOL" },
  hasRules: true,
  stopped: false,
  positions: { count: 2, openPnl: 120, cost: 400, realizedToday: 35 },
  topMover: { symbol: "BONK", pct: 22 },
  fearGreed: { value: 72, label: "Greed" },
};

describe("daily recap", () => {
  it("lays out the day", () => {
    const r = buildRecap(base, "Trader Companion");
    expect(r.headline).toBe("Green day! 🎉");
    expect(r.mood).toBe("celebrate");
    expect(r.tiles.map((t) => t.label)).toEqual(["Trades", "Day PnL", "Open positions", "Taken today", "Top mover (24h)", "Discipline"]);
    expect(r.tiles[1].value).toBe("+2.50 SOL");
    expect(r.tiles[2]).toMatchObject({ value: "+$120", sub: "+30.0% · 2 tokens" });
  });

  it("hides every amount of money when asked", () => {
    const r = buildRecap({ ...base, hideMoney: true }, "x");
    const text = JSON.stringify(r.tiles);
    expect(text).not.toMatch(/\$|SOL/);
    expect(r.tiles[1].value).toBe("Green day");
    expect(r.tiles[2].value).toBe("+30.0%");
  });

  it("is honest about a stop and a red day", () => {
    expect(buildRecap({ ...base, stopped: true }, "x").headline).toBe("Rules are rules. Stopped on time.");
    const red = buildRecap({ ...base, trades: { ...base.trades, total: -1, wins: 1, losses: 3 } }, "x");
    expect(red.mood).toBe("worried");
  });

  it("a day with no trades and no positions is a quiet one", () => {
    const r = buildRecap({ ...base, trades: { count: 0, wins: 0, losses: 0, total: 0, unit: "SOL" }, positions: null, hasRules: false }, "x");
    expect(r.headline).toBe("Quiet day. Watched, waited.");
    expect(r.tiles[0]).toMatchObject({ label: "Trades", value: "0" });
  });

  it("never suggests a trade", () => {
    for (const total of [-5, 0, 5]) {
      const r = buildRecap({ ...base, trades: { ...base.trades, total } }, "x");
      for (const s of [r.headline, ...r.tiles.map((t) => `${t.value} ${t.sub ?? ""}`)]) expect(s).not.toMatch(/\b(buy|sell|ape)\b/i);
    }
  });

  it("writes the date in English", () => {
    expect(recapDate(new Date(2026, 9, 5))).toBe("Mon 5 Oct");
  });
});

describe("weekly recap", () => {
  const wed = new Date(2026, 9, 7, 12); // Wednesday 7 Oct 2026
  const at = (d: number, h = 10) => new Date(2026, 9, d, h).getTime();

  it("finds this week and the one before, Monday to Monday", () => {
    const last = weekRange(wed, "last");
    expect(new Date(last.from)).toEqual(new Date(2026, 8, 28));
    expect(new Date(last.to)).toEqual(new Date(2026, 9, 5));
    expect(last.label).toBe("28 Sep – 4 Oct");
    expect(new Date(weekRange(wed, "this").from)).toEqual(new Date(2026, 9, 5));
  });

  it("lays out the week", () => {
    const trades = [
      { t: at(5), pnl: 1.5 },
      { t: at(5, 15), pnl: -0.5 },
      { t: at(6), pnl: -2 },
      { t: at(7), pnl: 3 },
      { t: at(1), pnl: 9 }, // the week before: left out
    ];
    const r = buildWeekRecap({ range: weekRange(wed, "this"), hideMoney: false, unit: "SOL", trades }, "Candy");
    expect(r.count).toBe(4);
    expect(r.total).toBeCloseTo(2);
    expect(r.headline).toBe("Green week! 🎉");
    expect(r.tiles.map((t) => t.label)).toEqual(["Week PnL", "Trades", "Green days", "Best day", "Best trade", "Biggest loss"]);
    expect(r.tiles[2].value).toBe("2 of 3");
    expect(r.tiles[3]).toMatchObject({ value: "Wed", sub: "+3.00 SOL" });
    const planned = buildWeekRecap({ range: weekRange(wed, "this"), hideMoney: false, unit: "SOL", trades: trades.map((x, i) => ({ ...x, plan: i % 2 ? ("no" as const) : ("yes" as const) })) }, "Candy");
    expect(planned.tiles.find((t) => t.label === "Plan followed")?.value).toBe("2 of 4");
    const hidden = buildWeekRecap({ range: weekRange(wed, "this"), hideMoney: true, unit: "SOL", trades }, "Candy");
    expect(JSON.stringify(hidden.tiles)).not.toMatch(/SOL/);
  });

  it("is due once, on the Monday after a week with trades", () => {
    const monday = new Date(2026, 9, 12, 9);
    const trades = [{ t: at(7) }];
    const due = weekRecapDue(monday, 0, trades);
    expect(due?.label).toBe("5 Oct – 11 Oct");
    expect(weekRecapDue(monday, due!.from, trades)).toBeNull();
    expect(weekRecapDue(monday, 0, [{ t: at(1) }])).toBeNull();
  });
});

describe("monthly recap", () => {
  it("finds this month and the one before, from the 1st, across a new year", () => {
    const last = monthRange(new Date(2026, 9, 10, 12), "last");
    expect(new Date(last.from)).toEqual(new Date(2026, 8, 1));
    expect(new Date(last.to)).toEqual(new Date(2026, 9, 1));
    expect(last).toMatchObject({ label: "September 2026", period: "month" });
    expect(monthRange(new Date(2027, 0, 3), "last").label).toBe("December 2026");
  });

  it("lays out the month in its own words", () => {
    const trades = [
      { t: new Date(2026, 8, 3, 10).getTime(), pnl: 1.2 },
      { t: new Date(2026, 8, 14, 10).getTime(), pnl: 2.1 },
      { t: new Date(2026, 8, 20, 10).getTime(), pnl: -0.4 },
    ];
    const r = buildWeekRecap({ range: monthRange(new Date(2026, 9, 2), "last"), hideMoney: false, unit: "SOL", trades }, "Candy");
    expect(r.kind).toBe("month");
    expect(r.headline).toBe("Green month! 🎉");
    expect(r.tiles[0].label).toBe("Month PnL");
    expect(r.tiles.find((t) => t.label === "Best day")?.value).toBe("14 Sep");
  });

  it("is due once, after a month with trades", () => {
    const first = new Date(2026, 9, 1, 9);
    const trades = [{ t: new Date(2026, 8, 20).getTime() }];
    const due = monthRecapDue(first, 0, trades);
    expect(due?.label).toBe("September 2026");
    expect(monthRecapDue(first, due!.from, trades)).toBeNull();
    expect(monthRecapDue(first, 0, [{ t: new Date(2026, 9, 1, 8).getTime() }])).toBeNull();
  });
});
