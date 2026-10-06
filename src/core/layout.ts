// Island geometry, in logical pixels. The window is a fixed PANEL_W × PANEL_H
// (must match src-tauri/src/island.rs); the island is drawn inside it, glued
// to the top edge and centred, to a side edge and vertically centred, or
// floating (see Placement).

import type { IslandMode, IslandViewName, Placement } from "./state";

export const PANEL_W = 720;
export const PANEL_H = 340;

export const HIDDEN_W = 184;
export const COMPACT_W = 320;
export const COMPACT_H = 32;
export const EXPANDED_W = 660;

/**
 * Motion. Coucou copied the Mac notch: a soft spring (0.5 s response, a little
 * overshoot) and a 340 ms close. Traders asked for snappier: a quicker,
 * better-damped spring and a short close.
 */
export const OPEN_RESPONSE = 0.3;
export const OPEN_DAMPING = 0.86;
export const CLOSE_MS = 190;

/**
 * On a side edge, the compact island is the top's ticker stood upright: as
 * thin as the top one is tall, as tall as it is wide, the mascot at its top
 * and the same line running down.
 */
export const SIDE_TAB_W = COMPACT_H;
export const SIDE_TAB_H = COMPACT_W;

/**
 * On a side edge the window is tall and narrow (must match island.rs), and
 * the open island is a sidebar: the tabs and the prices on two rows, a band
 * with the mascot and its line, then the view, with more rows and fewer
 * columns.
 */
export const SIDE_PANEL_W = 400;
export const SIDE_PANEL_H = 640;
export const SIDEBAR_W = 380;
export const SIDEBAR_HEADER_H = 70;
export const SIDEBAR_BAND_H = 72;
/** Rows a list shows in the sidebar before it scrolls. */
export const SIDEBAR_ROWS = 10;
/** Gap between a floating island and the window edge it hangs from (matches island.rs). */
export const FLOAT_MARGIN = 10;

export const COMPACT_CORNER = 14;
export const EXPANDED_CORNER = 22;

/** Header with the tabs. */
export const HEADER_H = 40;
/** Left column holding the mascot and its caption. */
export const SIDE_W = 138;
/** Room for the mood caption under the mascot: a 4 px gap and two lines. */
export const MASCOT_CAPTION_H = 34;

export const ROW_H = 30;
/** The watchlist's folder chips. */
export const FOLDERS_H = 24;
export const MAX_ROWS = 6;
export const WALLET_ROW_H = 48;

/** Content heights below the header, per view, given how many rows they show. */
export function viewHeight(view: IslandViewName, rows: number, maxRows = MAX_ROWS): number {
  const minBody = 132;
  switch (view) {
    case "watchlist": {
      // The folder chips, then the list (or its empty line), then the field.
      const list = rows === 0 ? 46 : Math.min(rows, maxRows) * ROW_H + 26;
      return HEADER_H + Math.max(minBody, list + 50 + FOLDERS_H);
    }
    case "trending": {
      // The Hot/New switch, then up to MAX_ROWS rows (scrolls past that).
      const list = rows === 0 ? 46 : Math.min(rows, maxRows) * ROW_H;
      // Two switch rows (list + chains, sort + window) above the table.
      return HEADER_H + Math.max(minBody, list + 96);
    }
    case "alerts": {
      const list = rows === 0 ? 40 : Math.min(rows, 4) * 28 + 8;
      return HEADER_H + Math.max(minBody, list + 58);
    }
    case "positions": {
      // No wallet yet (0): the setup text and field. Otherwise the wallet line,
      // a summary, the column heads, the rows and a line of fine print.
      if (rows === 0) return HEADER_H + minBody;
      return HEADER_H + Math.max(minBody, Math.min(rows, 5) * ROW_H + 130);
    }
    case "wallets": {
      const list = rows === 0 ? 52 : Math.min(rows, 4) * WALLET_ROW_H + 6;
      return HEADER_H + Math.max(minBody, list + 62);
    }
    case "wardrobe":
      // The Hat / Face / Colour switch and two rows of looks.
      return HEADER_H + 158;
    case "discipline":
      // `rows` is 1 when the journal (week chart and recent trades) is open.
      return HEADER_H + (rows > 0 ? 270 : 168);
    case "event":
      // `rows`: lines of a "while you were away" card past the first two.
      return 168 + Math.max(0, rows - 2) * 19;
    case "greeting":
      return 150;
  }
}

/** The sidebar's height for a view: two header rows and the mascot's band above it. */
export function sidebarHeight(view: IslandViewName, rows: number): number {
  // The event card and the greeting: the mascot on top, the words under it.
  if (view === "event") return viewHeight("event", rows) + 140;
  if (view === "greeting") return viewHeight("greeting", rows) + 110;
  // Every look on six columns: four rows of hats, faces or colours.
  if (view === "wardrobe") return SIDEBAR_HEADER_H + SIDEBAR_BAND_H + 300;
  // Trending's switches wrap onto a third row in the narrow sidebar.
  const extra = view === "trending" ? 30 : 0;
  return viewHeight(view, rows, SIDEBAR_ROWS) - HEADER_H + SIDEBAR_HEADER_H + SIDEBAR_BAND_H + extra;
}

