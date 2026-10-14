// Settings and the Closet open inside the island (src/island/island.ts
// openPanel): the island's window grows to a panel that holds the page, and
// the island itself becomes that panel, with its look (background, ring,
// rounded corners away from the screen edge). The window's maths here must
// match panel_frame in src-tauri/src/island.rs; a browser uses them as they
// are, on the page standing in for the screen.

import type { ShowOff } from "./bridge";
import { COMPACT_H, floatsUp, isSide } from "./layout";
import type { ShortcutId, ShortcutStatus } from "./shortcuts";
import type { Placement, Settings } from "./state";
import type { Manifest } from "../mascot/mascot";

export type PanelKind = "settings" | "closet";

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/**
 * The panel's own size, logical px, where the screen has room: about the old
 * windows' (Settings 600 × 720, the Closet 860 × 600) plus the title row.
 */
export const PANEL_SIZE: Record<PanelKind, Size> = {
  settings: { w: 680, h: 740 },
  closet: { w: 880, h: 640 },
};

/**
 * Room around the panel on the sides away from the screen edge it hangs from:
 * its ring and shadow are drawn there, and it keeps the panel this far from
 * the work area's other edges.
 */
export const PANEL_PAD = 20;

/** The title row: Settings or Closet, the switch between them and the close button. */
export const PANEL_HEAD_H = 56;

/** The panel's corners (the island's open ones are 22). */
export const PANEL_CORNER = 22;

/** Candy in the title row, from the panel's top-left corner (Settings; the Closet has a big Candy of its own). */
export const PANEL_MASCOT = { cx: 36, cy: PANEL_HEAD_H / 2 + 1, size: 46 };

/**
 * Hanging from the top edge, the title row comes down this much more: the
 * screen's edge is right above it, and a hat on Candy (a nightcap, a crown)
 * stays inside the panel.
 */
export const PANEL_TOP_INSET = 6;

/** Candy in the title row for a placement (see PANEL_TOP_INSET). */
export function panelMascot(placement: Placement): { cx: number; cy: number; size: number } {
  return placement === "top" ? { ...PANEL_MASCOT, cy: PANEL_MASCOT.cy + PANEL_TOP_INSET } : PANEL_MASCOT;
}

/**
 * Settings → Show me: Candy steps out of the title row, big, at the middle of
 * the panel's top, over the title row's empty middle and the top of the page,
 * for as long as the look plays.
 */
export function panelShowSpot(placement: Placement, panelW: number): { cx: number; cy: number; size: number } {
  const size = 128;
  const inset = placement === "top" ? PANEL_TOP_INSET + 4 : 4;
  return { cx: Math.round(panelW / 2), cy: inset + size / 2, size };
}

/**
 * How see-through the island's background may be under an open panel (%):
 * the old windows were solid, and the panel's title row and the closet's
 * hints sit on that background. The Transparency slider still shows its real
 * value while its thumb is held.
 */
export const PANEL_MAX_TRANSPARENCY = 15;

