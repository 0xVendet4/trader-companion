import { describe, expect, it } from "vitest";
import {
  COUNT_MS,
  COUNT_STAGGER_MS,
  DAY_END_CHOICES,
  DAY_END_DEFAULT,
  DAY_END_QUIET_MS,
  countDoneAt,
  countProgress,
  dayEndChoices,
  dayEndDue,
  dayEndMinutes,
  dayEndRows,
  dayEndStats,
  type DayEndCheck,
} from "./dayend";
import { normalizeSettings } from "../core/state";

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 13, h, m, s); // Tue 13 Oct 2026

const base: DayEndCheck = {
  now: at(22, 5),
  dayEndAt: "22:00",
  shownFor: "",
  somethingToTell: true,
  lastTradeAt: at(17, 32).getTime(),
  paused: false,
  sessionEndAt: 0,
};

describe("when the day ends", () => {
  it("reads the time, and knows off", () => {
    expect(dayEndMinutes("22:00")).toBe(1320);
    expect(dayEndMinutes("9:30")).toBe(570);
    expect(dayEndMinutes("")).toBeNull();
    expect(dayEndMinutes("24:00")).toBeNull();
    expect(dayEndMinutes("later")).toBeNull();
    expect(DAY_END_CHOICES[0]).toBe("");
    expect(DAY_END_CHOICES).toContain(DAY_END_DEFAULT);
    expect(DAY_END_CHOICES).toContain("12:00");
    expect(DAY_END_CHOICES).toContain("15:00");
    expect(DAY_END_CHOICES).toContain("23:30");
    for (const c of DAY_END_CHOICES.slice(1)) expect(dayEndMinutes(c)).not.toBeNull();
  });

  it("offers the time kept in the file among the choices, in its place", () => {
    expect(dayEndChoices("22:00")).toEqual(DAY_END_CHOICES);
    expect(dayEndChoices("")).toEqual(DAY_END_CHOICES);
    const withNine = dayEndChoices("09:00");
    expect(withNine.slice(0, 3)).toEqual(["", "09:00", "12:00"]);
    expect(withNine).toHaveLength(DAY_END_CHOICES.length + 1);
    expect(dayEndChoices("22:10").indexOf("22:10")).toBe(DAY_END_CHOICES.indexOf("22:00") + 1);
    expect(dayEndChoices("whenever")).toEqual(DAY_END_CHOICES);
  });

  it("plays at the day's time, once, and only with something to tell", () => {
    expect(dayEndDue(base)).toBe("time");
    expect(dayEndDue({ ...base, now: at(21, 59) })).toBeNull();
    expect(dayEndDue({ ...base, now: at(22, 0) })).toBe("time");
    // Already shown for today: not again; yesterday's showing doesn't count.
    expect(dayEndDue({ ...base, shownFor: "2026-10-13" })).toBeNull();
    expect(dayEndDue({ ...base, shownFor: "2026-10-12" })).toBe("time");
    expect(dayEndDue({ ...base, somethingToTell: false })).toBeNull();
    expect(dayEndDue({ ...base, dayEndAt: "" })).toBeNull();
    // Positions open but no trade logged: nothing to wait for.
    expect(dayEndDue({ ...base, lastTradeAt: 0 })).toBe("time");
  });

  it("a trade logged after the day's time: the time waits for a quiet moment", () => {
    // Nothing to tell at 22:00; the first trade comes at 22:40: not right behind it.
    expect(dayEndDue({ ...base, now: at(22, 40, 20), lastTradeAt: at(22, 40).getTime() })).toBeNull();
    expect(dayEndDue({ ...base, now: at(22, 44), lastTradeAt: at(22, 40).getTime() })).toBeNull();
    expect(dayEndDue({ ...base, now: at(22, 45), lastTradeAt: at(22, 40).getTime() })).toBe("time");
    expect(DAY_END_QUIET_MS).toBe(5 * 60_000);
    // Still trading at the time itself: the same wait.
    expect(dayEndDue({ ...base, now: at(22, 0), lastTradeAt: at(21, 59).getTime() })).toBeNull();
    expect(dayEndDue({ ...base, now: at(22, 4), lastTradeAt: at(21, 59).getTime() })).toBe("time");
    // A session end set is the moment the trader chose: no wait.
    expect(dayEndDue({ ...base, now: at(22, 0), lastTradeAt: at(21, 59).getTime(), sessionEndAt: at(22).getTime() })).toBe("session");
  });

  it("never while paused; a session end reached while paused waits for the unpause", () => {
    expect(dayEndDue({ ...base, paused: true })).toBeNull();
    expect(dayEndDue({ ...base, paused: true, sessionEndAt: at(21).getTime() })).toBeNull();
    // Unpaused at 23:00, the 21:00 session end still ends the day (companion.ts leaves it set while paused).
    expect(dayEndDue({ ...base, now: at(23), paused: false, sessionEndAt: at(21).getTime() })).toBe("session");
  });

  it("sizes the card by its tiles", () => {
    expect(dayEndRows(6, false)).toBe(6);
    expect(dayEndRows(5, false)).toBe(6);
    expect(dayEndRows(3, false)).toBe(3);
    expect(dayEndRows(2, false)).toBe(3);
    expect(dayEndRows(0, false)).toBe(3);
    expect(dayEndRows(6, true)).toBe(4);
    expect(dayEndRows(2, true)).toBe(2);
  });

  it("a session end set ends the day instead, whatever the time", () => {
    // The session ends later than the day's time: the time waits for it.
    expect(dayEndDue({ ...base, sessionEndAt: at(23).getTime() })).toBeNull();
    expect(dayEndDue({ ...base, now: at(23), sessionEndAt: at(23).getTime() })).toBe("session");
    // The session ends before the day's time, or with the time off: it still ends the day.
    expect(dayEndDue({ ...base, now: at(15), sessionEndAt: at(14, 30).getTime() })).toBe("session");
    expect(dayEndDue({ ...base, now: at(15), dayEndAt: "", sessionEndAt: at(14, 30).getTime() })).toBe("session");
    // Once for the day, the session end included.
    expect(dayEndDue({ ...base, now: at(15), sessionEndAt: at(14, 30).getTime(), shownFor: "2026-10-13" })).toBeNull();
  });
});

