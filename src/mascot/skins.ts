// Mascot colours. Each one is a CSS filter over the sprite, so every mood keeps
// its own face and the art needs no extra files. Pure: the island and the
// settings preview both ask here for the filter to apply.

import type { CustomSkin, Skin } from "../core/state";

/** The art is green; a preset rotates and tints it. */
export const SKIN_FILTERS: Record<Exclude<Skin, "custom">, string> = {
  mint: "none",
  neon: "saturate(2.2) brightness(1.15)",
  forest: "saturate(0.9) brightness(0.62)",
  lime: "hue-rotate(-38deg) saturate(1.7) brightness(1.08)",
  lemon: "hue-rotate(-82deg) saturate(1.7) brightness(1.18)",
  gold: "sepia(1) saturate(2.6) hue-rotate(-14deg) brightness(1.05)",
  sunset: "hue-rotate(-112deg) saturate(1.25)",
  peach: "hue-rotate(-122deg) saturate(0.7) brightness(1.22)",
  cherry: "hue-rotate(-140deg) saturate(1.45)",
  ruby: "hue-rotate(-140deg) saturate(1.7) brightness(0.72)",
  rose: "hue-rotate(-172deg) saturate(1.2) brightness(1.05)",
  magenta: "hue-rotate(160deg) saturate(1.6)",
  grape: "hue-rotate(140deg) saturate(1.1)",
  lavender: "hue-rotate(120deg) saturate(0.6) brightness(1.22)",
  violet: "hue-rotate(125deg) saturate(1.3) brightness(0.8)",
  teal: "hue-rotate(32deg) saturate(1.15)",
  sky: "hue-rotate(58deg) saturate(0.75) brightness(1.22)",
  ice: "hue-rotate(55deg) saturate(0.35) brightness(1.45)",
  ocean: "hue-rotate(70deg) saturate(1.1)",
  navy: "hue-rotate(85deg) saturate(1.3) brightness(0.62)",
  ghost: "grayscale(1) brightness(1.18) contrast(0.95)",
  slate: "grayscale(0.7) hue-rotate(70deg) brightness(0.95)",
  charcoal: "grayscale(1) brightness(0.62)",
};

/** Hue of the art's own green, for showing a custom hue as a colour. */
export const BASE_HUE = 142;

export const DEFAULT_CUSTOM_SKIN: CustomSkin = { hue: 0, sat: 100, light: 100 };

const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
};

/** A saved custom colour, repaired: hue −180…180°, saturation 0…250%, brightness 60…140%. */
export function normalizeCustomSkin(raw: Partial<CustomSkin> | null | undefined): CustomSkin {
  const c = raw ?? {};
  return {
    hue: clamp(c.hue, -180, 180, DEFAULT_CUSTOM_SKIN.hue),
    sat: clamp(c.sat, 0, 250, DEFAULT_CUSTOM_SKIN.sat),
    light: clamp(c.light, 60, 140, DEFAULT_CUSTOM_SKIN.light),
  };
}

/** The CSS filter for a skin. */
export function skinFilter(skin: Skin, custom?: CustomSkin | null): string {
  if (skin !== "custom") return SKIN_FILTERS[skin] ?? "none";
  const c = normalizeCustomSkin(custom);
  return `hue-rotate(${c.hue}deg) saturate(${c.sat}%) brightness(${c.light}%)`;
}

/** The filter for the whole look: a costume keeps its own colours. */
export function lookFilter(c: { costume: string; skin: Skin; customSkin: CustomSkin }): string {
  return c.costume === "none" ? skinFilter(c.skin, c.customSkin) : "none";
}

/** The colour a custom skin turns the art's green into, for a swatch. */
export function customSwatch(custom: CustomSkin): string {
  const c = normalizeCustomSkin(custom);
  const hue = (((BASE_HUE + c.hue) % 360) + 360) % 360;
  const sat = Math.min(100, Math.round(70 * (c.sat / 100)));
  const light = Math.min(85, Math.round(45 * (c.light / 100)));
  return `hsl(${hue} ${sat}% ${light}%)`;
}
