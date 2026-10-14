// Island geometry, in logical pixels. The window is a fixed PANEL_W × PANEL_H
// (must match src-tauri/src/island.rs); the island is drawn inside it, glued
// to the top edge and centred, to a side edge and vertically centred, or
// floating (see Placement).

import type { CompactIsland, IslandMode, IslandViewName, Placement } from "./state";

export const PANEL_W = 720;
export const PANEL_H = 340;

export const HIDDEN_W = 184;
export const COMPACT_W = 350;
/**
 * The compact ticker's height, the normal one. The floating island's maths
 * in island.rs (float_pill) use this value: the compact island's shorter
 * ticker (Density.tickerH) still hangs from the same window edge, so the
 * window's place is the same; only the pill sits a few px higher in it.
 */
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
/** A My wallet row: two lines, and the bar under them. */
export const POS_ROW_H = 40;
/** The watchlist's folder chips. */
export const FOLDERS_H = 24;
export const MAX_ROWS = 6;
export const WALLET_ROW_H = 48;

/**
 * The heights the island is built from: the normal ones, and the compact
 * island's (Settings → Compact island), each a step smaller. Every number
 * here pairs with a rule in style.css (body.compact for the second set).
 */
export interface Density {
  /** The header with the tabs. */
  headerH: number;
  /** A watchlist, trending or search row, and the column heads over them. */
  rowH: number;
  headRowH: number;
  /** A My wallet row: two lines, and the bar under them. */
  posRowH: number;
  /** An alert rule's row. */
  alertRowH: number;
  /** A followed wallet's card. */
  walletRowH: number;
  /** The watchlist's folder chips. */
  foldersH: number;
  /** Buttons and fields. */
  fieldH: number;
  /** A view's padding, above and below its content together. */
  padY: number;
  /** The least a tab view's body takes under the header. */
  minBody: number;
  /** The compact ticker's height, and the mascot in it. */
  tickerH: number;
  tickerMascot: number;
  /** The mascot in the open island. */
  mascot: number;
  /** My wallet: rows shown before the list scrolls, and what is around them (the wallet line, the cards, the allocation bar, the heads, the fine print). */
  posRows: number;
  walletExtra: number;
  /** Discipline: Today, and with the journal open. */
  disciplineH: number;
  journalH: number;
  wardrobeH: number;
  musicH: number;
  /** Trending's two rows of switches. */
  switchesH: number;
}

export const NORMAL: Density = {
  headerH: HEADER_H,
  rowH: ROW_H,
  headRowH: 20,
  posRowH: POS_ROW_H,
  alertRowH: 28,
  walletRowH: WALLET_ROW_H,
  foldersH: FOLDERS_H,
  fieldH: 28,
  padY: 16,
  minBody: 132,
  tickerH: COMPACT_H,
  tickerMascot: 28,
  mascot: 84,
  posRows: 5,
  walletExtra: 203,
  disciplineH: 196,
  journalH: 280,
  wardrobeH: 204,
  musicH: 132,
  switchesH: 96,
};

export const COMPACT: Density = {
  headerH: 32,
  rowH: 24,
  headRowH: 18,
  posRowH: 34,
  alertRowH: 24,
  walletRowH: 42,
  foldersH: 22,
  fieldH: 24,
  padY: 12,
  minBody: 112,
  tickerH: 26,
  tickerMascot: 22,
  mascot: 72,
  posRows: 4,
  walletExtra: 150,
  disciplineH: 168,
  journalH: 258,
  wardrobeH: 172,
  musicH: 118,
  switchesH: 86,
};

export function density(compact: boolean): Density {
  return compact ? COMPACT : NORMAL;
}

/**
 * Displays this tall or shorter get the compact island with "auto". The
 * height is the one the island lays itself out in: logical px, after the
 * system's display scaling (ScreenInfo.height in island.rs), since that is
 * the room the island takes. A 1366 × 768 laptop and a 1440 × 900 MacBook Air
 * qualify, a 1080p monitor at 100 % does not, and the same monitor at
 * Windows' 125 % (864 px of room) does.
 */
export const COMPACT_SCREEN_H = 900;

