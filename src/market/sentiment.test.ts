import { describe, expect, it } from "vitest";
import { fngTone, fngWords, parseFearGreed } from "./sentiment";

describe("fear & greed", () => {
  it("reads alternative.me's answer", () => {
    expect(parseFearGreed({ data: [{ value: "72", value_classification: "Greed" }] }, 5)).toEqual({ value: 72, label: "Greed", fetchedAt: 5 });
  });

  it("rejects anything else", () => {
    expect(parseFearGreed({ data: [] }, 0)).toBeNull();
    expect(parseFearGreed({ data: [{ value: "abc" }] }, 0)).toBeNull();
    expect(parseFearGreed({ data: [{ value: "140" }] }, 0)).toBeNull();
    expect(parseFearGreed(null, 0)).toBeNull();
  });

  it("names and colours a value", () => {
    expect(parseFearGreed({ data: [{ value: "10" }] }, 0)?.label).toBe("Extreme Fear");
    expect(fngWords(50)).toBe("Neutral");
    expect(fngTone(10)).toBe("down");
    expect(fngTone(80)).toBe("up");
  });
});
