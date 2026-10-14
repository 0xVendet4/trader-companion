// The demos' fictional market: four made-up memecoins and their numbers, for
// the presentation demo (demo.ts) and the one inside the app (island/tour.ts).
// Every coin here is fictional, so no real coin is shown making moves it never
// made.

import type { Quote, WatchToken } from "../core/state";

/** A coloured circle with a letter, as a token picture (no network). */
export function avatar(letter: string, bg: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><circle cx='20' cy='20' r='20' fill='${bg}'/><text x='20' y='26' font-family='Segoe UI,Arial' font-size='18' font-weight='700' fill='white' text-anchor='middle'>${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DEMO_TOKENS: WatchToken[] = [
  { key: "DemoCandLe1111111111111111111111111111111111", chainId: "solana", address: "DemoCandLe1111111111111111111111111111111111", symbol: "CANDLE", name: "Candle Cat", pairAddress: "DemoPairCandLe11111111111111111111111111111", dexId: "pumpswap", imageUrl: avatar("C", "#16a34a") },
  { key: "DemoFroGe11111111111111111111111111111111111", chainId: "solana", address: "DemoFroGe11111111111111111111111111111111111", symbol: "FROGE", name: "Froge", pairAddress: "DemoPairFroGe111111111111111111111111111111", dexId: "raydium", imageUrl: avatar("F", "#0ea5e9") },
  { key: "DemoWiCk111111111111111111111111111111111111", chainId: "solana", address: "DemoWiCk111111111111111111111111111111111111", symbol: "WICK", name: "Wick", pairAddress: "DemoPairWiCk1111111111111111111111111111111", dexId: "pumpswap", imageUrl: avatar("W", "#a855f7") },
  { key: "DemoSPaRK11111111111111111111111111111111111", chainId: "solana", address: "DemoSPaRK11111111111111111111111111111111111", symbol: "SPARK", name: "Spark", pairAddress: "DemoPairSPaRK111111111111111111111111111111", dexId: "meteora", imageUrl: avatar("S", "#f59e0b") },
];

/**
 * Two made-up EVM memecoins, for the EVM wallet scenes: one on BSC, one on
 * Base (keys as tokenKey makes them: chain:address, lower case).
 */
export const DEMO_EVM_TOKENS: WatchToken[] = [
  { key: "bsc:0xf1a3e000000000000000000000000000000000f1", chainId: "bsc", address: "0xF1A3E000000000000000000000000000000000F1", symbol: "FLAME", name: "Flame", pairAddress: "0xdea1f1a3e00000000000000000000000000000f1", dexId: "pancakeswap", imageUrl: avatar("F", "#f97316") },
  { key: "base:0xe3be2000000000000000000000000000000000e3", chainId: "base", address: "0xE3BE2000000000000000000000000000000000E3", symbol: "EMBER", name: "Ember", pairAddress: "0xdea1e3be200000000000000000000000000000e3", dexId: "uniswap", imageUrl: avatar("E", "#ef4444") },
];

export interface Live {
  price: number;
  supply: number;
  liq: number;
  m5: number;
  h1: number;
  h24: number;
}

/** Each demo coin's numbers at the start of a run, by symbol. */
export function freshLive(): Record<string, Live> {
  return {
    CANDLE: { price: 0.004213, supply: 1e9, liq: 182_000, m5: 1.2, h1: 6.4, h24: 41.8 },
    FROGE: { price: 0.01874, supply: 1e9, liq: 640_000, m5: -0.6, h1: -2.1, h24: 12.5 },
    WICK: { price: 0.000918, supply: 1e9, liq: 96_000, m5: 2.4, h1: 11.2, h24: -18.3 },
    SPARK: { price: 0.0612, supply: 1e9, liq: 1_250_000, m5: 0.3, h1: 1.8, h24: 4.2 },
    FLAME: { price: 0.0321, supply: 1e8, liq: 410_000, m5: 0.8, h1: 5.1, h24: 22.4 },
    EMBER: { price: 0.00087, supply: 1e10, liq: 150_000, m5: -1.1, h1: -3.4, h24: -9.8 },
  };
}

/** Quotes for the demo coins (the EVM ones too), as DexScreener would give them, by token key. */
export function demoQuotes(live: Record<string, Live>): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  for (const t of [...DEMO_TOKENS, ...DEMO_EVM_TOKENS]) {
    const l = live[t.symbol];
    out[t.key] = {
      address: t.key,
      pairAddress: t.pairAddress,
      priceUsd: l.price,
      marketCap: l.price * l.supply,
      liquidityUsd: l.liq,
      change: { m5: l.m5, h1: l.h1, h6: 0, h24: l.h24 },
      volume: { m5: 25_000, h1: 300_000, h6: 900_000, h24: 2_000_000 },
      txnsM5: { buys: 80, sells: 60 },
      txns: { m5: { buys: 80, sells: 60 }, h1: { buys: 910, sells: 702 }, h6: { buys: 4_100, sells: 3_350 }, h24: { buys: 12_800, sells: 10_400 } },
      updatedAt: Date.now(),
    };
  }
  return out;
}

/** Small random drift, so the numbers look alive between scripted moves. */
export function driftLive(live: Record<string, Live>, random = Math.random) {
  for (const l of Object.values(live)) {
    const step = (random() - 0.5) * 0.006;
    l.price *= 1 + step;
    l.m5 = Math.round((l.m5 + step * 100) * 10) / 10;
    l.liq *= 1 + (random() - 0.5) * 0.002;
  }
}
