// Candy on the desktop — the pure logic. No DOM, no Tauri: the island wires it
// up in src/island/desktop.ts, the desktop window draws him in
// src/desktop/main.ts, and Rust owns the window (src-tauri/src/desktop.rs).
// Adapted from Coucou's desktop-logic.ts (MIT, © Louis Raillé).

import type { MascotState } from "./mascot";
import type { PnlSign } from "./sign";

/** What the island tells the desktop window, whenever it changes. */
export interface DesktopSnapshot {
  /** The mood (reactions stay in the island). */
  state: MascotState;
  costume: string;
  /** Art paths from the manifest, or null. */
  hat: string | null;
  face: string | null;
  /** The trader's colour, as a CSS filter (see skins.ts). */
  filter: string;
  /** After midnight: his pyjamas (night.ts). Missing from an older island: none. */
  pyjamas?: boolean;
  /** How far his wax has run down on a strong drop (0–1, melt.ts). */
  melt?: number;
  soundEnabled: boolean;
  soundVolume: number;
  /** Tray → Pause: he dozes off and stays asleep. */
  paused: boolean;
  /** Music plays: he dances (dance.ts decides what moods sit it out). */
  dancing: boolean;
  /** Shades on for a moment (a 2x, see shades.ts): their art, or null. */
  shades: string | null;
  /** His face accessory stays on under the shades. */
  keepFace: boolean;
  /** What his sign says, held up while the mouse rests on him (see sign.ts). */
  sign: PnlSign | null;
}

/** Events between the two windows. Rust adds `desktop-dropped`. */
export const DESKTOP_EVENTS = {
  /** island → desktop window */
  state: "desktop-state",
  /** A swallowing step (mascot.ts MouthCue). */
  cue: "desktop-cue",
  /** An emote picked in the island's menu (emotes.ts), for him to play. */
  emote: "desktop-emote",
  /** A reaction for him to play, `{ state, ms }` (the cool look of a 2x's shades). */
  react: "desktop-react",
  /** island → desktop window: show a line in the speech bubble. Payload: { text, ms }. */
  say: "desktop-say",
  /** desktop window → island */
  ready: "desktop-ready",
  home: "desktop-home",
  /** A link or address dropped on him: the island adds it. */
  drop: "desktop-drop",
  /** Right-click on him: his menu (emotes, the wardrobe), in the island. */
  menu: "desktop-menu",
  /** Rust → island: a drag ended, `{ from: "island" | "desktop", home }`. */
  dropped: "desktop-dropped",
  /** Rust → desktop window */
  cursor: "desktop-cursor",
  visible: "desktop-visible",
  flight: "desktop-flight",
} as const;

// ── Constants ────────────────────────────────────────────────────────────────

/** Side of the desktop window, logical pixels (desktop.rs SIZE). */
export const PANEL_SIZE = 280;
/** The mascot's box inside it: the canvases' overhang fills the rest. */
export const MASCOT_SIZE = 112;
/** Seconds with nothing going on before he may doze off. */
export const SLEEP_TIMEOUT = 120;
/** He only dozes off once the pointer is at least this far from him, px. */
export const SLEEP_MOUSE_DISTANCE = 150;
/** Clickable body radius, as a fraction of the window side (desktop.rs too). */
export const BODY_RADIUS_FRACTION = 0.132;

/** Surprised, then off to the island (0.45 s). */
export const RETRACT_DELAY_MS = 450;
/** Pause in the island after the alert is dismissed, before flying back (0.6 s). */
export const RETURN_DELAY_MS = 600;
/** Single click → poke, unless it turns out to be a double click. */
export const DOUBLE_CLICK_MS = 300;
/** A press that moves farther than this is a drag, not a click. */
export const DRAG_THRESHOLD = 3;

// ── Pure helpers ─────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** Whether he should be asleep: nothing going on for longer than SLEEP_TIMEOUT, and the pointer not close. */
export function shouldSleep(sinceActive: number, mouseDistanceToCenter: number): boolean {
  return sinceActive > SLEEP_TIMEOUT && mouseDistanceToCenter >= SLEEP_MOUSE_DISTANCE;
}

