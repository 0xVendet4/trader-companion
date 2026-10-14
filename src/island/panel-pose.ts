// What opening and closing a panel (Settings, the Closet) does to the island,
// with no DOM: the island remembers how it was when the first panel opened,
// a second one takes the first one's place, and closing puts the island back
// exactly as it was. Island.openPanel / closePanel act on these answers.

import type { PanelKind, SettingsSection } from "../core/panel";
import type { IslandViewName } from "../core/state";
import type { FsmState } from "./fsm";

/** How the island was before a panel opened. */
export interface Pose {
  fsm: FsmState;
  view: IslandViewName;
  minimized: boolean;
  pinned: boolean;
}

export interface OpenPanel {
  kind: PanelKind;
  /** Where Settings opened (a link to My wallet, Discipline…), if not at the top. */
  section?: SettingsSection;
  /** The island as it was before any panel: put back on close. */
  restore: Pose;
}

/** What an open request comes to. */
export type PanelStep =
  /** Open this panel (the first, or another in place of the one open). */
  | { kind: "open"; panel: OpenPanel; swap: boolean }
  /** The same panel again, at a section: it scrolls there. */
  | { kind: "reveal"; section: SettingsSection }
  /** The same panel again (its button, the tray item, Ctrl+,): it closes. */
  | { kind: "close" };

/**
 * Settings or the Closet asked for. `toggle`: the gear, the tray item or the
 * shortcut, which close the panel when it is the one open; a link (a
 * section, the closet's way to Settings) never closes it.
 */
export function requestPanel(open: OpenPanel | null, kind: PanelKind, pose: Pose, opts: { section?: SettingsSection; toggle?: boolean } = {}): PanelStep {
  if (open && open.kind === kind) {
    if (opts.section) return { kind: "reveal", section: opts.section };
    if (opts.toggle) return { kind: "close" };
    return { kind: "reveal", section: open.section ?? "watchlist" };
  }
  // Another panel takes this one's place; the island still goes back to how it was before the first.
  return { kind: "open", panel: { kind, section: opts.section, restore: open ? open.restore : pose }, swap: !!open };
}

/**
 * How the island goes back once the panel closes: the view it showed, open,
 * folded into the ticker or hidden, pinned or not, minimized or not. The
 * launch greeting never comes back (it had played): the ticker does.
 */
export function restorePose(open: OpenPanel): Pose {
  const { restore } = open;
  return { ...restore, fsm: restore.fsm === "greet" ? "petit" : restore.fsm, view: restore.view === "greeting" ? "watchlist" : restore.view };
}

/** The island as it is when a panel is asked for, pins and all. */
export interface IslandNow extends Pose {
  /** Candy's menu is open: it pins the island while it shows… */
  menuOpen: boolean;
  /** …and puts back the pin it found (Island.menuPinned). */
  menuPinned: boolean;
  /** A field of the island has the keyboard: it pins the island until it lets go. */
  inputFocused: boolean;
}

/**
 * The pose to put back on close. The menu and a field being typed in are put
 * away as the panel opens, so their pins don't count: the menu's is the one
 * it found, a field's ends with it. Kept, the island would stay pinned open
 * after the panel with nothing left to unpin it.
 */
export function poseOf(now: IslandNow): Pose {
  const pinned = now.menuOpen ? now.menuPinned : now.inputFocused ? false : now.pinned;
  return { fsm: now.fsm, view: now.view, minimized: now.minimized, pinned };
}

/** A panel's session in the island: the panel open, and an alert waiting for it to close. */
export interface PanelSession {
  open: OpenPanel | null;
  heldAlert: boolean;
}

export const NO_PANEL: PanelSession = { open: null, heldAlert: false };

export type PanelEvent =
  | { type: "request"; kind: PanelKind; now: IslandNow; section?: SettingsSection; toggle?: boolean }
  | { type: "alert" }
  | { type: "close"; restore: boolean };

/** What the island does about an event (Island.openPanel, presentEvent, closePanel act on it). */
export interface PanelOutcome {
  session: PanelSession;
  /** A request's step (open, swap, reveal, close). */
  step?: PanelStep;
  /** The island's machine stays put (no collapse, no hide, no sleep) while true. */
  frozen: boolean;
  /** Closed: how the island goes back (absent: it stays open for what asked, a tab or the wardrobe). */
  restore?: Pose;
  /** Closed: the alert card that waited, now. */
  showAlert: boolean;
  /** An alert came while the panel is open: it waits (Candy reacts in the title row). */
  held: boolean;
}

/**
 * One step of a panel's session: opening (from however the island was),
 * swapping, an alert arriving meanwhile, closing back to the pose or for a
 * view asked for.
 */
export function panelStep(session: PanelSession, event: PanelEvent): PanelOutcome {
  const none = { frozen: !!session.open, showAlert: false, held: false };
  switch (event.type) {
    case "request": {
      const step = requestPanel(session.open, event.kind, poseOf(event.now), { section: event.section, toggle: event.toggle });
      if (step.kind === "close") return panelStep(session, { type: "close", restore: true });
      if (step.kind === "reveal") return { ...none, session, step };
      return { ...none, session: { ...session, open: step.panel }, step, frozen: true };
    }
    case "alert":
      if (!session.open) return { ...none, session };
      return { ...none, session: { ...session, heldAlert: true }, held: true };
    case "close": {
      if (!session.open) return { ...none, session };
      return {
        session: NO_PANEL,
        step: { kind: "close" },
        frozen: false,
        restore: event.restore ? restorePose(session.open) : undefined,
        showAlert: session.heldAlert,
        held: false,
      };
    }
  }
}
