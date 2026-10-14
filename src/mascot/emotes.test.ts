import { describe, expect, it } from "vitest";
import { EMOTES, EMOTE_INFO, isEmote, menuSpot, stepItem } from "./emotes";

describe("emotes", () => {
  it("are dance, wave, laugh and spin, each with a label and a sound", () => {
    expect([...EMOTES]).toEqual(["dance", "wave", "laugh", "spin"]);
    for (const e of EMOTES) {
      expect(EMOTE_INFO[e].label.length).toBeGreaterThan(0);
      expect(EMOTE_INFO[e].sound).toBeTruthy();
    }
    expect(isEmote("spin")).toBe(true);
    expect(isEmote("tilt")).toBe(false);
    expect(isEmote(3)).toBe(false);
  });

  it("open the menu to Candy's right, level with him", () => {
    // The island's left column: Candy at (75, 103), 84 px.
    const s = menuSpot({ x: 75, y: 103, r: 35 }, { w: 130, h: 150 }, { w: 660, h: 230 });
    expect(s.side).toBe("right");
    expect(s.left).toBe(75 + 35 + 6);
    expect(s.top).toBe(103 - 75);
    expect(s.tail).toBe(75);
  });

  it("keep the menu inside the island, top and bottom", () => {
    const low = menuSpot({ x: 75, y: 150, r: 35 }, { w: 130, h: 150 }, { w: 660, h: 172 });
    expect(low.top).toBe(172 - 6 - 150);
    expect(low.top + 150).toBeLessThanOrEqual(172 - 6);
    // The tail still points at Candy.
    expect(low.tail).toBe(150 - low.top);
    const high = menuSpot({ x: 75, y: 20, r: 14 }, { w: 130, h: 150 }, { w: 660, h: 340 });
    expect(high.top).toBe(6);
    expect(high.tail).toBe(14);
  });

  it("open on his left when the right has no room, and squeeze in when neither has", () => {
    const left = menuSpot({ x: 330, y: 100, r: 30 }, { w: 130, h: 120 }, { w: 380, h: 640 });
    expect(left.side).toBe("left");
    expect(left.left).toBe(330 - 30 - 6 - 130);
    const tight = menuSpot({ x: 60, y: 100, r: 30 }, { w: 130, h: 120 }, { w: 170, h: 300 });
    expect(tight.left).toBeGreaterThanOrEqual(6);
    expect(tight.left + 130).toBeLessThanOrEqual(170 - 6);
  });

  it("walk the items with the arrow keys, wrapping around", () => {
    expect(stepItem(-1, 5, 1)).toBe(0);
    expect(stepItem(-1, 5, -1)).toBe(4);
    expect(stepItem(0, 5, -1)).toBe(4);
    expect(stepItem(4, 5, 1)).toBe(0);
    expect(stepItem(2, 5, 1)).toBe(3);
    expect(stepItem(0, 0, 1)).toBe(-1);
  });
});
