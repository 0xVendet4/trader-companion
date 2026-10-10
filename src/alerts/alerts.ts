// Alert rules — pure functions, no DOM and no timers, so they can be tested.
//
// A rule fires when its condition *becomes* true, then stays quiet until the
// condition has been false again (and a short cool-down has passed). A price
// sitting on the target, or a pump that keeps pumping, is one alert, not one
// per poll. A rule whose condition is already true when it is created fires
// on the next poll, which is the user's answer to "is it there yet?".
//
// The texts state what happened in the data. They never suggest buying or
// selling: the app shows numbers, the trader decides.

import { formatPct, formatPrice, formatUsd } from "../core/format";
import { N_, t } from "../core/i18n";
import type { AlertKind, AlertRule, EventTone, Quote, Sample, WatchToken } from "../core/state";

/** Minimum time between two firings of the same rule. */
const COOLDOWN_MS: Record<AlertKind, number> = {
  priceAbove: 3 * 60_000,
  priceBelow: 3 * 60_000,
  mcapAbove: 3 * 60_000,
  mcapBelow: 3 * 60_000,
  pctUp: 10 * 60_000,
  pctDown: 10 * 60_000,
  liqDrop: 10 * 60_000,
};

/** History is kept a little longer than the longest window an alert can use. */
export const HISTORY_MS = 65 * 60_000;
export const WINDOW_CHOICES = [5, 15, 30, 60];

export const KIND_LABELS: Record<AlertKind, string> = {
  priceAbove: N_("Price above"),
  priceBelow: N_("Price below"),
  mcapAbove: N_("Market cap above"),
  mcapBelow: N_("Market cap below"),
  pctUp: N_("Up at least"),
  pctDown: N_("Down at least"),
  liqDrop: N_("Liquidity drops"),
};

export function usesWindow(kind: AlertKind): boolean {
  return kind === "pctUp" || kind === "pctDown" || kind === "liqDrop";
}

export function usesPercent(kind: AlertKind): boolean {
  return usesWindow(kind);
}

/** "Price above $0.0₅35", "Up at least 20% in 5 min". */
export function describeRule(rule: AlertRule): string {
  const price = formatPrice(rule.value);
  const level = formatUsd(rule.value);
  const p = { pct: rule.value, minutes: rule.windowMin };
  switch (rule.kind) {
    case "priceAbove":
      return t("Price above {price}", { price });
    case "priceBelow":
      return t("Price below {price}", { price });
    case "mcapAbove":
      return t("Market cap above {level}", { level });
    case "mcapBelow":
      return t("Market cap below {level}", { level });
    case "pctUp":
      return t("Up at least {pct}% in {minutes} min", p);
    case "pctDown":
      return t("Down at least {pct}% in {minutes} min", p);
    case "liqDrop":
      return t("Liquidity drops {pct}% in {minutes} min", p);
  }
}

/**
 * Price change over the last `windowMin` minutes, in percent, from our own
 * samples. Null until the samples cover at least 80% of the window — a
 * fresh start must not read two polls 20 s apart as "the last 15 minutes".
 */
export function changeOverWindow(history: Sample[], now: number, windowMin: number): number | null {
  if (history.length < 2) return null;
  const from = now - windowMin * 60_000;
  const first = history.find((s) => s.t >= from);
  const last = history[history.length - 1];
  if (!first || first === last || first.price <= 0) return null;
  if (last.t - first.t < windowMin * 60_000 * 0.8) return null;
  return (last.price / first.price - 1) * 100;
}

/**
 * The best available change for a window: our samples when they cover it,
 * otherwise DexScreener's own 5-minute and 1-hour figures for those windows.
 */
export function windowChange(
  history: Sample[],
  quote: Quote,
  now: number,
  windowMin: number,
): number | null {
  const own = changeOverWindow(history, now, windowMin);
  if (own != null) return own;
  if (windowMin === 5) return quote.change.m5;
  if (windowMin === 60) return quote.change.h1;
  return null;
}

/** Drop from the highest liquidity seen in the window to now, in percent. */
export function liquidityDrop(history: Sample[], now: number, windowMin: number): number | null {
  const from = now - windowMin * 60_000;
  const recent = history.filter((s) => s.t >= from && s.liq != null && s.liq > 0);
  if (recent.length < 2) return null;
  const max = Math.max(...recent.map((s) => s.liq as number));
  const cur = recent[recent.length - 1].liq as number;
  return (1 - cur / max) * 100;
}

