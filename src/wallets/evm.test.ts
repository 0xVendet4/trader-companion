import { describe, expect, it, vi } from "vitest";
import { Bridge } from "../core/bridge";
import { parseInput } from "../market/dexscreener";
import { explorerLink } from "../market/links";
import { entryFromHistory, historyCost } from "../positions/history";
import { walletFamily } from "../market/chains";
import {
  BALANCE_OF_SELECTOR,
  TRANSFER_TOPIC,
  balanceOfCalldata,
  blockRange,
  blockTime,
  fetchTransfers,
  hexToAmount,
  hexToInt,
  lastTransfer,
  padAddress,
  parseDecimals,
  parseTransferLogs,
  priceNear,
  readDecimals,
  readEvmWallet,
  transfersToDeltas,
} from "./evm";

const WALLET = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
const TOKEN = "0x4200000000000000000000000000000000000006";
const POOL = "0x1111111111111111111111111111111111111111";

/** A Transfer log as a node returns it. */
function log(from: string, to: string, amountHex: string, block: number, index = 0) {
  return {
    address: TOKEN,
    topics: [TRANSFER_TOPIC, padAddress(from), padAddress(to)],
    data: amountHex,
    blockNumber: `0x${block.toString(16)}`,
    logIndex: `0x${index.toString(16)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
  };
}

describe("wallet address detection", () => {
  it("tells a 0x address from a Solana one, checksum or not", () => {
    expect(walletFamily(WALLET)).toBe("evm");
    expect(walletFamily(WALLET.toLowerCase())).toBe("evm");
    expect(walletFamily(`  ${WALLET}  `)).toBe("evm");
    expect(walletFamily("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("solana");
    expect(walletFamily("0x1234")).toBeNull();
    expect(walletFamily(`${WALLET}00`)).toBeNull();
    expect(walletFamily("0xZZ5801a7D398351b8bE11C439e05C5B3259aeC9B")).toBeNull();
    expect(walletFamily("")).toBeNull();
  });
});

describe("hex encoding", () => {
  it("builds balanceOf(wallet) with the address padded to 32 bytes", () => {
    const data = balanceOfCalldata(WALLET);
    expect(data).toBe(`${BALANCE_OF_SELECTOR}000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b`);
    expect(data).toHaveLength(2 + 8 + 64);
    expect(padAddress(WALLET)).toHaveLength(66);
  });

  it("decodes balances with the token's decimals", () => {
    expect(hexToAmount("0xde0b6b3a7640000", 18)).toBe(1); // 1e18
    expect(hexToAmount("0x0f4240", 6)).toBe(1); // USDC's 1e6
    expect(hexToAmount("0x3b9aca00", 9)).toBe(1); // 1e9
    expect(hexToAmount("0x1bc16d674ec80000", 18)).toBe(2);
    expect(hexToAmount("0x2386f26fc10000", 18)).toBeCloseTo(0.01);
    expect(hexToAmount("0x5", 0)).toBe(5);
    // 123456789.123456789 tokens with 18 decimals.
    expect(hexToAmount("0x661efdf2e3b19f74a89200", 18)).toBeCloseTo(123456789.123456789, 6);
    expect(hexToAmount("0x", 18)).toBe(0);
    expect(hexToAmount("0x0", 18)).toBe(0);
    expect(hexToAmount("nope", 18)).toBe(0);
    expect(hexToAmount(null, 18)).toBe(0);
    expect(hexToAmount(42, 18)).toBe(0);
  });

  it("reads block numbers and decimals", () => {
    expect(hexToInt("0x1b4")).toBe(436);
    expect(hexToInt("0x0")).toBe(0);
    expect(hexToInt("")).toBe(0);
    expect(hexToInt("0xzz")).toBe(0);
    expect(parseDecimals(`0x${"0".repeat(62)}12`)).toBe(18);
    expect(parseDecimals(`0x${"0".repeat(63)}6`)).toBe(6);
    expect(parseDecimals("0x")).toBe(18);
    expect(parseDecimals(`0x${"f".repeat(64)}`)).toBe(18);
    expect(parseDecimals(undefined)).toBe(18);
  });

  it("asks for the last 2000 blocks, never before the first", () => {
    expect(blockRange(10_000)).toEqual({ fromBlock: "0x1f41", toBlock: "0x2710" });
    expect(blockRange(10_000, 100)).toEqual({ fromBlock: "0x26ad", toBlock: "0x2710" });
    expect(blockRange(5)).toEqual({ fromBlock: "0x0", toBlock: "0x5" });
  });
});

describe("transfer logs", () => {
  it("parses the wallet's transfers in order, skipping what is not a Transfer", () => {
    const logs = [
      log(POOL, WALLET, "0xde0b6b3a7640000", 200, 3),
      log(WALLET, POOL, "0x6f05b59d3b20000", 150, 1), // 0.5
      { ...log(POOL, WALLET, "0x1", 160), topics: ["0x" + "1".repeat(64), padAddress(POOL), padAddress(WALLET)] }, // another event
      { ...log(POOL, WALLET, "0x1", 170), removed: true }, // reorged away
      { ...log(POOL, WALLET, "0x1", 180), topics: [TRANSFER_TOPIC] }, // no indexed parties
      null,
      "junk",
    ];
    const list = parseTransferLogs(logs, 18);
    expect(list.map((x) => [x.block, x.amount, x.from === WALLET.toLowerCase() ? "out" : "in"])).toEqual([
      [150, 0.5, "out"],
      [200, 1, "in"],
    ]);
    expect(list[0].token).toBe(TOKEN.toLowerCase());
    expect(list[0].index).toBe(1);
    expect(parseTransferLogs(null, 18)).toEqual([]);
    expect(parseTransferLogs({ not: "a list" }, 18)).toEqual([]);
  });

  it("dates a block by how many blocks ago it was", () => {
    const now = 1_000_000_000;
    expect(blockTime(1000, 1000, now, 12)).toBe(now);
    expect(blockTime(990, 1000, now, 12)).toBe(now - 120_000);
    expect(blockTime(1010, 1000, now, 12)).toBe(now); // never in the future
  });

  it("prices a moment from the nearest sample within the tolerance", () => {
    const samples = [
      { t: 100_000, price: 1, mcap: null, liq: null },
      { t: 400_000, price: 2, mcap: null, liq: null },
    ];
    expect(priceNear(samples, 120_000)).toBe(1);
    expect(priceNear(samples, 260_000)).toBe(2);
    expect(priceNear(samples, 5_000_000)).toBeNull();
    expect(priceNear(undefined, 1)).toBeNull();
    expect(priceNear(samples, 120_000, 1_000)).toBeNull();
  });

  it("turns the transfers into trades for the entry, the part held before the window unknown", () => {
    const now = 2_000_000;
    const latest = 1000;
    const transfers = parseTransferLogs(
      [
        log(POOL, WALLET, "0x3635c9adc5dea00000", 900), // +1000 tokens, 100 blocks ago
        log(WALLET, POOL, "0x1b1ae4d6e2ef500000", 950), // -500 tokens, 50 blocks ago
        log(POOL, "0x2222222222222222222222222222222222222222", "0x1", 960), // someone else's
      ],
      18,
    );
    const priceAt = (t: number) => (t === now - 100 * 12 * 1000 ? 0.5 : null);
    // Holds 700 now: 200 were there before the window.
    const deltas = transfersToDeltas(transfers, WALLET, 700, latest, now, 12, priceAt);
    expect(deltas).toEqual([
      { t: now - 1_200_000, before: 200, token: 1000, sol: 0, usd: -500 },
      { t: now - 600_000, before: 1200, token: -500, sol: 0, usd: 0 },
    ]);
    const entry = entryFromHistory(deltas);
    expect(entry.amount).toBeCloseTo(700);
    // 200 unknown of 1200, then 5/12 of it sold.
    expect(entry.unknown).toBeCloseTo(200 * (700 / 1200));
    expect(entry.costUsd).toBeCloseTo(500 * (700 / 1200));
    const cost = historyCost(entry, 700, 1, 0.4);
    expect(cost).toBeCloseTo(entry.costUsd + entry.unknown * 0.4);
  });

  it("leaves the cost unknown when no sample dates the buy", () => {
    const transfers = parseTransferLogs([log(POOL, WALLET, "0x3635c9adc5dea00000", 900)], 18);
    const deltas = transfersToDeltas(transfers, WALLET, 1000, 1000, 2_000_000, 12, () => null);
    expect(deltas[0]).toMatchObject({ before: 0, token: 1000, usd: 0 });
    const entry = entryFromHistory(deltas);
    expect(entry.unknown).toBe(1000);
    expect(historyCost(entry, 1000, 1, 1)).toBeNull();
  });

  it("names a followed wallet's last move", () => {
    const now = 3_000_000;
    const transfers = parseTransferLogs(
      [log(POOL, WALLET, "0xde0b6b3a7640000", 500, 2), log(WALLET, POOL, "0xde0b6b3a7640000", 500, 7), log(POOL, WALLET, "0xde0b6b3a7640000", 100)],
      18,
    );
    const key = `base:${TOKEN.toLowerCase()}`;
    const move = lastTransfer(transfers, WALLET, { [key]: "FLAME" }, {}, "base", 500, now);
    expect(move).toEqual({ side: "sold all", symbol: "FLAME", t: now });
    expect(lastTransfer(transfers, WALLET, { [key]: "FLAME" }, { [key]: 3 }, "base", 500, now)?.side).toBe("sold");
    const bought = lastTransfer(transfers.slice(0, 1), WALLET, {}, {}, "base", 110, now);
    expect(bought).toMatchObject({ side: "bought", symbol: "0x4200…", t: now - 10 * 2 * 1000 });
    expect(lastTransfer([], WALLET, {}, {}, "bsc", 1, now)).toBeNull();
  });
});

describe("edges", () => {
  it("tells a 0x address one digit short or long from a wallet", () => {
    expect(walletFamily(WALLET.slice(0, 41))).toBeNull();
    expect(walletFamily(`${WALLET}0`)).toBeNull();
    expect(walletFamily(WALLET.slice(2))).toBeNull(); // no 0x, and a 0 is not base58
    expect(walletFamily("0x")).toBeNull();
    expect(walletFamily("1111111111111111111111111111111")).toBeNull(); // 31 chars
    expect(walletFamily("11111111111111111111111111111111")).toBe("solana"); // the system program
  });

  it("reads any hex quantity, whatever its length or casing of digits", () => {
    expect(hexToAmount("0xA", 0)).toBe(10);
    expect(hexToAmount("0xabc", 0)).toBe(2748); // odd length
    expect(hexToAmount("0x00000000000000000000000000000000000000000000000000000000000000ff", 0)).toBe(255);
    expect(hexToAmount(`0x${"f".repeat(64)}`, 18)).toBeCloseTo(1.157920892373162e59, -45); // uint256 max
    expect(hexToAmount("0x1", 18)).toBe(0); // one wei is below what a number keeps
    expect(hexToAmount("0xde0b6b3a7640000", NaN)).toBe(1); // unreadable decimals: 18
    expect(hexToAmount("0xde0b6b3a7640000", -3)).toBe(1e18);
    expect(hexToAmount("0xde0b6b3a7640000", 18.9)).toBe(1);
    expect(hexToAmount("0X1", 0)).toBe(0); // not how a node writes it
    expect(hexToAmount("0x 1", 0)).toBe(0);
    expect(hexToAmount("1", 0)).toBe(0);
    expect(hexToInt("0x10000000000000000")).toBe(0); // 17 digits: never a block number
  });

  it("keeps a Transfer with a fourth topic or no data (an NFT), as nothing moved", () => {
    const nft = { ...log(POOL, WALLET, "0x", 300), topics: [TRANSFER_TOPIC, padAddress(POOL), padAddress(WALLET), `0x${"0".repeat(63)}1`] };
    const list = parseTransferLogs([nft], 0);
    expect(list).toHaveLength(1);
    expect(list[0].amount).toBe(0);
    expect(lastTransfer(list, WALLET, {}, {}, "base", 300, 1)).toBeNull();
    // A log of another contract, or with an address that is not one: skipped.
    expect(parseTransferLogs([{ ...log(POOL, WALLET, "0x1", 1), address: "0x12" }], 18)).toEqual([]);
    expect(parseTransferLogs([{ ...log(POOL, WALLET, "0x1", 1), topics: [TRANSFER_TOPIC, "0xshort", padAddress(WALLET)] }], 18)).toEqual([]);
  });

  it("names the chain when a held EVM token joins the watchlist from its explorer's link", () => {
    for (const chain of ["ethereum", "bsc", "base"] as const) {
      const link = explorerLink(chain, TOKEN)!;
      expect(parseInput(link.url)).toMatchObject({ kind: "address", chainId: chain, address: TOKEN });
    }
    expect(parseInput(TOKEN)).toMatchObject({ kind: "address", chainId: null });
  });
});

describe("fetching", () => {
  it("asks for the logs in two calls per token, each the shape Rust rebuilds, over 2000 blocks at most", async () => {
    const calls: unknown[][] = [];
    const spy = vi.spyOn(Bridge, "evmRpc").mockImplementation(async (chain, method, params) => {
      calls.push([chain, method, params]);
      return [log(POOL, WALLET, "0xde0b6b3a7640000", 9990)] as never;
    });
    try {
      const list = await fetchTransfers("bsc", WALLET, TOKEN, 18, 10_000);
      expect(list).toHaveLength(2);
      expect(calls).toEqual([
        ["bsc", "eth_getLogs", [{ address: TOKEN, fromBlock: "0x1f41", toBlock: "0x2710", topics: [TRANSFER_TOPIC, padAddress(WALLET), null] }]],
        ["bsc", "eth_getLogs", [{ address: TOKEN, fromBlock: "0x1f41", toBlock: "0x2710", topics: [TRANSFER_TOPIC, null, padAddress(WALLET)] }]],
      ]);
      const range = calls[0][2] as [{ fromBlock: string; toBlock: string }];
      expect(hexToInt(range[0].toBlock) - hexToInt(range[0].fromBlock)).toBe(1999);
    } finally {
      spy.mockRestore();
    }
  });

  it("reads the coin and each token's balance with balanceOf(wallet), leaving out what is zero", async () => {
    const calls: unknown[][] = [];
    const spy = vi.spyOn(Bridge, "evmRpc").mockImplementation(async (chain, method, params) => {
      calls.push([chain, method, params]);
      if (method === "eth_getBalance") return "0x6f05b59d3b20000" as never; // 0.5
      const data = (params[0] as { to: string; data: string }).data;
      expect(data).toBe(balanceOfCalldata(WALLET));
      return ((params[0] as { to: string }).to === TOKEN ? "0x0f4240" : "0x0") as never;
    });
    try {
      const read = await readEvmWallet(WALLET, "base", [
        { address: TOKEN, decimals: 6 },
        { address: POOL, decimals: 18 },
      ]);
      expect(read).toEqual({ native: 0.5, holdings: { [`base:${TOKEN.toLowerCase()}`]: 1 } });
      expect(calls.map((c) => c[1])).toEqual(["eth_getBalance", "eth_call", "eth_call"]);
      expect(calls[0]).toEqual(["base", "eth_getBalance", [WALLET]]);
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to 18 decimals when decimals() fails or answers nothing", async () => {
    const spy = vi.spyOn(Bridge, "evmRpc").mockRejectedValue(new Error("execution reverted"));
    try {
      expect(await readDecimals("ethereum", TOKEN)).toBe(18);
      spy.mockResolvedValue("0x" as never);
      expect(await readDecimals("ethereum", TOKEN)).toBe(18);
      spy.mockResolvedValue(`0x${"0".repeat(63)}9` as never);
      expect(await readDecimals("ethereum", TOKEN)).toBe(9);
    } finally {
      spy.mockRestore();
    }
  });

  it("lets a failed balance read fail the wallet, never a silent sale", async () => {
    const spy = vi.spyOn(Bridge, "evmRpc").mockImplementation(async (_chain, method) => {
      if (method === "eth_getBalance") return "0x1" as never;
      throw new Error("the public Base RPC is busy (429)");
    });
    try {
      await expect(readEvmWallet(WALLET, "base", [{ address: TOKEN, decimals: 18 }])).rejects.toThrow("busy");
    } finally {
      spy.mockRestore();
    }
  });
});
