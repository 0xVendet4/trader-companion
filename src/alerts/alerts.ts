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
  priceAbove: "Price above",
  priceBelow: "Price below",
  mcapAbove: "Market cap above",
  mcapBelow: "Market cap below",
  pctUp: "Up at least",
  pctDown: "Down at least",
  liqDrop: "Liquidity drops",
};

export function usesWindow(kind: AlertKind): boolean {
  return kind === "pctUp" || kind === "pctDown" || kind === "liqDrop";
}

export function usesPercent(kind: AlertKind): boolean {
  return usesWindow(kind);
}

/** "Price above $0.0₅35", "Up at least 20% in 5 min". */
export function describeRule(rule: AlertRule): string {
  const label = KIND_LABELS[rule.kind];
  switch (rule.kind) {
    case "priceAbove":
    case "priceBelow":
      return `${label} ${formatPrice(rule.value)}`;
    case "mcapAbove":
    case "mcapBelow":
      return `${label} ${formatUsd(rule.value)}`;
    default:
      return `${label} ${rule.value}% in ${rule.windowMin} min`;
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
    const token = tokens.find((t) => t.key === rule.address);
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
  const sym = token.symbol;
  const detail = `MC ${formatUsd(quote.marketCap)} · ${formatPrice(quote.priceUsd)} · liq ${formatUsd(quote.liquidityUsd)}`;
  switch (rule.kind) {
    case "priceAbove":
      return { title: `${sym} hit ${formatPrice(quote.priceUsd)}`, detail, tone: "up" };
    case "priceBelow":
      return { title: `${sym} fell to ${formatPrice(quote.priceUsd)}`, detail, tone: "down" };
    case "mcapAbove":
      return { title: `${sym} crossed ${formatUsd(rule.value)} market cap`, detail, tone: "up" };
    case "mcapBelow":
      return { title: `${sym} dropped below ${formatUsd(rule.value)} market cap`, detail, tone: "down" };
    case "pctUp":
      return { title: `${sym} ${formatPct(measured)} in ${rule.windowMin} min`, detail, tone: "up" };
    case "pctDown":
      return { title: `${sym} ${formatPct(measured)} in ${rule.windowMin} min`, detail, tone: "down" };
    case "liqDrop":
      return {
        title: `${sym} liquidity down ${Math.round(measured ?? 0)}% in ${rule.windowMin} min`,
        detail: `Could be liquidity being pulled. ${detail}`,
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
