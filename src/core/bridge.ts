// Thin wrapper over the Tauri commands/events. In a plain browser (`npm run
// dev`) every call falls back to something harmless — settings go to
// localStorage and links open in a new tab — so the UI can be built and
// checked without compiling Rust.

import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { t } from "./i18n";
import type { EvmChain } from "../market/chains";
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
  /** Dragged by how far the mouse goes, not by screen position (a layer surface: KDE, Sway…). */
  dragsByDelta?: boolean;
}

/**
 * In a browser the pages are tabs, not windows: a BroadcastChannel carries
 * the events between them, each tab answering to the label its page has in
 * the app (desktop.html "candy", the rest the island).
 */
let devChannel: BroadcastChannel | null | undefined;
function devEvents(): BroadcastChannel | null {
  if (devChannel === undefined) devChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("trader-companion.events") : null;
  return devChannel;
}
function devLabel(): string {
  const page = typeof location === "undefined" ? "" : location.pathname;
  return page.endsWith("/desktop.html") ? "candy" : "island";
}

/** An event for one window only (island ⇄ desktop Candy). Never throws. */
export async function emitToWindow(label: string, event: string, payload?: unknown) {
  if (!IS_TAURI) {
    devEvents()?.postMessage({ label, event, payload });
    return;
  }
  try {
    await emitTo(label, event, payload);
  } catch (err) {
    console.error(`[companion] emit ${event} failed`, err);
  }
}

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the island lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number; notch?: number };
  version: string;
  /** The OS the app runs on (absent in a browser). */
  os?: string;
  /** False where the cursor can't be read across the screen (see State.cursorPoll). */
  cursorPoll?: boolean;
  /** False where the island can't be placed (plain Wayland without layer-shell): top edge only. */
  canPlace?: boolean;
  /** The trader's first name from their OS account, for the greeting (src-tauri/src/identity.rs); null when it has none. */
  firstName?: string | null;
  /** True inside the Microsoft Store's package: the Store updates Candy, so no update check (see State.packaged). */
  packaged?: boolean;
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

/**
 * In a browser, the page's own listeners for settings saved in it (Settings
 * and the Closet are panels of the island's page now): what Rust's
 * settings-changed is in the app, which reaches every listener, the saving
 * page's own included, each with a copy of its own.
 */