export interface RuleCheck {
  /** Whether the condition holds right now. */
  active: boolean;
  /** The measured value behind it (percent for windowed rules). */
  measured: number | null;
}

export function checkRule(rule: AlertRule, quote: Quote, history: Sample[], now: number): RuleCheck {
  switch (rule.kind) {
    case "priceAbove":
      return { active: quote.priceUsd > 0 && quote.priceUsd >= rule.value, measured: quote.priceUsd };
    case "priceBelow":
      return { active: quote.priceUsd > 0 && quote.priceUsd <= rule.value, measured: quote.priceUsd };
    case "mcapAbove":
      return { active: quote.marketCap != null && quote.marketCap >= rule.value, measured: quote.marketCap };
    case "mcapBelow":
      return { active: quote.marketCap != null && quote.marketCap <= rule.value, measured: quote.marketCap };
    case "pctUp": {
      const c = windowChange(history, quote, now, rule.windowMin);
      return { active: c != null && c >= rule.value, measured: c };
    }
    case "pctDown": {
      const c = windowChange(history, quote, now, rule.windowMin);
      return { active: c != null && c <= -rule.value, measured: c };
    }
    case "liqDrop": {
      const d = liquidityDrop(history, now, rule.windowMin);
      return { active: d != null && d >= rule.value, measured: d };
    }
  }
}

/** Per-rule memory between polls. */
export interface RuleMemory {
  active: boolean;
  lastFired: number;
}

export interface Firing {
  rule: AlertRule;
  title: string;
  detail: string;
  tone: EventTone;
}

/**
 * Records where a rule stands without firing it. Used for the rules that
 * already existed when the app started: "WIF above $0.20" should not go off
 * on every launch just because WIF is still above $0.20.
 */
export function primeRule(
  rule: AlertRule,
  quote: Quote,
  history: Sample[],
  memory: Map<string, RuleMemory>,
  now: number,
) {
  memory.set(rule.id, { active: checkRule(rule, quote, history, now).active, lastFired: 0 });
}

/**
 * Runs every enabled rule against the latest quotes. Mutates `memory` and
 * returns the rules that fired this poll.
 */
export function evaluateRules(
  rules: AlertRule[],
  tokens: WatchToken[],
  quotes: Record<string, Quote>,
  history: Record<string, Sample[]>,
  memory: Map<string, RuleMemory>,
  now: number,
): Firing[] {
  const fired: Firing[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const quote = quotes[rule.address];
    const token = tokens.find((tok) => tok.key === rule.address);
    if (!quote || !token) continue;

    const check = checkRule(rule, quote, history[rule.address] ?? [], now);
    const mem = memory.get(rule.id) ?? { active: false, lastFired: 0 };
    const cooledDown = now - mem.lastFired >= COOLDOWN_MS[rule.kind];
    if (check.active && !mem.active && cooledDown) {
      mem.lastFired = now;
      fired.push({ rule, ...firingText(rule, token, quote, check.measured) });
    }
    mem.active = check.active;
    memory.set(rule.id, mem);
  }
  return fired;
}

function firingText(
  rule: AlertRule,
  token: WatchToken,
  quote: Quote,
  measured: number | null,
): { title: string; detail: string; tone: EventTone } {
  const symbol = token.symbol;
  const detail = t("MC {mcap} · {price} · liq {liq}", {
    mcap: formatUsd(quote.marketCap),
    price: formatPrice(quote.priceUsd),
    liq: formatUsd(quote.liquidityUsd),
  });
  switch (rule.kind) {
    case "priceAbove":
      return { title: t("{symbol} hit {price}", { symbol, price: formatPrice(quote.priceUsd) }), detail, tone: "up" };
    case "priceBelow":
      return { title: t("{symbol} fell to {price}", { symbol, price: formatPrice(quote.priceUsd) }), detail, tone: "down" };
    case "mcapAbove":
      return { title: t("{symbol} crossed {level} market cap", { symbol, level: formatUsd(rule.value) }), detail, tone: "up" };
    case "mcapBelow":
      return { title: t("{symbol} dropped below {level} market cap", { symbol, level: formatUsd(rule.value) }), detail, tone: "down" };
    case "pctUp":
      return { title: t("{symbol} {pct} in {minutes} min", { symbol, pct: formatPct(measured), minutes: rule.windowMin }), detail, tone: "up" };
    case "pctDown":
      return { title: t("{symbol} {pct} in {minutes} min", { symbol, pct: formatPct(measured), minutes: rule.windowMin }), detail, tone: "down" };
    case "liqDrop":
      return {
        title: t("{symbol} liquidity down {pct}% in {minutes} min", { symbol, pct: Math.round(measured ?? 0), minutes: rule.windowMin }),
        detail: t("Could be liquidity being pulled. {detail}", { detail }),
        tone: "warn",
      };
  }
}

