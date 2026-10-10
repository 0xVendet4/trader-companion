// Token safety from RugCheck's public summary (no key, CORS open):
// mint/freeze authority still enabled, holder concentration, unlocked
// liquidity and the like, each flagged "danger" or "warn" by RugCheck.
//
// It is a hint, not a guarantee: a clean report does not make a token safe.

import { N_, t } from "../core/i18n";
import type { SafetyReport } from "../core/state";

const API = "https://api.rugcheck.xyz/v1/tokens";

/** The subset of /report/summary this app reads. */
export interface RugSummary {
  score_normalised?: number;
  lpLockedPct?: number | null;
  risks?: { name?: string; value?: string; level?: string }[] | null;
}

/** Reports are kept this long before being fetched again. */
export const SAFETY_TTL_MS = 15 * 60_000;

/** Below this share of locked liquidity, an otherwise clean token is "medium". */
const LOW_LP_LOCK = 50;

export function toSafety(s: RugSummary, now = Date.now()): SafetyReport {
  const risks = (s.risks ?? []).map((r) => ({
    name: String(r.name ?? t("Unknown risk")),
    value: String(r.value ?? ""),
    level: r.level === "danger" ? ("danger" as const) : r.level === "warn" ? ("warn" as const) : ("info" as const),
  }));
  const lp = typeof s.lpLockedPct === "number" && Number.isFinite(s.lpLockedPct) ? s.lpLockedPct : null;
  let level: SafetyReport["level"] = risks.some((r) => r.level === "danger")
    ? "high"
    : risks.some((r) => r.level === "warn")
      ? "medium"
      : "low";
  if (level === "low" && lp != null && lp < LOW_LP_LOCK) level = "medium";
  return { level, score: Math.round(s.score_normalised ?? 0), lpLockedPct: lp, risks, fetchedAt: now };
}

export async function fetchSafety(mint: string, signal?: AbortSignal): Promise<SafetyReport> {
  const res = await fetch(`${API}/${mint}/report/summary`, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`RugCheck returned ${res.status}`);
  return toSafety((await res.json()) as RugSummary);
}

export const SAFETY_LABEL: Record<SafetyReport["level"], string> = {
  low: N_("Low risk"),
  medium: N_("Some risks"),
  high: N_("High risk"),
};

/** Tooltip text: the level, each risk, locked liquidity, and the caveat. */
export function describeSafety(r: SafetyReport): string {
  const lines = [t("{level} · RugCheck score {score}/100", { level: t(SAFETY_LABEL[r.level]), score: r.score })];
  // RugCheck's own words for each risk: shown as they came.
  for (const risk of r.risks) lines.push(`${risk.level === "danger" ? "✖" : risk.level === "warn" ? "!" : "·"} ${risk.name}${risk.value ? ` (${risk.value})` : ""}`);
  if (r.risks.length === 0) lines.push(t("No risks flagged"));
  if (r.lpLockedPct != null) lines.push(t("Liquidity locked: {pct}%", { pct: Math.round(r.lpLockedPct) }));
  lines.push(t("A hint, not a guarantee. Click for the full report."));
  return lines.join("\n");
}

export const rugcheckUrl = (mint: string) => `https://rugcheck.xyz/tokens/${mint}`;
