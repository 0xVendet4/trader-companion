// Candy on the desktop, island side: runs his life cycle (the controller in
// mascot/desktop-logic.ts) against the real app, tells the desktop window what
// to show, and handles the drag out of the island. The window itself lives in
// src-tauri/src/desktop.rs and draws him in src/desktop/main.ts. Adapted from
// Coucou's island/desktop.ts (MIT, © Louis Raillé).

import { Bridge, emitToWindow, onEvent, type DesktopMode } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { DESKTOP_EVENTS, DesktopController, type DesktopSnapshot } from "../mascot/desktop-logic";
import type { MascotState, MouthCue } from "../mascot/mascot";

/** Label of the desktop Candy's window (desktop.rs LABEL). */
const WINDOW = "candy";

/** What the life cycle needs from the island. */
export interface DesktopHost {
  /** Shows the island (compact) if it is hidden. */
  reveal(): void;
  /** The hat and face to wear right now (the trader's, or the season's), as art paths. */
  /** What Candy wears right now, a look being tried on included: costume, hat and face art, colour filter. */
  wearing(): { costume: string; hat: string | null; face: string | null; filter: string };
  /** A reaction on the island's own Candy. */
  react(state: MascotState, ms: number): void;
  /** A poke on the desktop Candy: the island's streak logic says what it does. */
  poked(): void;
  /** A link or address dropped on the desktop Candy: added like one dropped on the island. */
  dropped(text: string): void;
  /** Right-click on the desktop Candy: the wardrobe in the island. */
  wardrobe(): void;
}

/** An event card is up: he comes home to show it (see DesktopController). */
export const alertActive = () => State.mode === "expanded" && State.view === "event";

export class DesktopLink {
  mode: DesktopMode = "off";
  readonly controller: DesktopController;

  /** The pointer is dragging Candy out of the island. */
  carrying = false;

  private pushed = "";
  private pendingCarry: { x: number; y: number } | null = null;
  private carryFrame = false;
  private host: DesktopHost;

  constructor(host: DesktopHost) {
    this.host = host;
    this.controller = new DesktopController({
      flyOut: async (anywhere) => (await Bridge.desktopFlyOut(anywhere)) ?? false,
      flyHome: async (forget) => (await Bridge.desktopFlyHome(forget)) ?? true,
      setAway: (away) => {
        State.mascotAway = away;
        State.notify();
      },
      react: (state, ms) => this.host.react(state, ms),
      play: (sound) => Sound.play(sound),
      alertActive,
      revealIsland: () => {
        if (State.mode === "hidden") this.host.reveal();
      },
      later: (fn, ms) => void window.setTimeout(fn, ms),
    });
  }

  /** False where windows can't be placed (native Wayland): he stays in the island. */
  get supported(): boolean {
    return this.mode !== "off";
  }

  async init() {
    const info = await Bridge.desktopInfo();
    if (!info || info.mode === "off") return;
    this.mode = info.mode;
    this.controller.enabled = info.onDesktop;

    await onEvent<{ from: "island" | "desktop"; home: boolean }>(DESKTOP_EVENTS.dropped, (e) => this.onDropped(e.from, e.home));
    await onEvent<null>(DESKTOP_EVENTS.home, () => void this.controller.flyHome());
    await onEvent<null>(DESKTOP_EVENTS.poked, () => this.host.poked());
    await onEvent<string>(DESKTOP_EVENTS.drop, (text) => this.host.dropped(text));
    await onEvent<null>(DESKTOP_EVENTS.wardrobe, () => this.host.wardrobe());
    // The window's page (re)loaded: it knows nothing yet.
    await onEvent<null>(DESKTOP_EVENTS.ready, () => {
      this.pushed = "";
      this.push();
    });

    State.subscribe(() => this.sync());
    this.sync();
  }

  /** The launch greeting is over: back to his spot if that is where he lives. */
  launch() {
    if (this.supported) void this.controller.launchFlyIfNeeded();
  }

  // ── Drag out of the island ──────────────────────────────────────────────────

  /** Whether Candy can be picked up from the island right now. */
  canPickUp(): boolean {
    return this.supported && !State.paused && !State.mascotAway && this.controller.phase === "home";
  }

  /** (x, y): the pointer, island-window coordinates. */
  pickUp(x: number, y: number) {
    this.carrying = true;
    State.mascotAway = true;
    State.notify();
    void Bridge.desktopPickUp(x, y).then((ok) => {
      if (ok) return;
      this.carrying = false;
      State.mascotAway = false;
      State.notify();
    });
  }

  /** The pointer moved during the drag. Windows carries him from Rust. */
  carry(x: number, y: number) {
    if (!this.carrying || this.mode === "poll") return;
    this.pendingCarry = { x, y };
    if (this.carryFrame) return;
    this.carryFrame = true;
    requestAnimationFrame(() => {
      this.carryFrame = false;
      const p = this.pendingCarry;
      this.pendingCarry = null;
      if (p && this.carrying) void Bridge.desktopCarry(p.x, p.y);
    });
  }

  /** The button went up. On Windows the cursor poll has seen it already. */
  carryEnd(x: number, y: number) {
    if (!this.carrying || this.mode === "poll") return;
    this.pendingCarry = null;
    void Bridge.desktopCarryEnd(x, y);
  }

  private onDropped(from: "island" | "desktop", home: boolean) {
    if (from === "island") {
      this.carrying = false;
      if (home) {
        // Dropped back on the island: he is simply there again.
        State.mascotAway = false;
        State.notify();
      } else {
        this.controller.installed();
      }
    } else if (home) {
      void this.controller.flyHome();
    }
  }

  /** A swallowing step for the desktop Candy (he is the one on screen). */
  relay(c: MouthCue) {
    void emitToWindow(WINDOW, DESKTOP_EVENTS.cue, c);
  }

  // ── State → desktop window ──────────────────────────────────────────────────

  private sync() {
    this.controller.updateAlert(alertActive());
    this.push();
  }

  private push() {
    const wearing = this.host.wearing();
    const snapshot: DesktopSnapshot = {
      state: State.mood.state,
      costume: wearing.costume,
      hat: wearing.hat,
      face: wearing.face,
      filter: wearing.filter,
      soundEnabled: State.settings.soundEnabled,
      soundVolume: State.settings.soundVolume,
      paused: State.paused,
      dancing: State.music && State.companion.danceToMusic,
    };
    const key = JSON.stringify(snapshot);
    if (key === this.pushed) return;
    this.pushed = key;
    void emitToWindow(WINDOW, DESKTOP_EVENTS.state, snapshot);
  }
}
