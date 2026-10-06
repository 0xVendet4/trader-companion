// The chains the app follows, with what each needs: DexScreener's id, its
// native coin (for the header prices), which trading terminals support it, and
// how its addresses look.

export type ChainId = "solana" | "bsc" | "ethereum" | "robinhood";

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
    rugcheck: false,
  },
};

export const ALL_CHAINS: ChainId[] = ["solana", "bsc", "ethereum", "robinhood"];

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

export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
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
