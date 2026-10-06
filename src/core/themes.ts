// Island backgrounds. One list for the island itself, the wardrobe's Island
// shelf and the settings swatches. Every background stays dark: the island's
// text is light. `ring` is the island's box-shadow (an outline, a glow), and
// `accent` recolours highlights where it is set.

import type { Theme } from "./state";

export interface IslandTheme {
  name: string;
  background: string;
  ring?: string;
  accent?: string;
}

const grid = (rgba: string) =>
  `linear-gradient(${rgba} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, ${rgba} 1px, transparent 1px) 0 0 / 14px 14px`;
const glow = (rgba: string, strong: string) => `0 0 0 1px ${rgba}, 0 6px 26px ${strong}`;
/** A scatter of stars, repeating every 120 × 60 px. */
const stars = [
  [12, 18, 0.9], [38, 44, 0.6], [61, 12, 0.8], [83, 36, 0.5], [104, 20, 0.9], [27, 52, 0.4], [96, 54, 0.7], [70, 30, 0.35],
]
  .map(([x, y, a]) => `radial-gradient(1.2px 1.2px at ${x}px ${y}px, rgba(255, 255, 255, ${a}), transparent) 0 0 / 120px 60px`)
  .join(", ");

export const ISLAND_THEMES: Record<Theme, IslandTheme> = {
  classic: { name: "Classic", background: "#000" },
  midnight: { name: "Midnight", background: "linear-gradient(180deg, #0b1226, #050814)" },
  neon: { name: "Neon", background: "#000", ring: glow("rgba(74, 222, 128, 0.55)", "rgba(74, 222, 128, 0.28)") },
  gold: {
    name: "Gold",
    background: "linear-gradient(180deg, #0d0a04, #000)",
    ring: glow("rgba(250, 204, 21, 0.5)", "rgba(250, 204, 21, 0.18)"),
    accent: "#facc15",
  },
  // See-through: on Windows the desktop shows behind it.
  glass: { name: "Glass", background: "rgba(12, 12, 16, 0.8)", ring: "0 0 0 1px rgba(255, 255, 255, 0.14)" },
  carbon: {
    name: "Carbon",
    background: "repeating-linear-gradient(45deg, #141417 0 4px, #0a0a0c 4px 8px)",
    ring: "0 0 0 1px rgba(255, 255, 255, 0.08)",
  },
  solana: {
    name: "Solana",
    background: "linear-gradient(120deg, #1d0c38 0%, #0a0912 55%, #052a24 100%)",
    ring: glow("rgba(153, 69, 255, 0.5)", "rgba(20, 241, 149, 0.16)"),
    accent: "#c084fc",
  },
  ocean: {
    name: "Ocean",
    background: "linear-gradient(180deg, #05203a, #020b16)",
    ring: glow("rgba(56, 189, 248, 0.45)", "rgba(56, 189, 248, 0.2)"),
    accent: "#38bdf8",
  },
  sunset: {
    name: "Sunset",
    background: "linear-gradient(180deg, #1f0b26 0%, #2b0c16 65%, #3d1806 100%)",
    ring: glow("rgba(251, 146, 60, 0.45)", "rgba(251, 146, 60, 0.18)"),
    accent: "#fb923c",
  },
  bubblegum: {
    name: "Bubblegum",
    background: "linear-gradient(180deg, #26102c, #0f0713)",
    ring: glow("rgba(244, 114, 182, 0.45)", "rgba(244, 114, 182, 0.18)"),
    accent: "#f472b6",
  },
  matrix: {
    name: "Matrix",
    background: `${grid("rgba(74, 222, 128, 0.08)")}, #020503`,
    ring: "0 0 0 1px rgba(74, 222, 128, 0.35)",
  },
  bull: {
    name: "Bull",
    background: "radial-gradient(120% 140% at 50% 0%, #0c2c19 0%, #020805 70%)",
    ring: glow("rgba(52, 211, 153, 0.45)", "rgba(52, 211, 153, 0.18)"),
  },
  bear: {
    name: "Bear",
    background: "radial-gradient(120% 140% at 50% 0%, #2e0c11 0%, #080203 70%)",
    ring: glow("rgba(244, 80, 94, 0.45)", "rgba(244, 80, 94, 0.18)"),
  },
  // To the moon: a starry night.
  moon: {
    name: "Moon",
    background: `${stars}, radial-gradient(90% 120% at 85% 0%, #1b2350 0%, #070a1c 55%, #020308 100%)`,
    ring: glow("rgba(165, 180, 252, 0.4)", "rgba(165, 180, 252, 0.16)"),
    accent: "#a5b4fc",
  },
};

/** The CSS variables a theme sets on the page (see #island in style.css). */
export function themeVars(theme: Theme): Record<"--island-bg" | "--island-ring" | "--accent", string | null> {
  const t = ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic;
  return { "--island-bg": t.background, "--island-ring": t.ring ?? "none", "--accent": t.accent ?? null };
}

/** Puts a theme on an element: the page, or a swatch that previews it. */
export function applyTheme(el: HTMLElement, theme: Theme) {
  for (const [name, value] of Object.entries(themeVars(theme))) {
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
  }
}
