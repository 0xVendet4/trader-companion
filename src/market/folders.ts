// Watchlist folders ("Runners", "Holds", "Watching"…): a name on each token.
// "All" shows every token; a token with no folder shows under All only.
// Pure helpers; the companion and the views do the rest.

import type { WatchToken } from "../core/state";

export const DEFAULT_FOLDERS = ["Runners", "Holds", "Watching"];
export const MAX_FOLDERS = 8;
export const MAX_FOLDER_NAME = 16;

/** The tokens a folder shows ("" = All). */
export function folderTokens(list: WatchToken[], folder: string): WatchToken[] {
  return folder ? list.filter((t) => t.folder === folder) : list;
}

/** A folder name as typed, cleaned up; null when it can't be one. */
export function cleanFolderName(raw: string, existing: string[]): string | null {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_FOLDER_NAME);
  if (!name || name.toLowerCase() === "all") return null;
  if (existing.some((f) => f.toLowerCase() === name.toLowerCase())) return null;
  return name;
}

/** Repairs saved folders: unique, short names; tokens keep only folders that exist. */
export function normalizeFolders(
  raw: unknown,
  tokens: WatchToken[],
  active: unknown,
): { folders: string[]; tokens: WatchToken[]; active: string } {
  const folders: string[] = [];
  for (const f of Array.isArray(raw) ? raw : DEFAULT_FOLDERS) {
    if (typeof f !== "string") continue;
    const name = cleanFolderName(f, folders);
    if (name && folders.length < MAX_FOLDERS) folders.push(name);
  }
  return {
    folders,
    tokens: tokens.map((t) => (t.folder && !folders.includes(t.folder) ? { ...t, folder: undefined } : t)),
    active: typeof active === "string" && folders.includes(active) ? active : "",
  };
}
