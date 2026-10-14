import { describe, expect, it } from "vitest";
import { pnlSign } from "./sign";

const noLog = { count: 0, total: 0, unit: "SOL" };

describe("the PnL sign", () => {
  it("says the day's log as the header's day pill counts it, in its unit", () => {
    const s = pnlSign({ log: { count: 4, total: 4.14, unit: "SOL" }, wallet: null });
    expect(s).toEqual({ tone: "up", label: "Today", big: "+4.14 SOL", small: "4 trades" });
  });

  it("is red for a losing day, and counts one trade in the singular", () => {
    const s = pnlSign({ log: { count: 1, total: -0.8, unit: "SOL" }, wallet: null });
    expect(s.tone).toBe("down");
    expect(s.big).toBe("−0.80 SOL");
    expect(s.small).toBe("1 trade");
  });

  it("adds what the wallet still holds, in USD, under the log", () => {
    const s = pnlSign({ log: { count: 2, total: 1.5, unit: "SOL" }, wallet: { realizedUsd: 210, openUsd: -45, held: 3 } });
    expect(s.big).toBe("+1.50 SOL");
    expect(s.small).toBe("2 trades · −$45 open");
  });

  it("says what today's sales took when there is no log, the open positions under it", () => {
    const s = pnlSign({ log: noLog, wallet: { realizedUsd: 640, openUsd: 300, held: 3 } });
    expect(s).toEqual({ tone: "up", label: "Today", big: "+$640", small: "+$300 open" });
    const sold = pnlSign({ log: noLog, wallet: { realizedUsd: -120, openUsd: 0, held: 0 } });
    expect(sold).toEqual({ tone: "down", label: "Today", big: "−$120", small: "" });
  });

  it("never counts the open positions as today's: they are up since their entries", () => {
    // Sold at a loss today, the bag held since last week far up: today is red.
    const s = pnlSign({ log: noLog, wallet: { realizedUsd: -50, openUsd: 1234, held: 1 } });
    expect(s.tone).toBe("down");
    expect(s.big).toBe("−$50");
  });

  it("heads the open positions as open, not today, when nothing was sold yet", () => {
    const s = pnlSign({ log: noLog, wallet: { realizedUsd: 0, openUsd: 1234, held: 2 } });
    expect(s).toEqual({ tone: "up", label: "Open PnL", big: "+$1.23K", small: "No sales yet today" });
    expect(pnlSign({ log: noLog, wallet: { realizedUsd: 0, openUsd: -80, held: 1 } }).tone).toBe("down");
  });

  it("is a calm sign on a day with nothing", () => {
    const empty = { tone: "flat", label: "No trades today", big: "", small: "" };
    expect(pnlSign({ log: noLog, wallet: null })).toEqual(empty);
    // A wallet followed, nothing held, nothing sold.
    expect(pnlSign({ log: noLog, wallet: { realizedUsd: 0, openUsd: 0, held: 0 } })).toEqual(empty);
  });

  it("is flat at break-even, trades or not", () => {
    expect(pnlSign({ log: { count: 2, total: 0, unit: "USD" }, wallet: null }).tone).toBe("flat");
    // Part of a position sold: no whole trade yet, but money taken.
    expect(pnlSign({ log: { count: 0, total: 0.3, unit: "SOL" }, wallet: null })).toEqual({ tone: "up", label: "Today", big: "+0.30 SOL", small: "" });
  });
});
