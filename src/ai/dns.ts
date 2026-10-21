export interface DnsInfo {
  a: string[];
  mx: string[];
  txt: string[];
}

/**
 * Parse a Cloudflare DNS-over-HTTPS `application/dns-json` response for one record type.
 * Pure function — no network, fully unit-testable.
 */
export function parseDoh(json: unknown, type: "A" | "AAAA" | "MX" | "TXT"): string[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.Answer)) return [];
  const typeNum = { A: 1, AAAA: 28, MX: 15, TXT: 16 }[type];
  return obj.Answer.filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .filter((r) => r.type === typeNum)
    .map((r) => String(r.data ?? "").trim())
    .filter(Boolean);
}
