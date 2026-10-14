// Island looks. One list for the island itself, the wardrobe's Island shelf
// and the settings swatches. A theme is a background, a `ring` (the island's
// box-shadow: an outline, a glow) and an `accent` that recolours highlights;
// a full theme also sets `vars`, the page's own CSS variables (text, cards,
// borders, up/down tones, fonts: see :root in src/style.css), and restyles
// the whole island. `light` marks the one look with dark ink on a pale
// island: form controls and scrollbars follow it (color-scheme).

import { N_ } from "./i18n";
import { clampTransparency, type Theme } from "./state";

/** The variables a theme may set, as :root in style.css declares them. */
export const THEME_VARS = [
  "--font", "--font-num", "--caps",
  "--ink", "--dim", "--dim-2", "--dim-3",
  "--card", "--card-2", "--tab-on", "--pop", "--hover", "--hairline", "--hairline-2",
  "--up", "--down", "--amber", "--calm",
  "--base", "--on-ink", "--ink-hover", "--knob", "--bubble", "--bubble-ink", "--scroll", "--fx-rgb", "--chain-pure", "--card-edge",
] as const;
export type ThemeVar = (typeof THEME_VARS)[number];
export type ThemeVars = Partial<Record<ThemeVar, string>>;

export interface IslandTheme {
  /** In English (N_): t(name) where it is shown. */
  name: string;
  background: string;
  ring?: string;
  accent?: string;
  /** The page's variables this theme overrides; the rest keep style.css's. */
  vars?: ThemeVars;
  /** Dark ink on a pale island. */
  light?: boolean;
  /** The alpha of a `background` that is see-through on its own (Glass): the words get their shade from the start. */
  alpha?: number;
  /**
   * The background drawn small, for the wardrobe's and Settings' swatches,
   * where a pattern as fine as the island's would not show (Blueprint's grid:
   * on its own island the swatch was a blank box on a card of its blue).
   */
  swatch?: string;
}

/** The island's text colour before any theme: :root's --ink in style.css. */
export const DEFAULT_INK = "#f5f6f8";
/** The accent before any theme: :root's --accent in style.css. */
export const DEFAULT_ACCENT = "#4ade80";
/** The up tone before any theme: :root's --up in style.css. */
export const DEFAULT_UP = "#34d399";

const grid = (rgba: string) =>
  `linear-gradient(${rgba} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, ${rgba} 1px, transparent 1px) 0 0 / 14px 14px`;
const glow = (rgba: string, strong: string) => `0 0 0 1px ${rgba}, 0 6px 26px ${strong}`;
/** A scatter of stars, repeating every 120 × 60 px. */
const stars = [
  [12, 18, 0.9], [38, 44, 0.6], [61, 12, 0.8], [83, 36, 0.5], [104, 20, 0.9], [27, 52, 0.4], [96, 54, 0.7], [70, 30, 0.35],
]
  .map(([x, y, a]) => `radial-gradient(1.2px 1.2px at ${x}px ${y}px, rgba(255, 255, 255, ${a}), transparent) 0 0 / 120px 60px`)
  .join(", ");
/** Paper grain: faint fibres both ways over the cream. */
const fibres = [
  "repeating-linear-gradient(0deg, rgba(90, 64, 30, 0.035) 0 1px, transparent 1px 3px)",
  "repeating-linear-gradient(90deg, rgba(90, 64, 30, 0.025) 0 1px, transparent 1px 5px)",
].join(", ");
/**
 * Drafting film: a fine white grid every `cell` px and a stronger line every
 * fifth, as on a blueprint's sheet.
 */
const drafting = (cell: number, fine: number, strong: number) =>
  [
    `linear-gradient(rgba(255, 255, 255, ${strong}) 1px, transparent 1px) 0 0 / ${cell * 5}px ${cell * 5}px`,
    `linear-gradient(90deg, rgba(255, 255, 255, ${strong}) 1px, transparent 1px) 0 0 / ${cell * 5}px ${cell * 5}px`,
    `linear-gradient(rgba(255, 255, 255, ${fine}) 1px, transparent 1px) 0 0 / ${cell}px ${cell}px`,
    `linear-gradient(90deg, rgba(255, 255, 255, ${fine}) 1px, transparent 1px) 0 0 / ${cell}px ${cell}px`,
  ].join(", ");