/** Hit test of the body inside the square window (window-local). */
export function isOverBody(local: Point, panelSize = PANEL_SIZE): boolean {
  const c = panelSize / 2;
  const r = panelSize * BODY_RADIUS_FRACTION;
  const dx = local.x - c;
  const dy = local.y - c;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Linux has no global cursor (the window only hears the pointer over his
 * body). That counts as "near" for this long afterwards.
 */
export const POINTER_MEMORY_MS = 4000;

/**
 * Distance from the pointer to his centre, for shouldSleep. With a cursor
 * poll (Windows) it is measured; without one, the pointer is near while it was
 * over him a moment ago, and far otherwise.
 */
export function pointerDistance(cursorPoll: boolean, cursor: Point | null, sincePointerMs: number, panelSize = PANEL_SIZE): number {
  if (cursorPoll) return cursor ? Math.hypot(cursor.x - panelSize / 2, cursor.y - panelSize / 2) : Infinity;
  return sincePointerMs < POINTER_MEMORY_MS ? 0 : Infinity;
}

/** X11 drag: screen coordinates are global there; the window moves in physical pixels. */
export function windowDragTopLeft(origin: Point, screen: Point, screenAtPress: Point, dpr: number): Point {
  return { x: origin.x + (screen.x - screenAtPress.x) * dpr, y: origin.y + (screen.y - screenAtPress.y) * dpr };
}

// ── Life cycle ───────────────────────────────────────────────────────────────

export type DesktopPhase =
  /** No window on screen. */
  | "home"
  /** Window flying from the island to his spot. */
  | "flyingOut"
  /** On the desktop: the normal state. */
  | "onDesktop"
  /** An alert card just went up: surprised, about to fly to the island. */
  | "retracting"
  /** The alert was dismissed while he was flying to the island. */
  | "alertGoneDuringRetract"
  /** In the island, showing the alert; back out once it is dismissed. */
  | "atIslandForAlert";

/** Everything the life cycle does to the world, injected so it can be tested. */
export interface DesktopPorts {
  /** Shows the window at the island and flies it to his spot. False: no spot. `anywhere`: the first-visit corner then. */
  flyOut(anywhere: boolean): Promise<boolean>;
  /** Flies the window to the island and hides it. `forget`: he lives there again. */
  flyHome(forget: boolean): Promise<boolean>;
  /** The island's own Candy hides while he is out. */
  setAway(away: boolean): void;
  /** A reaction on the island's Candy (he is back) or a sound. */
  react(state: MascotState, ms: number): void;
  play(sound: "pop" | "greet" | "eep"): void;
  alertActive(): boolean;
  /** The island must be on screen for him to show the alert there. */
  revealIsland(): void;
  later(fn: () => void, ms: number): void;
}

export class DesktopController {
  phase: DesktopPhase = "home";
  /** He lives on the desktop (the `onDesktop` preference). */
  enabled = false;

  private alertWas = false;
  private port: DesktopPorts;

  constructor(port: DesktopPorts) {
    this.port = port;
  }

  /** Launch, and back from an alert: fly out to his spot if he lives there. */
  async launchFlyIfNeeded(anywhere = false): Promise<void> {
    if (!this.enabled || this.phase !== "home") return;
    // An alert is up: wait in the island, the alert's end flies him out.
    if (this.port.alertActive()) {
      this.phase = "atIslandForAlert";
      return;
    }
    this.phase = "flyingOut";
    this.port.setAway(true);
    const ok = await this.port.flyOut(anywhere);
    if (this.phase !== "flyingOut") return;
    if (!ok) {
      // His spot is on a display that is gone: he stays home.
      this.phase = "home";
      this.enabled = false;
      this.port.setAway(false);
      return;
    }
    this.landed();
  }

  /** Dropped on the desktop after a drag out of the island (Rust placed him). */
  installed() {
    if (this.phase !== "home") return;
    this.enabled = true;
    this.port.setAway(true);
    this.port.play("pop");
    this.landed();
  }

  /** Double click, or dropped on the island: home for good. */
  async flyHome(): Promise<void> {
    const out: DesktopPhase[] = ["onDesktop", "retracting", "alertGoneDuringRetract"];
    if (!out.includes(this.phase)) return;
    this.phase = "home";
    this.enabled = false;
    await this.port.flyHome(true);
    this.port.setAway(false);
    this.port.react("happy", 1200);
    this.port.play("greet");
  }

  /** Out to his spot from the island, home from the desktop; in flight, nothing. */
  async flyOutOrHome(): Promise<void> {
    if (this.phase === "home") {
      this.enabled = true;
      await this.launchFlyIfNeeded(true);
    } else if (this.phase === "onDesktop") {
      await this.flyHome();
    }
  }

  /** Call whenever the alert condition may have changed; only edges count. */
  updateAlert(active: boolean) {
    if (active === this.alertWas) return;
    this.alertWas = active;
    if (active) {
      if (this.phase === "onDesktop") this.beginRetract();
      return;
    }
    if (this.phase === "atIslandForAlert") {
      this.phase = "home";
      this.port.later(() => void this.launchFlyIfNeeded(), RETURN_DELAY_MS);
    } else if (this.phase === "retracting") {
      this.phase = "alertGoneDuringRetract";
    }
  }

  private landed() {
    this.phase = "onDesktop";
    // An alert may have gone up during the flight, when nothing reacts to it.
    this.alertWas = this.port.alertActive();
    if (this.alertWas) this.beginRetract();
  }

  private beginRetract() {
    this.port.play("eep");
    this.phase = "retracting";
    this.port.later(() => {
      if (this.phase === "retracting") {
        void this.retractForAlert();
      } else if (this.phase === "alertGoneDuringRetract") {
        // Dismissed before he even took off: he never left his spot.
        this.phase = "onDesktop";
      }
    }, RETRACT_DELAY_MS);
  }

  private async retractForAlert() {
    await this.port.flyHome(false);
    this.port.setAway(false);
    if (this.phase === "alertGoneDuringRetract") {
      this.phase = "home";
      await this.launchFlyIfNeeded();
    } else if (this.phase === "retracting") {
      this.phase = "atIslandForAlert";
      this.port.revealIsland();
    }
  }
}
