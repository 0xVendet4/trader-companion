// Launchpads: a token starts on its launchpad's bonding curve (pump.fun and
// the like) and "graduates" when it gets a real pool on a DEX. DexScreener
// names where a token's best pair lives (its dexId): a change from a launchpad
// to a DEX is the graduation, the moment many traders look at the token.

/** DexScreener's ids for bonding curves, and how to name them. */
export const LAUNCHPADS: Record<string, string> = {
  pumpfun: "pump.fun",
  moonshot: "Moonshot",
  launchlab: "LaunchLab",
  boop: "boop",
  believe: "Believe",
};

/** How to name a DEX by DexScreener's id. */
const DEX_NAMES: Record<string, string> = {
  pumpswap: "PumpSwap",
  raydium: "Raydium",
  meteora: "Meteora",
  orca: "Orca",
  uniswap: "Uniswap",
  pancakeswap: "PancakeSwap",
};

export const dexName = (id: string) => DEX_NAMES[id] ?? LAUNCHPADS[id] ?? (id ? id[0].toUpperCase() + id.slice(1) : "a DEX");

/** The token left its launchpad for a DEX pool: from where to where; null otherwise. */
export function graduation(prevDex: string | undefined, nextDex: string | undefined): { from: string; to: string } | null {
  if (!prevDex || !nextDex || prevDex === nextDex) return null;
  if (!LAUNCHPADS[prevDex] || LAUNCHPADS[nextDex]) return null;
  return { from: LAUNCHPADS[prevDex], to: dexName(nextDex) };
}