/** Appends a sample and drops the ones older than HISTORY_MS. */
export function pushSample(list: Sample[], sample: Sample): Sample[] {
  const last = list[list.length - 1];
  // DexScreener caches for ~30 s: an identical reading is not new information.
  if (last && last.price === sample.price && last.liq === sample.liq && sample.t - last.t < 30_000) {
    return list;
  }
  const cutoff = sample.t - HISTORY_MS;
  const kept = list.filter((s) => s.t >= cutoff);
  kept.push(sample);
  return kept;
}

// ── Volume surges ─────────────────────────────────────────────────────────────

/** A token's volume alert stays quiet this long after it fired. */
export const VOLUME_ALERT_COOLDOWN_MS = 30 * 60_000;
/** Five minutes with less volume than this never count: dust. */
export const VOLUME_ALERT_MIN_USD = 10_000;

/**
 * The last 5 minutes' volume against the other eleven 5-minute slots of the
 * hour, as a multiple. Null for a major coin (no short-frame volume), for
 * dust, and when the rest of the hour had nothing to compare with.
 */
export function volumeSurge(q: Quote, minUsd = VOLUME_ALERT_MIN_USD): number | null {
  if (q.major) return null;
  const rest = q.volume.h1 - q.volume.m5;
  if (!(rest > 0) || q.volume.m5 < minUsd) return null;
  return q.volume.m5 / (rest / 11);
}

export interface VolumeFiring {
  token: WatchToken;
  ratio: number;
  title: string;
  detail: string;
  tone: EventTone;
}

/**
 * The watchlist tokens whose 5-minute volume runs `times` the hour's pace or
 * more, each at most once per VOLUME_ALERT_COOLDOWN_MS (`last` remembers when,
 * by key, and is updated). `times` 0 turns them off.
 */
export function volumeAlerts(
  tokens: WatchToken[],
  quotes: Record<string, Quote>,
  times: number,
  last: Map<string, number>,
  now: number,
): VolumeFiring[] {
  if (!(times > 0)) return [];
  const out: VolumeFiring[] = [];
  for (const token of tokens) {
    const q = quotes[token.key];
    const ratio = q ? volumeSurge(q) : null;
    if (!q || ratio == null || ratio < times) continue;
    if (now - (last.get(token.key) ?? 0) < VOLUME_ALERT_COOLDOWN_MS) continue;
    last.set(token.key, now);
    out.push({
      token,
      ratio,
      title: t("{symbol} volume {ratio}x the hour's pace", { symbol: token.symbol, ratio: Math.round(ratio) }),
      detail: t("{m5} traded in 5 min ({h1} in the hour) · price {pct} in 5 min", {
        m5: formatUsd(q.volume.m5),
        h1: formatUsd(q.volume.h1),
        pct: formatPct(q.change.m5),
      }),
      tone: q.change.m5 < 0 ? "down" : "up",
    });
  }
  return out;
}

// ── Market-cap milestones ─────────────────────────────────────────────────────

/** Round market caps worth a word when a watched token crosses them, either way. */
export const MCAP_MILESTONES = [1e6, 5e6, 10e6, 50e6, 100e6, 500e6, 1e9];
/** The same token and milestone stay quiet this long after firing: a cap hovering on the line. */
export const MILESTONE_COOLDOWN_MS = 60 * 60_000;

/** "$5M", "$1B": a round milestone, written round. */
const milestoneLabel = (level: number) => (level >= 1e9 ? `$${level / 1e9}B` : `$${level / 1e6}M`);

