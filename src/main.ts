// Entry point: boot the bridge, load the mascot art, wire the island to the
// companion, start polling.

import "./style.css";
import { Bridge, IS_TAURI, onEvent, onSettingsChanged } from "./core/bridge";
import { bindHotkey } from "./core/hotkey";
import { Sound } from "./core/sound";
import { State } from "./core/state";
import { Companion } from "./companion";
import { Island } from "./island/island";
import { loadManifest } from "./mascot/mascot";

async function main() {
  const root = document.getElementById("root");
  if (!root) return;
  if (!IS_TAURI) document.body.classList.add("browser");

  const island = new Island(root);
  const [boot, manifest] = await Promise.all([Bridge.boot(), loadManifest()]);
  State.settings = boot.settings;
  State.version = boot.version;
  State.os = boot.os ?? "browser";
  State.cursorPoll = boot.cursorPoll ?? true;
  // No cursor poll (Linux): the page's own mouse events stand in for it.
  if (IS_TAURI && !State.cursorPoll) island.followPage();
  island.useArt(manifest);
  island.applySettings();

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

  // The show/hide shortcut (global in the app, page-only in a browser).
  let hotkey = State.companion.hotkey;
  void bindHotkey(hotkey, () => island.toggle());

  // The settings window writes preferences; apply them here without a restart.
  await onSettingsChanged((s) => {
    Companion.applyExternal(s);
    island.applySettings();
    if (s.companion.hotkey !== hotkey) {
      hotkey = s.companion.hotkey;
      void bindHotkey(hotkey, () => island.toggle());
    }
  });

  Companion.onEvent = (e) => island.showEvent(e);
  Companion.onFeeling = (state, line) => island.feel(state, line);
  Companion.start();
  island.launch();

  if (!IS_TAURI) {
    document.addEventListener("click", () => Sound.resume(), { once: true });
    // Dev-server handle for poking at the state from the dev tools.
    if (import.meta.env.DEV) Object.assign(window, { __companion: { State, Companion, island } });
  }
}

void main();
