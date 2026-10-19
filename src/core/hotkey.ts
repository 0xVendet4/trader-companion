// The global shortcuts (src/core/shortcuts.ts lists them): registered here, by
// the island. In the app they work from any program; in a browser only while
// the page has focus.

import { IS_TAURI } from "./bridge";
import { keyName, type ShortcutId } from "./shortcuts";

/** Does this key event match an accelerator like "CommandOrControl+Shift+Space"? */
export function matches(accel: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string; key: string }): boolean {
  if (!accel) return false;
  const parts = accel.split("+");
  const key = parts.pop()!.toLowerCase();
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const ctrl = want.has("commandorcontrol") || want.has("control") || want.has("ctrl");
  const sup = want.has("super") || want.has("meta");
  // CommandOrControl is ⌘ on a Mac: there the Meta key stands for it.
  if (ctrl !== (e.ctrlKey || (!sup && e.metaKey))) return false;
  if (sup !== e.metaKey && !(ctrl && !sup && !e.ctrlKey)) return false;
  if (want.has("shift") !== e.shiftKey) return false;
  if (want.has("alt") !== e.altKey) return false;
  const named = e.code ? keyName(e.code) : null;
  const pressed = (named ?? (e.key === " " ? "space" : e.key)).toLowerCase();
  return pressed === key;
}

/** How a registration went: "inUse" when another program holds the keys. */
export type BindResult = "on" | "off" | "inUse";

/** One binding per shortcut: a new one replaces the old one. */
const bound = new Map<ShortcutId, { accel: string; release: () => Promise<void> }>();

/** Binds `accel` to `onPress` for shortcut `slot`, replacing its previous binding. */
export async function bindHotkey(accel: string, onPress: () => void, slot: ShortcutId = "toggle"): Promise<BindResult> {
  await unbindHotkey(slot);
  if (!accel) return "off";
  if (IS_TAURI) {
    try {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      await gs.register(accel, (e) => {
        if (e.state === "Pressed") onPress();
      });
      bound.set(slot, { accel, release: () => gs.unregister(accel).catch(() => {}) });
      return "on";
    } catch (err) {
      console.error("[companion] shortcut", slot, err);
      return "inUse";
    }
  }
  const fn = (e: KeyboardEvent) => {
    if (!matches(accel, e)) return;
    e.preventDefault();
    onPress();
  };
  window.addEventListener("keydown", fn);
  bound.set(slot, {
    accel,
    release: async () => window.removeEventListener("keydown", fn),
  });
  return "on";
}

export async function unbindHotkey(slot: ShortcutId): Promise<void> {
  const b = bound.get(slot);
  bound.delete(slot);
  await b?.release();
}

/** Lets go of every shortcut (Settings is recording a new one). */
export async function unbindAll(): Promise<void> {
  await Promise.all([...bound.keys()].map((slot) => unbindHotkey(slot)));
}
