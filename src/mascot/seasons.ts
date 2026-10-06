// Seasonal looks: for a few days a year Candy dresses for the occasion, over
// the trader's own pick (who can turn it off). Pure: hand in a date.

import type { Face, Outfit } from "../core/state";

export interface SeasonLook {
  name: string;
  hat?: Outfit;
  face?: Face;
}

/** Names one season's run ("Christmas 2026"), so a choice can last for it. */
export function seasonKey(d: Date): string | null {
  const s = seasonalLook(d);
  if (!s) return null;
  // New Year straddles two years: count it with the December.
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  return `${s.name} ${year}`;
}

/**
 * The seasonal look to wear: none when the trader turned seasons off, or
 * picked their own look during this season (`seasonOff` holds its key).
 */
export function activeSeason(d: Date, seasonal: boolean, seasonOff: string): SeasonLook | null {
  if (!seasonal) return null;
  const key = seasonKey(d);
  return key && key !== seasonOff ? seasonalLook(d) : null;
}

/** The look for a local date, or null on an ordinary day. */
export function seasonalLook(d: Date): SeasonLook | null {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return { name: "New Year", hat: "party" };
  if (m === 12 && day <= 26) return { name: "Christmas", hat: "santa" };
  if (m === 10 && day >= 24) return { name: "Halloween", hat: "pumpkin" };
  if (m === 2 && (day === 13 || day === 14)) return { name: "Valentine's Day", face: "heartglasses" };
  return null;
}
