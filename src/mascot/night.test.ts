import { describe, expect, it } from "vitest";
import { OUTFIT_IDS, normalizeSettings } from "../core/state";
import { FLOURISHES } from "./flourish";
import { isPyjamaTime, lookKey, nightKey, wearsPyjamas } from "./night";

const at = (h: number, m = 0, day = 14) => new Date(2026, 9, day, h, m);

describe("pyjamas after midnight", () => {
  it("from midnight to 6 am", () => {
    expect(isPyjamaTime(at(0, 0))).toBe(true);
    expect(isPyjamaTime(at(3, 30))).toBe(true);
    expect(isPyjamaTime(at(5, 59))).toBe(true);
    expect(isPyjamaTime(at(6, 0))).toBe(false);
    expect(isPyjamaTime(at(12))).toBe(false);
    expect(isPyjamaTime(at(23, 59))).toBe(false);
  });

  it("are worn over the trader's look, unless turned off or a costume is on", () => {
    expect(wearsPyjamas(at(1), true, "", "none")).toBe(true);
    expect(wearsPyjamas(at(13), true, "", "none")).toBe(false);
    expect(wearsPyjamas(at(1), false, "", "none")).toBe(false);
    expect(wearsPyjamas(at(1), true, "", "gengar")).toBe(false);
  });

  it("a look picked during the night wins until morning, and the next night they're back", () => {
    const tonight = nightKey(at(2));
    expect(tonight).toBe("night 2026-10-14");
    expect(nightKey(at(9))).toBeNull();
    expect(wearsPyjamas(at(4), true, tonight!, "none")).toBe(false);
    expect(wearsPyjamas(at(1, 0, 15), true, tonight!, "none")).toBe(true);
  });

  it("the look is put on again when the night starts or ends", () => {
    expect(lookKey(at(23, 59, 13))).not.toBe(lookKey(at(0, 1, 14)));
    expect(lookKey(at(5, 59))).not.toBe(lookKey(at(6, 0)));
    expect(lookKey(at(7))).toBe(lookKey(at(18)));
  });

  it("yawns more at night than by day", () => {
    expect(FLOURISHES.nightYawn.chance).toBeGreaterThan(FLOURISHES.yawn.chance);
    expect(FLOURISHES.nightYawn.quietMs).toBeLessThan(FLOURISHES.yawn.quietMs);
  });
});

describe("settings for the night look, the nap and the melt", () => {
  it("an older settings file gets them all on", () => {
    const c = normalizeSettings({ companion: { seasonal: true } } as never).companion;
    expect(c.pyjamas).toBe(true);
    expect(c.napBed).toBe(true);
    expect(c.meltOnDrop).toBe(true);
    expect(c.nightOff).toBe("");
  });

  it("keeps what the trader turned off, and mends a broken value", () => {
    const c = normalizeSettings({ companion: { pyjamas: false, napBed: false, meltOnDrop: false, nightOff: "night 2026-10-14" } } as never).companion;
    expect([c.pyjamas, c.napBed, c.meltOnDrop, c.nightOff]).toEqual([false, false, false, "night 2026-10-14"]);
    const broken = normalizeSettings({ companion: { pyjamas: "yes", nightOff: 3 } } as never).companion;
    expect(broken.pyjamas).toBe(true);
    expect(broken.nightOff).toBe("");
  });

  it("the nightcap is a hat anyone can pick", () => {
    expect(OUTFIT_IDS).toContain("nightcap");
    expect(normalizeSettings({ companion: { outfit: "nightcap" } } as never).companion.outfit).toBe("nightcap");
  });
});