const BLUEPRINT_GROUND = "linear-gradient(180deg, #10407f, #0a2e60)";
/** The page's one monospace stack (:root --mono in style.css), so a theme's
    words and the wallet addresses beside them share a face. */
const MONO = "var(--mono)";

export const ISLAND_THEMES: Record<Theme, IslandTheme> = {
  classic: { name: N_("Classic"), background: "#000" },
  midnight: { name: N_("Midnight"), background: "linear-gradient(180deg, #0b1226, #050814)" },
  neon: { name: N_("Neon"), background: "#000", ring: glow("rgba(74, 222, 128, 0.55)", "rgba(74, 222, 128, 0.28)") },
  gold: {
    name: N_("Gold"),
    background: "linear-gradient(180deg, #0d0a04, #000)",
    ring: glow("rgba(250, 204, 21, 0.5)", "rgba(250, 204, 21, 0.18)"),
    accent: "#facc15",
  },
  // See-through: on Windows the desktop shows behind it.
  glass: { name: N_("Glass"), background: "rgba(12, 12, 16, 0.8)", ring: "0 0 0 1px rgba(255, 255, 255, 0.14)", alpha: 0.8 },
  carbon: {
    name: N_("Carbon"),
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
    name: N_("Ocean"),
    background: "linear-gradient(180deg, #05203a, #020b16)",
    ring: glow("rgba(56, 189, 248, 0.45)", "rgba(56, 189, 248, 0.2)"),
    accent: "#38bdf8",
  },
  sunset: {
    name: N_("Sunset"),
    background: "linear-gradient(180deg, #1f0b26 0%, #2b0c16 65%, #3d1806 100%)",
    ring: glow("rgba(251, 146, 60, 0.45)", "rgba(251, 146, 60, 0.18)"),
    accent: "#fb923c",
  },
  bubblegum: {
    name: N_("Bubblegum"),
    background: "linear-gradient(180deg, #26102c, #0f0713)",
    ring: glow("rgba(244, 114, 182, 0.45)", "rgba(244, 114, 182, 0.18)"),
    accent: "#f472b6",
  },
  // The grid, and everything on it in green: the numbers in monospace.
  matrix: {
    name: N_("Matrix"),
    background: `${grid("rgba(74, 222, 128, 0.09)")}, #020503`,
    ring: "0 0 0 1px rgba(74, 222, 128, 0.35), 0 0 22px rgba(74, 222, 128, 0.12)",
    accent: "#4ade80",
    vars: {
      "--font-num": MONO,
      "--ink": "#b4f7c6",
      "--dim": "#5fc47d",
      "--dim-2": "#3f9459",
      "--dim-3": "#285f3a",
      "--card": "#071a0d",
      "--card-2": "#0b2613",
      "--tab-on": "#10331a",
      "--pop": "#06150a",
      "--hover": "rgba(74, 222, 128, 0.1)",
      "--hairline": "rgba(74, 222, 128, 0.18)",
      "--hairline-2": "rgba(74, 222, 128, 0.45)",
      "--up": "#4ade80",
      "--down": "#f87171",
      "--amber": "#fbbf24",
      "--calm": "#5eead4",
      "--base": "#020503",
      "--on-ink": "#02140a",
      "--ink-hover": "#dcfce7",
      "--knob": "#d1fae5",
      "--bubble": "#4ade80",
      "--bubble-ink": "#02140a",
      "--scroll": "#14532d",
      "--fx-rgb": "74, 222, 128",
    },
  },
  bull: {
    name: N_("Bull"),
    background: "radial-gradient(120% 140% at 50% 0%, #0c2c19 0%, #020805 70%)",
    ring: glow("rgba(52, 211, 153, 0.45)", "rgba(52, 211, 153, 0.18)"),
  },
  bear: {
    name: N_("Bear"),
    background: "radial-gradient(120% 140% at 50% 0%, #2e0c11 0%, #080203 70%)",
    ring: glow("rgba(244, 80, 94, 0.45)", "rgba(244, 80, 94, 0.18)"),
  },
  // To the moon: a starry night.
  moon: {
    name: N_("Moon"),
    background: `${stars}, radial-gradient(90% 120% at 85% 0%, #1b2350 0%, #070a1c 55%, #020308 100%)`,
    ring: glow("rgba(165, 180, 252, 0.4)", "rgba(165, 180, 252, 0.16)"),
    accent: "#a5b4fc",
  },
  // Phosphor green on black, every word in monospace and capitals, thin lines.
  terminal: {
    name: N_("Terminal"),
    background: "#000",
    ring: "0 0 0 1px rgba(82, 245, 126, 0.55)",
    accent: "#52f57e",
    vars: {
      "--font": MONO,
      "--caps": "uppercase",
      "--ink": "#52f57e",
      "--dim": "#2fb85a",
      "--dim-2": "#218a43",
      "--dim-3": "#155c2c",
      "--card": "#04110a",
      "--card-2": "#082013",
      "--tab-on": "#0d2d1a",
      "--pop": "#030a05",
      "--hover": "rgba(82, 245, 126, 0.12)",
      "--hairline": "rgba(82, 245, 126, 0.35)",
      "--hairline-2": "rgba(82, 245, 126, 0.65)",
      "--up": "#52f57e",
      "--down": "#ff5f5f",
      "--amber": "#ffcc33",
      "--calm": "#5fd3ff",
      "--base": "#000",
      "--on-ink": "#000",
      "--ink-hover": "#9dffb8",
      "--knob": "#c8ffd9",
      "--bubble": "#52f57e",
      "--bubble-ink": "#000",
      "--scroll": "#155c2c",
      "--fx-rgb": "82, 245, 126",
    },
  },
  // Pink, cyan and purple, a glow all round, magenta highlights.
  vaporwave: {
    name: "Vaporwave",
    background: [
      "radial-gradient(70% 110% at 0% 0%, rgba(255, 113, 206, 0.38), transparent 62%)",
      "radial-gradient(70% 110% at 100% 100%, rgba(1, 205, 254, 0.34), transparent 62%)",
      "linear-gradient(135deg, #2e0b52 0%, #4d1366 38%, #1c1148 70%, #0c2d55 100%)",
    ].join(", "),
    ring: "0 0 0 1px rgba(255, 113, 206, 0.6), 0 0 26px rgba(1, 205, 254, 0.35), 0 8px 30px rgba(255, 113, 206, 0.25)",
    accent: "#ff71ce",
    vars: {
      "--ink": "#fdf4ff",
      "--dim": "#c9a9ee",
      "--dim-2": "#9f80cc",
      "--dim-3": "#6f58a3",
      "--card": "#3c1a63",
      "--card-2": "#4e2478",
      "--tab-on": "#622f90",
      "--pop": "#3c1a63",
      "--hover": "rgba(255, 255, 255, 0.1)",
      "--hairline": "rgba(255, 113, 206, 0.3)",
      "--hairline-2": "rgba(1, 205, 254, 0.55)",
      "--up": "#3df5b0",
      "--down": "#ff5c8a",
      "--amber": "#ffe66d",
      "--calm": "#01cdfe",
      "--base": "#2e0b52",
      "--on-ink": "#2e0b52",
      "--ink-hover": "#fff",
      "--knob": "#fff",
      "--bubble": "#ff71ce",
      "--bubble-ink": "#2e0b52",
      "--scroll": "#6f58a3",
      "--fx-rgb": "1, 205, 254",
    },
  },
  // Cream paper, dark ink, warm cards: the only light island, red pen for the highlights.
  paper: {
    name: N_("Paper"),
    background: `${fibres}, linear-gradient(180deg, #f8f1e1, #efe4cc)`,
    ring: "0 0 0 1px rgba(74, 52, 28, 0.32), 0 8px 24px rgba(0, 0, 0, 0.35)",
    accent: "#b5422f",
    light: true,
    vars: {
      "--ink": "#2a2219",
      "--dim": "#6b5d4e",
      "--dim-2": "#8c7e6d",
      "--dim-3": "#b3a58f",
      "--card": "#e9ddc3",
      "--card-2": "#dfd1b2",
      "--tab-on": "#d6c6a3",
      "--pop": "#fbf6ea",
      "--hover": "rgba(74, 52, 28, 0.08)",
      "--hairline": "rgba(74, 52, 28, 0.16)",
      "--hairline-2": "rgba(74, 52, 28, 0.35)",
      "--up": "#1e7a47",
      "--down": "#c0392b",
      "--amber": "#b36b00",
      "--calm": "#2a6f97",
      "--base": "#f4ebd8",
      "--on-ink": "#f8f1e1",
      "--ink-hover": "#000",
      "--knob": "#fff",
      "--bubble": "#2a2219",
      "--bubble-ink": "#f8f1e1",
      "--scroll": "#c6b797",
      "--fx-rgb": "74, 52, 28",
      // The chains' bright tags (SOL, ETH, BSC, BASE) are faint on cream: darkened toward the ink.
      "--chain-pure": "55%",
    },
  },
  // A technical drawing: white and pale-cyan ink on deep blue drafting film,
  // cards as lighter boxes ruled in white, the numbers lettered in monospace.
  blueprint: {
    name: N_("Blueprint"),
    background: `${drafting(8, 0.045, 0.11)}, ${BLUEPRINT_GROUND}`,
    swatch: `${drafting(5, 0.1, 0.24)}, ${BLUEPRINT_GROUND}`,
    ring: "0 0 0 1px rgba(186, 230, 255, 0.5), 0 8px 26px rgba(3, 16, 40, 0.55)",
    accent: "#8fe3ff",
    vars: {
      "--font-num": MONO,
      "--ink": "#eef6ff",
      "--dim": "#a9c8ea",
      "--dim-2": "#8db2de",
      "--dim-3": "#5a81b0",
      "--card": "#12437f",
      "--card-2": "#174b8c",
      "--tab-on": "#1d5599",
      "--pop": "#0f3b75",
      "--hover": "rgba(255, 255, 255, 0.08)",
      "--hairline": "rgba(255, 255, 255, 0.22)",
      "--hairline-2": "rgba(255, 255, 255, 0.55)",
      "--up": "#5df0b0",
      "--down": "#ffa594",
      "--amber": "#ffd27a",
      "--calm": "#9ad8ff",
      "--base": "#0c3570",
      "--on-ink": "#0c3570",
      "--ink-hover": "#fff",
      "--knob": "#fff",
      "--bubble": "#eef6ff",
      "--bubble-ink": "#0c3570",
      "--scroll": "#3d6ba6",
      "--fx-rgb": "160, 220, 255",
      // The chains' tags (BASE's blue above all) faint on the blue, on their own
      // tinted chips: lightened toward the ink, readable on every card.
      "--chain-pure": "42%",
      // Every card, chip and tab ruled in a white hairline, as a drafting box.
      "--card-edge": "rgba(255, 255, 255, 0.2)",
    },
  },
};

