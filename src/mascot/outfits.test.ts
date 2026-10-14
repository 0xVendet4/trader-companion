/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OUTFIT_IDS, normalizeSettings } from "../core/state";
import type { Manifest } from "./mascot";
import { piecesOf } from "./pieces";

const DIR = join(__dirname, "..", "..", "public", "mascot");
const manifest = JSON.parse(readFileSync(join(DIR, "mascot.json"), "utf8")) as Manifest;

describe("hats", () => {
  it("every hat the wardrobe offers has art on disk, and the art offers no hat the settings would drop", () => {
    const hats = OUTFIT_IDS.filter((id) => id !== "none");
    expect(Object.keys(manifest.outfits ?? {}).sort()).toEqual([...hats].sort());
    for (const id of hats) {
      const src = manifest.outfits![id];
      expect(existsSync(join(DIR, src)), src).toBe(true);
    }
  });

  it("hats in pieces have every piece on disk, attached inside the canvas", () => {
    const cut = Object.values(manifest.outfits ?? {}).filter((src) => piecesOf(manifest.pieces, src));
    // The pompoms, ears, tassels, bells, antennae, sprout and headband ends.
    expect(cut).toEqual(expect.arrayContaining(["outfits/fez.svg", "outfits/jester.svg", "outfits/alien.svg", "outfits/sprout.svg", "outfits/sweatband.svg"]));
    for (const src of cut) {
      const set = piecesOf(manifest.pieces, src)!;
      for (const file of [set.base, ...set.parts.map((p) => p.src)].filter(Boolean)) expect(existsSync(join(DIR, file!)), file).toBe(true);
      for (const p of set.parts) {
        for (const v of p.pivot) {
          expect(v, `${p.src} pivot`).toBeGreaterThanOrEqual(0);
          expect(v, `${p.src} pivot`).toBeLessThanOrEqual(128);
        }
      }
    }
  });

  it("a saved new hat stays on; an unknown one comes off", () => {
    expect(normalizeSettings({ companion: { outfit: "fedora" } } as never).companion.outfit).toBe("fedora");
    expect(normalizeSettings({ companion: { outfit: "sombrero" } } as never).companion.outfit).toBe("sombrero");
    expect(normalizeSettings({ companion: { outfit: "trilby" } } as never).companion.outfit).toBe("none");
    expect(normalizeSettings({}).companion.outfit).toBe("none");
  });
});
