// Which of a wallet's tokens get priced on a check. A wallet can hold thousands
// (dust left by old trades, airdropped spam): pricing them all every minute
// would flood DexScreener, and pricing the first few in the RPC's order misses
// the real ones. Pure: the companion keeps what it learned between checks.

/** The longest a token rests between pricings. */
export const REST_MS = 6 * 60 * 60_000;
/** A token with no pair yet rests this long, then 6× longer each miss: a coin
 * bought minutes ago may simply not be listed yet; old dust never will be. */
export const FIRST_REST_MS = 5 * 60_000;

export interface PricingMemory {
  /** Tokens found with a real pair. */
  known: Set<string>;
  /** Tokens with no pair, or junk: when they may be priced again, and how often they missed. */
  resting: Map<string, { until: number; misses: number }>;
}

/** A priced token's verdict: a real pair, no pair at all, or a pair that is junk (see market/spam). */
export type Verdict = "real" | "none" | "junk";

/**
 * In order, up to `limit`: tokens with a position, tokens just traded, tokens
 * whose amount moved since the last read (bought, sold, sold out, airdropped),
 * tokens known to have a real pair, tokens never priced (a batch at a time),
 * then tokens whose rest is over. A resting token also comes back when its
 * amount moves.
 */
export function mintsToPrice(o: {
  held: string[];
  traded: string[];
  holdings: Record<string, number>;
  /** The last read's holdings; null on a wallet's first read. */
  prev: Record<string, number> | null;
  memory: PricingMemory;
  now: number;
  limit: number;
}): string[] {
  const out = new Set<string>();
  const add = (m: string) => {
    if (out.size < o.limit) out.add(m);
  };
  for (const m of o.held) add(m);
  for (const m of o.traded) add(m);
  if (o.prev) {
    for (const m of new Set([...Object.keys(o.prev), ...Object.keys(o.holdings)])) {
      if ((o.prev[m] ?? 0) !== (o.holdings[m] ?? 0)) add(m);
    }
  }
  const present = Object.keys(o.holdings);
  const { known, resting } = o.memory;
  for (const m of present) if (known.has(m)) add(m);
  for (const m of present) if (!known.has(m) && !resting.has(m)) add(m);
  for (const m of present) if (resting.has(m) && resting.get(m)!.until <= o.now) add(m);
  return [...out];
}

/** What a check taught: real pairs are remembered, the rest rest. */
export function learn(memory: PricingMemory, verdicts: Record<string, Verdict>, now: number): void {
  for (const [m, v] of Object.entries(verdicts)) {
    if (v === "real") {
      memory.known.add(m);
      memory.resting.delete(m);
      continue;
    }
    memory.known.delete(m);
    const misses = (memory.resting.get(m)?.misses ?? 0) + 1;
    const rest = v === "junk" ? REST_MS : Math.min(REST_MS, FIRST_REST_MS * 6 ** (misses - 1));
    memory.resting.set(m, { until: now + rest, misses });
  }
}