/**
 * A look whose words or numbers are in a monospace face, wider than the
 * island's own: narrow layouts (the sidebar's discipline pane) give its lines
 * room to wrap.
 */
export function wideFace(theme: Theme): boolean {
  const vars = (ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic).vars;
  return !!(vars?.["--font"] || vars?.["--font-num"]);
}

/** The look's background for a small swatch: its coarser `swatch` where it has one. */
export function themeSwatch(theme: Theme): string {
  const t = ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic;
  return t.swatch ?? t.background;
}

/** The look's text colour, for a swatch that hints at it. */
export function themeInk(theme: Theme): string {
  return (ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic).vars?.["--ink"] ?? DEFAULT_INK;
}

/**
 * The opacity of the island's background layer for a transparency (%): 1 is
 * solid, 70% leaves 0.3. The layer carries the theme's colours and ring, so a
 * gradient or a pattern keeps its look, only fainter; the words, the cards and
 * Candy sit above it, untouched. Glass is see-through on its own (its colour
 * has an alpha of 0.8) and the layer's opacity multiplies that: the slider
 * adds to Glass's transparency rather than replacing it.
 */
export function islandAlpha(transparency: number): number {
  return (100 - clampTransparency(transparency)) / 100;
}

/**
 * How much of the desktop shows through the island's background, 0 (none)
 * to 1: the slider's share times the theme's own (Glass lets 0.2 through
 * before the slider moves).
 */