describe("the board", () => {
  const trades = { count: 3, wins: 2, losses: 1, total: 1.6, unit: "SOL" };
  const entries = [
    { t: at(10, 5).getTime(), pnl: 1.2, symbol: "WICK" },
    { t: at(11, 40).getTime(), pnl: -0.4, symbol: "FROGE" },
    { t: at(13, 15).getTime(), pnl: 0.3, partial: true },
    { t: at(14, 0).getTime(), pnl: 0.5, tradePnl: 0.8 },
  ];

  it("lays the day out: PnL, trades with the win rate, best and worst, time in session", () => {
    const s = dayEndStats({ trades, positions: null, entries, sessionMs: 3 * 3600_000 + 12 * 60_000 });
    expect(s.map((x) => x.label)).toEqual(["Day PnL", "Trades", "Win rate", "Best trade", "Worst trade", "In session"]);
    expect(s[0].format(s[0].value)).toBe("+1.60 SOL");
    expect(s[0].tone).toBe("up");
    expect(s[1]).toMatchObject({ value: 3, sub: "2W / 1L" });
    expect(s[2].format(s[2].value)).toBe("67%");
    expect(s[3]).toMatchObject({ value: 1.2, sub: "WICK", tone: "up" });
    expect(s[4]).toMatchObject({ value: -0.4, sub: "FROGE", tone: "down" });
    expect(s[5].format(s[5].value)).toBe("3h 12m");
  });

  it("names a typed trade by its note, else its time; a closed position by its whole result; skips the parts sold", () => {
    const typed = [
      { t: at(9, 5).getTime(), pnl: -2 },
      { t: at(9, 30).getTime(), pnl: 0.1, partial: true },
      { t: at(16, 45).getTime(), pnl: 0.2, tradePnl: 2.5, symbol: "CANDLE" },
    ];
    const trades = { count: 2, wins: 1, losses: 1, total: 0.8, unit: "SOL" };
    const s = dayEndStats({ trades, positions: null, entries: typed, sessionMs: 0 });
    expect(s.find((x) => x.label === "Best trade")).toMatchObject({ value: 2.5, sub: "CANDLE" });
    expect(s.find((x) => x.label === "Worst trade")).toMatchObject({ value: -2, sub: "09:05" });
    // With the journal: the note's start names it (matched by the trade's time); a long note is cut at a word.
    const journal = [
      { id: "a", t: at(9, 5).getTime(), pnl: -2, note: "chased the WIF breakout, late" },
      { id: "b", t: at(16, 45).getTime(), pnl: 2.5, note: "Auto: CANDLE closed (+$300)" },
    ];
    const named = dayEndStats({ trades, positions: null, entries: typed, journal, sessionMs: 0 });
    expect(named.find((x) => x.label === "Worst trade")).toMatchObject({ sub: "chased the WIF…" });
    expect(named.find((x) => x.label === "Best trade")).toMatchObject({ sub: "CANDLE" });
    const short = dayEndStats({ trades, positions: null, entries: typed, journal: [{ ...journal[0], note: "  scalp  " }], sessionMs: 0 });
    expect(short.find((x) => x.label === "Worst trade")).toMatchObject({ sub: "scalp" });
    const blank = dayEndStats({ trades, positions: null, entries: typed, journal: [{ ...journal[0], note: " " }], sessionMs: 0 });
    expect(blank.find((x) => x.label === "Worst trade")).toMatchObject({ sub: "09:05" });
  });

  it("counts the numbers up on the way", () => {
    const s = dayEndStats({ trades, positions: null, entries, sessionMs: 60_000 });
    expect(s[0].format(s[0].value * 0.5)).toBe("+0.80 SOL");
    expect(s[1].format(1.4)).toBe("1");
    expect(s[2].format(33.3)).toBe("33%");
    expect(s[5].format(0)).toBe("0s");
  });

  it("a day with only one trade has no worst; with none, only the count and the time", () => {
    const one = dayEndStats({ trades: { count: 1, wins: 1, losses: 0, total: 1, unit: "SOL" }, positions: null, entries: [entries[0]], sessionMs: 0 });
    expect(one.map((x) => x.label)).toEqual(["Day PnL", "Trades", "Win rate", "Best trade", "In session"]);
    const none = dayEndStats({ trades: { count: 0, wins: 0, losses: 0, total: 0, unit: "SOL" }, positions: null, entries: [], sessionMs: 0 });
    expect(none.map((x) => x.label)).toEqual(["Trades", "In session"]);
    expect(none[0].sub).toBeUndefined();
  });

  it("with no trade but positions open, shows what they are worth", () => {
    const s = dayEndStats({
      trades: { count: 0, wins: 0, losses: 0, total: 0, unit: "SOL" },
      positions: { count: 2, openPnl: 120, cost: 400, realizedToday: 0 },
      entries: [],
      sessionMs: 0,
    });
    expect(s[0]).toMatchObject({ label: "Open positions", value: 120, sub: "2 tokens", tone: "up" });
    expect(s[0].format(120)).toBe("+$120");
  });

  it("staggers the count-up and settles each number", () => {
    expect(countProgress(0, 0)).toBe(0);
    expect(countProgress(0, COUNT_MS)).toBe(1);
    expect(countProgress(0, COUNT_MS / 2)).toBeGreaterThan(0.5); // eases out: fast first
    expect(countProgress(2, 2 * COUNT_STAGGER_MS)).toBe(0);
    expect(countProgress(2, 2 * COUNT_STAGGER_MS + COUNT_MS)).toBe(1);
    expect(countDoneAt(6)).toBe(5 * COUNT_STAGGER_MS + COUNT_MS);
    expect(countDoneAt(0)).toBe(COUNT_MS);
  });
});

describe("the setting", () => {
  it("has its default, keeps a chosen off, and drops a time that isn't one", () => {
    expect(normalizeSettings(null).companion).toMatchObject({ dayEndAt: "22:00", dayEndShown: "" });
    expect(normalizeSettings({ companion: { dayEndAt: "" } } as never).companion.dayEndAt).toBe("");
    expect(normalizeSettings({ companion: { dayEndAt: "20:30", dayEndShown: "2026-10-12" } } as never).companion).toMatchObject({ dayEndAt: "20:30", dayEndShown: "2026-10-12" });
    expect(normalizeSettings({ companion: { dayEndAt: "whenever", dayEndShown: 5 } } as never).companion).toMatchObject({ dayEndAt: "22:00", dayEndShown: "" });
  });
});
