import { describe, expect, it } from "vitest";
import type { DexPair } from "./dexscreener";
import { junkReason } from "./spam";

/** A pair quoted in SOL at $200: `quote` SOL backs the pool. */
function pair(o: { name?: string; symbol?: string; price: number; liqUsd?: number | null; quote?: number }): DexPair {
  return {
    chainId: "solana",
    dexId: "pumpswap",
    pairAddress: "P",
    baseToken: { address: "M", name: o.name ?? "Real Coin", symbol: o.symbol ?? "REAL" },
    quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
    priceUsd: String(o.price),
    priceNative: String(o.price / 200),
    liquidity: o.liqUsd === null ? undefined : { usd: o.liqUsd ?? 0, quote: o.quote ?? 0 },
  };
}

describe("junkReason", () => {
  it("keeps a real holding in a real pool", () => {
    // $342 held, a pool with ~$10.8K of SOL in it.
    expect(junkReason(pair({ price: 0.001, liqUsd: 12_900, quote: 27 }), 342_000)).toBeNull();
  });

  it("flags a holding worth more than all the real money in its pool", () => {
    // Seen in a real wallet: "$1,147" of a coin whose pool holds nothing.
    expect(junkReason(pair({ price: 0.002, liqUsd: 0, quote: 0 }), 573_640)).toMatch(/can't be sold/);
    // $500 held, $40 of SOL in the pool.
    expect(junkReason(pair({ price: 0.001, liqUsd: 80, quote: 0.1 }), 500_000)).toMatch(/can't be sold/);
  });

  it("flags a fake pool", () => {
    // Reports $2M, holds $20 of SOL.
    expect(junkReason(pair({ price: 1, liqUsd: 2_000_000, quote: 0.1 }), 1)).toMatch(/fake/);
  });

  it("flags a name that advertises a site or a prize", () => {
    for (const [name, symbol] of [
      ["Visit solreward.io to claim", "REWARD"],
      ["$5000 USDC Airdrop", "claim-usdc.com"],
      ["Bonus", "t.me/freebonus"],
      ["https://jup-claim.app", "JUP"],
      ["Redeem your voucher", "VOUCHER"],
    ]) {
      expect(junkReason(pair({ name, symbol, price: 0.001, liqUsd: 50_000, quote: 125 }), 10), name).toMatch(/phishing/);
    }
  });

  it("leaves ordinary names alone", () => {
    for (const [name, symbol] of [["dogwifhat", "$WIF"], ["Pump", "PUMP"], ["Artifact Council", "AC"], ["SPX6900 (Wormhole)", "SPX"]]) {
      expect(junkReason(pair({ name, symbol, price: 1, liqUsd: 1_000_000, quote: 2_500 }), 10), name).toBeNull();
    }
  });

  it("judges only the name of a coin still on its pump.fun curve", () => {
    // The curve has no pool figures, and it buys the coin back.
    expect(junkReason(pair({ price: 0.00001, liqUsd: null }), 10_000_000)).toBeNull();
    expect(junkReason(pair({ name: "claim at pumpdrop.fun", price: 0.00001, liqUsd: null }), 1)).toMatch(/phishing/);
  });
});
