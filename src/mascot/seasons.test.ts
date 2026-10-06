import { describe, expect, it } from "vitest";
import { activeSeason, seasonKey, seasonalLook } from "./seasons";

const on = (m: number, d: number) => seasonalLook(new Date(2026, m - 1, d));

describe("seasonal looks", () => {
  it("dresses for the season", () => {
    expect(on(12, 1)?.hat).toBe("santa");
    expect(on(12, 26)?.hat).toBe("santa");
    expect(on(12, 31)?.hat).toBe("party");
    expect(on(1, 1)?.hat).toBe("party");
    expect(on(10, 31)?.hat).toBe("pumpkin");
    expect(on(2, 14)).toEqual({ name: "Valentine's Day", face: "heartglasses" });
  });

  it("stays out of the way on ordinary days", () => {
    for (const [m, d] of [[10, 5], [10, 23], [12, 27], [1, 2], [7, 4]]) expect(on(m, d)).toBeNull();
  });
});

describe("choosing over a season", () => {
  const xmas = new Date(2026, 11, 10);
  it("a look picked during the season lasts until it ends", () => {
    expect(seasonKey(xmas)).toBe("Christmas 2026");
    expect(activeSeason(xmas, true, "")?.hat).toBe("santa");
    expect(activeSeason(xmas, true, "Christmas 2026")).toBeNull();
    expect(activeSeason(new Date(2027, 11, 10), true, "Christmas 2026")?.hat).toBe("santa");
    expect(activeSeason(xmas, false, "")).toBeNull();
  });

  it("counts New Year with its December", () => {
    expect(seasonKey(new Date(2027, 0, 1))).toBe("New Year 2026");
    expect(seasonKey(new Date(2026, 11, 31))).toBe("New Year 2026");
  });
});
