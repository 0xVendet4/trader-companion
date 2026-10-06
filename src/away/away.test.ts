import { describe, expect, it } from "vitest";
import { awaySummary, type Snapshot } from "./away";

const snap = (t: number, prices: Record<string, number>, positions: Snapshot["positions"] = null): Snapshot => ({
  t,
  prices: Object.fromEntries(Object.entries(prices).map(([k, price]) => [k, { symbol: k, price }])),
  positions,
});

describe("while you were away", () => {
  it("sums up moves, the wallet, alerts and followed wallets", () => {
    const s = awaySummary(
      snap(0, { BONK: 1, WIF: 2, POPCAT: 1 }, { value: 500, pnl: 50 }),
      snap(80 * 60_000, { BONK: 1.18, WIF: 1.86, POPCAT: 1.01 }, { value: 620, pnl: 170 }),
      [
        { t: 10, title: "BONK +15% in 15 min", wallet: false },
        { t: 20, title: "Whale bought WIF", wallet: true },
        { t: -5, title: "before leaving", wallet: false },
      ],
    )!;
    expect(s.away).toBe("1h 20m");
    expect(s.lines).toEqual(["Moves: BONK +18.0%, WIF −7.0%", "Your wallet: +$120 on open positions", "1 alert: BONK +15% in 15 min", "Whale bought WIF"]);
  });

  it("says nothing when nothing happened", () => {
    expect(awaySummary(snap(0, { BONK: 1 }), snap(60 * 60_000, { BONK: 1.02 }), [])).toBeNull();
  });

  it("counts many alerts and keeps the last wallet moves", () => {
    const ev = (t: number, title: string, wallet: boolean) => ({ t, title, wallet });
    const s = awaySummary(snap(0, {}), snap(1, {}), [ev(1, "a", false), ev(2, "b", false), ev(3, "W1", true), ev(4, "W2", true), ev(5, "W3", true)])!;
    expect(s.lines).toEqual(["2 alerts, last: b", "W2; W3 (+1 more)"]);
  });
});
