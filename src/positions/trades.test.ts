import { describe, expect, it } from "vitest";
import type { ActivityItem } from "../core/state";
import { USDC, WSOL, type ParsedTx } from "./history";
import { gapTrades, mergeActivity, tradesFromSwaps, txSwap, type Swap } from "./trades";

const ME = "Me11111111111111111111111111111111111111111";
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";

/** A transaction where the trader's lamports go from `lamports[0]` to `lamports[1]` and tokens move. */
function tx(lamports: [number, number], tokens: { mint: string; pre: number; post: number; owner?: string }[], err: unknown = null): ParsedTx {
  const bal = (mint: string, amount: number, i: number, owner = ME) => ({ accountIndex: i, mint, owner, uiTokenAmount: { uiAmount: amount, uiAmountString: String(amount) } });
  return {
    blockTime: 1_700_000_000,
    meta: {
      err,
      preBalances: [lamports[0], ...tokens.map(() => 2_039_280)],
      postBalances: [lamports[1], ...tokens.map(() => 2_039_280)],
      preTokenBalances: tokens.map((t, i) => bal(t.mint, t.pre, i + 1, t.owner)),
      postTokenBalances: tokens.map((t, i) => bal(t.mint, t.post, i + 1, t.owner)),
    },
    transaction: { message: { accountKeys: [ME, ...tokens.map((_, i) => `acc${i}`)] } },
  };
}

describe("txSwap", () => {
  it("reads a buy (SOL out, token in) and a sell", () => {
    const buy = txSwap(tx([2e9, 1e9], [{ mint: BONK, pre: 0, post: 1000 }]), ME, "sig1");
    expect(buy).toMatchObject({ id: "sig1", mint: BONK, token: 1000, sol: -1 });
    const sell = txSwap(tx([1e9, 1.5e9], [{ mint: BONK, pre: 1000, post: 0 }]), ME, "sig2");
    expect(sell).toMatchObject({ mint: BONK, token: -1000, sol: 0.5 });
  });

  it("counts wrapped SOL and USDC as the price", () => {
    const viaWsol = txSwap(tx([1e9, 1e9], [{ mint: WSOL, pre: 2, post: 1 }, { mint: BONK, pre: 0, post: 50 }]), ME, "s");
    expect(viaWsol).toMatchObject({ mint: BONK, token: 50, sol: -1 });
    const viaUsdc = txSwap(tx([1e9, 1e9], [{ mint: USDC, pre: 100, post: 40 }, { mint: BONK, pre: 0, post: 50 }]), ME, "s");
    expect(viaUsdc).toMatchObject({ mint: BONK, usd: -60 });
  });

  it("skips transfers, fee-only moves, token-for-token swaps and failed transactions", () => {
    expect(txSwap(tx([1e9, 1e9 - 5000], [{ mint: BONK, pre: 0, post: 1000 }]), ME, "s")).toBeNull();
    expect(txSwap(tx([2e9, 1e9], [{ mint: BONK, pre: 0, post: 1000 }, { mint: WIF, pre: 10, post: 0 }]), ME, "s")).toBeNull();
    expect(txSwap(tx([2e9, 1e9], [{ mint: BONK, pre: 0, post: 1000 }], { InstructionError: [0, "x"] }), ME, "s")).toBeNull();
    expect(txSwap(tx([2e9, 1e9], [{ mint: BONK, pre: 0, post: 1000, owner: "someone else" }]), ME, "s")).toBeNull();
  });
});

