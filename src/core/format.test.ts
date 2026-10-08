import { describe, expect, it } from "vitest";
import { compact, formatPct, formatPnl, formatPrice, moveLevel, parseAmount, valueCell, valueHead } from "./format";

describe("the value column", () => {
  const btc = { priceUsd: 83_382, marketCap: 1.67e12, major: true };
  const meme = { priceUsd: 0.004213, marketCap: 4_213_000 };

  it("reads a major coin by its price and a memecoin by its market cap", () => {
    expect(valueCell("auto", btc).text).toBe("$83.4K");
    expect(valueCell("auto", btc).title).toBe("Price · market cap $1.67T");
    expect(valueCell("auto", meme).text).toBe("$4.21M");
  });

  it("shows one of them for all when the trader picks it", () => {
    expect(valueCell("price", meme).text).toBe("$0.004213");
    expect(valueCell("mcap", btc).text).toBe("$1.67T");
    expect(valueCell("auto", null).text).toBe("—");
  });

  it("names its head after what the rows show", () => {
    expect(valueHead("auto", [btc, btc])).toBe("Price");
    expect(valueHead("auto", [meme])).toBe("MC");
    expect(valueHead("auto", [btc, meme])).toBe("MC / Price");
    expect(valueHead("price", [meme])).toBe("Price");
    expect(valueHead("mcap", [btc])).toBe("MC");
  });
});

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
    expect(formatPrice(84.5)).toBe("$84.50");
    expect(formatPrice(123.456)).toBe("$123.46");
    expect(formatPrice(65_000)).toBe("$65.0K");
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(0)).toBe("$0");
  });
});

describe("compact", () => {
  it("uses K, M, B and T", () => {
    expect(compact(950)).toBe("950");
    expect(compact(12_345)).toBe("12.3K");
    expect(compact(1_234_567)).toBe("1.23M");
    expect(compact(345_349_568)).toBe("345M");
    expect(compact(4_500_000_000)).toBe("4.50B");
    expect(compact(1_667_639_960_180)).toBe("1.67T");
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

describe("moveLevel", () => {
  it("grades a move for the ticker's dots", () => {
    expect(moveLevel(0.2)).toBe(0);
    expect(moveLevel(-0.49)).toBe(0);
    expect(moveLevel(1.8)).toBe(1);
    expect(moveLevel(-2.1)).toBe(-1);
    expect(moveLevel(41.8)).toBe(2);
    expect(moveLevel(-28)).toBe(-2);
  });

  it("has nothing to say without a number", () => {
    expect(moveLevel(null)).toBeNull();
    expect(moveLevel(undefined)).toBeNull();
    expect(moveLevel(Number.NaN)).toBeNull();
  });
});
