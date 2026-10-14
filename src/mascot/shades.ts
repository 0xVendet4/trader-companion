// Shades on a 2x: when a token the trader holds first reaches twice what was
// paid for it, Candy puts on dark shades by himself for a few seconds, then
// takes them off again. The trader's own face accessory is never touched: the
// shades go over it (see Mascot.wearShades). Pure: the island feeds it the
// positions it sees and plays what comes out.

/** The multiple that puts the shades on: a 2x. */
export const SHADES_AT = 2;
/**
 * Back under this, the next 2x counts again: a price hovering around 2x does
 * not put them on and off with every tick.
 */
export const SHADES_REARM = 1.8;
/** How long he keeps them on. */
export const SHADES_MS = 7000;
/** Shades due while the island was out of sight still go on if it comes back this soon. */
export const SHADES_PENDING_MS = 60_000;

/** The shades in the wardrobe's faces (mascot.json `faces`). */
export const SHADES_FACE = "shades";

/**
 * Face accessories worn below the eyes (a mustache, a scarf…): they stay on
 * under the shades. Anything else sits on the eyes (glasses, a mask, a
 * patch…), and fades out while the shades are on.
 */
const BELOW_EYES: ReadonlySet<string> = new Set([
  "mustache",
  "clownnose",
  "beard",
  "whiskers",
  "freckles",
  "bandaid",
  "lollipop",
  "bubblegum",
  "warpaint",
  "facemask",
  "scarf",
  "partyhorn",
  "pacifier",
  "rose",
  "bowtie",
  "goldchain",
]);

export function keepsFaceUnderShades(face: string): boolean {
  return BELOW_EYES.has(face);
}

/** One held token: its key and value over cost (null while its cost is unknown). */
export interface Held {
  key: string;
  multiple: number | null;
}

/**
 * The tokens that just reached 2x, and what to remember for next time (key →
 * at or over 2x). A token seen for the first time already at 2x (Candy just
 * started, or its entry was typed in) is only remembered: nothing crossed. One
 * that is sold is forgotten. Each crossing counts once: the same token puts
 * them on again only after it fell back under SHADES_REARM.
 */
export function shadesCrossings(seen: ReadonlyMap<string, boolean>, held: readonly Held[]): { crossed: string[]; seen: Map<string, boolean> } {
  const next = new Map<string, boolean>();
  const crossed: string[] = [];
  for (const { key, multiple } of held) {
    if (multiple == null || !Number.isFinite(multiple)) {
      // No cost known yet: keep what was known.
      const was = seen.get(key);
      if (was != null) next.set(key, was);
      continue;
    }
    const was = seen.get(key);
    if (was == null) {
      next.set(key, multiple >= SHADES_AT);
      continue;
    }
    if (!was && multiple >= SHADES_AT) {
      crossed.push(key);
      next.set(key, true);
    } else if (was && multiple < SHADES_REARM) next.set(key, false);
    else next.set(key, was);
  }
  return { crossed, seen: next };
}