export function islandThrough(theme: Theme, transparency: number): number {
  const t = ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic;
  const through = 1 - islandAlpha(transparency) * (t.alpha ?? 1);
  return through < 0.005 ? 0 : through;
}

/**
 * The shadow under the island's words for a transparency: none while the
 * background is solid, a halo that deepens as the desktop shows through
 * (grey words on a faint black over a bright page were unreadable at 70%).
 * Dark under light ink; light under the dark ink of a pale island (Paper).
 * Glass is see-through on its own, so its words carry a faint one from 0%.
 */
export function islandTextShadow(theme: Theme, transparency: number): string {
  const through = islandThrough(theme, transparency);
  if (through === 0) return "none";
  const a = Math.min(1, through * 1.25).toFixed(2);
  const rgb = (ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic).light ? "255, 255, 255" : "0, 0, 0";
  return `0 1px 2px rgba(${rgb}, ${a}), 0 0 1px rgba(${rgb}, ${a})`;
}

/** The island's greys as :root sets them (style.css): the dim words, and the dimmer column heads. */
const DIM = "#9398a1";
const DIM_2 = "#6b7079";

/** A colour moved toward another by k (0 leaves it, 1 is the other). */
function lift(hex: string, k: number, toward = "#ffffff"): string {
  const n = parseInt(hex.slice(1), 16);
  const m = parseInt(toward.slice(1), 16);
  const ch = (c: number, to: number) => Math.round(c + (to - c) * k).toString(16).padStart(2, "0");
  return `#${ch(n >> 16, m >> 16)}${ch((n >> 8) & 255, (m >> 8) & 255)}${ch(n & 255, m & 255)}`;
}

