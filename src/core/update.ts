// Updates from source, asked first (see src-tauri/src/update.rs): which version
// is newer, and where to read what changed. Pure.

/** Where Candy's code lives: the same as REPO in src-tauri/src/update.rs. */
export const UPDATE_REPO = "0xVendet4/trader-companion";

/** What changed lately, for the update card's "What's new". */
export const WHATS_NEW_URL = `https://github.com/${UPDATE_REPO}/commits/main`;

/** How often the app asks GitHub for a newer version. */
export const UPDATE_CHECK_MS = 6 * 60 * 60_000;

/** "0.1.10" > "0.1.9": compares x.y.z numbers; anything unreadable is never newer. */
export function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const r = parse(remote);
  const l = parse(local);
  if (!r || !l) return false;
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] ?? 0;
    const b = l[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}