/**
 * The milestone a market cap crossed between two readings: going up, the
 * highest one passed; going down, the lowest one lost. Null when none was.
 */
export function crossedMilestone(prev: number | null | undefined, next: number | null | undefined): { level: number; up: boolean } | null {
  if (prev == null || next == null || !(prev > 0) || !(next > 0) || prev === next) return null;
  const up = next > prev;
  const crossed = MCAP_MILESTONES.filter((m) => (up ? prev < m && next >= m : prev >= m && next < m));
  if (!crossed.length) return null;
  return { level: up ? crossed[crossed.length - 1] : crossed[0], up };
}

/**
 * The milestone alert for one token between its previous quote and this one,
 * at most once per MILESTONE_COOLDOWN_MS for the same level (`last`, by key
 * and level, is updated). Major coins are left out.
 */
export function milestoneAlert(token: WatchToken, prev: Quote | undefined, q: Quote, last: Map<string, number>, now: number): VolumeFiring | null {
  if (q.major || !prev) return null;
  const hit = crossedMilestone(prev.marketCap, q.marketCap);
  if (!hit) return null;
  const id = `${token.key}:${hit.level}`;
  if (now - (last.get(id) ?? 0) < MILESTONE_COOLDOWN_MS) return null;
  last.set(id, now);
  const p = { symbol: token.symbol, level: milestoneLabel(hit.level) };
  return {
    token,
    ratio: hit.level,
    title: hit.up ? t("{symbol} passed {level} market cap", p) : t("{symbol} fell below {level} market cap", p),
    detail: t("MC {mcap} · price {pct} in 1 h · liq {liq}", {
      mcap: formatUsd(q.marketCap),
      pct: formatPct(q.change.h1),
      liq: formatUsd(q.liquidityUsd),
    }),
    tone: hit.up ? "up" : "down",
  };
}

// ── Sell pressure ─────────────────────────────────────────────────────────────

/** Sells per buy over 5 minutes that make it pressure. */
export const SELL_PRESSURE_RATIO = 2.5;
/** Fewer trades than this in 5 minutes never count: too little to read anything into. */
export const SELL_PRESSURE_MIN_TXNS = 40;
export const SELL_PRESSURE_COOLDOWN_MS = 30 * 60_000;

/** Sells per buy over the last 5 minutes; null for a major coin or too few trades. */
export function sellPressure(q: Quote): number | null {
  if (q.major) return null;
  const { buys, sells } = q.txnsM5;
  if (buys + sells < SELL_PRESSURE_MIN_TXNS) return null;
  return sells / Math.max(1, buys);
}

/**
 * The watched tokens where sells far outnumber buys over 5 minutes, each at
 * most once per SELL_PRESSURE_COOLDOWN_MS. Off: none.
 */
export function sellPressureAlerts(
  tokens: WatchToken[],
  quotes: Record<string, Quote>,
  on: boolean,
  last: Map<string, number>,
  now: number,
): VolumeFiring[] {
  if (!on) return [];
  const out: VolumeFiring[] = [];
  for (const token of tokens) {
    const q = quotes[token.key];
    const ratio = q ? sellPressure(q) : null;
    if (!q || ratio == null || ratio < SELL_PRESSURE_RATIO) continue;
    if (now - (last.get(token.key) ?? 0) < SELL_PRESSURE_COOLDOWN_MS) continue;
    last.set(token.key, now);
    out.push({
      token,
      ratio,
      title: t("{symbol}: {sells} sells and {buys} buys in 5 min", { symbol: token.symbol, sells: q.txnsM5.sells, buys: q.txnsM5.buys }),
      detail: t("Price {pct} in 5 min · {volume} traded · liq {liq}", {
        pct: formatPct(q.change.m5),
        volume: formatUsd(q.volume.m5),
        liq: formatUsd(q.liquidityUsd),
      }),
      tone: "down",
    });
  }
  return out;
}

/** A token's alerts silenced until a time (the alert card's "Mute 1 h"). */
export function isMuted(muted: Record<string, number>, key: string, now: number): boolean {
  return (muted[key] ?? 0) > now;
}

/** The mutes still running: the rest are dropped so the saved list stays short. */
export function liveMutes(muted: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(muted).filter(([, until]) => typeof until === "number" && until > now));
}
