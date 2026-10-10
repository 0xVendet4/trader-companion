// The checklist that comes up when a token is added: what is worth a look
// before any entry, each line with what RugCheck and DexScreener say about it.
// Candy goes over it himself, line by line, and sums it up (src/views/event.ts).
// It states what the data shows; it never says whether to buy.

import { formatAge, formatUsd } from "../core/format";
import { currentLang, t, tn } from "../core/i18n";
import type { Quote, SafetyReport } from "../core/state";

export type CheckId = "mint" | "freeze" | "lp" | "holders" | "age" | "liquidity";

export interface CheckItem {
  id: CheckId;
  label: string;
  /** "ok": the data looks fine; "warn": worth a closer look; "unknown": no data (check it yourself). */
  state: "ok" | "warn" | "unknown";
  detail: string;
  /** RugCheck hasn't answered yet: Candy waits on this line (see RUGCHECK_WAIT_MS). */
  waiting?: true;
}

/** How long Candy waits on RugCheck before he moves on without it. */
export const RUGCHECK_WAIT_MS = 8000;

export const CHECK_IDS: readonly CheckId[] = ["mint", "freeze", "lp", "holders", "age", "liquidity"];

/** Younger than this, a pair reads as brand new. */
const NEW_PAIR_MS = 60 * 60_000;
/** Less backed liquidity than this is thin. */
const THIN_LIQUIDITY = 10_000;
/** Less of the pool locked than this is worth a look. */
const LOW_LP_LOCK = 50;

/**
 * The checklist for a token. `safety` is RugCheck's report (Solana only):
 * undefined while it loads, null where there is none.
 */
export function checklistFor(quote: Quote | undefined, safety: SafetyReport | null | undefined, now = Date.now()): CheckItem[] {
  const risk = (re: RegExp) => safety?.risks.find((r) => re.test(r.name) && r.level !== "info");
  const noReport = (id: CheckId, label: string): CheckItem =>
    safety === undefined
      ? { id, label, state: "unknown", detail: t("Waiting for RugCheck…"), waiting: true }
      : { id, label, state: "unknown", detail: t("No RugCheck report: check it yourself") };
  const fromRugcheck = (id: CheckId, label: string, re: RegExp, okText: string): CheckItem => {
    if (!safety) return noReport(id, label);
    const r = risk(re);
    // RugCheck's own words for a risk: shown as they came.
    return r ? { id, label, state: "warn", detail: r.value ? `${r.name} (${r.value})` : r.name } : { id, label, state: "ok", detail: okText };
  };

  const items: CheckItem[] = [
    fromRugcheck("mint", t("Mint authority"), /mint authority/i, t("Revoked: no new tokens can be made")),
    fromRugcheck("freeze", t("Freeze authority"), /freeze authority/i, t("Revoked: holders can't be frozen")),
  ];

  // Locked liquidity: RugCheck's share, or its own flag.
  const lpLabel = t("Liquidity locked");
  if (!safety) items.push(noReport("lp", lpLabel));
  else {
    const unlocked = risk(/lp unlocked|liquidity.*unlocked|unlocked.*liquidity/i);
    const pct = safety.lpLockedPct;
    const locked = pct != null ? t("{pct}% locked", { pct: Math.round(pct) }) : null;
    if (unlocked || (pct != null && pct < LOW_LP_LOCK)) items.push({ id: "lp", label: lpLabel, state: "warn", detail: locked ?? unlocked!.name });
    else items.push({ id: "lp", label: lpLabel, state: pct != null ? "ok" : "unknown", detail: locked ?? t("RugCheck doesn't say") });
  }

  items.push(fromRugcheck("holders", t("Top holders"), /holder/i, t("No holder concentration flagged")));

  const created = quote?.pairCreatedAt;
  if (created == null) items.push({ id: "age", label: t("Age"), state: "unknown", detail: t("Pair age unknown") });
  else items.push({ id: "age", label: t("Age"), state: now - created < NEW_PAIR_MS ? "warn" : "ok", detail: t("Pair created {age} ago", { age: formatAge(created, now) }) });

  const liqLabel = t("Real liquidity");
  if (!quote || quote.liquidityUsd == null) items.push({ id: "liquidity", label: liqLabel, state: "unknown", detail: t("No liquidity figure yet") });
  else if (quote.suspectLiquidity)
    items.push({ id: "liquidity", label: liqLabel, state: "warn", detail: t("Reported far above what backs it ({usd} backed)", { usd: formatUsd(quote.liquidityUsd) }) });
  else
    items.push({
      id: "liquidity",
      label: liqLabel,
      state: quote.liquidityUsd < THIN_LIQUIDITY ? "warn" : "ok",
      detail: t("{usd} backed by SOL / USDC", { usd: formatUsd(quote.liquidityUsd) }),
    });
  return items;
}

/** The lines still waiting on RugCheck once Candy has stopped waiting for it. */
export function stopWaiting(items: CheckItem[]): CheckItem[] {
  return items.map((i) => (i.waiting ? { id: i.id, label: i.label, state: "unknown", detail: t("RugCheck didn't answer: check it yourself") } : i));
}

export interface CheckSummary {
  ok: number;
  warn: number;
  unknown: number;
  /** For the card: what Candy found, the lines worth a look by name. */
  line: string;
  /** For his bubble, in his own words. */
  say: string;
  /** What decides his face: anything flagged, else anything he couldn't check. */
  tone: "ok" | "warn" | "unknown";
}

/** What Candy says once he has gone over the checklist. Counts of what the data shows, nothing about buying. */
export function checklistSummary(items: CheckItem[], name: string): CheckSummary {
  const ok = items.filter((i) => i.state === "ok").length;
  const flagged = items.filter((i) => i.state === "warn");
  const warn = flagged.length;
  const unknown = items.length - ok - warn;
  // Each part stands on its own ("3 look fine"), so the line is a list of them.
  const parts: string[] = [];
  if (ok === items.length) parts.push(t("nothing flagged"));
  else if (ok) parts.push(tn(ok, "{n} looks fine", "{n} look fine"));
  // English names them in lower case mid-sentence; other languages keep their own case (German nouns).
  const named = flagged.map((i) => (currentLang() === "en" ? i.label.toLowerCase() : i.label));
  if (warn) parts.push(tn(warn, "{n} worth a closer look ({labels})", "{n} worth a closer look ({labels})", { labels: named.join(", ") }));
  if (unknown) parts.push(tn(unknown, "{n} he couldn't check", "{n} he couldn't check"));
  const line = tn(items.length, "{name} checked {n}: {parts}.", "{name} checked {n}: {parts}.", { name, parts: parts.join(", ") });
  const say = warn ? tn(warn, "{n} to look at", "{n} to look at") : unknown ? tn(unknown, "{n} I couldn't check", "{n} I couldn't check") : t("nothing flagged!");
  return { ok, warn, unknown, line, say, tone: warn ? "warn" : unknown ? "unknown" : "ok" };
}
