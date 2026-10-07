// Thin wrapper over the Tauri commands/events. In a plain browser (`npm run
// dev`) every call falls back to something harmless — settings go to
// localStorage and links open in a new tab — so the UI can be built and
// checked without compiling Rust.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the island lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  /** The OS the app runs on (absent in a browser). */
  os?: string;
  /** False where the cursor can't be read across the screen (see State.cursorPoll). */
  cursorPoll?: boolean;
}

function devLoad(): Settings {
  try {
    const raw = localStorage.getItem(DEV_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSettings(null);
  }
}

export const Bridge = {
  async boot(): Promise<BootInfo> {
    const info = await call<BootInfo>("boot");
    if (info) return { ...info, settings: normalizeSettings(info.settings) };
    return {
      settings: devLoad(),
      screen: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight, scale: 1 },
      version: "dev",
    };
  },

  async saveSettings(settings: Settings): Promise<void> {
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
    if (!IS_TAURI) return "Updates come with the app.";
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
