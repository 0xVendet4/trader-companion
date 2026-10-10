// The economic calendar: the hours when the whole market moves (US CPI, the
// Fed's decisions, the jobs report…), with a heads-up before each. The source
// is Forex Factory's public weekly export (no key); it has no CORS headers, so
// the app reads it through Rust (`economic_calendar`) and the dev server
// through its /api/calendar proxy. Only the US's high-impact releases count:
// those are what move crypto. Pure, and tested.

import { N_, currentLang, t } from "../core/i18n";

/** One line of the calendar. Its texts come from a third party: shown as text only. */
export interface MacroEvent {
  title: string;
  /** Forex Factory's currency code: USD, EUR… */
  country: string;
  /** When it is released (ms). */
  at: number;
  impact: "High" | "Medium" | "Low" | "Holiday";
  forecast: string;
  previous: string;
}

/** Releases at the same moment (CPI m/m, Core CPI m/m, CPI y/y at 8:30), under one name. */
export interface Release {
  key: string;
  at: number;
  country: string;
  /** What to call it: "CPI", "Fed rate decision"… */
  name: string;
  events: MacroEvent[];
}

export interface Calendar {
  events: MacroEvent[];
  fetchedAt: number;
}

/** Read again every few hours: the week's file changes little, and a new week starts on Sunday. */
export const CALENDAR_TTL_MS = 3 * 60 * 60_000;
/** After a failed read, the next try. */
export const CALENDAR_RETRY_MS = 30 * 60_000;
/** The heads-up choices, minutes before (0: off). */
export const CALENDAR_LEADS = [0, 15, 30, 60] as const;
/** The header's chip shows the next release from this far ahead. */
export const CHIP_AHEAD_MS = 24 * 60 * 60_000;
/** A heads-up that comes late (the app just started) still shows this long after the release. */
const LATE_MS = 2 * 60_000;
const COUNTRIES = new Set(["USD"]);
const IMPACTS = new Set(["High", "Medium", "Low", "Holiday"]);
const MAX_EVENTS = 300;

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Reads the weekly export; what does not look right is skipped. Sorted by time. */
export function parseCalendar(json: unknown): MacroEvent[] {
  if (!Array.isArray(json)) return [];
  const out: MacroEvent[] = [];
  for (const row of json.slice(0, MAX_EVENTS)) {
    const r = row as Record<string, unknown> | null;
    if (!r || typeof r !== "object") continue;
    const at = typeof r.date === "string" ? Date.parse(r.date) : NaN;
    const title = clip(r.title, 80);
    const impact = clip(r.impact, 10);
    if (!Number.isFinite(at) || !title || !IMPACTS.has(impact)) continue;
    out.push({
      title,
      country: clip(r.country, 6).toUpperCase(),
      at,
      impact: impact as MacroEvent["impact"],
      forecast: clip(r.forecast, 16),
      previous: clip(r.previous, 16),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Short names for the releases traders watch, the most important first, and the header chip's word. */
const NAMES: [RegExp, string, string][] = [
  [/federal funds rate/i, N_("Fed rate decision"), "FED"],
  [/fomc press conference/i, N_("FOMC press conference"), "FOMC"],
  [/fomc (statement|economic projections)/i, N_("FOMC"), "FOMC"],
  [/fomc meeting minutes/i, N_("FOMC minutes"), "FOMC"],
  [/\bcpi\b/i, N_("CPI"), "CPI"],
  [/non-farm employment/i, N_("jobs report"), "NFP"],
  [/\bpce\b/i, N_("PCE inflation"), "PCE"],
  [/\bppi\b/i, N_("PPI"), "PPI"],
  [/\bgdp\b/i, N_("GDP"), "GDP"],
  [/fed chair .*speaks/i, N_("Fed Chair speech"), "FED"],
  [/unemployment rate/i, N_("unemployment rate"), "JOBS"],
  [/average hourly earnings/i, N_("wages"), "JOBS"],
  [/retail sales/i, N_("retail sales"), "RETAIL"],
  [/ism manufacturing/i, N_("ISM manufacturing"), "ISM"],
  [/ism services/i, N_("ISM services"), "ISM"],
  [/jolts/i, N_("JOLTS job openings"), "JOLTS"],
  [/unemployment claims/i, N_("jobless claims"), "CLAIMS"],
];

/** What to call a release: the most important of its lines, or its first line's own title. */
export function releaseName(events: MacroEvent[]): string {
  for (const [re, name] of NAMES) if (events.some((e) => re.test(e.title))) return name;
  return events[0]?.title ?? "";
}

/** A release's name in Candy's language: one of NAMES translated, a third party's title as it came. */
const shownName = (name: string) => (NAMES.some(([, n]) => n === name) ? t(name) : name);

/** The header chip's word for a release: "CPI", "FED"; "MACRO" for one without a short name. */
export function chipWord(r: Release): string {
  return NAMES.find(([, name]) => name === r.name)?.[2] ?? "MACRO";
}

const PLACE: Record<string, string> = { USD: N_("US"), EUR: N_("Euro area"), GBP: N_("UK"), JPY: N_("Japan"), CNY: N_("China") };

/** "US CPI", "US Fed rate decision". */
export function releaseLabel(r: Release): string {
  const place = PLACE[r.country];
  return place ? t("{place} {name}", { place: t(place), name: shownName(r.name) }) : shownName(r.name);
}

/** The US's high-impact releases, grouped by moment. */
export function releases(events: MacroEvent[]): Release[] {
  const groups = new Map<string, MacroEvent[]>();
  for (const e of events) {
    if (e.impact !== "High" || !COUNTRIES.has(e.country)) continue;
    const k = `${e.country}|${e.at}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([k, evs]) => ({ key: `${k}|${releaseName(evs)}`, at: evs[0].at, country: evs[0].country, name: releaseName(evs), events: evs }))
    .sort((a, b) => a.at - b.at);
}

/** The releases whose heads-up is due now and has not been shown (`shown`: their keys). */
export function dueHeadsUps(all: Release[], now: number, leadMin: number, shown: ReadonlySet<string>): Release[] {
  if (leadMin <= 0) return [];
  const lead = leadMin * 60_000;
  return all.filter((r) => !shown.has(r.key) && now >= r.at - lead && now < r.at + LATE_MS);
}

/** The next release still to come within `aheadMs`, for the header's chip. */
export function nextRelease(all: Release[], now: number, aheadMs = CHIP_AHEAD_MS): Release | null {
  return all.find((r) => r.at > now && r.at - now <= aheadMs) ?? null;
}

/** "in 25 min", "in 3 h", "now", "4 min ago". */
export function untilWords(ms: number): string {
  if (ms <= -60_000) return t("{minutes} min ago", { minutes: Math.round(-ms / 60_000) });
  if (ms < 60_000) return t("now");
  const min = Math.round(ms / 60_000);
  if (min < 60) return t("in {minutes} min", { minutes: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m && h < 6 ? t("in {hours} h {minutes} min", { hours: h, minutes: m }) : t("in {hours} h", { hours: h });
}

/** The heads-up's title: "US CPI in 30 min", "US CPI now". */
export function headsUpTitle(label: string, ms: number): string {
  return t("{release} {when}", { release: label, when: untilWords(ms) });
}

/** The chip's few characters: "25m", "3h", "now". */
export function untilShort(ms: number): string {
  if (ms < 60_000) return t("now");
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min}m` : `${Math.round(min / 60)}h`;
}

/** The chip's tooltip: the releases still to come this week, in local time. */
export function weekLines(all: Release[], now: number, max = 6): string[] {
  return all
    .filter((r) => r.at > now - LATE_MS)
    .slice(0, max)
    .map((r) => {
      const d = new Date(r.at);
      const when = `${d.toLocaleDateString(currentLang(), { weekday: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `${when} · ${releaseLabel(r)} (${untilWords(r.at - now)})`;
    });
}

/** Each line of a release with what is expected and what came before: "CPI m/m: forecast 0.3%, previous 0.4%". */
export function releaseLines(r: Release): string[] {
  return r.events.map((e) => {
    // The title is Forex Factory's own: it goes in as it came.
    const p = { title: e.title, forecast: e.forecast, previous: e.previous };
    if (e.forecast && e.previous) return t("{title}: forecast {forecast}, previous {previous}", p);
    if (e.forecast) return t("{title}: forecast {forecast}", p);
    if (e.previous) return t("{title}: previous {previous}", p);
    return e.title;
  });
}