const localListeners = new Set<(s: Settings) => void>();
function echoLocally(settings: Settings) {
  if (!localListeners.size) return;
  const json = JSON.stringify(settings);
  // Later, as Rust's echo comes: what the saver does next in the same turn is not overtaken.
  setTimeout(() => {
    for (const fn of [...localListeners]) fn(normalizeSettings(JSON.parse(json)));
  }, 0);
}

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
    echoLocally(settings);
  },

  /**
   * Settings changed in a page that saves nothing (the demo): its listeners
   * hear of them as of a save, and nothing is written.
   */
  previewSettings(settings: Settings) {
    if (!IS_TAURI) echoLocally(settings);
  },

  /** Candy's look on the tray icon: RGBA pixels, square, 16 to 64 px (see island/tray-icon.ts). */
  setTrayIcon: (rgba: number[], width: number, height: number) => call<void>("set_tray_icon", { rgba, width, height }),
  /** The tray icon's hover text (see mascot/tray.ts trayTooltip). */
  setTrayTooltip: (text: string) => call<void>("set_tray_tooltip", { text }),
  /** The tray menu's seven items, in the trader's language. */
  setUiLabels: (tray: string[]) => call<void>("set_ui_labels", { tray }),
  /** An alert's notification with Open and Mute 1 h (`buttons`: their words; Windows); false where there is none. */
  async notifyAlert(title: string, body: string, key: string, buttons: [string, string]): Promise<boolean> {
    return (await call<boolean>("notify_alert", { title, body, key, buttons })) ?? false;
  },

  /** A plain notification filed by the app under its own id (the Store package's differs); false where the page's plugin does it. */
  async notifyPlain(title: string, body: string): Promise<boolean> {
    return (await call<boolean>("notify_plain", { title, body })) ?? false;
  },

  /** The ticker on a screen edge lets clicks through until the cursor rests on it (island.rs). */
  setClickGuard: (on: boolean) => call<void>("set_click_guard", { on }),

  /**
   * Shrink the window down to the invisible wake strip (hidden) or back to full.
   * `asleep`: minimized, so the hidden island's edge doesn't bring it back.
   */
  setCollapsed: (collapsed: boolean, asleep = false) => call<void>("set_collapsed", { collapsed, asleep }),

  /** Pushes the island shape in window coordinates for the click-through test. */
  setIslandRect: (x: number, y: number, width: number, height: number) =>
    call<void>("set_island_rect", { x, y, width, height }),

  /** Where the ticker's mascot sits (layout.ts tickerSeat): Candy's flights to and from the desktop start and end there. */
  setTickerSeat: (x: number, y: number) => call<void>("set_ticker_seat", { x, y }),

  /** Give the window keyboard focus (a text field) and take it away again. */
  focusWindow: (focused: boolean) => call<void>("focus_window", { focused }),

  /**
   * Settings or the Closet open in the island (core/panel.ts): its window
   * grows to hold a panel of w × h (logical px; less on a small screen), takes
   * the mouse over all of it and the keyboard; closed, it goes back to the
   * island's own size and gives the keyboard back. Resolves to the window's
   * size as placed and where the island's own window sits from it (dx, dy),
   * logical px (null in a browser).
   */
  setPanel: (open: boolean, w = 0, h = 0) => call<{ w: number; h: number; dx: number; dy: number }>("set_panel", { open, width: w, height: h }),

  /** Where the panel's window would go for a panel of w × h, without moving it (a swap's target). */
  panelPlace: (w: number, h: number) => call<{ w: number; h: number; dx: number; dy: number }>("panel_place", { width: w, height: h }),

  /** The panel is closing: the mouse and the keyboard go back to the trader while the island shrinks (set_panel(false) follows). */
  panelClosing: () => call<void>("panel_closing"),

  reposition: () => call<void>("reposition"),

  /** The island's display as it is now (the same read as boot's); null in a browser. */
  async screenInfo(): Promise<BootInfo["screen"] | null> {
    return (await call<BootInfo>("boot"))?.screen ?? null;
  },

  /**
   * The floating island was pressed: Rust moves the window with the mouse
   * until the button is let go, then sends "float-drag-end".
   */
  startFloatDrag: () => call<void>("start_float_drag"),
  /** Without a cursor poll (Linux) the page drags the floating island: by (dx, dy), then let go. */
  floatDragBy: (dx: number, dy: number) => call<void>("float_drag_by", { dx, dy }),
  floatDragDone: (moved: boolean) => call<void>("float_drag_done", { moved }),

  /** Only https links to the known trading sites are opened (see lib.rs). */
  async openUrl(url: string): Promise<void> {
    if (IS_TAURI) {
      await call<boolean>("open_url", { url });
      return;
    }
    window.open(url, "_blank", "noopener");
  },

  quit: () => call<void>("quit_app"),

  /** Writes to %LOCALAPPDATA%\TraderCompanion\companion.log. */
  log: (message: string) => call<void>("log_line", { message }),

  /** The latest release's version on GitHub (src-tauri/src/update.rs), or null: offline, or a browser. */
  checkUpdate: () => call<string>("check_update"),

  /**
   * Downloads the release and installs it; resolves to how it went under way
   * ("installer": the release's installer or app, Candy closes by itself;
   * "build": its code, built here), or to what went wrong.
   */
  async startUpdate(version: string): Promise<{ how: "installer" | "build" } | { error: string }> {
    if (!IS_TAURI) return { error: t("Updates come with the app.") };
    try {
      const how = await invoke<string>("start_update", { version });
      return { how: how === "build" ? "build" : "installer" };
    } catch (err) {
      return { error: String(err) };
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
   * A read-only EVM RPC call on one chain (eth_getBalance, eth_call balanceOf,
   * eth_blockNumber, eth_getLogs; see src/wallets/evm.ts): through Rust in the
   * app (evm_rpc, which rebuilds the params and picks the chain's public
   * endpoints), through the dev server's /api/evm/<chain> proxy in a browser.
   */
  async evmRpc<T>(chain: EvmChain, method: string, params: unknown[]): Promise<T> {
    if (IS_TAURI) return invoke<T>("evm_rpc", { chain, method, params });
    const res = await fetch(`/api/evm/${chain}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null;
    if (!res.ok || !json || json.error) throw new Error(json?.error?.message ?? `the ${chain} RPC returned ${res.status}`);
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

  /**
   * A pool's candles from GeckoTerminal (see src/market/chart.ts): through
   * Rust in the app (src-tauri/src/chart.rs builds the URL from these
   * checked parts), through the dev server's /api/ohlcv proxy in a browser.
   * Resolves to the answer's candle list (or the whole answer: the page reads
   * both); throws "busy" when the API says too many requests.
   */
  async ohlcv(network: string, pool: string, timeframe: string, aggregate: number, limit: number): Promise<unknown> {
    if (IS_TAURI) return invoke<unknown>("ohlcv", { network, pool, timeframe, aggregate, limit });
    const q = new URLSearchParams({ network, pool, timeframe, aggregate: String(aggregate), limit: String(limit) });
    const res = await fetch(`/api/ohlcv?${q}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) throw new Error("busy");
    if (!res.ok) throw new Error(`the chart returned ${res.status}`);
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
  /**
   * How his window works here. The app sets that window up while the island's
   * page loads, and a page asking first got no answer and took him for
   * unsupported: he could never be dragged out. It asks again, for a few seconds.
   */
  async desktopInfo(): Promise<DesktopInfo | null> {
    if (!IS_TAURI) return null;
    for (let tries = 0; ; tries++) {
      const info = await call<DesktopInfo>("desktop_info");
      if (info || tries >= 40) return info;
      await new Promise((r) => setTimeout(r, 250));
    }
  },
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

  /**
   * Fetches the HTML of an https URL for project analysis (src-tauri/src/lib.rs).
   * Only available in the app; returns null in a browser (npm run dev has no server-side fetch).
   */
  async fetchPage(url: string): Promise<string | null> {
    if (!IS_TAURI) return null;
    return call<string>("fetch_page", { url });
  },

  /** RDAP domain lookup via rdap.iana.org (Rust side). */
  async rdapLookup(domain: string): Promise<unknown> {
    if (!IS_TAURI) return null;
    return call<unknown>("rdap_lookup", { domain });
  },

  /** DNS-over-HTTPS via Cloudflare for one record type (Rust side). */
  async dnsLookup(domain: string, recordType: "A" | "MX" | "TXT"): Promise<unknown> {
    if (!IS_TAURI) return null;
    return call<unknown>("dns_lookup", { domain, recordType });
  },

  /** Forward a Chat Completions request via Rust, bypassing the webview's CSP.
   *  Uses invoke() directly so the Rust Err string propagates (call() swallows errors). */
  async openaiChat(apiKey: string, body: string): Promise<string> {
    if (!IS_TAURI) throw new Error("not-tauri");
    return invoke<string>("openai_chat", { apiKey, body });
  },

  /**
   * Sends a voice recording (base64, `mime` its media type) to OpenAI through
   * Rust and returns what it says, in `lang` (Candy's two-letter language).
   * Uses invoke() directly so the Rust Err string propagates.
   */
  async openaiTranscribe(apiKey: string, audio: string, mime: string, lang: string): Promise<string> {
    if (!IS_TAURI) throw new Error("not-tauri");
    return invoke<string>("openai_transcribe", { apiKey, audio, mime, lang });
  },

  /** URL of the active tab in the frontmost browser (macOS only via AppleScript). */
  async getActiveBrowserTabUrl(): Promise<string | null> {
    if (!IS_TAURI) return null;
    return call<string>("get_active_tab_url");
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
  if (!IS_TAURI) {
    const channel = devEvents();
    if (!channel) return () => {};
    const fn = (e: MessageEvent<{ label?: string; event?: string; payload?: T }>) => {
      if (e.data?.label === devLabel() && e.data.event === name) handler(e.data.payload as T);
    };
    channel.addEventListener("message", fn);
    return () => channel.removeEventListener("message", fn);
  }
  return listen<T>(name, (e) => handler(e.payload));
}

/** Settings → Show me: a look of Candy's played on the island for a few seconds (Island.showOff). */
export type ShowOff = "pyjamas" | "nap" | "melt";

/**
 * Settings saved: by this page (the island, or its Settings and Closet
 * panels) or another window (the desktop Candy). Rust broadcasts
 * `settings-changed` to every page; in a browser a save in this page is
 * echoed to its listeners (see echoLocally), and one in another tab arrives
 * through localStorage's `storage` event.
 */
export async function onSettingsChanged(handler: (s: Settings) => void) {
  if (IS_TAURI) {
    return listen<Settings>("settings-changed", (e) => handler(normalizeSettings(e.payload)));
  }
  const fn = (e: StorageEvent) => {
    if (e.key === DEV_KEY) handler(devLoad());
  };
  window.addEventListener("storage", fn);
  localListeners.add(handler);
  return () => {
    window.removeEventListener("storage", fn);
    localListeners.delete(handler);
  };
}
