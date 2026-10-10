import { describe, expect, it } from "vitest";
import { chipWord, dueHeadsUps, headsUpTitle, nextRelease, parseCalendar, releaseLabel, releaseLines, releases, untilShort, untilWords, weekLines } from "./calendar";

// Shaped like Forex Factory's weekly export.
const WEEK = [
  { title: "CPI m/m", country: "USD", date: "2026-10-14T08:30:00-04:00", impact: "High", forecast: "0.3%", previous: "0.4%" },
  { title: "Core CPI m/m", country: "USD", date: "2026-10-14T08:30:00-04:00", impact: "High", forecast: "0.3%", previous: "0.3%" },
  { title: "CPI y/y", country: "USD", date: "2026-10-14T08:30:00-04:00", impact: "Medium", forecast: "2.9%", previous: "2.9%" },
  { title: "BOE Gov Bailey Speaks", country: "GBP", date: "2026-10-13T08:15:00-04:00", impact: "High", forecast: "", previous: "" },
  { title: "FOMC Statement", country: "USD", date: "2026-10-15T14:00:00-04:00", impact: "High", forecast: "", previous: "" },
  { title: "Federal Funds Rate", country: "USD", date: "2026-10-15T14:00:00-04:00", impact: "High", forecast: "3.75%", previous: "4.00%" },
  { title: "Crude Oil Inventories", country: "USD", date: "2026-10-14T10:30:00-04:00", impact: "Low", forecast: "", previous: "" },
  { title: "Bad date", country: "USD", date: "soon", impact: "High" },
  { title: "<b>Weird</b>", country: "USD", date: "2026-10-16T08:30:00-04:00", impact: "Extreme" },
  null,
];
const CPI_AT = Date.parse("2026-10-14T12:30:00Z");
const FED_AT = Date.parse("2026-10-15T18:00:00Z");

describe("economic calendar", () => {
  it("reads the weekly export, skipping what does not look right", () => {
    const events = parseCalendar(WEEK);
    expect(events).toHaveLength(7);
    expect(events[0].title).toBe("BOE Gov Bailey Speaks");
    expect(events.find((e) => e.title === "CPI m/m")).toMatchObject({ at: CPI_AT, forecast: "0.3%", previous: "0.4%", country: "USD" });
    expect(parseCalendar({ not: "a list" })).toEqual([]);
  });

  it("keeps the US's high-impact releases, one per moment, under a short name", () => {
    const all = releases(parseCalendar(WEEK));
    expect(all.map((r) => releaseLabel(r))).toEqual(["US CPI", "US Fed rate decision"]);
    expect(all[0].events.map((e) => e.title)).toEqual(["CPI m/m", "Core CPI m/m"]);
    expect(releaseLines(all[0])).toEqual(["CPI m/m: forecast 0.3%, previous 0.4%", "Core CPI m/m: forecast 0.3%, previous 0.3%"]);
    expect(releaseLines(all[1])[0]).toBe("FOMC Statement");
  });

  it("gives each heads-up once, from the lead time until just after the release", () => {
    const all = releases(parseCalendar(WEEK));
    const shown = new Set<string>();
    expect(dueHeadsUps(all, CPI_AT - 31 * 60_000, 30, shown)).toEqual([]);
    const due = dueHeadsUps(all, CPI_AT - 30 * 60_000, 30, shown);
    expect(due.map((r) => r.name)).toEqual(["CPI"]);
    shown.add(due[0].key);
    expect(dueHeadsUps(all, CPI_AT - 10 * 60_000, 30, shown)).toEqual([]);
    // Started late: still told, just after.
    expect(dueHeadsUps(all, CPI_AT + 60_000, 30, new Set())).toHaveLength(1);
    expect(dueHeadsUps(all, CPI_AT + 5 * 60_000, 30, new Set())).toHaveLength(0);
    expect(dueHeadsUps(all, CPI_AT - 10 * 60_000, 0, new Set())).toHaveLength(0);
  });

  it("finds the next release for the header within a day", () => {
    const all = releases(parseCalendar(WEEK));
    expect(nextRelease(all, CPI_AT - 3 * 3600_000)?.name).toBe("CPI");
    // The Fed is a day and a half after CPI: nothing to show in between.
    expect(nextRelease(all, CPI_AT + 1000)).toBeNull();
    expect(nextRelease(all, FED_AT - 20 * 3600_000)?.name).toBe("Fed rate decision");
    expect(nextRelease(all, FED_AT - 20 * 3600_000, 3600_000)).toBeNull();
    expect(nextRelease(all, FED_AT + 1)).toBeNull();
  });

  it("says how long until it", () => {
    expect(untilWords(25 * 60_000)).toBe("in 25 min");
    expect(untilWords(90 * 60_000)).toBe("in 1 h 30 min");
    expect(untilWords(8 * 3600_000)).toBe("in 8 h");
    expect(untilWords(20_000)).toBe("now");
    expect(untilWords(-4 * 60_000)).toBe("4 min ago");
    expect(untilShort(25 * 60_000)).toBe("25m");
    expect(untilShort(3 * 3600_000)).toBe("3h");
    expect(untilShort(0)).toBe("now");
    expect(headsUpTitle("US CPI", 30 * 60_000)).toBe("US CPI in 30 min");
  });

  it("names each release on the header's chip and lists the rest of the week", () => {
    const all = releases(parseCalendar(WEEK));
    expect(all.map(chipWord)).toEqual(["CPI", "FED"]);
    expect(chipWord({ ...all[0], name: "Treasury Currency Report" })).toBe("MACRO");
    const lines = weekLines(all, CPI_AT - 3600_000);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d · US CPI \(in 1 h\)$/);
    expect(weekLines(all, CPI_AT + 10 * 60_000)).toHaveLength(1);
  });
});
