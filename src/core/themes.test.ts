/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAINS } from "../market/chains";
import { MAX_ISLAND_TRANSPARENCY, THEME_IDS, clampTransparency, normalizeSettings } from "./state";
import { DEFAULT_ACCENT, DEFAULT_INK, DEFAULT_UP, ISLAND_THEMES, THEME_VARS, applyTheme, islandAlpha, islandDim, islandTextShadow, islandThrough, themeInk, themeSwatch, themeVars, wideFace } from "./themes";

/** A stand-in for an element's style: what applyTheme set, and nothing else. */
function fakeStyle() {
  const props = new Map<string, string>();
  return {
    props,
    el: {
      style: {
        setProperty: (name: string, value: string) => void props.set(name, value),
        removeProperty: (name: string) => void props.delete(name),
      },
    } as unknown as HTMLElement,
  };
}

/** WCAG's contrast ratio between two #rrggbb colours (1 to 21). */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** color-mix(in srgb, a k%, b), as the chain tags mix their colour with the ink. */
function mix(a: string, b: string, k: number): string {
  const n = parseInt(a.slice(1), 16);
  const m = parseInt(b.slice(1), 16);
  const ch = (x: number, y: number) => Math.round(x * k + y * (1 - k)).toString(16).padStart(2, "0");
  return `#${ch(n >> 16, m >> 16)}${ch((n >> 8) & 255, (m >> 8) & 255)}${ch(n & 255, m & 255)}`;
}

