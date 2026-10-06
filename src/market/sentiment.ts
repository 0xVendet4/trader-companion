// The crypto Fear & Greed index (alternative.me, public, no key). It moves
// once a day, so it is read at most once an hour.

export interface FearGreed {
  /** 0 (extreme fear) to 100 (extreme greed). */
  value: number;
  /** alternative.me's own words: "Fear", "Greed", "Extreme Fear"… */
  label: string;
  fetchedAt: number;
}

const URL = "https://api.alternative.me/fng/?limit=1";
export const FNG_TTL_MS = 60 * 60_000;

/** Reads alternative.me's answer; null when it is not what we expect. */
export function parseFearGreed(json: unknown, now: number): FearGreed | null {
  const row = (json as { data?: { value?: unknown; value_classification?: unknown }[] } | null)?.data?.[0];
  const value = Number(row?.value);
  if (!row || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const label = typeof row.value_classification === "string" ? row.value_classification.slice(0, 20) : fngWords(value);
  return { value: Math.round(value), label, fetchedAt: now };
}

/** Words for a value, when the API sends none. */
export function fngWords(value: number): string {
  if (value < 25) return "Extreme Fear";
  if (value < 45) return "Fear";
  if (value <= 55) return "Neutral";
  if (value <= 75) return "Greed";
  return "Extreme Greed";
}

/** Colour band for the header chip. */
export function fngTone(value: number): "down" | "warn" | "flat" | "up" {
  if (value < 25) return "down";
  if (value < 45) return "warn";
  if (value <= 55) return "flat";
  return "up";
}

export async function fetchFearGreed(signal?: AbortSignal): Promise<FearGreed | null> {
  const res = await fetch(URL, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Fear & Greed returned ${res.status}`);
  return parseFearGreed(await res.json(), Date.now());
}
