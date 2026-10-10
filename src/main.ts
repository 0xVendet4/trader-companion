// Entry point: boot the bridge, load the mascot art, wire the island to the
// companion, start polling.

import "./style.css";
import { Bridge, IS_TAURI, emitToWindow, onEvent, onSettingsChanged } from "./core/bridge";
import { bindHotkey, unbindAll } from "./core/hotkey";
import { SHORTCUTS, planShortcuts, shortcutKeys, type ShortcutId, type ShortcutStatus } from "./core/shortcuts";
import { Music, type NowPlaying } from "./core/music";
import { Sound } from "./core/sound";
import { State } from "./core/state";
import { Companion } from "./companion";
import { Island } from "./island/island";
import { syncTrayIcon } from "./island/tray-icon";
import { loadManifest } from "./mascot/mascot";
import { devLang, pickLang, systemLangs, t, useLang } from "./core/i18n";

/** The words Rust shows (the tray menu, the settings window's title), in the trader's language. */
function syncRustLabels() {
  void Bridge.setUiLabels([t("Open"), t("Wardrobe…"), t("Try the demo"), t("Settings…"), t("Pause / resume"), t("Quit")], t("Settings — Candy"));
}

async function main() {
  const root = document.getElementById("root");
  if (!root) return;
  if (!IS_TAURI) document.body.classList.add("browser");

  const [boot, manifest] = await Promise.all([Bridge.boot(), loadManifest()]);
  // The words first: the island is built in the trader's language.
  let lang = pickLang(devLang() ?? boot.settings.companion.language, systemLangs());
  await useLang(lang);
  const island = new Island(root);
  if (IS_TAURI) syncRustLabels();
  State.settings = boot.settings;
  State.version = boot.version;
  State.os = boot.os ?? "browser";
  State.cursorPoll = boot.cursorPoll ?? true;
  State.firstName = boot.firstName ?? null;
  // No cursor poll (Linux): the page's own mouse events stand in for it.
  if (IS_TAURI && !State.cursorPoll) island.followPage();
  island.useArt(manifest);
  island.applySettings();
  island.initDesktop();
  // The trader's own recordings, if any (Settings → Reload reads the folder again).
  void Sound.reload();
  await onEvent<null>("sounds-changed", () => void Sound.reload().then(() => Sound.play("pop")));

  await onEvent<{ x: number; y: number }>("cursor", ({ x, y }) => island.onCursor(x, y));

  await onEvent<string>("tray", (what) => {
    switch (what) {
      case "open":
        Companion.setPaused(false);
        island.setView("watchlist");
        break;
      case "pause":
        Companion.setPaused(!State.paused);
        if (!State.paused) island.reveal();
        break;
      case "wardrobe":
        if (!(State.mode === "expanded" && State.view === "wardrobe")) island.toggleWardrobe();
        break;
      case "demo":
        island.toggleDemo();
        break;
    }
  });

  await onEvent<null>("screen-changed", () => void Bridge.reposition());

  // Rust saw the mouse pressed outside the island (the window lets those
  // clicks through, so the page never sees them).
  await onEvent<null>("click-outside", () => island.clickOutside());

  // Ctrl held over the island: the mouse goes through to what is behind it,
  // and the island fades so that can be seen.
  await onEvent<boolean>("pass-through", (on) => document.body.classList.toggle("passing", on));

  // The floating island was let go: moved (and saved by Rust), or just clicked.
  await onEvent<{ moved: boolean; x: number | null; y: number | null }>("float-drag-end", (e) =>
    island.floatDragEnded(e.moved, e.x, e.y),
  );

  // An alert's Windows notification: its Open or Mute 1 h button, or a click on it.
  await onEvent<{ action: string; key: string }>("toast-action", (e) => island.toastAction(e.action, e.key));

  // The global shortcuts (src/core/shortcuts.ts; page-only in a browser).
  // Settings asks how each one went, and has them all let go while it records
  // new keys, so a combination Candy holds is recorded instead of run.
  let shortcutStatus: Partial<Record<ShortcutId, ShortcutStatus>> = {};
  let shortcutKeysNow = "";
  let suspended = false;
  let queue = Promise.resolve();
  const publishShortcuts = () => void emitToWindow("settings", "shortcuts-status", shortcutStatus);
  const applyShortcuts = (force = false) => {
    if (suspended) return;
    const keys = Object.fromEntries(SHORTCUTS.map((d) => [d.id, shortcutKeys(State.companion, d.id)])) as Record<ShortcutId, string>;
    const key = JSON.stringify(keys);
    if (!force && key === shortcutKeysNow) return;
    shortcutKeysNow = key;
    queue = queue.then(async () => {
      await unbindAll();
      const types = (await Bridge.shortcutTypes(SHORTCUTS.map((d) => keys[d.id]))) ?? [];
      const status: Partial<Record<ShortcutId, ShortcutStatus>> = {};
      for (const p of planShortcuts(keys, types)) {
        if (p.register) status[p.id] = { kind: await bindHotkey(p.register, () => island.shortcut(p.id), p.id) };
        else if (p.status) status[p.id] = p.status;
      }
      shortcutStatus = status;
      publishShortcuts();
    });
  };
  applyShortcuts();
  await onEvent<null>("shortcuts-ask", publishShortcuts);
  await onEvent<null>("shortcuts-suspend", () => {
    suspended = true;
    shortcutKeysNow = "";
    queue = queue.then(() => unbindAll());
  });
  await onEvent<null>("shortcuts-resume", () => {
    suspended = false;
    applyShortcuts(true);
  });

  // What plays on the PC: the music card and Candy's dance (Settings → Music).
  await onEvent<NowPlaying | null>("now-playing", (np) => {
    State.nowPlaying = np;
    State.notify();
  });
  await onEvent<[string, string]>("now-playing-art", ([key, url]) => {
    Music.art = { key, url };
    State.notify();
  });
  const wantsMusic = () => State.companion.danceToMusic || State.companion.musicCard;
  let watching = wantsMusic();
  if (IS_TAURI) void Bridge.setMediaWatch(watching);

  // The settings window writes preferences; apply them here without a restart.
  await onSettingsChanged((s) => {
    // The real settings changed under the demo: it ends, and they apply.
    if (State.demo) island.stopDemo();
    Companion.applyExternal(s);
    island.applySettings();
    applyShortcuts();
    // A new language: its words load, and the island is relabelled in place.
    const next = pickLang(State.companion.language, systemLangs());
    if (next !== lang) {
      lang = next;
      void useLang(next).then(() => {
        island.relabel();
        if (IS_TAURI) syncRustLabels();
      });
    }
    if (wantsMusic() !== watching) {
      watching = wantsMusic();
      if (IS_TAURI) void Bridge.setMediaWatch(watching);
      if (!watching) State.nowPlaying = null;
    }
  });

  Companion.onEvent = (e) => island.showEvent(e);
  Companion.onFeeling = (state, line) => island.feel(state, line);
  Companion.onTrade = (pnl) => island.tradeClosed(pnl);
  // The tray icon wears Candy's mood and colour, and a dot for an alert not seen yet.
  if (IS_TAURI) State.subscribe(syncTrayIcon);
  Companion.start();
  island.launch();

  if (!IS_TAURI) {
    document.addEventListener("click", () => Sound.resume(), { once: true });
    // Dev-server handle for poking at the state from the dev tools.
    if (import.meta.env.DEV) Object.assign(window, { __companion: { State, Companion, island, useLang } });
  }
}

void main();
