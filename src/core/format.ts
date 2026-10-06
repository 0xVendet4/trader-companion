// Number formatting the way memecoin traders read it: market caps in K/M/B,
// tiny prices with the zero count in subscript ($0.0₅3924), signed percentages.

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

function subscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
}

/** $1.23, $0.0123, $0.0₅3924 — four significant digits after the zeros. */
export function formatPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "—";
  if (price === 0) return "$0";
  if (price >= 1000) return `$${compact(price)}`;
  if (price >= 1) return `$${price.toFixed(price >= 100 ? 2 : 3)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  // Leading zeros after "0." — 0.000003924 has 5. Corrected afterwards, since
  // log10 of an exact power of ten can land a hair either side of the integer.
  let zeros = Math.max(0, Math.ceil(-Math.log10(price)) - 1);
  if (price * 10 ** (zeros + 1) < 1) zeros++;
  if (zeros > 0 && price * 10 ** zeros >= 1) zeros--;
  // Four significant digits; 9.9996 rounds up into the next decade.
  let digits = Math.round(price * 10 ** (zeros + 4));
  if (digits >= 10_000) {
    zeros = Math.max(0, zeros - 1);
    digits = 1000;
  }
  const sig = String(digits).replace(/0+$/, "") || "0";
  if (zeros < 3) return `$0.${"0".repeat(zeros)}${sig}`;
  return `$0.0${subscript(zeros)}${sig}`;
}

/** 950, 12.3K, 1.23M, 4.5B. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  return `${sign}${Math.round(abs)}`;
}

function trim(v: number): string {
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${compact(n)}`;
}

/** +4.2%, −12%, +1.2K% — the minus sign is a real minus so columns line up. */
export function formatPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  if (Math.abs(p) < 0.05) return "0.0%";
  const abs = Math.abs(p);
  const body = abs >= 1000 ? `${compact(abs)}` : abs >= 100 ? abs.toFixed(0) : abs.toFixed(1);
  return `${p >= 0 ? "+" : "−"}${body}%`;
}

export function pctClass(p: number | null | undefined): "up" | "down" | "flat" {
  if (p == null || !Number.isFinite(p) || Math.abs(p) < 0.05) return "flat";
  return p > 0 ? "up" : "down";
}

/** +0.5 SOL, −1.25 SOL. */
export function formatPnl(n: number, unit: string): string {
  const abs = Math.abs(n);
  const body = abs >= 100 ? abs.toFixed(0) : abs >= 10 ? abs.toFixed(1) : abs.toFixed(2);
  return `${n >= 0 ? "+" : "−"}${body} ${unit}`;
}

/** 1h 05m, 12m, 45s. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** 4:05 — for countdowns. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Shortens a Solana address for display: 7xKX…gAsU. */
export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

/** Parses "1,5", "0.0012", "1.2k", "3M", "$45K" into a number. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/^\$/, "").replace(/\s/g, "").replace(",", ".").toLowerCase();
  const m = /^(-?\d*\.?\d+)([kmb]?)$/.exec(s);
  if (!m) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  const v = Number(m[1]) * mult;
  return Number.isFinite(v) ? v : null;
}

/** How old something is: 45s, 12m, 5h, 3d, 2mo. */
export function formatAge(since: number | null | undefined, now = Date.now()): string {
  if (since == null || !Number.isFinite(since)) return "—";
  const s = Math.max(0, (now - since) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 86_400 * 60) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (86_400 * 30))}mo`;
}

/** A coin price for the header: $2,713 · $120.4 · $0.9921. */
export function formatCoin(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "—";
  if (price >= 1000) return `$${Math.round(price).toLocaleString("en-US")}`;
  if (price >= 1) return `$${price.toFixed(1)}`;
  return formatPrice(price);
}
