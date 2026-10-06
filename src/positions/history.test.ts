import { describe, expect, it } from "vitest";
import { entryFromHistory, historyCost, txDelta, type ParsedTx, type TxDelta } from "./history";

const ME = "Me111111111111111111111111111111111111111111";
const BONK = "BonkMint";
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RENT = 2_039_280;

/** accounts: [me, my BONK account, my wSOL account, pool] */
function tx(o: {
  t?: number;
  meLamports: [number, number];
  bonk?: [number | null, number | null];
  bonkLamports?: [number, number];
  wsol?: [number, number];
  usdc?: [number, number];
  err?: unknown;
}): ParsedTx {
  const tb = (i: number, mint: string, v: number | null) => (v == null ? [] : [{ accountIndex: i, mint, owner: ME, uiTokenAmount: { uiAmount: v } }]);
  return {
    blockTime: o.t ?? 1,
    meta: {
      err: o.err ?? null,
      preBalances: [o.meLamports[0], o.bonkLamports?.[0] ?? RENT, 5_000_000_000, 0, RENT],
      postBalances: [o.meLamports[1], o.bonkLamports?.[1] ?? RENT, 5_000_000_000, 0, RENT],
      preTokenBalances: [...tb(1, BONK, o.bonk?.[0] ?? null), ...(o.wsol ? tb(2, WSOL, o.wsol[0]) : []), ...(o.usdc ? tb(4, USDC, o.usdc[0]) : [])],
      postTokenBalances: [...tb(1, BONK, o.bonk?.[1] ?? null), ...(o.wsol ? tb(2, WSOL, o.wsol[1]) : []), ...(o.usdc ? tb(4, USDC, o.usdc[1]) : [])],
    },
    transaction: { message: { accountKeys: [{ pubkey: ME }, { pubkey: "acc1" }, { pubkey: "acc2" }, { pubkey: "pool" }, { pubkey: "acc4" }] } },
  };
}

describe("txDelta", () => {
  it("a first buy: SOL out, the new token account's rent left out", () => {
    // Paid 1 SOL + 0.000005 fee + rent for the new account.
    const d = txDelta(tx({ meLamports: [3e9, 3e9 - 1e9 - 5000 - RENT], bonk: [null, 1000], bonkLamports: [0, RENT] }), ME, BONK)!;
    expect(d.token).toBe(1000);
    expect(d.before).toBe(0);
    expect(d.sol).toBeCloseTo(-1.000005, 6);
  });

  it("counts wrapped SOL and USDC as payment", () => {
    expect(txDelta(tx({ meLamports: [1e9, 1e9 - 5000], bonk: [10, 20], wsol: [2, 1.5] }), ME, BONK)!.sol).toBeCloseTo(-0.500005, 6);
    expect(txDelta(tx({ meLamports: [1e9, 1e9 - 5000], bonk: [10, 20], usdc: [100, 40] }), ME, BONK)!.usd).toBe(-60);
  });

  it("skips failed or unrelated transactions", () => {
    expect(txDelta(tx({ meLamports: [1, 1], err: { InstructionError: [0, "x"] } }), ME, BONK)).toBeNull();
    expect(txDelta(tx({ meLamports: [1, 1] }), "SomeoneElse111111111111111111111111111111111", BONK)).toBeNull();
    expect(txDelta(null, ME, BONK)).toBeNull();
  });
});

describe("entryFromHistory", () => {
  const d = (t: number, token: number, sol = 0, usd = 0, before = 0): TxDelta => ({ t, before, token, sol, usd });

  it("averages buys and lets sells take their share", () => {
    // Buy 1000 for 1 SOL, buy 1000 for 3 SOL, sell 1000: 2 SOL of cost left.
    const h = entryFromHistory([d(3, -1000, 2.5, 0, 2000), d(1, 1000, -1), d(2, 1000, -3, 0, 1000)]);
    expect(h).toEqual({ amount: 1000, unknown: 0, costSol: 2, costUsd: 0 });
  });

  it("marks what came in for free, or before the window, as unknown", () => {
    expect(entryFromHistory([d(1, 500, 0)]).unknown).toBe(500);
    expect(entryFromHistory([d(1, 500, -1, 0, 300)])).toMatchObject({ amount: 800, unknown: 300, costSol: 1 });
  });

  it("turns into a USD cost only when it adds up", () => {
    const h = { amount: 1000, unknown: 0, costSol: 2, costUsd: 10 };
    expect(historyCost(h, 1000, 150, 0)).toBe(310);
    expect(historyCost(h, 1500, 150, 0)).toBeNull(); // the history misses 500
    expect(historyCost({ ...h, unknown: 800 }, 1000, 150, 0.1)).toBeNull(); // mostly unknown
    expect(historyCost({ ...h, unknown: 200 }, 1000, 150, 0.5)).toBe(410); // 200 × 0.5 estimated
  });
});
