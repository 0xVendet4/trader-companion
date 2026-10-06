// Junk in a wallet: airdropped scams and coins nobody can sell. Wallets collect
// them by the hundred (anyone can send any token to any address), and at the
// price DexScreener quotes some look like a fortune. Judged from the pair the
// wallet check already fetched: no extra call.

import { backedLiquidity, suspectLiquidity, type DexPair } from "./dexscreener";

/**
 * A name or symbol that advertises a site or a prize: the phishing airdrop
 * ("Visit xyz.com to claim"). Real coins don't carry a web address.
 */
const LURE =
  /https?:\/\/|www\.|t\.me\/|\b[a-z0-9-]{2,}\.(?:com|io|xyz|net|org|app|gg|site|top|fun|live|pro|vip|win|link|click|online|info|cc|co|lol|claims?|gift|today)\b|\b(?:claim|visit|redeem|voucher|giveaway)\b/i;

/**
 * Why a token held in a wallet is junk, or null when it looks like a real
 * holding:
 * - its name or symbol advertises a site or a prize;
 * - its pool's liquidity is fake (reported far above what backs it);
 * - what is held is worth more, at the quoted price, than all the real money
 *   in its pool: the price is a mirage, nothing near it can be taken out.
 * A token still on its pump.fun curve has no pool figures (liquidity null):
 * it sells back to the curve, so only its name is judged.
 */
export function junkReason(pair: DexPair, amount: number): string | null {
  if (LURE.test(`${pair.baseToken?.name ?? ""} ${pair.baseToken?.symbol ?? ""}`)) {
    return "its name advertises a site: a phishing airdrop";
  }
  if (pair.liquidity?.usd == null) return null;
  if (suspectLiquidity(pair)) return "its pool's liquidity is fake";
  const value = amount * (Number(pair.priceUsd) || 0);
  if (value > 0 && value > backedLiquidity(pair)) return "worth more than all the real money in its pool: it can't be sold at that price";
  return null;
}