/** The island's transparency shown now: capped under a panel, unless Settings' slider is being dragged (`preview`). */
export function shownTransparency(setting: number, panelOpen: boolean, preview: number | null = null): number {
  if (preview != null) return preview;
  return panelOpen ? Math.min(setting, PANEL_MAX_TRANSPARENCY) : setting;
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/** The panel inside its window: everything but the room for the ring on the free sides. */
export function panelInWindow(placement: Placement, w: number, h: number): Rect {
  const p = PANEL_PAD;
  const box = (x: number, y: number, pw: number, ph: number): Rect => ({ x, y, w: Math.max(0, pw), h: Math.max(0, ph) });
  switch (placement) {
    case "top":
      return box(p, 0, w - 2 * p, h - p);
    case "left":
      return box(0, p, w - p, h - 2 * p);
    case "right":
      return box(p, p, w - p, h - 2 * p);
    case "float":
      return box(p, p, w - 2 * p, h - 2 * p);
  }
}

/**
 * Where the island's window goes while a panel is open, and the panel in it
 * (logical px). `work` is the display's work area (the screen without the
 * taskbar or the menu bar); `float` is where a floating ticker sits, as
 * fractions of it. The window grows from the island's edge: downward from
 * the top, centred like the island; inward from a side edge, centred
 * vertically; around a floating ticker, opening downward in the upper half
 * and upward in the lower half, as the island does. It never leaves the work
 * area: on a small screen the panel is as big as fits (its page scrolls).
 */
export function panelFrame(work: Rect, placement: Placement, want: Size, float: { x: number; y: number } = { x: 0.5, y: 0.1 }): { win: Rect; panel: Rect } {
  const p = PANEL_PAD;
  const padW = isSide(placement) ? p : 2 * p;
  const padH = placement === "top" ? p : 2 * p;
  const w = Math.round(Math.max(0, Math.min(want.w + padW, work.w)));
  const h = Math.round(Math.max(0, Math.min(want.h + padH, work.h)));
  let x: number;
  let y: number;
  switch (placement) {
    case "top":
      x = work.x + (work.w - w) / 2;
      y = work.y;
      break;
    case "left":
      x = work.x;
      y = work.y + (work.h - h) / 2;
      break;
    case "right":
      x = work.x + work.w - w;
      y = work.y + (work.h - h) / 2;
      break;
    case "float": {
      const cx = work.x + clamp(float.x, 0, 1) * work.w;
      const cy = work.y + clamp(float.y, 0, 1) * work.h;
      // The panel's top where the ticker's top is (its bottom, opening upward).
      const top = floatsUp(float.y) ? cy + COMPACT_H / 2 + p - h : cy - COMPACT_H / 2 - p;
      x = clamp(cx - w / 2, work.x, work.x + work.w - w);
      y = clamp(top, work.y, work.y + work.h - h);
      break;
    }
  }
  const win = { x: Math.round(x), y: Math.round(y), w, h };
  return { win, panel: panelInWindow(placement, w, h) };
}

/**
 * Where the island sits (its top-left corner) while it grows from `from` into
 * `to`, or shrinks from `to` back into `from`, at size w × h: each axis moves
 * as far along as its size has, so the island leaves its own spot and lands
 * on the panel's (a ticker floating anywhere, an edge's island) without a
 * jump. An axis whose size doesn't change follows the other one.
 */
export function growRect(from: Rect, to: Rect, w: number, h: number): { x: number; y: number } {
  const along = (a: number, b: number, v: number) => (Math.abs(b - a) < 1 ? null : (v - a) / (b - a));
  const kw = along(from.w, to.w, w);
  const kh = along(from.h, to.h, h);
  const kx = kw ?? kh ?? 1;
  const ky = kh ?? kw ?? 1;
  return { x: from.x + (to.x - from.x) * kx, y: from.y + (to.y - from.y) * ky };
}

/** `r` moved (not resized) to lie inside a w × h box at the origin, as far as it fits. */
export function clampInto(r: Rect, box: Size): Rect {
  return { ...r, x: clamp(r.x, 0, box.w - r.w), y: clamp(r.y, 0, box.h - r.h), w: r.w, h: r.h };
}

/**
 * The island's CSS position in its window, from the point of the window that
 * stays put on screen when the window changes between the island's own and
 * a panel's: the top edge's middle at the top, the edge's middle on a side.
 * Placed that way, the island stays where it is on screen while the OS
 * moves and resizes the window under it, whichever lands first. A floating
 * island has no such point (the page hides it for that moment instead).
 */
export function anchoredAt(placement: Placement, r: { x: number; y: number }, win: Size): { left: string; top: string } {
  const n = (v: number) => Math.round(v * 100) / 100;
  const fromMiddle = (v: number, size: number) => `calc(50% + ${n(v - size / 2)}px)`;
  switch (placement) {
    case "top":
      return { left: fromMiddle(r.x, win.w), top: `${n(r.y)}px` };
    case "left":
      return { left: `${n(r.x)}px`, top: fromMiddle(r.y, win.h) };
    case "right":
      return { left: `calc(100% - ${n(win.w - r.x)}px)`, top: fromMiddle(r.y, win.h) };
    case "float":
      return { left: `${n(r.x)}px`, top: `${n(r.y)}px` };
  }
}

/**
 * Where a link can open Settings (Discipline's "Edit", My wallet's "add it in
 * Settings" for an RPC key, the closet's "Seasonal looks"): a section, or one
 * row of one ("rpc", "seasonal"). Each is lit up as it opens.
 */
export const SETTINGS_TARGETS = ["watchlist", "alerts", "wallet", "following", "discipline", "appearance", "seasonal", "general", "rpc"] as const;
export type SettingsSection = (typeof SETTINGS_TARGETS)[number];

/** How a page in a panel reaches the island around it (Island.panelHost). */
export interface PanelHost {
  /** Saves the page's settings (the island hears them back as from any save). */
  save(settings: Settings): void;
  /** Settings → Show me: played on Candy, who steps out of the title row big for it. How long it plays (ms). */
  showOff(what: ShowOff): number;
  /**
   * The transparency slider as it moves: the panel, which is the island,
   * fades to it. `settle`: the thumb was let go, the value saved; it stays a
   * moment, then the panel is as solid as a panel is (PANEL_MAX_TRANSPARENCY).
   * Null: back to the setting at once.
   */
  previewTransparency(transparency: number | null, settle?: boolean): void;
  /** The other panel in this one's place, or Settings at a section. */
  open(kind: PanelKind, section?: SettingsSection): void;
  /** The global shortcuts (src/main.ts): how each one went, and let go of while new keys are recorded. */
  shortcuts: ShortcutLink;
  /** The art, already loaded by the island. */
  manifest: Manifest;
}

export interface ShortcutLink {
  status(): Partial<Record<ShortcutId, ShortcutStatus>>;
  /** Told whenever the statuses change; returns how to stop. */
  onStatus(fn: () => void): () => void;
  suspend(): void;
  resume(): void;
}

/** A page mounted in a panel: taken down on close (nothing of it keeps running), or scrolled to a section. */
export interface PanelPage {
  dispose(): void;
  reveal?(section: SettingsSection): void;
}
