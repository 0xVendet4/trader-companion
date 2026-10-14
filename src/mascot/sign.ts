// The little sign Candy holds up while the mouse rests on him: today's PnL.
// What it says comes from the numbers the island already shows: the day's log
// (the header's day pill, in the journal's unit) and the trader's own wallet
// (what today's sales took, in USD; what the tokens held are up or down since
// their entries goes under it as "open", never into today's figure).
// Pure: the island gathers the numbers, the mascot draws the sign.

import { formatPnl } from "../core/format";
import { t, tn } from "../core/i18n";
import { formatSignedUsd } from "../positions/positions";

export interface DayPnl {
  /** Today's log: whole trades, and what they took in the journal's unit ("SOL", "USD"). */
  log: { count: number; total: number; unit: string };
  /** The trader's own wallet, when one is followed: today's sales and the open positions (USD), and how many are held. */
  wallet: { realizedUsd: number; openUsd: number; held: number } | null;
}

export type SignTone = "up" | "down" | "flat";

export interface PnlSign {
  tone: SignTone;
  /** The small word on top ("Today"), or the whole line of an empty sign. */
  label: string;
  /** The number, big; empty on an empty sign. */
  big: string;
  /** Under it: the trades, what is still open. */
  small: string;
}

/** Less than a cent either way counts as flat. */
const toneOf = (v: number): SignTone => (v >= 0.005 ? "up" : v <= -0.005 ? "down" : "flat");

/**
 * What the sign says. The day's log comes first, in its own unit, exactly as
 * the header's day pill counts it; with no log, what today's sales took (USD).
 * The open positions never count as today's: they are up or down since their
 * entries, which may be days ago, so they go under it as "open", or, with
 * nothing sold today, on a sign of their own headed "Open PnL". Nothing at
 * all today: a calm "No trades today".
 */
export function pnlSign(d: DayPnl): PnlSign {
  const w = d.wallet;
  const holding = !!w && w.held > 0;
  const open = holding ? t("{amount} open", { amount: formatSignedUsd(w.openUsd) }) : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  if (d.log.count > 0 || d.log.total !== 0) {
    return {
      tone: toneOf(d.log.total),
      label: t("Today"),
      big: formatPnl(d.log.total, d.log.unit),
      small: join(d.log.count > 0 ? tn(d.log.count, "{n} trade", "{n} trades") : "", open),
    };
  }
  if (w && w.realizedUsd !== 0) {
    return { tone: toneOf(w.realizedUsd), label: t("Today"), big: formatSignedUsd(w.realizedUsd), small: open };
  }
  if (w && holding) {
    return { tone: toneOf(w.openUsd), label: t("Open PnL"), big: formatSignedUsd(w.openUsd), small: t("No sales yet today") };
  }
  return { tone: "flat", label: t("No trades today"), big: "", small: "" };
}
