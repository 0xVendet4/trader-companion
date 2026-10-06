import { describe, expect, it } from "vitest";
import { compact, formatPct, formatPnl, formatPrice, parseAmount } from "./format";

describe("formatPrice", () => {
  it("writes memecoin prices with the zero count in subscript", () => {
    expect(formatPrice(0.000003924)).toBe("$0.0₅3924");
    expect(formatPrice(0.00000003216)).toBe("$0.0₇3216");
    expect(formatPrice(0.0001)).toBe("$0.0₃1");
  });

  it("writes small prices with a couple of zeros plainly", () => {
    expect(formatPrice(0.0012345)).toBe("$0.001235");
    expect(formatPrice(0.0123)).toBe("$0.0123");
    expect(formatPrice(0.5)).toBe("$0.5000");
  });

  it("handles rounding into the next decade", () => {
    expect(formatPrice(0.00099999)).toBe("$0.001");
  });

  it("handles ordinary and missing prices", () => {
    expect(formatPrice(1.5)).toBe("$1.500");
    expect(formatPrice(123.456)).toBe("$123.46");
    expect(formatPrice(65_000)).toBe("$65.0K");
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(0)).toBe("$0");
  });
});

describe("compact", () => {
  it("uses K, M and B", () => {
    expect(compact(950)).toBe("950");
    expect(compact(12_345)).toBe("12.3K");
    expect(compact(1_234_567)).toBe("1.23M");
    expect(compact(345_349_568)).toBe("345M");
    expect(compact(4_500_000_000)).toBe("4.50B");
  });
});

describe("formatPct and formatPnl", () => {
  it("signs every value", () => {
    expect(formatPct(4.21)).toBe("+4.2%");
    expect(formatPct(-12)).toBe("−12.0%");
    expect(formatPct(250)).toBe("+250%");
    expect(formatPct(1500)).toBe("+1.50K%");
    expect(formatPnl(-1.25, "SOL")).toBe("−1.25 SOL");
    expect(formatPnl(0.5, "SOL")).toBe("+0.50 SOL");
  });
});

describe("parseAmount", () => {
  it("reads what traders type", () => {
    expect(parseAmount("1.5M")).toBe(1_500_000);
    expect(parseAmount("$45K")).toBe(45_000);
    expect(parseAmount("0,5")).toBe(0.5);
    expect(parseAmount("0.0012")).toBe(0.0012);
    expect(parseAmount("20")).toBe(20);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});