/** Whether the island is compact: the trader's choice, or by the display's height (logical px; 0: not known yet). */
export function compactFor(setting: CompactIsland, screenHeight: number): boolean {
  if (setting === "on") return true;
  if (setting === "off") return false;
  return screenHeight > 0 && screenHeight <= COMPACT_SCREEN_H;
}

/** Content heights below the header, per view, given how many rows they show. */
export function viewHeight(view: IslandViewName, rows: number, maxRows = MAX_ROWS, d: Density = NORMAL): number {
  const { headerH, minBody } = d;
  switch (view) {
    case "watchlist": {
      // The folder chips, then the list under its heads (or its empty line), then the field.
      const list = rows === 0 ? d.padY + 30 : Math.min(rows, maxRows) * d.rowH + d.headRowH + 6;
      return headerH + Math.max(minBody, list + d.fieldH + d.padY + 6 + d.foldersH);
    }
    case "trending": {
      // The Hot/New switch, then up to MAX_ROWS rows (scrolls past that).
      const list = rows === 0 ? d.padY + 30 : Math.min(rows, maxRows) * d.rowH;
      // Two switch rows (list + chains, sort + window) above the table.
      return headerH + Math.max(minBody, list + d.switchesH);
    }
    case "alerts": {
      const list = rows === 0 ? 40 : Math.min(rows, 4) * d.alertRowH + 8;
      return headerH + Math.max(minBody, list + d.fieldH + 30);
    }
    case "positions": {
      // No wallet yet (0): the setup text and field. Otherwise the wallet line,
      // a summary, the column heads, the rows and a line of fine print with
      // Share my day. The cards, the allocation bar and two-line rows
      // (Activity rows are shorter, but have a heading per day).
      if (rows === 0) return headerH + minBody;
      return headerH + Math.max(minBody, Math.min(rows, d.posRows) * d.posRowH + d.walletExtra);
    }
    case "wallets": {
      const list = rows === 0 ? 52 : Math.min(rows, 4) * d.walletRowH + 6;
      return headerH + Math.max(minBody, list + d.fieldH + 34);
    }
    case "wardrobe":
      // The Hat / Face / Colour switch and the rows of looks: three on twelve
      // columns (36 hats, 36 faces), three on the compact island's fourteen.
      return headerH + d.wardrobeH;
    case "music":
      // The cover beside the title and artist, the progress bar, the buttons.
      return headerH + d.musicH;
    case "discipline":
      // `rows` is 1 when the journal (week chart and recent trades) is open.
      // The journal fills the tallest island the window allows (PANEL_H − 20).
      return headerH + (rows > 0 ? d.journalH : d.disciplineH);
    case "event":
      // `rows`: lines of a "while you were away" card past the first two.
      return 168 + Math.max(0, rows - 2) * 19;
    case "greeting":
      return 150;
  }
}

/**
 * The sidebar's height for a view: two header rows and the mascot's band above
 * it. The discipline pane's foot (Share my day · my week · Replay today · Your
 * rules) takes two rows in the narrow sidebar; `wide`: the island wears a
 * wider face (a monospace theme), and the session line takes a second row too.
 */
export function sidebarHeight(view: IslandViewName, rows: number, d: Density = NORMAL, wide = false): number {
  // The event card and the greeting: the mascot on top, the words under it.
  if (view === "event") return viewHeight("event", rows, MAX_ROWS, d) + 140;
  if (view === "greeting") return viewHeight("greeting", rows, MAX_ROWS, d) + 110;
  // Every look on six columns, under the shelf switch and the closet button:
  // six rows of hats (36) and of faces (36), four of colours, none scrolling.
  if (view === "wardrobe") return SIDEBAR_HEADER_H + SIDEBAR_BAND_H + 440;
  // Trending's switches wrap onto a third row in the narrow sidebar; the
  // discipline foot onto a second (14 px), its session line too in a wider face.
  const extra = view === "trending" ? 30 : view === "discipline" ? (wide ? 28 : 14) : 0;
  return viewHeight(view, rows, SIDEBAR_ROWS, d) - d.headerH + SIDEBAR_HEADER_H + SIDEBAR_BAND_H + extra;
}

