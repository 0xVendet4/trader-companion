// The global shortcuts: what each does, its default keys, and the pure rules
// for recording new ones in Settings. Adapted from Coucou's shortcuts (MIT, ©
// Louis Raillé). On Windows Ctrl+Alt is AltGr, so the defaults avoid the keys
// that type a character with AltGr on the usual European and Brazilian (ABNT2)
// layouts; the app also asks Windows what each Ctrl+Alt combination types on
// the layouts installed, and leaves alone one that types something.

export type ShortcutId = "toggle" | "paste" | "alert" | "nextTab" | "prevTab" | "mute" | "wardrobe" | "desktop";

export interface ShortcutDef {
  id: ShortcutId;
  label: string;
  /** Its keys out of the box ("" = off until set). */
  dflt: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: "toggle", label: "Show / hide the island", dflt: "CommandOrControl+Shift+Space" },
  { id: "paste", label: "Add the copied token", dflt: "CommandOrControl+Alt+V" },
  { id: "alert", label: "Open the waiting alert", dflt: "CommandOrControl+Alt+A" },
  { id: "nextTab", label: "Next tab", dflt: "CommandOrControl+Alt+Right" },
  { id: "prevTab", label: "Previous tab", dflt: "CommandOrControl+Alt+Left" },
  { id: "mute", label: "Mute / unmute", dflt: "CommandOrControl+Alt+S" },
  { id: "wardrobe", label: "Wardrobe", dflt: "CommandOrControl+Alt+G" },
  { id: "desktop", label: "Candy to the desktop, or home", dflt: "CommandOrControl+Alt+D" },
];

/** What a shortcut's registration came to, for Settings. */
export type ShortcutStatus = { kind: "on" } | { kind: "off" } | { kind: "inUse" } | { kind: "twice" } | { kind: "types"; char: string };

/** The keys a shortcut has: the show/hide and paste ones keep their own settings (older files have them). */
export function shortcutKeys(c: { hotkey: string; pasteHotkey: string; shortcuts: Partial<Record<ShortcutId, string>> }, id: ShortcutId): string {
  if (id === "toggle") return c.hotkey;
  if (id === "paste") return c.pasteHotkey;
  const set = c.shortcuts[id];
  return typeof set === "string" ? set : (SHORTCUTS.find((s) => s.id === id)?.dflt ?? "");
}

/** A key as an accelerator names it, from a KeyboardEvent's `code`; null for one that can't be a shortcut key. */
export function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const f = /^F([1-9]|1[0-2])$/.exec(code);
  if (f) return code;
  const named: Record<string, string> = {
    Space: "Space",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    ArrowUp: "Up",
    ArrowDown: "Down",
    Enter: "Enter",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Minus: "Minus",
    Equal: "Equal",
  };
  return named[code] ?? null;
}

/**
 * The accelerator a key press records, or null while it is only modifiers or
 * has no Ctrl, Alt or Win: a global shortcut on a bare letter would steal it
 * from every program. F-keys may go alone.
 */
export function recordPress(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code: string }): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("CommandOrControl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Super");
  const fkey = /^F\d+$/.test(key);
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !fkey) return null;
  return [...mods, key].join("+");
}

/** How keys read in Settings: "Ctrl + Alt + V". */
export function keysLabel(accel: string): string {
  if (!accel) return "Off";
  return accel
    .split("+")
    .map((p) => ({ CommandOrControl: "Ctrl", Super: "Win", Left: "←", Right: "→", Up: "↑", Down: "↓", Comma: ",", Period: ".", Slash: "/", Minus: "-", Equal: "=" })[p] ?? p)
    .join(" + ");
}

/** The shortcuts set to the same keys as another one. */
export function twice(keys: Partial<Record<ShortcutId, string>>): Set<ShortcutId> {
  const seen = new Map<string, ShortcutId[]>();
  for (const [id, k] of Object.entries(keys) as [ShortcutId, string][]) {
    if (!k) continue;
    const norm = k.toLowerCase();
    seen.set(norm, [...(seen.get(norm) ?? []), id]);
  }
  const out = new Set<ShortcutId>();
  for (const ids of seen.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

/**
 * What to do with each shortcut before the OS is asked: its keys to register,
 * or why not. `types[i]` is what SHORTCUTS[i]'s keys type on this PC ("" =
 * nothing); of two shortcuts on the same keys, the first one keeps them.
 */
export function planShortcuts(keys: Record<ShortcutId, string>, types: readonly string[]): { id: ShortcutId; register?: string; status?: ShortcutStatus }[] {
  const seen = new Set<string>();
  return SHORTCUTS.map((d, i) => {
    const k = keys[d.id];
    if (!k) return { id: d.id, status: { kind: "off" } };
    if (types[i]) return { id: d.id, status: { kind: "types", char: types[i] } };
    const norm = k.toLowerCase();
    if (seen.has(norm)) return { id: d.id, status: { kind: "twice" } };
    seen.add(norm);
    return { id: d.id, register: k };
  });
}

/** Steps through the tabs shown, wrapping round; from a view that is not one of them, the first (or last). */
export function stepTab<T>(tabs: readonly T[], current: T, step: 1 | -1): T | null {
  if (!tabs.length) return null;
  const at = tabs.indexOf(current);
  if (at < 0) return step > 0 ? tabs[0] : tabs[tabs.length - 1];
  return tabs[(at + step + tabs.length) % tabs.length];
}

/** What a status reads as next to the keys. */
export function statusLabel(s: ShortcutStatus | undefined): string {
  if (!s) return "";
  switch (s.kind) {
    case "on":
    case "off":
      return "";
    case "inUse":
      return "In use by another app";
    case "twice":
      return "Used twice";
    case "types":
      return `Types “${s.char}” on your keyboard`;
  }
}
