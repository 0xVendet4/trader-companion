// Little still pictures of looks, for the cards of the island's wardrobe and
// of the closet window: Candy wearing one, or a scrap of island in a background.

import { h } from "./dom";
import type { Look } from "../core/looks";
import type { Theme } from "../core/state";
import { DEFAULT_ACCENT, DEFAULT_UP, ISLAND_THEMES, themeInk, themeSwatch } from "../core/themes";
import { accessory, dressed, miniCandy, type Manifest } from "../mascot/mascot";
import { lookFilter } from "../mascot/skins";

/** Candy in a whole look: the costume's body (or Candy's, in its colour), the face accessory and the hat. Still, no timers. */
export function lookCandy(art: Manifest, look: Look): HTMLElement {
  return miniCandy(dressed(art, look.costume), {
    hat: accessory(art, "outfits", look.outfit),
    face: accessory(art, "faces", look.face),
    filter: lookFilter(look),
  });
}

/**
 * A little island in a background, with a token on it. `small` (the island
 * wardrobe's tiles) draws a fine pattern coarser, so it shows at that size.
 */
export function islandSwatch(id: Theme, small = false): HTMLElement {
  const theme = ISLAND_THEMES[id];
  const el = h("span", { class: "island-swatch" }, h("i", { class: "sw-dot" }), h("i", { class: "sw-line" }), h("i", { class: "sw-up" }));
  el.style.background = small ? themeSwatch(id) : theme.background;
  if (theme.ring) el.style.boxShadow = theme.ring;
  // Its own accent, text colour and up tone, not the ones the island wears now.
  el.style.setProperty("--accent", theme.accent ?? DEFAULT_ACCENT);
  el.style.setProperty("--sw-ink", themeInk(id));
  el.style.setProperty("--up", theme.vars?.["--up"] ?? DEFAULT_UP);
  return el;
}
