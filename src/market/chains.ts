// The chains the app follows, with what each needs: DexScreener's id, its
// native coin (for the header prices), which trading terminals support it, and
// how its addresses look.

export type ChainId = "solana" | "bsc" | "ethereum" | "base" | "robinhood";

/** The chains an EVM wallet (one 0x address) is followed on. */
export const EVM_CHAINS = ["ethereum", "bsc", "base"] as const;
export type EvmChain = (typeof EVM_CHAINS)[number];

export function isEvmChain(x: unknown): x is EvmChain {
  return typeof x === "string" && (EVM_CHAINS as readonly string[]).includes(x);
}

/** A wallet's family: a Solana (base58) address, or one 0x address followed on the EVM chains. */
export type WalletFamily = "solana" | "evm";

export interface Chain {
  id: ChainId;
  label: string;
  /** Two- to four-letter tag shown next to a token. */
  tag: string;
  color: string;
  /** Native coin shown in the header, priced from its wrapped token. */
  native: { symbol: "SOL" | "BNB" | "ETH"; chain: ChainId; address: string };
  /** GMGN's path segment, when GMGN lists this chain. */
  gmgn: string | null;
  /** Axiom token pages are Solana only. */
  axiom: boolean;
  /** Based Bot's path segment, when it lists this chain. */
  basedbot: string | null;
  /** RugCheck only covers Solana. */
  rugcheck: boolean;
}

const WSOL = "So11111111111111111111111111111111111111112";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

export const CHAINS: Record<ChainId, Chain> = {
  solana: {
    id: "solana",
    label: "Solana",
    tag: "SOL",
    color: "#a78bfa",
    native: { symbol: "SOL", chain: "solana", address: WSOL },
    gmgn: "sol",
    axiom: true,
    basedbot: "sol",
    rugcheck: true,
  },
  bsc: {
    id: "bsc",
    label: "BSC",
    tag: "BSC",
    color: "#facc15",
    native: { symbol: "BNB", chain: "bsc", address: WBNB },
    gmgn: "bsc",
    axiom: false,
    basedbot: "bsc",
    rugcheck: false,
  },
  ethereum: {
    id: "ethereum",
    label: "Ethereum",
    tag: "ETH",
    color: "#93c5fd",
    native: { symbol: "ETH", chain: "ethereum", address: WETH },
    gmgn: "eth",
    axiom: false,
    basedbot: "eth",
    rugcheck: false,
  },
  base: {
    id: "base",
    label: "Base",
    tag: "BASE",
    color: "#60a5fa",
    // Base pays gas in ETH: its header price is ETH's.
    native: { symbol: "ETH", chain: "ethereum", address: WETH },
    gmgn: "base",
    axiom: false,
    basedbot: null,
    rugcheck: false,
  },
  robinhood: {
    id: "robinhood",
    label: "Robinhood",
    tag: "HOOD",
    color: "#4ade80",
    // Robinhood Chain pays gas in ETH: its header price is ETH's.
    native: { symbol: "ETH", chain: "ethereum", address: WETH },
    gmgn: null,
    axiom: false,
    basedbot: "robinhood",
    rugcheck: false,
  },
};

export const ALL_CHAINS: ChainId[] = ["solana", "bsc", "ethereum", "base", "robinhood"];

export function isChain(x: unknown): x is ChainId {
  return typeof x === "string" && (ALL_CHAINS as string[]).includes(x);
}

export const isEvm = (c: ChainId) => c !== "solana";

/**
 * The key a token is stored under (quotes, history, alerts). Solana keeps the
 * bare address, as before multichain; EVM chains get "chain:address" in lower
 * case, because the same address can exist on several of them and checksum
 * casing varies between sources.
 */
export function tokenKey(chainId: ChainId, address: string): string {
  return chainId === "solana" ? address : `${chainId}:${address.toLowerCase()}`;
}

/**
 * The chain and address behind a token key: "chain:address" for an EVM
 * token, a bare address for a Solana one (see tokenKey).
 */
export function splitKey(key: string): { chainId: ChainId; address: string } {
  const i = key.indexOf(":");
  if (i > 0) {
    const chain = key.slice(0, i);
    if (isChain(chain)) return { chainId: chain, address: key.slice(i + 1) };
  }
  return { chainId: "solana", address: key };
}

export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * What kind of wallet address was typed: a 0x + 40 hex address (checksum
 * casing optional) is an EVM wallet, base58 a Solana one, anything else none.
 */
export function walletFamily(input: string): WalletFamily | null {
  const s = input.trim();
  if (EVM_ADDRESS.test(s)) return "evm";
  if (SOLANA_ADDRESS.test(s)) return "solana";
  return null;
}
/** Uniswap v4 pool ids (Robinhood Chain pairs) are 32-byte hashes. */
export const EVM_POOL_ID = /^0x[0-9a-fA-F]{64}$/;

/** The distinct native coins of a set of chains, in a stable order. */
export function nativeCoins(chains: ChainId[]): Chain["native"][] {
  const seen = new Set<string>();
  const out: Chain["native"][] = [];
  for (const id of ALL_CHAINS) {
    if (!chains.includes(id)) continue;
    const n = CHAINS[id].native;
    if (seen.has(n.symbol)) continue;
    seen.add(n.symbol);
    out.push(n);
  }
  return out;
}
