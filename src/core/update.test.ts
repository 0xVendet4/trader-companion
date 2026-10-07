import { describe, expect, it } from "vitest";
import { isNewer } from "./update";

describe("isNewer", () => {
  it("compares versions number by number", () => {
    expect(isNewer("0.1.2", "0.1.1")).toBe(true);
    expect(isNewer("0.1.10", "0.1.9")).toBe(true);
    expect(isNewer("0.2.0", "0.1.99")).toBe(true);
    expect(isNewer("1.0", "0.9.9")).toBe(true);
  });

  it("is not newer when equal or older", () => {
    expect(isNewer("0.1.1", "0.1.1")).toBe(false);
    expect(isNewer("0.1.1", "0.1.2")).toBe(false);
    expect(isNewer("0.1", "0.1.0")).toBe(false);
  });

  it("never offers what it can't read", () => {
    expect(isNewer("", "0.1.1")).toBe(false);
    expect(isNewer("latest", "0.1.1")).toBe(false);
    expect(isNewer("0.1.2", "dev")).toBe(false);
  });
});
