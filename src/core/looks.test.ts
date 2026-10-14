import { describe, expect, it } from "vitest";
import { CLOSET_ONLY, COSTUME_NAMES, SHELVES, copyLook, islandIds, lookName, lookNameKey, nightNote, pickLook, seasonNote, shelfOf, shownLook, tryOn, wearing } from "./looks";
import { seasonalLook } from "../mascot/seasons";
import { FACE_IDS, OFFERED_COSTUMES, OUTFIT_IDS, SKIN_IDS, THEME_IDS, normalizeSettings } from "./state";
import { ISLAND_THEMES } from "./themes";

const fresh = () => normalizeSettings(null).companion;
// By day: from midnight to 6 am the pyjamas are on (night.ts, tested below).
const ordinaryDay = new Date(2026, 6, 4, 12);
const christmas = new Date(2026, 11, 10, 12);
const ordinaryNight = new Date(2026, 6, 4, 1, 30);

describe("looks", () => {
  it("names every hat, face and colour once, here", () => {
    for (const id of [...OUTFIT_IDS, ...FACE_IDS, ...SKIN_IDS]) expect(lookNameKey(id), id).not.toBeNull();
    expect(lookName("tophat")).toBe("Top hat");
    expect(lookName("threed")).toBe("3D glasses");
  });

  it("gives a look without a name yet its id, capitalised", () => {
    expect(lookNameKey("tiara")).toBeNull();
    expect(lookName("tiara")).toBe("Tiara");
  });

  it("names costumes by their own names, Candy herself included", () => {
    expect(COSTUME_NAMES.none).toBe("Candy");
    for (const id of OFFERED_COSTUMES) expect(shelfOf("costume").name(id)).toBe(COSTUME_NAMES[id]);
  });

  it("lays out the five shelves in order, each with every look of its kind", () => {
    expect(SHELVES.map((s) => s.id)).toEqual(["hat", "face", "colour", "costume", "island"]);
    expect(shelfOf("hat").ids).toEqual(OUTFIT_IDS);
    expect(shelfOf("face").ids).toEqual(FACE_IDS);
    expect(shelfOf("colour").ids).toEqual(SKIN_IDS);
    expect(shelfOf("costume").ids).toEqual(OFFERED_COSTUMES);
    expect(shelfOf("island").ids).toEqual(THEME_IDS);
    expect(shelfOf("island").name("midnight")).toBe(ISLAND_THEMES.midnight.name);
    expect(SHELVES.filter((s) => s.on === "island").map((s) => s.id)).toEqual(["island"]);
  });

  it("wears whatever a shelf holds, and knows it is worn", () => {
    for (const shelf of SHELVES) {
      for (const id of shelf.ids) {
        const c = fresh();
        shelf.wear(c, id);
        expect(shelf.worn(c, id), `${shelf.id} ${id}`).toBe(true);
        expect(shelf.ids.filter((other) => shelf.worn(c, other))).toEqual([id]);
      }
    }
  });

  it("takes a costume off for a colour: colours are Candy's own", () => {
    const c = { ...fresh(), costume: "gengar" as const, skin: "mint" as const };
    expect(shelfOf("colour").worn(c, "mint")).toBe(false);
    shelfOf("colour").wear(c, "ocean");
    expect(c).toMatchObject({ skin: "ocean", costume: "none" });
  });

  it("tries a look on a copy, never on the settings", () => {
    const c = { ...fresh(), outfit: "crown" as const, customSkin: { hue: 10, sat: 100, light: 100 } };
    const tried = tryOn(c, shelfOf("hat"), "wizard");
    expect(tried.outfit).toBe("wizard");
    expect(c.outfit).toBe("crown");
    tried.customSkin.hue = 90;
    expect(c.customSkin.hue).toBe(10);
    expect(copyLook(c)).toEqual({ outfit: "crown", face: c.face, skin: c.skin, customSkin: c.customSkin, costume: c.costume, theme: c.theme });
  });

  it("keeps a pick made during a season over the season's look, until it ends", () => {
    const c = { ...fresh(), seasonal: true, outfit: "crown" as const };
    expect(wearing(c, christmas).outfit).toBe("santa");
    pickLook(c, shelfOf("hat"), "cap", christmas);
    expect(c.outfit).toBe("cap");
    expect(c.seasonOff).toBe("Christmas 2026");
    expect(wearing(c, christmas).outfit).toBe("cap");
  });

  it("leaves the season's hat on when only the background changes", () => {
    const c = { ...fresh(), seasonal: true };
    pickLook(c, shelfOf("island"), "ocean", christmas);
    expect(c.theme).toBe("ocean");
    expect(c.seasonOff).toBe("");
    expect(wearing(c, christmas).outfit).toBe("santa");
  });

  it("changes nothing about seasons on an ordinary day", () => {
    const c = { ...fresh(), seasonal: true, seasonOff: "Halloween 2025" };
    pickLook(c, shelfOf("face"), "shades", ordinaryDay);
    expect(c.seasonOff).toBe("Halloween 2025");
    expect(shownLook({ ...c, outfit: "crown" }, ordinaryDay)).toMatchObject({ outfit: "crown", face: "shades" });
  });

  it("shows the season's look as the island wears it, unless seasons are off", () => {
    const c = { ...fresh(), outfit: "crown" as const, seasonal: true };
    expect(shownLook(c, christmas).outfit).toBe("santa");
    expect(shownLook({ ...c, seasonal: false }, christmas).outfit).toBe("crown");
    expect(shownLook(c, new Date(2026, 1, 14, 12)).face).toBe("heartglasses");
  });

  it("names what the season put on, until the trader picks a look of their own", () => {
    const c = { ...fresh(), outfit: "crown" as const, seasonal: true };
    expect(seasonNote(c, christmas)).toBe("Santa for Christmas");
    expect(seasonNote(c, new Date(2026, 9, 31))).toBe("Pumpkin for Halloween");
    expect(seasonNote(c, new Date(2026, 11, 31))).toBe("Party hat for New Year");
    expect(seasonNote(c, new Date(2027, 1, 14))).toBe("Heart glasses for Valentine's Day");
    expect(seasonNote(c, ordinaryDay)).toBeNull();
    expect(seasonNote({ ...c, seasonal: false }, christmas)).toBeNull();
    pickLook(c, shelfOf("hat"), "cap", christmas);
    expect(seasonNote(c, christmas)).toBeNull();
    // Every season has a name of its own in the note.
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
      const season = seasonalLook(d);
      if (season) expect(seasonNote(fresh(), d), season.name).toMatch(new RegExp(`for ${season.name}$`));
    }
  });

  it("puts the pyjamas and the nightcap on after midnight, as the island does, and notes it", () => {
    const c = { ...fresh(), outfit: "crown" as const };
    expect(wearing(c, ordinaryNight)).toMatchObject({ outfit: "nightcap", pyjamas: true });
    expect(shownLook(c, ordinaryNight).outfit).toBe("nightcap");
    expect(nightNote(c, ordinaryNight)).toBe("Pyjamas after midnight");
    expect(seasonNote(c, ordinaryNight)).toBeNull();
    // By day, with the night look off, or under a costume: none.
    expect(wearing(c, ordinaryDay)).toMatchObject({ outfit: "crown", pyjamas: false });
    expect(wearing({ ...c, pyjamas: false }, ordinaryNight)).toMatchObject({ outfit: "crown", pyjamas: false });
    expect(wearing({ ...c, costume: "ninja" }, ordinaryNight).pyjamas).toBe(false);
    expect(nightNote(c, ordinaryDay)).toBeNull();
    // A season's hat stays on at night, and its note is the one shown.
    const xmasNight = new Date(2026, 11, 10, 2);
    expect(wearing(c, xmasNight)).toMatchObject({ outfit: "santa", pyjamas: true });
    expect(nightNote(c, xmasNight)).toBeNull();
  });

  it("keeps a look picked after midnight over the pyjamas until morning; a background leaves them on", () => {
    const c = fresh();
    pickLook(c, shelfOf("island"), "ocean", ordinaryNight);
    expect(c.nightOff).toBe("");
    expect(wearing(c, ordinaryNight).pyjamas).toBe(true);
    pickLook(c, shelfOf("hat"), "cap", ordinaryNight);
    expect(c.nightOff).not.toBe("");
    expect(wearing(c, ordinaryNight)).toMatchObject({ outfit: "cap", pyjamas: false });
    expect(nightNote(c, ordinaryNight)).toBeNull();
    // The next night they are back.
    expect(wearing(c, new Date(2026, 6, 5, 1)).pyjamas).toBe(true);
  });

  it("lays the island's Hat shelf out in exactly three full rows of twelve; the closet has every hat", () => {
    const hats = islandIds(shelfOf("hat"));
    expect(hats.length).toBe(36);
    expect(hats).not.toContain("nightcap");
    expect(shelfOf("hat").ids).toContain("nightcap");
    expect(CLOSET_ONLY.every((id) => OUTFIT_IDS.includes(id as never))).toBe(true);
    for (const shelf of SHELVES.filter((s) => s.id !== "hat")) expect(islandIds(shelf), shelf.id).toEqual(shelf.ids);
  });

  it("lays the Face shelf out in three full rows of twelve too: none and thirty-five faces", () => {
    const faces = islandIds(shelfOf("face"));
    expect(faces.length).toBe(36);
    expect(faces[0]).toBe("none");
    expect(faces.length % 12).toBe(0);
  });

  it("names the rose in the teeth apart from the Rose colour, though they share an id", () => {
    expect(lookNameKey("rose", "face")).toBe("Red rose");
    expect(lookNameKey("rose", "colour")).toBe("Rose");
    expect(lookNameKey("rose")).toBe("Rose");
    expect(shelfOf("face").name("rose")).toBe("Red rose");
    expect(shelfOf("colour").name("rose")).toBe("Rose");
    // Every other face goes by its one name.
    for (const id of FACE_IDS.filter((f) => f !== "rose")) expect(lookNameKey(id, "face"), id).toBe(lookNameKey(id));
  });
});
