// Settings names every look the way core/looks.ts does (lookNameKey, and
// state.ts's COSTUME_NAMES for the costumes), so the island's wardrobe, the
// closet and Settings never show two names for one hat. This keeps the costume
// list one list.
import { describe, expect, it } from "vitest";
import { COSTUME_NAMES as LOOKS_COSTUME_NAMES, shelfOf } from "../core/looks";
import { COSTUME_NAMES, OFFERED_COSTUMES, costumeName } from "../core/state";

describe("Settings' look names", () => {
  it("costumes: one list, state.ts's, read by Settings, the wardrobe and the closet", () => {
    expect(LOOKS_COSTUME_NAMES).toBe(COSTUME_NAMES);
    for (const id of OFFERED_COSTUMES) expect(shelfOf("costume").name(id), id).toBe(costumeName(id));
  });
});
