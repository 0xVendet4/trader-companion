/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COSTUME_IDS, OFFERED_COSTUMES, normalizeSettings, offeredCostumes } from "../core/state";
import { MASCOT_STATES, dressed, resolveState, type Manifest } from "./mascot";
import { lookFilter } from "./skins";

const DIR = join(__dirname, "..", "..", "public", "mascot");
const manifest = JSON.parse(readFileSync(join(DIR, "mascot.json"), "utf8")) as Manifest & {
  costumes: Record<string, { exclusive?: boolean }>;
};

describe("costumes", () => {
  it("every costume has art, for every mood, on disk", () => {
    // A friend's "edition" costume is not in the repository (editions/, ignored).
    for (const id of COSTUME_IDS.filter((c) => c !== "none" && c !== "edition")) {
      const states = manifest.costumes?.[id]?.states;
      expect(states, id).toBeTruthy();
      for (const s of MASCOT_STATES) {
        const def = states![s];
        expect(def?.frames.length, `${id} ${s}`).toBeGreaterThan(0);
        for (const f of [...def!.frames, def!.eyes, def!.eyesBlink, def!.blink].filter(Boolean)) {
          expect(existsSync(join(DIR, f!)), f).toBe(true);
        }
      }
    }
  });

  it("dresses the mascot in a costume's frames, keeping Candy's motion", () => {
    const gengar = dressed(manifest, "gengar");
    expect(resolveState(gengar, "idle")?.frames[0]).toBe("costumes/gengar/idle.svg");
    expect(resolveState(gengar, "celebrate")?.motion).toBe(resolveState(manifest, "celebrate")?.motion);
    expect(gengar.outfits).toBe(manifest.outfits);
    expect(dressed(manifest, "none")).toBe(manifest);
    expect(dressed(manifest, "nobody")).toBe(manifest);
  });

  it("a costume keeps its own colours", () => {
    const customSkin = { hue: 0, sat: 100, light: 100 };
    expect(lookFilter({ costume: "gengar", skin: "ocean", customSkin })).toBe("none");
    expect(lookFilter({ costume: "none", skin: "mint", customSkin })).toBe("none");
    expect(lookFilter({ costume: "none", skin: "ocean", customSkin })).not.toBe("none");
  });

  it("offers the exclusive costume only in a friend's build", () => {
    expect(offeredCostumes(false)).not.toContain("edition");
    expect(offeredCostumes(true)).toContain("edition");
    expect(offeredCostumes(true)).toContain("gengar");
    // A regular build (the tests run as one).
    expect(OFFERED_COSTUMES).toEqual(offeredCostumes(false));
  });

  it("keeps friends' exclusive costumes out of the public manifest", () => {
    expect(manifest.costumes.edition).toBeUndefined();
    expect(Object.values(manifest.costumes).filter((c) => c.exclusive)).toEqual([]);
  });

  it("older or hand-edited settings fall back to Candy, renamed costumes stay on", () => {
    expect(normalizeSettings({}).companion.costume).toBe("none");
    expect(normalizeSettings({ companion: { costume: "pikachu" } } as never).companion.costume).toBe("none");
    expect(normalizeSettings({ companion: { costume: "spiderman" } } as never).companion.costume).toBe("spiderman");
    expect(normalizeSettings({ companion: { costume: "yovich" } } as never).companion.costume).toBe("gengar");
    expect(normalizeSettings({ companion: { costume: "mrshadow" } } as never).companion.costume).toBe("shadow");
    // Not offered by this build.
    expect(normalizeSettings({ companion: { costume: "edition" } } as never).companion.costume).toBe("none");
  });
});