const css = readFileSync(join(__dirname, "..", "style.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

describe("themes", () => {
  it("has a look for every theme id, and only those", () => {
    expect(Object.keys(ISLAND_THEMES).sort()).toEqual([...THEME_IDS].sort());
    for (const id of THEME_IDS) expect(ISLAND_THEMES[id].name).toBeTruthy();
  });

  it("only sets variables style.css declares, with its defaults as this file knows them", () => {
    for (const name of THEME_VARS) {
      if (name === "--font-num") continue; // Falls back to --font where it is read.
      expect(root, name).toContain(`${name}:`);
    }
    expect(root).toContain(`--ink: ${DEFAULT_INK};`);
    expect(root).toContain(`--accent: ${DEFAULT_ACCENT};`);
    expect(root).toContain(`--up: ${DEFAULT_UP};`);
    for (const id of THEME_IDS) {
      for (const name of Object.keys(ISLAND_THEMES[id].vars ?? {})) expect(THEME_VARS, `${id} sets ${name}`).toContain(name);
    }
  });

  it("gives the five full themes a palette of their own", () => {
    for (const id of ["terminal", "vaporwave", "matrix", "paper", "blueprint"] as const) {
      const vars = ISLAND_THEMES[id].vars!;
      for (const name of ["--ink", "--dim", "--card", "--card-2", "--up", "--down", "--base", "--bubble"] as const) expect(vars[name], `${id} ${name}`).toBeTruthy();
    }
    // One monospace stack for the page: the theme's words and .w-addr share --mono.
    expect(ISLAND_THEMES.terminal.vars!["--font"]).toBe("var(--mono)");
    expect(root).toMatch(/--mono: .*"Menlo".*monospace;/);
    expect(ISLAND_THEMES.terminal.vars!["--caps"]).toBe("uppercase");
    expect(ISLAND_THEMES.matrix.vars!["--font-num"]).toBe("var(--mono)");
    expect(ISLAND_THEMES.vaporwave.accent).toBe("#ff71ce");
    // Paper is the one light island: dark ink, and the page told so.
    expect(ISLAND_THEMES.paper.light).toBe(true);
    expect(themeVars("paper")["color-scheme"]).toBe("light");
    expect(THEME_IDS.filter((id) => ISLAND_THEMES[id].light)).toEqual(["paper"]);
  });

  it("names every variable for every theme, so the next theme clears the last", () => {
    for (const id of THEME_IDS) {
      const vars = themeVars(id);
      for (const name of THEME_VARS) expect(name in vars, `${id} ${name}`).toBe(true);
      expect(vars["--island-bg"]).toBe(ISLAND_THEMES[id].background);
    }
    expect(themeVars("classic")["--ink"]).toBeNull();
    expect(themeVars("classic")["--island-ring"]).toBe("none");
    expect(themeVars("terminal")["--ink"]).toBe("#52f57e");
    expect(themeVars("neon")["--accent"]).toBeNull();
    expect(themeVars("gold")["--accent"]).toBe("#facc15");
  });

  it("puts a theme on an element and takes it off again", () => {
    const { el, props } = fakeStyle();
    applyTheme(el, "terminal");
    expect(props.get("--ink")).toBe("#52f57e");
    expect(props.get("--font")).toBe("var(--mono)");
    expect(props.get("--island-ring")).toBe(ISLAND_THEMES.terminal.ring);
    applyTheme(el, "paper");
    expect(props.get("--ink")).toBe("#2a2219");
    expect(props.has("--font")).toBe(false);
    expect(props.get("color-scheme")).toBe("light");
    applyTheme(el, "classic");
    expect(props.has("--ink")).toBe(false);
    expect(props.has("--accent")).toBe(false);
    expect(props.has("color-scheme")).toBe(false);
    expect(props.get("--island-bg")).toBe("#000");
    expect(props.get("--island-ring")).toBe("none");
  });

  it("knows which looks wear a wider face", () => {
    expect(wideFace("terminal")).toBe(true);
    expect(wideFace("matrix")).toBe(true);
    expect(wideFace("classic")).toBe(false);
    expect(wideFace("paper")).toBe(false);
    // Blueprint letters its numbers in monospace, its words stay proportional.
    expect(wideFace("blueprint")).toBe(true);
  });

  it("hints a swatch at the look's text colour", () => {
    expect(themeInk("classic")).toBe(DEFAULT_INK);
    expect(themeInk("paper")).toBe("#2a2219");
    expect(themeInk("terminal")).toBe("#52f57e");
    expect(themeInk("blueprint")).toBe("#eef6ff");
  });

  it("keeps the new ids through the settings file, and drops one it does not know", () => {
    for (const id of ["terminal", "vaporwave", "paper", "matrix", "blueprint"] as const) expect(normalizeSettings({ companion: { theme: id } } as never).companion.theme).toBe(id);
    expect(normalizeSettings({ companion: { theme: "lava" } } as never).companion.theme).toBe("classic");
    expect(normalizeSettings({}).companion.theme).toBe("classic");
  });
});

describe("blueprint", () => {
  const bp = ISLAND_THEMES.blueprint;
  const v = bp.vars!;

  it("is the eighteenth look: the wardrobe's Island shelf is two full rows of nine (six of three in the sidebar)", () => {
    expect(THEME_IDS.length).toBe(18);
    expect(THEME_IDS[THEME_IDS.length - 1]).toBe("blueprint");
    expect(THEME_IDS.length % 9).toBe(0);
    expect(THEME_IDS.length % 3).toBe(0);
    expect(bp.name).toBe("Blueprint");
  });

  it("is drafting film: a fine white grid, a stronger line every fifth, over deep blue", () => {
    expect(bp.background).toContain("8px 8px");
    expect(bp.background).toContain("40px 40px");
    expect(bp.background).toMatch(/linear-gradient\(180deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
    expect(bp.light).toBeFalsy();
    expect(themeVars("blueprint")["color-scheme"]).toBeNull();
    // Numbers in the page's monospace, words in its own face, no capitals.
    expect(v["--font-num"]).toBe("var(--mono)");
    expect(v["--font"]).toBeUndefined();
    expect(v["--caps"]).toBeUndefined();
  });

  it("rules its cards in a white hairline, and only it: the next theme clears the line", () => {
    expect(root).toContain("--card-edge: transparent;");
    expect(v["--card-edge"]).toMatch(/^rgba\(255, 255, 255, 0\.\d+\)$/);
    for (const id of THEME_IDS) if (id !== "blueprint") expect(themeVars(id)["--card-edge"], id).toBeNull();
    const { el, props } = fakeStyle();
    applyTheme(el, "blueprint");
    expect(props.get("--card-edge")).toBe(v["--card-edge"]);
    expect(props.get("--font-num")).toBe("var(--mono)");
    applyTheme(el, "matrix");
    expect(props.has("--card-edge")).toBe(false);
  });

  it("keeps its ink, greys, accent and up/down tones readable on the blue and on its cards", () => {
    // The island's lightest blue (its gradient's top), its cards, the popover,
    // the open tab, and the open folder's accent wash (16% over the island).
    const top = bp.background.match(/linear-gradient\(180deg, (#[0-9a-f]{6}), #[0-9a-f]{6}\)$/)![1];
    const surfaces = [v["--base"]!, top, v["--card"]!, v["--card-2"]!, v["--pop"]!];
    const wash = mix(bp.accent!, top, 0.16);
    for (const ground of surfaces) {
      for (const name of ["--up", "--down", "--amber", "--calm"] as const) expect(contrast(v[name]!, ground), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(bp.accent!, ground), `accent on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const ground of surfaces) expect(contrast(v["--dim"]!, ground), `--dim on ${ground}`).toBeGreaterThanOrEqual(4.5);
    // The words, and the faintest grey, also sit on the open tab and switch, and
    // on the open folder (its name in ink, its count in --dim-2).
    for (const ground of [...surfaces, v["--tab-on"]!, wash]) {
      expect(contrast(v["--ink"]!, ground), `--ink on ${ground}`).toBeGreaterThanOrEqual(4.5);
      // The column heads and the folders' counts, as dim as Classic's on its own cards.
      expect(contrast(v["--dim-2"]!, ground), `--dim-2 on ${ground}`).toBeGreaterThanOrEqual(3);
    }
    // The open folder's mini Candy, in the colour of its hour.
    for (const name of ["--up", "--down"] as const) expect(contrast(v[name]!, wash), `${name} on the open folder`).toBeGreaterThanOrEqual(3);
    // The greys stay a step apart: --dim-2 dimmer than --dim.
    expect(contrast(v["--dim-2"]!, v["--card"]!)).toBeLessThan(contrast(v["--dim"]!, v["--card"]!) - 1);
    // Up and down told apart by more than hue: a mint and a coral.
    expect(v["--up"]).not.toBe(v["--down"]);
    // The speech bubble's words, and the words on an ink-coloured button.
    expect(contrast(v["--bubble-ink"]!, v["--bubble"]!)).toBeGreaterThanOrEqual(7);
    expect(contrast(v["--on-ink"]!, v["--ink"]!)).toBeGreaterThanOrEqual(7);
  });

  it("lightens the chains' tag words toward the ink, so BASE's blue reads on the blue", () => {
    const pure = parseInt(v["--chain-pure"]!, 10) / 100;
    expect(pure).toBeLessThan(1);
    const top = bp.background.match(/linear-gradient\(180deg, (#[0-9a-f]{6}), #[0-9a-f]{6}\)$/)![1];
    // The word sits on its own chip: the chain's colour at 16% over the
    // ground (.chain-tag in style.css). A major coin's tag is gold.
    const tagRule = css.slice(css.indexOf(".chain-tag {"), css.indexOf("}", css.indexOf(".chain-tag {")));
    expect(tagRule).toContain("color-mix(in srgb, var(--chain, #888) 16%, transparent)");
    const gold = css.match(/\.chain-tag\.major \{\s*--chain: (#[0-9a-f]{6});/)![1];
    const colors = [...Object.values(CHAINS).map((c) => [c.tag, c.color]), ["MAJOR", gold]];
    for (const ground of [v["--base"]!, top, v["--card"]!, v["--card-2"]!, v["--pop"]!]) {
      for (const [tag, color] of colors) {
        expect(contrast(mix(color, v["--ink"]!, pure), mix(color, ground, 0.16)), `${tag} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Still the chain's colour, not the plain ink.
    expect(pure).toBeGreaterThanOrEqual(0.4);
  });

  it("draws its swatch's grid coarser, so it shows on a wardrobe tile, over the island's own blue", () => {
    expect(bp.swatch).toBeTruthy();
    expect(bp.swatch).not.toBe(bp.background);
    expect(bp.swatch!.endsWith(bp.background.slice(bp.background.lastIndexOf("linear-gradient(180deg")))).toBe(true);
    expect(themeSwatch("blueprint")).toBe(bp.swatch);
    expect(themeSwatch("paper")).toBe(ISLAND_THEMES.paper.background);
  });

  it("fades like the other dark islands: a dark halo under its words and its greys lifted toward white", () => {
    expect(islandTextShadow("blueprint", 0)).toBe("none");
    expect(islandTextShadow("blueprint", 35)).toBe("0 1px 2px rgba(0, 0, 0, 0.44), 0 0 1px rgba(0, 0, 0, 0.44)");
    expect(islandTextShadow("blueprint", 70)).toBe("0 1px 2px rgba(0, 0, 0, 0.88), 0 0 1px rgba(0, 0, 0, 0.88)");
    expect(islandDim("blueprint", 0)).toEqual({ "--dim": v["--dim"], "--dim-2": v["--dim-2"] });
    for (const t of [35, 70]) {
      const dim = islandDim("blueprint", t);
      // Lighter than solid, the more so the more shows through.
      expect(contrast(dim["--dim"]!, "#000000")).toBeGreaterThan(contrast(v["--dim"]!, "#000000"));
      expect(contrast(dim["--dim-2"]!, "#000000")).toBeGreaterThan(contrast(v["--dim-2"]!, "#000000"));
    }
    expect(contrast(islandDim("blueprint", 70)["--dim-2"]!, "#000000")).toBeGreaterThan(contrast(islandDim("blueprint", 35)["--dim-2"]!, "#000000"));
    expect(themeVars("blueprint", 50)).toMatchObject({ "--island-bg": bp.background, "--island-alpha": "0.5", "--accent": "#8fe3ff" });
  });
});

describe("island transparency", () => {
  it("keeps a whole percent between solid and the most the island allows", () => {
    expect(clampTransparency(0)).toBe(0);
    expect(clampTransparency(35)).toBe(35);
    expect(clampTransparency(35.6)).toBe(36);
    expect(clampTransparency(MAX_ISLAND_TRANSPARENCY)).toBe(70);
    expect(clampTransparency(120)).toBe(70);
    expect(clampTransparency(-5)).toBe(0);
    expect(clampTransparency(NaN)).toBe(0);
    expect(clampTransparency("35")).toBe(0);
    expect(clampTransparency(undefined)).toBe(0);
  });

  it("fades only the background layer: solid at 0, 0.3 left at 70", () => {
    expect(islandAlpha(0)).toBe(1);
    expect(islandAlpha(35)).toBe(0.65);
    expect(islandAlpha(70)).toBe(0.3);
    expect(islandAlpha(100)).toBe(0.3);
    expect(islandAlpha(-1)).toBe(1);
  });

  it("hands the page the alpha next to the theme's colours", () => {
    expect(themeVars("classic")).toMatchObject({ "--island-bg": "#000", "--island-ring": "none", "--island-alpha": "1", "--accent": null });
    expect(themeVars("classic", 35)["--island-alpha"]).toBe("0.65");
    expect(themeVars("sunset", 70)).toMatchObject({ "--island-bg": ISLAND_THEMES.sunset.background, "--island-alpha": "0.3", "--accent": "#fb923c" });
    // Unknown theme: Classic, still faded.
    expect(themeVars("nope" as never, 50)).toMatchObject({ "--island-bg": "#000", "--island-alpha": "0.5" });
  });

  it("adds to Glass's own transparency instead of replacing it", () => {
    const glass = themeVars("glass", 50);
    expect(glass["--island-bg"]).toBe("rgba(12, 12, 16, 0.8)");
    expect(glass["--island-alpha"]).toBe("0.5");
  });

  it("shades the words only once the desktop shows through, deeper the more it does", () => {
    expect(islandTextShadow("classic", 0)).toBe("none");
    expect(islandTextShadow("sunset", 0)).toBe("none");
    expect(islandTextShadow("classic", 35)).toBe("0 1px 2px rgba(0, 0, 0, 0.44), 0 0 1px rgba(0, 0, 0, 0.44)");
    expect(islandTextShadow("classic", 70)).toBe("0 1px 2px rgba(0, 0, 0, 0.88), 0 0 1px rgba(0, 0, 0, 0.88)");
    // Glass is see-through on its own: a faint halo from the start, the deepest at 70%.
    expect(islandTextShadow("glass", 0)).toBe("0 1px 2px rgba(0, 0, 0, 0.25), 0 0 1px rgba(0, 0, 0, 0.25)");
    expect(islandTextShadow("glass", 70)).toBe("0 1px 2px rgba(0, 0, 0, 0.95), 0 0 1px rgba(0, 0, 0, 0.95)");
    expect(themeVars("classic")["--island-text-shadow"]).toBe("none");
    expect(themeVars("midnight", 70)["--island-text-shadow"]).toBe(islandTextShadow("midnight", 70));
    for (const id of THEME_IDS) if (id !== "paper") expect(islandTextShadow(id, 70)).toMatch(/^0 1px 2px rgba\(0, 0, 0, 0\.(88|95)\)/);
    // Paper's ink is dark: a light halo under it.
    expect(islandTextShadow("paper", 70)).toBe("0 1px 2px rgba(255, 255, 255, 0.88), 0 0 1px rgba(255, 255, 255, 0.88)");
    expect(islandTextShadow("paper", 0)).toBe("none");
  });

  it("lifts the dim greys as the desktop shows through, and leaves :root's while it is solid", () => {
    expect(islandThrough("classic", 0)).toBe(0);
    expect(islandThrough("classic", 70)).toBeCloseTo(0.7);
    expect(islandThrough("glass", 0)).toBeCloseTo(0.2);
    expect(islandThrough("glass", 70)).toBeCloseTo(0.76);
    expect(islandDim("classic", 0)).toEqual({ "--dim": null, "--dim-2": null });
    expect(islandDim("sunset", 0)).toEqual({ "--dim": null, "--dim-2": null });
    expect(islandDim("classic", 70)).toEqual({ "--dim": "#c0c3c8", "--dim-2": "#a9acb1" });
    expect(islandDim("classic", 35)).toEqual({ "--dim": "#aaaeb5", "--dim-2": "#8a8e95" });
    expect(themeVars("classic")).toMatchObject({ "--dim": null, "--dim-2": null });
    expect(themeVars("glass", 0)["--dim"]).toBe(islandDim("glass", 0)["--dim"]);
    // Lighter, never past white, and still a grey.
    for (const id of THEME_IDS) expect(islandDim(id, 70)["--dim"]).toMatch(/^#[0-9a-f]{6}$/);
    // A full theme's own greys while solid, lifted from there as it fades: Matrix's toward white, Paper's dark ink's toward black.
    expect(islandDim("matrix", 0)).toEqual({ "--dim": "#5fc47d", "--dim-2": "#3f9459" });
    expect(themeVars("matrix")["--dim"]).toBe("#5fc47d");
    expect(islandDim("matrix", 70)).toEqual({ "--dim": "#a2ddb4", "--dim-2": "#90c19f" });
    expect(islandDim("paper", 70)).toEqual({ "--dim": "#3e362d", "--dim-2": "#51493f" });
    expect(themeVars("paper", 70)["--dim-2"]).toBe("#51493f");
  });

  it("every theme keeps its gradient or pattern whole at any transparency", () => {
    for (const id of THEME_IDS) {
      expect(themeVars(id, 70)["--island-bg"]).toBe(ISLAND_THEMES[id].background);
      expect(themeVars(id, 70)["--island-ring"]).toBe(ISLAND_THEMES[id].ring ?? "none");
    }
  });

  it("reads older settings files as solid, and clamps what is there", () => {
    expect(normalizeSettings({}).companion.islandTransparency).toBe(0);
    expect(normalizeSettings({ companion: { theme: "glass" } } as never).companion.islandTransparency).toBe(0);
    expect(normalizeSettings({ companion: { islandTransparency: 35 } } as never).companion.islandTransparency).toBe(35);
    expect(normalizeSettings({ companion: { islandTransparency: 200 } } as never).companion.islandTransparency).toBe(70);
    expect(normalizeSettings({ companion: { islandTransparency: "lots" } } as never).companion.islandTransparency).toBe(0);
  });
});
