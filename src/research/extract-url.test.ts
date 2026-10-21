import { describe, expect, it } from "vitest";
import { extractTokenFromUrl } from "./extract-url";

const MINT = "So11111111111111111111111111111111111111112";
const EVM_ADDR = "0x1234567890abcdef1234567890abcdef12345678";

describe("extractTokenFromUrl — GMGN", () => {
  it("returns mint from a GMGN Solana token URL", () => {
    expect(extractTokenFromUrl(`https://gmgn.ai/sol/token/${MINT}`)).toBe(MINT);
  });

  it("returns mint from GMGN URL with underscore prefix in path segment", () => {
    // GMGN sometimes uses pattern: /sol/token/abc_<mint>
    expect(extractTokenFromUrl(`https://gmgn.ai/sol/token/sol_${MINT}`)).toBe(MINT);
  });

  it("returns null for GMGN Ethereum token URL (not Solana)", () => {
    expect(extractTokenFromUrl(`https://gmgn.ai/eth/token/${EVM_ADDR}`)).toBeNull();
  });

  it("returns null for GMGN without token path", () => {
    expect(extractTokenFromUrl("https://gmgn.ai/sol")).toBeNull();
  });
});

describe("extractTokenFromUrl — Axiom", () => {
  it("returns mint from an Axiom meme URL", () => {
    expect(extractTokenFromUrl(`https://axiom.trade/meme/${MINT}`)).toBe(MINT);
  });

  it("returns null for Axiom URL containing only an EVM address", () => {
    // EVM addresses are not treated as Solana tokens
    expect(extractTokenFromUrl(`https://axiom.trade/meme/${EVM_ADDR}`)).toBeNull();
  });
});

describe("extractTokenFromUrl — DexScreener", () => {
  it("returns mint from a DexScreener Solana pair URL", () => {
    expect(extractTokenFromUrl(`https://dexscreener.com/solana/${MINT}`)).toBe(MINT);
  });

  it("returns null for DexScreener Ethereum pair URL", () => {
    expect(extractTokenFromUrl(`https://dexscreener.com/ethereum/${EVM_ADDR}`)).toBeNull();
  });
});

describe("extractTokenFromUrl — edge cases", () => {
  it("returns null for an empty string", () => {
    expect(extractTokenFromUrl("")).toBeNull();
  });

  it("returns null for a plain search query", () => {
    expect(extractTokenFromUrl("PEPE")).toBeNull();
  });

  it("returns null for an unrelated https URL", () => {
    expect(extractTokenFromUrl("https://example.com/some-page")).toBeNull();
  });

  it("returns null for a bare EVM address", () => {
    expect(extractTokenFromUrl(EVM_ADDR)).toBeNull();
  });

  it("handles leading/trailing whitespace in the URL", () => {
    expect(extractTokenFromUrl(`  https://axiom.trade/meme/${MINT}  `)).toBe(MINT);
  });
});
