/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHADES_AT, SHADES_FACE, SHADES_MS, SHADES_REARM, keepsFaceUnderShades, shadesCrossings } from "./shades";

describe("shades on a 2x", () => {
  it("go on when a held token first reaches 2x", () => {
    let seen = shadesCrossings(new Map(), [{ key: "WIF", multiple: 1.4 }]).seen;
    const up = shadesCrossings(seen, [{ key: "WIF", multiple: 2.05 }]);
    expect(up.crossed).toEqual(["WIF"]);
    seen = up.seen;
    // Still over 2x on the next prices: once per crossing.
    expect(shadesCrossings(seen, [{ key: "WIF", multiple: 2.6 }]).crossed).toEqual([]);
  });

  it("count again only after falling back under the re-arm line", () => {
    let seen = shadesCrossings(new Map(), [{ key: "BONK", multiple: 1.9 }]).seen;
    seen = shadesCrossings(seen, [{ key: "BONK", multiple: 2.01 }]).seen;
    // Hovering around 2x: no flicker.
    for (const m of [1.95, 2.02, 1.85, 2.1]) {
      const r = shadesCrossings(seen, [{ key: "BONK", multiple: m }]);
      expect(r.crossed).toEqual([]);
      seen = r.seen;
    }
    seen = shadesCrossings(seen, [{ key: "BONK", multiple: SHADES_REARM - 0.1 }]).seen;
    expect(shadesCrossings(seen, [{ key: "BONK", multiple: SHADES_AT }]).crossed).toEqual(["BONK"]);
  });

  it("stay off for a token already at 2x when first seen", () => {
    const first = shadesCrossings(new Map(), [{ key: "CANDLE", multiple: 2.4 }]);
    expect(first.crossed).toEqual([]);
    expect(shadesCrossings(first.seen, [{ key: "CANDLE", multiple: 3 }]).crossed).toEqual([]);
  });

  it("wait for a cost before counting, and forget what was sold", () => {
    let r = shadesCrossings(new Map(), [{ key: "A", multiple: null }]);
    expect(r.seen.has("A")).toBe(false);
    r = shadesCrossings(r.seen, [{ key: "A", multiple: 1.2 }, { key: "B", multiple: 1.1 }]);
    r = shadesCrossings(r.seen, [{ key: "A", multiple: null }, { key: "B", multiple: Number.NaN }]);
    expect(r.seen.get("A")).toBe(false);
    r = shadesCrossings(r.seen, [{ key: "A", multiple: 2.2 }]);
    expect(r.crossed).toEqual(["A"]);
    expect(r.seen.has("B")).toBe(false);
  });

  it("can fire for several tokens at once, in the order given", () => {
    const seen = shadesCrossings(new Map(), [
      { key: "X", multiple: 1 },
      { key: "Y", multiple: 1.5 },
    ]).seen;
    expect(shadesCrossings(seen, [{ key: "Y", multiple: 2.5 }, { key: "X", multiple: 2 }]).crossed).toEqual(["Y", "X"]);
  });

  it("last a few seconds", () => {
    expect(SHADES_MS).toBeGreaterThanOrEqual(6000);
    expect(SHADES_MS).toBeLessThanOrEqual(8000);
  });

  it("are the wardrobe's own shades, over whatever he wears on his eyes", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../public/mascot/mascot.json", import.meta.url), "utf8")) as { faces: Record<string, string> };
    expect(manifest.faces[SHADES_FACE]).toBeTruthy();
    // Below the eyes: stays on under them. On the eyes: fades out while they are on.
    expect(keepsFaceUnderShades("mustache")).toBe(true);
    expect(keepsFaceUnderShades("scarf")).toBe(true);
    expect(keepsFaceUnderShades("glasses")).toBe(false);
    expect(keepsFaceUnderShades("shades")).toBe(false);
    expect(keepsFaceUnderShades("something-new")).toBe(false);
    for (const id of ["mustache", "clownnose", "beard", "whiskers", "freckles", "bandaid", "lollipop", "bubblegum", "warpaint", "facemask", "scarf"]) {
      expect(manifest.faces[id], id).toBeTruthy();
    }
    // The newer faces: what goes in the mouth or under it stays on; what goes over the eyes fades.
    for (const id of ["partyhorn", "pacifier", "rose", "bowtie", "goldchain"]) {
      expect(manifest.faces[id], id).toBeTruthy();
      expect(keepsFaceUnderShades(id), id).toBe(true);
    }
    for (const id of ["aviators", "sleepmask", "snorkel", "cateye", "hypno", "cyborg"]) {
      expect(manifest.faces[id], id).toBeTruthy();
      expect(keepsFaceUnderShades(id), id).toBe(false);
    }
  });
});
