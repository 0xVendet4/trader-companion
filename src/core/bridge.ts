// Thin wrapper over the Tauri commands/events. In a plain browser (`npm run
// dev`) every call falls back to something harmless — settings go to
// localStorage and links open in a new tab — so the UI can be built and
// checked without compiling Rust.

import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { t } from "./i18n";
import { normalizeSettings, type Settings } from "./state";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEV_KEY = "trader-companion.settings";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[companion] ${cmd} failed`, err);
    return null;
  }
}

/** How the desktop Candy's window works here (desktop.rs DesktopInfo). */
export type DesktopMode = "poll" | "window" | "off";

export interface DesktopInfo {
  mode: DesktopMode;
  /** He was on the desktop when the app last quit. */
  onDesktop: boolean;
  /** His window is on screen right now (a page loading late missed the news). */
  shown?: boolean;
}

/** An event for one window only (island ⇄ desktop Candy). Never throws. */
export async function emitToWindow(label: string, event: string, payload?: unknown) {
  if (!IS_TAURI) return;
  try {
    await emitTo(label, event, payload);
  } catch (err) {
    console.error(`[companion] emit ${event} failed`, err);
  }
}

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the island lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  /** The OS the app runs on (absent in a browser). */
  os?: string;
  /** False where the cursor can't be read across the screen (see State.cursorPoll). */
  cursorPoll?: boolean;
  /** The trader's first name from their OS account, for the greeting (src-tauri/src/identity.rs); null when it has none. */
  firstName?: string | null;
}

/** The browser's settings. Ones that can't be read are left alone: the page runs on defaults and saves nothing. */
function devLoad(): Settings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DEV_KEY);
    const s = normalizeSettings(raw ? JSON.parse(raw) : null);
    booted = true;
    return s;
  } catch {
    booted = raw == null;
    return normalizeSettings(null);
  }
}

/**
 * The settings were read in this page (from Rust in the app, from
 * localStorage in a browser). Until they have, the page holds only defaults,
 * and saving them would write an empty config over the trader's (a page
 * reloaded while the app restarts can miss Rust for a moment): nothing is
 * saved before.
 */
let booted = false;

export const Bridge = {
  async boot(): Promise<BootInfo> {
    if (IS_TAURI) {
      // Never the browser's fallback in the app: Rust is asked again, and a
      // page that still can't reach it stops here rather than run on defaults.
      for (let tries = 0; ; tries++) {
        try {
          const info = await invoke<BootInfo>("boot");
          booted = true;
          return { ...info, settings: normalizeSettings(info.settings) };
        } catch (err) {
          if (tries >= 20) throw err;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }
    return {
      settings: devLoad(),
      screen: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, scale: 1 },
      version: "dev",
    };
  },

  async saveSettings(settings: Settings): Promise<void> {
    if (!booted) {
      console.error("[companion] not saved: this page never read the settings");
      return;
    }
    if (IS_TAURI) {
      await call<void>("save_settings", { settings });
      return;
    }
    try {
      localStorage.setItem(DEV_KEY, JSON.stringify(settings));
    } catch {
      /* private window: nothing to keep */
    }
  },

  /** Candy's look on the tray icon: RGBA pixels, square, 16 to 64 px (see island/tray-icon.ts). */
  setTrayIcon: (rgba: number[], width: number, height: number) => call<void>("set_tray_icon", { rgba, width, height }),
  /** The tray icon's hover text (see mascot/tray.ts trayTooltip). */
  setTrayTooltip: (text: string) => call<void>("set_tray_tooltip", { text }),
  /** The tray menu's six items and the settings window's title, in the trader's language. */
  setUiLabels: (tray: string[], settingsTitle: string) => call<void>("set_ui_labels", { tray, settingsTitle }),
  /** An alert's notification with Open and Mute 1 h (`buttons`: their words; Windows); false where there is none. */
  async notifyAlert(title: string, body: string, key: string, buttons: [string, string]): Promise<boolean> {
    return (await call<boolean>("notify_alert", { title, body, key, buttons })) ?? false;
  },

  /** Shrink the window down to the invisible wake strip (hidden) or back to full. */
  setCollapsed: (collapsed: boolean) => call<void>("set_collapsed", { collapsed }),

  /** Pushes the island shape in window coordinates for the click-through test. */
  setIslandRect: (x: number, y: number, width: number, height: number) =>
    call<void>("set_island_rect", { x, y, width, height }),

  /** Give the window keyboard focus (a text field) and take it away again. */
  focusWindow: (focused: boolean) => call<void>("focus_window", { focused }),

  reposition: () => call<void>("reposition"),

  /**
   * The floating island was pressed: Rust moves the window with the mouse
   * until the button is let go, then sends "float-drag-end".
   */
  startFloatDrag: () => call<void>("start_float_drag"),

  /** Only https links to the known trading sites are opened (see lib.rs). */
  async openUrl(url: string): Promise<void> {
    if (IS_TAURI) {
      await call<boolean>("open_url", { url });
      return;
    }
    window.open(url, "_blank", "noopener");
  },

  quit: () => call<void>("quit_app"),

  openSettingsWindow: async () => {
    if (IS_TAURI) await call<void>("open_settings_window");
    else window.open("/settings.html", "_blank");
  },

  /** Writes to %LOCALAPPDATA%\TraderCompanion\companion.log. */
  log: (message: string) => call<void>("log_line", { message }),

  /** The newest version on GitHub (src-tauri/src/update.rs), or null: offline, or a browser. */
  checkUpdate: () => call<string>("check_update"),

  /** Downloads the new code and starts its installer; resolves to what went wrong, or null once under way. */
  async startUpdate(): Promise<string | null> {
    if (!IS_TAURI) return t("Updates come with the app.");
    try {
      await invoke("start_update");
      return null;
    } catch (err) {
      return String(err);
    }
  },

  /**
   * A read-only Solana RPC call (getBalance, getTokenAccountsByOwner). The
   * public RPC refuses requests made from a web page, so the app goes through
   * Rust, and the browser (npm run dev) through the dev server's /api/rpc
   * proxy (vite.config.ts).
   */
  async rpc<T>(method: string, params: unknown[]): Promise<T> {
    if (IS_TAURI) return invoke<T>("solana_rpc", { method, params });
    const res = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null;
    if (!res.ok || !json || json.error) throw new Error(json?.error?.message ?? `Solana RPC returned ${res.status}`);
    return json.result as T;
  },

  /**
   * This week's economic calendar, as Forex Factory exports it (see
   * src/market/calendar.ts): through Rust in the app, through the dev server's
   * /api/calendar proxy in a browser (it sends no CORS headers).
   */
  async economicCalendar(): Promise<unknown> {
    if (IS_TAURI) return invoke<unknown>("economic_calendar");
    const res = await fetch("/api/calendar", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`the calendar returned ${res.status}`);
    return res.json();
  },

  /** Which of these sound files the trader put in the sounds folder (src-tauri/src/sounds.rs). */
  customSounds: (names: string[]) => call<string[]>("custom_sounds", { names }),
  /** The bytes of one of them, to decode. */
  customSound: (name: string) => call<ArrayBuffer>("custom_sound", { name }),
  /** Settings → Open sounds folder. */
  revealSoundsFolder: () => call<void>("reveal_sounds_folder"),
  /** Settings → Reload: tells the island to read the folder again. */
  reloadSounds: () => call<void>("reload_sounds"),
  /** Watches what plays on the PC (src-tauri/src/music.rs); the island hears "now-playing" and "now-playing-art". */
  setMediaWatch: (on: boolean) => call<void>("set_media_watch", { on }),
  /** A button on the music card: playPause, next, previous, seek (s), shuffle / repeat (1, 0), volume (0–1). */
  mediaControl: (action: string, value?: number) => call<boolean>("media_control", { action, value: value ?? null }),

  // ── Candy on the desktop (src-tauri/src/desktop.rs) ───────────────────────
  desktopInfo: () => call<DesktopInfo>("desktop_info"),
  /** Dragged out of the island: (x, y) is the pointer in island-window coordinates. */
  desktopPickUp: (x: number, y: number) => call<boolean>("desktop_pick_up", { x, y }),
  /** Linux: the pointer moved during that drag (Windows carries him from Rust). */
  desktopCarry: (x: number, y: number) => call<void>("desktop_carry", { x, y }),
  desktopCarryEnd: (x: number, y: number) => call<void>("desktop_carry_end", { x, y }),
  /** A drag started on the desktop Candy; resolves to his top-left corner, physical px. */
  desktopDragBegin: () => call<[number, number] | null>("desktop_drag_begin"),
  /** X11: top-left corner, physical pixels. */
  desktopDragMove: (x: number, y: number) => call<void>("desktop_drag_move", { x, y }),
  desktopDragEnd: (x: number, y: number) => call<void>("desktop_drag_end", { x, y }),
  /** From the island to his spot. False: no spot on any connected display; `anywhere`: the first-visit corner then. */
  desktopFlyOut: (anywhere = false) => call<boolean>("desktop_fly_out", { anywhere }),
  /** To the island, then hidden. `forget`: he lives in the island again. */
  desktopFlyHome: (forget: boolean) => call<boolean>("desktop_fly_home", { forget }),
  /** Asleep, the cursor poll stops. */
  desktopSetAsleep: (asleep: boolean) => call<void>("desktop_set_asleep", { asleep }),

  /** Windows: a game, a video or a presentation fills the screen (alerts wait); false elsewhere. */
  async fullscreenBusy(): Promise<boolean> {
    return (await call<boolean>("fullscreen_busy")) ?? false;
  },

  /** What each accelerator types with AltGr on this PC's keyboard layouts ("" = nothing; null in a browser). */
  shortcutTypes: (keys: string[]) => call<string[]>("shortcut_types", { keys }),

  /**
   * The clipboard's text for the paste shortcut, or null. The app reads it
   * without taking focus; a browser asks the page's clipboard, which may refuse.
   */
  async readClipboard(): Promise<string | null> {
    if (IS_TAURI) return call<string | null>("read_clipboard");
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  },

  /**
   * Copies text. The island never takes focus on its own, and the clipboard
   * API wants a focused page, so the app borrows focus for the moment.
   */
  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      if (!IS_TAURI) return false;
      await call<void>("focus_window", { focused: true });
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      } finally {
        await call<void>("focus_window", { focused: false });
      }
    }
  },
};

/** Copies a PNG, borrowing focus like `Bridge.copy`. */
export async function copyImage(png: Blob): Promise<boolean> {
  const write = () => navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  try {
    await write();
    return true;
  } catch {
    if (!IS_TAURI) return false;
    await call<void>("focus_window", { focused: true });
    try {
      await write();
      return true;
    } catch {
      return false;
    } finally {
      await call<void>("focus_window", { focused: false });
    }
  }
}

export async function onEvent<T>(name: string, handler: (payload: T) => void) {
  if (!IS_TAURI) return () => {};
  return listen<T>(name, (e) => handler(e.payload));
}

/**
 * Settings written by the other window. Rust broadcasts `settings-changed`;
 * in a browser the two pages share localStorage, whose `storage` event plays
 * the same part.
 */
export async function onSettingsChanged(handler: (s: Settings) => void) {
  if (IS_TAURI) {
    return listen<Settings>("settings-changed", (e) => handler(normalizeSettings(e.payload)));
  }
  const fn = (e: StorageEvent) => {
    if (e.key === DEV_KEY) handler(devLoad());
  };
  window.addEventListener("storage", fn);
  return () => window.removeEventListener("storage", fn);
}
