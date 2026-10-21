export interface RdapInfo {
  registrar: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  updatedAt: number | null;
  /** Two-letter country code from registrant address, or inferred from ccTLD. */
  country: string | null;
  /** Up to 4 authoritative nameservers (lowercased). */
  nameservers: string[];
}

/**
 * Parse an IANA RDAP domain response.
 * Pure function — no network, fully unit-testable.
 */
export function parseRdap(json: unknown): RdapInfo {
  const result: RdapInfo = {
    registrar: null,
    createdAt: null,
    expiresAt: null,
    updatedAt: null,
    country: null,
    nameservers: [],
  };
  if (!json || typeof json !== "object") return result;
  const obj = json as Record<string, unknown>;

  // Events → dates
  if (Array.isArray(obj.events)) {
    for (const ev of obj.events) {
      if (!ev || typeof ev !== "object") continue;
      const event = ev as Record<string, unknown>;
      const action = event.eventAction;
      const date = typeof event.eventDate === "string" ? Date.parse(event.eventDate) : NaN;
      if (!Number.isFinite(date)) continue;
      if (action === "registration") result.createdAt = date;
      else if (action === "expiration") result.expiresAt = date;
      else if (action === "last changed") result.updatedAt = date;
    }
  }

  // Nameservers at top level
  if (Array.isArray(obj.nameservers)) {
    result.nameservers = (obj.nameservers as unknown[])
      .map((ns) => (ns && typeof ns === "object" ? ((ns as Record<string, unknown>).ldhName as string | undefined) : undefined))
      .filter((n): n is string => typeof n === "string" && n.length > 0)
      .map((n) => n.toLowerCase())
      .slice(0, 4);
  }

  // Entities → registrar name + country
  if (Array.isArray(obj.entities)) {
    for (const entity of obj.entities) {
      if (!entity || typeof entity !== "object") continue;
      const e = entity as Record<string, unknown>;
      const roles = Array.isArray(e.roles) ? e.roles : [];
      const vcard = Array.isArray(e.vcardArray) ? (e.vcardArray[1] as unknown[]) : null;

      if (roles.includes("registrar") && !result.registrar) {
        if (Array.isArray(vcard)) {
          for (const prop of vcard) {
            if (!Array.isArray(prop)) continue;
            if (prop[0] === "fn" && typeof prop[3] === "string") {
              result.registrar = prop[3].trim() || null;
              break;
            }
          }
        }
        if (!result.registrar && typeof e.handle === "string") result.registrar = e.handle;
      }

      // Country from adr vcard property (any entity role)
      if (!result.country && Array.isArray(vcard)) {
        for (const prop of vcard) {
          if (!Array.isArray(prop) || prop[0] !== "adr") continue;
          // adr value: ["", pobox, ext, street, locality, region, postal, country]
          const adr = prop[3];
          if (Array.isArray(adr)) {
            const cc = adr[adr.length - 1];
            if (typeof cc === "string" && /^[A-Z]{2}$/.test(cc.toUpperCase())) {
              result.country = cc.toUpperCase();
              break;
            }
          } else if (typeof adr === "string") {
            // Some registrars return a plain text address; last line might be a country.
            const lines = adr.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
            const last = lines[lines.length - 1];
            if (last && /^[A-Z]{2}$/.test(last.toUpperCase())) result.country = last.toUpperCase();
          }
        }
      }
    }
  }

  return result;
}

/** A country's name in Candy's language ("BR" → "Brasil" in pt, "Brazil" in en), or the code when unknown. */
export function countryName(cc: string, lang: string): string {
  const code = cc.toUpperCase();
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
