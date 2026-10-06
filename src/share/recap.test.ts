import { describe, expect, it } from "vitest";
import { buildRecap, recapDate, type RecapInput } from "./recap";

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