export function isSide(placement: Placement): boolean {
  return placement === "left" || placement === "right";
}

/** The window's size for a placement (must match window_frame in island.rs). */
export function windowSize(placement: Placement): { w: number; h: number } {
  return isSide(placement) ? { w: SIDE_PANEL_W, h: SIDE_PANEL_H } : { w: PANEL_W, h: PANEL_H };
}

export function islandSize(mode: IslandMode, view: IslandViewName, rows: number, placement: Placement = "top"): { w: number; h: number } {
  const side = isSide(placement);
  // A floating island never hides: there is no edge to wake it from.
  if (placement === "float" && mode === "hidden") mode = "compact";
  if (side && mode === "hidden") return { w: 0, h: SIDE_TAB_H };
  if (side && mode === "compact") return { w: SIDE_TAB_W, h: SIDE_TAB_H };
  if (side) return { w: SIDEBAR_W, h: Math.min(SIDE_PANEL_H - 20, sidebarHeight(view, rows)) };
  switch (mode) {
    case "hidden":
      return { w: HIDDEN_W, h: 0 };
    case "compact":
      return { w: COMPACT_W, h: COMPACT_H };
    case "expanded":
      return { w: EXPANDED_W, h: Math.min(PANEL_H - 20, viewHeight(view, rows)) };
  }
}

/** A floating island in the lower half of the display hangs from the window's bottom and opens upwards. */
export function floatsUp(floatY: number): boolean {
  return floatY > 0.5;
}

/** The island's top-left corner in the window, for its size and placement. */
export function islandOrigin(placement: Placement, w: number, h: number, up = false): { x: number; y: number } {
  switch (placement) {
    case "top":
      return { x: (PANEL_W - w) / 2, y: 0 };
    case "left":
      return { x: 0, y: (SIDE_PANEL_H - h) / 2 };
    case "right":
      return { x: SIDE_PANEL_W - w, y: (SIDE_PANEL_H - h) / 2 };
    case "float":
      return { x: (PANEL_W - w) / 2, y: up ? PANEL_H - FLOAT_MARGIN - h : FLOAT_MARGIN };
  }
}

/** Rounded corners, except where the island meets a screen edge. */
export function islandCorners(placement: Placement, r: number): string {
  switch (placement) {
    case "top":
      return `0 0 ${r}px ${r}px`;
    case "left":
      return `0 ${r}px ${r}px 0`;
    case "right":
      return `${r}px 0 0 ${r}px`;
    case "float":
      return `${r}px`;
  }
}

export interface MascotPlacement {
  cx: number;
  cy: number;
  size: number;
  opacity: number;
}

/** Where the mascot sits, relative to the island's top-left corner. */
export function mascotPlacement(mode: IslandMode, view: IslandViewName, islandH: number, placement: Placement = "top"): MascotPlacement {
  const side = placement === "left" || placement === "right";
  if (placement === "float" && mode === "hidden") mode = "compact";
  // The side tab: the mascot on top, the ticker under it.
  if (side && mode === "hidden") return { cx: 0, cy: 22, size: 10, opacity: 0 };
  // As on the top ticker (22, 16, 28), turned upright.
  if (side && mode === "compact") return { cx: SIDE_TAB_W / 2, cy: 22, size: 28, opacity: 1 };
  if (side && mode === "expanded") {
    if (view === "greeting" || view === "event") return { cx: SIDEBAR_W / 2, cy: 62, size: 92, opacity: 1 };
    // In the band under the header, its line to the right of it.
    return { cx: 46, cy: SIDEBAR_HEADER_H + SIDEBAR_BAND_H / 2, size: 58, opacity: 1 };
  }
  switch (mode) {
    case "hidden":
      return { cx: 24, cy: 6, size: 10, opacity: 0 };
    case "compact":
      return { cx: 22, cy: 16, size: 28, opacity: 1 };
    case "expanded": {
      if (view === "greeting") return { cx: 92, cy: 78, size: 104, opacity: 1 };
      if (view === "event") return { cx: 84, cy: 84, size: 104, opacity: 1 };
      // The mascot and its caption (up to two lines below it) sit as one group
      // in the middle of the left column, however tall the island grows. The
      // island's height is animated, so the mascot glides along as it opens.
      const size = 84;
      const group = size + MASCOT_CAPTION_H;
      const body = islandH - HEADER_H;
      const groupTop = HEADER_H + Math.max(0, (body - group) / 2);
      return { cx: SIDE_W / 2 + 6, cy: groupTop + size / 2, size, opacity: 1 };
    }
  }
}
