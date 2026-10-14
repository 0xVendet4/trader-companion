// Late at night Candy dresses for bed: striped pyjamas and a nightcap, from
// midnight to 6 am, and he yawns more. Like the seasonal looks (seasons.ts) it
// is worn over the trader's own pick and never saved over it: a costume wins
// (no pyjamas over one), and so does a look picked that night. Pure: hand in
// a date.

import { todayKey } from "../discipline/discipline";

/** Local hours of pyjamas: from midnight to before 6 am. */
export const PYJAMAS_FROM = 0;
export const PYJAMAS_TO = 6;

/** The hat worn with the pyjamas (mascot.json → outfits). */
export const NIGHTCAP = "nightcap";

export function isPyjamaTime(d: Date): boolean {
  const h = d.getHours();
  return h >= PYJAMAS_FROM && h < PYJAMAS_TO;
}

/** Names one night ("night 2026-10-14"), so a look picked during it lasts until morning; null by day. */
export function nightKey(d: Date): string | null {
  return isPyjamaTime(d) ? `night ${todayKey(d)}` : null;
}

/**
 * Whether Candy wears his pyjamas now: the night look is on (Settings), no
 * costume is worn, and the trader didn't pick a look of their own tonight
 * (`nightOff` holds that night's key).
 */
export function wearsPyjamas(d: Date, enabled: boolean, nightOff: string, costume: string): boolean {
  if (!enabled || costume !== "none") return false;
  const key = nightKey(d);
  return key != null && key !== nightOff;
}

/**
 * What changes when the clock crosses into or out of the night: the island
 * puts the look on again when this changes (a new day may also start a season).
 */
export function lookKey(d: Date): string {
  return `${todayKey(d)}${isPyjamaTime(d) ? " night" : ""}`;
}
