import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../core/state";
import { SKIN_FILTERS, customSwatch, normalizeCustomSkin, skinFilter } from "./skins";

describe("skins", () => {
  it("presets map to their filter, mint is the art as drawn", () => {
    expect(skinFilter("mint")).toBe("none");
    expect(skinFilter("ocean")).toBe(SKIN_FILTERS.ocean);
  });

  it("builds the custom filter from the sliders", () => {
    expect(skinFilter("custom", { hue: -90, sat: 150, light: 110 })).toBe("hue-rotate(-90deg) saturate(150%) brightness(110%)");
    expect(skinFilter("custom", null)).toBe("hue-rotate(0deg) saturate(100%) brightness(100%)");
  });

  it("repairs a hand-edited custom colour", () => {
    expect(normalizeCustomSkin({ hue: 999, sat: -5, light: "x" as never })).toEqual({ hue: 180, sat: 0, light: 100 });
  });

  it("shows the custom colour as the green it turns into", () => {
    expect(customSwatch({ hue: 0, sat: 100, light: 100 })).toBe("hsl(142 70% 45%)");
    expect(customSwatch({ hue: -142, sat: 100, light: 100 })).toBe("hsl(0 70% 45%)");
  });
});

describe("appearance settings", () => {
  it("moves shades and laser eyes from the old outfit to the face slot", () => {
    const s = normalizeSettings({ companion: { outfit: "shades" } } as never);
    expect(s.companion.outfit).toBe("none");
    expect(s.companion.face).toBe("shades");
    const t = normalizeSettings({ companion: { outfit: "laser" } } as never);
    expect(t.companion.face).toBe("laser");
  });

  it("keeps a hat and fills in the new fields", () => {
    const s = normalizeSettings({ companion: { outfit: "crown", skin: "gold" } } as never);
    expect(s.companion).toMatchObject({ outfit: "crown", face: "none", skin: "gold", customSkin: { hue: 0, sat: 100, light: 100 } });
  });

  it("drops unknown values", () => {
    const s = normalizeSettings({ companion: { outfit: "jetpack", face: "snorkel", skin: "plaid" } } as never);
    expect(s.companion).toMatchObject({ outfit: "none", face: "none", skin: "mint" });
  });
});
