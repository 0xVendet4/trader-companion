import { parseInput } from "../market/dexscreener";

/**
 * Extracts a Solana token mint address from a browser tab URL.
 * Handles GMGN (gmgn.ai/sol/token/…) and Axiom (axiom.trade/meme/…) links,
 * plus DexScreener and Solana explorer links via parseInput.
 * Returns null when the URL doesn't resolve to a Solana token.
 */
export function extractTokenFromUrl(url: string): string | null {
  const parsed = parseInput(url.trim());
  return parsed.kind === "address" && parsed.chainId === "solana" ? parsed.address : null;
}