describe("tradesFromSwaps", () => {
  const s = (id: string, t: number, mint: string, token: number, sol: number): Swap => ({ id, t, mint, token, sol, usd: 0 });

  it("follows a round trip: opened, bought more, sold part, closed, and what it took", () => {
    const { activity, closed } = tradesFromSwaps(
      [s("a", 1, BONK, 100, -1), s("b", 2, BONK, 100, -1), s("c", 3, BONK, -100, 1.5), s("d", 4, BONK, -100, 2.5)],
      { [BONK]: "BONK" },
      100,
    );
    expect(activity.map((a) => a.side)).toEqual(["opened", "bought", "sold", "closed"]);
    expect(activity[2].realizedUsd).toBeCloseTo(50); // 1.5 SOL for what cost 1 SOL
    expect(activity[3].realizedUsd).toBeCloseTo(200); // the whole trip: 4 SOL back for 2
    expect(closed).toEqual([{ id: "d", t: 4, mint: BONK, symbol: "BONK", pnlSol: 2, pnlUsd: 200 }]);
    expect(activity.every((a) => a.history)).toBe(true);
  });

  it("says what each sale took by itself, for Taken today (a close's entry shows the whole trip)", () => {
    const { taken } = tradesFromSwaps(
      [s("a", 1, BONK, 100, -1), s("b", 2, BONK, 100, -1), s("c", 3, BONK, -100, 1.5), s("d", 4, BONK, -100, 2.5)],
      { [BONK]: "BONK" },
      100,
    );
    expect(taken.map((x) => x.id)).toEqual(["c", "d"]);
    expect(taken[0].usd).toBeCloseTo(50); // 1.5 SOL for half the cost (1 SOL)
    expect(taken[1].usd).toBeCloseTo(150); // 2.5 SOL for the other half: 50 + 150 = the trip's 200
    // Sales of something bought before the window took an unknown amount: left out.
    expect(tradesFromSwaps([s("x", 1, WIF, -50, 3)], {}, 100).taken).toEqual([]);
  });

  it("marks a sale of something bought before the window as unknown, and keeps it out of the journal", () => {
    const { activity, closed } = tradesFromSwaps([s("x", 1, WIF, -50, 3)], {}, 100);
    expect(activity[0]).toMatchObject({ side: "closed", costUnknown: true, realizedUsd: 0, symbol: "EKpQ…" });
    expect(closed).toEqual([]);
  });
});

describe("mergeActivity", () => {
  const item = (t: number, id?: string): ActivityItem => ({ t, mint: BONK, symbol: "BONK", side: "opened", usd: 1, realizedUsd: 0, ...(id ? { id } : {}) });

  it("adds what is new, oldest first, and keeps the newest", () => {
    const merged = mergeActivity([item(5), item(3, "a")], [item(3, "a"), item(1, "b"), item(9, "c")], 3);
    expect(merged.map((a) => a.t)).toEqual([3, 5, 9]);
  });
});

describe("gapTrades", () => {
  const s = (id: string, t: number, mint: string, token: number, sol: number): Swap => ({ id, t, mint, token, sol, usd: 0 });
  const flip = [s("buy", 1, BONK, 100, -1), s("sell", 2, BONK, -100, 1.5)];

  it("records a token bought and sold between two reads, which the balances never see", () => {
    const g = gapTrades(flip, {}, {}, { [BONK]: "BONK" }, 100);
    expect(g.activity.map((a) => a.side)).toEqual(["opened", "closed"]);
    expect(g.activity.some((a) => a.history)).toBe(false);
    expect(g.closed).toEqual([{ id: "sell", t: 2, mint: BONK, symbol: "BONK", pnlSol: 0.5, pnlUsd: 50 }]);
    expect(g.taken).toEqual([{ id: "sell", t: 2, usd: 50 }]);
    expect(g.fills).toEqual({});
  });

  it("treats a dust leftover as sold out", () => {
    expect(gapTrades(flip, {}, { [BONK]: 0.4 }, {}, 100).closed).toHaveLength(1);
  });

  it("leaves what the balances see to them, at the price it really traded at", () => {
    // Bought in the gap and still held: the buy's own price (1 SOL for 100 = $1 each).
    const bought = gapTrades([s("b", 1, BONK, 100, -1)], {}, { [BONK]: 100 }, {}, 100);
    expect(bought.activity).toEqual([]);
    expect(bought.fills[BONK]).toBeCloseTo(1);
    // Held before and sold out in the gap: the sale's price.
    const sold = gapTrades([s("x", 1, BONK, -100, 1.5)], { [BONK]: 100 }, {}, {}, 100);
    expect(sold.activity).toEqual([]);
    expect(sold.fills[BONK]).toBeCloseTo(1.5);
    // Bought and sold while held: no single price, the market's stays.
    const mixed = gapTrades([s("b", 1, BONK, 50, -0.5), s("x", 2, BONK, -20, 0.3)], { [BONK]: 100 }, { [BONK]: 130 }, {}, 100);
    expect(mixed.fills).toEqual({});
    expect(mixed.activity).toEqual([]);
  });
});
