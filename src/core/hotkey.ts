// The show/hide shortcut. In the app it is global (works from any program);
// in a browser it only works while the page has focus.

import { IS_TAURI } from "./bridge";

export const HOTKEY_CHOICES: [string, string][] = [
  ["CommandOrControl+Shift+Space", "Ctrl + Shift + Space"],
  ["Alt+Shift+Space", "Alt + Shift + Space"],
  ["CommandOrControl+Alt+T", "Ctrl + Alt + T"],
  ["", "Off"],
];

export function hotkeyLabel(accel: string): string {
  return HOTKEY_CHOICES.find(([a]) => a === accel)?.[1] ?? accel.replace(/CommandOrControl/g, "Ctrl").replace(/\+/g, " + ");
}

/** Does this key event match an accelerator like "CommandOrControl+Shift+Space"? */
export function matches(accel: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; code: string; key: string }): boolean {
  if (!accel) return false;
  const parts = accel.split("+");
  const key = parts.pop()!.toLowerCase();
  const want = new Set(parts.map((p) => p.toLowerCase()));
  const ctrl = want.has("commandorcontrol") || want.has("control") || want.has("ctrl");
  if (ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (want.has("shift") !== e.shiftKey) return false;
  if (want.has("alt") !== e.altKey) return false;
  const pressed = e.code === "Space" ? "space" : e.key.toLowerCase();
  return pressed === key;
}

let unbind: (() => void) | null = null;

/** Binds `accel` to `onPress`, replacing any previous binding. */
export async function bindHotkey(accel: string, onPress: () => void): Promise<void> {
  unbind?.();
  unbind = null;
  if (!accel) return;
  if (IS_TAURI) {
    try {
      const gs = await import("@tauri-apps/plugin-global-shortcut");
      await gs.register(accel, (e) => {
        if (e.state === "Pressed") onPress();
      });
      unbind = () => void gs.unregister(accel);
    } catch (err) {
      console.error("[companion] shortcut", err);
    }
    return;
  }
  const fn = (e: KeyboardEvent) => {
    if (!matches(accel, e)) return;
    e.preventDefault();
    onPress();
  };
  window.addEventListener("keydown", fn);
  unbind = () => window.removeEventListener("keydown", fn);
}
