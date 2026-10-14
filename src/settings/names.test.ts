/// <reference types="node" />
// Settings still lists its own hat, face and colour names (settings/main.ts:
// OUTFITS, FACES, SKINS) next to core/looks.ts, which the island's wardrobe and
// the closet read. Until Settings reads looks.ts too, this keeps the two in
// step: a look named in one place only, or named differently, fails here
// instead of showing two names for one hat. Costume names are one list already
// (state.ts's COSTUME_NAMES and costumeName, read by all three).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COSTUME_NAMES as LOOKS_COSTUME_NAMES, lookNameKey, shelfOf } from "../core/looks";
import { COSTUME_NAMES, FACE_IDS, OFFERED_COSTUMES, OUTFIT_IDS, SKIN_IDS, costumeName } from "../core/state";

const source = readFileSync(join(__dirname, "main.ts"), "utf8");

/** The [id, name] pairs of one of main.ts's tables; EDITION_NAME stands for itself. */
function table(name: string): [string, string][] {
  const start = source.indexOf(`const ${name}:`);
  expect(start, `${name} in settings/main.ts`).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("];", start));
  return [...body.matchAll(/\[\s*"([^"]+)",\s*(?:N_\(\s*"([^"]+)"\s*\)|"([^"]+)"|(EDITION_NAME))\s*\]/g)].map((m) => [m[1], m[2] ?? m[3] ?? m[4]]);
}

describe("Settings' look names", () => {
  for (const [name, ids, shelf] of [
    ["OUTFITS", OUTFIT_IDS, "hat"],
    ["FACES", FACE_IDS, "face"],
    ["SKINS", SKIN_IDS, "colour"],
  ] as const) {
    it(`${name}: every look, named as in core/looks.ts`, () => {
      const rows = table(name);
      expect(rows.map(([id]) => id)).toEqual([...ids]);
      for (const [id, label] of rows) expect(label, id).toBe(lookNameKey(id, shelf));
    });
  }

  it("the rose in the teeth and the Rose colour share an id, each with its own name", () => {
    const face = table("FACES").find(([id]) => id === "rose")?.[1];
    const colour = table("SKINS").find(([id]) => id === "rose")?.[1];
    expect(face).toBe("Red rose");
    expect(colour).toBe("Rose");
    expect(shelfOf("face").name("rose")).toBe("Red rose");
    expect(shelfOf("colour").name("rose")).toBe("Rose");
  });

  it("costumes: one list, state.ts's, read by Settings, the wardrobe and the closet", () => {
    expect(source).not.toMatch(/const COSTUMES\s*:/);
    expect(source).toMatch(/OFFERED_COSTUMES\.map\([^)]*\)\s*:\s*\[string, string\]\s*=>\s*\[id, costumeName\(id\)\]/);
    expect(LOOKS_COSTUME_NAMES).toBe(COSTUME_NAMES);
    for (const id of OFFERED_COSTUMES) expect(shelfOf("costume").name(id), id).toBe(costumeName(id));
  });
});