export function isSide(placement: Placement): boolean {
  return placement === "left" || placement === "right";
}

/** The window's size for a placement (must match window_frame in island.rs). */
export function windowSize(placement: Placement): { w: number; h: number } {
  return isSide(placement) ? { w: SIDE_PANEL_W, h: SIDE_PANEL_H } : { w: PANEL_W, h: PANEL_H };
}

/**
 * The island's size. `compact`: the compact island (Density). `wide`: the
 * theme wears a wider face (see sidebarHeight).
 */
export function islandSize(mode: IslandMode, view: IslandViewName, rows: number, placement: Placement = "top", compact = false, wide = false): { w: number; h: number } {
  const d = density(compact);
  const side = isSide(placement);
  // A floating island never hides: there is no edge to wake it from.
  if (placement === "float" && mode === "hidden") mode = "compact";
  if (side && mode === "hidden") return { w: 0, h: SIDE_TAB_H };
  // The side tab is the ticker stood upright: as thin as it is tall.
  if (side && mode === "compact") return { w: d.tickerH, h: SIDE_TAB_H };
  if (side) return { w: SIDEBAR_W, h: Math.min(SIDE_PANEL_H - 20, sidebarHeight(view, rows, d, wide)) };
  switch (mode) {
    case "hidden":
      return { w: HIDDEN_W, h: 0 };
    case "compact":
      return { w: COMPACT_W, h: d.tickerH };
    case "expanded":
      return { w: EXPANDED_W, h: Math.min(PANEL_H - 20, viewHeight(view, rows, MAX_ROWS, d)) };
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
export function mascotPlacement(mode: IslandMode, view: IslandViewName, islandH: number, placement: Placement = "top", compact = false): MascotPlacement {
  const d = density(compact);
  const side = placement === "left" || placement === "right";
  if (placement === "float" && mode === "hidden") mode = "compact";
  // The side tab: the mascot on top, the ticker under it.
  if (side && mode === "hidden") return { cx: 0, cy: 22, size: 10, opacity: 0 };
  // As on the top ticker, turned upright.
  if (side && mode === "compact") return { cx: d.tickerH / 2, cy: d.tickerH / 2 + 6, size: d.tickerMascot, opacity: 1 };
  if (side && mode === "expanded") {
    if (view === "greeting" || view === "event") return { cx: SIDEBAR_W / 2, cy: 62, size: 92, opacity: 1 };
    // In the band under the header, its line to the right of it.
    return { cx: 46, cy: SIDEBAR_HEADER_H + SIDEBAR_BAND_H / 2, size: 58, opacity: 1 };
  }
  switch (mode) {
    case "hidden":
      return { cx: 24, cy: 6, size: 10, opacity: 0 };
    case "compact":
      // 8 px in from the left edge, centred on the ticker's height.
      return { cx: 8 + d.tickerMascot / 2, cy: d.tickerH / 2, size: d.tickerMascot, opacity: 1 };
    case "expanded": {
      if (view === "greeting") return { cx: 92, cy: 78, size: 104, opacity: 1 };
      if (view === "event") return { cx: 84, cy: 84, size: 104, opacity: 1 };
      // The mascot and its caption (up to two lines below it) sit as one group
      // in the middle of the left column, however tall the island grows. The
      // island's height is animated, so the mascot glides along as it opens.
      const size = d.mascot;
      const group = size + MASCOT_CAPTION_H;
      const body = islandH - d.headerH;
      const groupTop = d.headerH + Math.max(0, (body - group) / 2);
      return { cx: SIDE_W / 2 + 6, cy: groupTop + size / 2, size, opacity: 1 };
    }
  }
}

/**
 * Where the mascot sits in the ticker (logical px from the island's top-left
 * corner, under the band over a notch): where Candy's flights to and from the
 * desktop start and end. The island pushes it to Rust (set_ticker_seat), whose
 * desktop.rs falls back to the normal top seat until it has.
 */
export function tickerSeat(placement: Placement, compact: boolean): { cx: number; cy: number } {
  const { cx, cy } = mascotPlacement("compact", "watchlist", density(compact).tickerH, placement, compact);
  return { cx, cy };
}