/**
 * The island's dim greys for a transparency: the theme's own (or null for
 * :root's) while the background is solid, and moved away from the island's
 * ink's opposite the more of the desktop shows through: toward white under
 * light ink, toward black on a pale island (Paper). A halo alone left the
 * 10 px column heads faint over a bright page.
 */
export function islandDim(theme: Theme, transparency: number): { "--dim": string | null; "--dim-2": string | null } {
  const t = ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic;
  const own = { "--dim": t.vars?.["--dim"] ?? null, "--dim-2": t.vars?.["--dim-2"] ?? null };
  const through = islandThrough(theme, transparency);
  if (through === 0) return own;
  const toward = t.light ? "#000000" : "#ffffff";
  return { "--dim": lift(own["--dim"] ?? DIM, through * 0.6, toward), "--dim-2": lift(own["--dim-2"] ?? DIM_2, through * 0.6, toward) };
}

/**
 * Everything a theme sets on the page: its background, ring and accent, every
 * variable of THEME_VARS (null where the theme leaves style.css's), the
 * colour scheme, so that putting a theme on clears the one before it, and
 * the transparency's share (see #island and #island::before in style.css):
 * the background layer's alpha, the halo under the words and the greys
 * lifted for it.
 */
export function themeVars(theme: Theme, transparency = 0): Record<string, string | null> {
  const t = ISLAND_THEMES[theme] ?? ISLAND_THEMES.classic;
  const out: Record<string, string | null> = {
    "--island-bg": t.background,
    "--island-ring": t.ring ?? "none",
    "--island-alpha": String(islandAlpha(transparency)),
    "--island-text-shadow": islandTextShadow(theme, transparency),
    "--accent": t.accent ?? null,
    "color-scheme": t.light ? "light" : null,
  };
  for (const name of THEME_VARS) out[name] = t.vars?.[name] ?? null;
  Object.assign(out, islandDim(theme, transparency));
  return out;
}

/** Puts a theme on an element: the page, or a swatch that previews it. */
export function applyTheme(el: HTMLElement, theme: Theme, transparency = 0) {
  for (const [name, value] of Object.entries(themeVars(theme, transparency))) {
    if (value == null) el.style.removeProperty(name);
    else el.style.setProperty(name, value);
  }
}
