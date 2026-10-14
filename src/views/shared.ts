// Pieces every island view uses: the actions the island hands them, buttons,
// keyboard-borrowing fields, token images, % labels, the safety badge and the
// mini chart.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { formatPct, formatUsd, pctClass } from "../core/format";
import { t } from "../core/i18n";
import { Companion } from "../companion";
import { State, type Companion as CompanionSettings, type IslandViewName, type Quote, type TrackedWallet, type WatchToken } from "../core/state";
import type { CardFormat } from "../share/card";
import { weekRange, type WeekRange } from "../share/recap";
import type { SoundName } from "../core/sound";
import type { MascotState } from "../mascot/mascot";
import type { ParticleKind } from "../mascot/particles";
import type { SettingsSection } from "../core/panel";
import { CHAINS, EVM_CHAINS, walletFamily, type ChainId, type EvmChain } from "../market/chains";
import { majorFor } from "../market/majors";
import { SAFETY_LABEL, describeSafety } from "../market/safety";
import { relativeStrength, sparkPair, sparkPath, sparkSeries } from "../market/sparkline";

export interface ViewActions {
  setView(v: IslandViewName): void;
  blip(): void;
  toggleSound(): void;
  /** Opens Settings in the island (or closes it, from the gear); at a section for a link to one. */
  openSettings(section?: SettingsSection): void;
  /** Opens the closet in the island: every look, large (src/closet). */
  openCloset(): void;
  /** Opens a token on the trading terminal; `token` for tokens off the watchlist. */
  openToken(address: string, token?: WatchToken): void;
  openUrl(url: string): void;
  /** Lets a text field take the keyboard (the island never does otherwise). */
  focusInput(on: boolean): void;
  /** OK / the event card's buttons: next event, or back to the tabs. */
  dismissEvent(): void;
  /** The event card's ⌃: folded into the ticker, unanswered. */
  foldEvent(): void;
  /** The content changed size (a row was added): animate the island. */
  relayout(): void;
  /** Candy's mouth: open while an address pasted in a field is looked up, then it gulps (added) or shuts (not). */
  mouth(state: "open" | "gulp" | "shut"): void;
  /** Puts on the look just picked (hat, face, colour). */
  applyLook(): void;
  /** Tries a look on Candy without keeping it (the wardrobe's hover); null: back to the one kept. */
  previewLook(apply: ((c: CompanionSettings) => void) | null): void;
  /** Hides the island until the show/hide shortcut, or Open in the tray, brings it back. */
  minimize(): void;
  /** Draws today's recap card and copies (or downloads) it; resolves to a note. */
  shareDay(): Promise<string>;
  /** A week's recap card, wide or a 9:16 story, copied (see Island.shareWeek); resolves to what to tell the trader. */
  shareWeek(range: WeekRange, format: CardFormat): Promise<string>;
  /** Candy doing his part in a card (going over the checklist). */
  candy(act: CandyAct): void;
  /**
   * Keeps the island from folding away while something plays out in it (he
   * goes over a checklist; a chart is open). `holder` names who asks (the
   * card by default): one holder letting go does not release another's hold.
   */
  holdOpen(on: boolean, holder?: string): void;
}

export interface CandyAct {
  /** A short reaction, for `ms`. */
  react?: MascotState;
  /** A line in his bubble for `ms`; null hides it. */
  say?: string | null;
  ms?: number;
  /** One of these off his head (`count` of them: a burst). */
  emit?: ParticleKind;
  count?: number;
  hop?: boolean;
  sound?: SoundName;
  /** His eyes on an element of the card; null: back to the cursor's way. */
  look?: HTMLElement | null;
  /** A step forward (closer, bigger) while he holds something up; false: back in his spot. Ends with the card. */
  forward?: boolean;
}

export interface ViewHost {
  el: HTMLElement;
  sync(): void;
  /** Called once a second while the view is on screen. */
  tick?(): void;
}

export function btn(label: string, kind: "primary" | "secondary" | "ghost", onClick: () => void): HTMLButtonElement {
  return h("button", { class: `btn ${kind}`, onclick: onClick }, label) as HTMLButtonElement;
}

export function iconBtn(icon: string, title: string, onClick: (e: MouseEvent) => void, stroke?: number): HTMLButtonElement {
  return h(
    "button",
    { class: "icon-btn", title, onclick: (e: Event) => onClick(e as MouseEvent) },
    svg(icon, 13, stroke ? { stroke } : {}),
  ) as HTMLButtonElement;
}

/** A text field that borrows the keyboard while it is being used. */
export function field(actions: ViewActions, attrs: Record<string, string>): HTMLInputElement {
  const input = h("input", { class: "field", spellcheck: "false", autocomplete: "off", ...attrs });
  input.addEventListener("mousedown", () => {
    actions.focusInput(true);
    window.setTimeout(() => input.focus(), 30);
  });
  input.addEventListener("blur", () => actions.focusInput(false));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") input.blur();
    // The island's own keys (Ctrl + 1–9 for a tab, Ctrl + , for Settings) still work while typing.
    if (e.ctrlKey && !e.altKey && (/^Digit[1-9]$/.test(e.code) || e.code === "Comma")) return;
    e.stopPropagation();
  });
  return input;
}

/** A native select also opens a popup that needs the keyboard. */
export function borrowKeyboard(actions: ViewActions, el: HTMLElement) {
  el.addEventListener("mousedown", () => actions.focusInput(true));
  el.addEventListener("blur", () => actions.focusInput(false));
}

export function tokenImg(url: string | null, symbol: string): HTMLElement {
  if (url) {
    const img = h("img", { class: "tok-img", src: url, alt: "", draggable: "false" });
    img.addEventListener("error", () => img.replaceWith(tokenFallback(symbol)));
    return img;
  }
  return tokenFallback(symbol);
}

function tokenFallback(symbol: string): HTMLElement {
  return h("span", { class: "tok-img fallback", text: symbol.slice(0, 1).toUpperCase() });
}

export function pct(p: number | null | undefined): HTMLElement {
  return h("span", { class: `pct ${pctClass(p)}`, text: formatPct(p) });
}

/** Liquidity, with a warning when the pool reports far more than backs it. */
export function liquidityCell(q: { liquidityUsd: number | null; suspectLiquidity?: boolean } | null | undefined): HTMLElement {
  const el = h("span", { class: `c-liq ${q?.suspectLiquidity ? "suspect" : ""}` }, formatUsd(q?.liquidityUsd));
  el.title = q?.suspectLiquidity
    ? t("Fake-looking liquidity: the pool reports far more than the SOL / USDC / ETH actually in it. This shows the real part.")
    : t("Liquidity backed by SOL / USDC / ETH / BNB in the pool");
  if (q?.suspectLiquidity) el.prepend("⚠ ");
  return el;
}

/** A small chain tag (SOL / BSC / ETH / HOOD) next to a symbol. */
export function chainTag(chainId: ChainId): HTMLElement {
  const c = CHAINS[chainId];
  return h("span", { class: "chain-tag", text: c.tag, title: c.label, style: `--chain:${c.color}` });
}

/**
 * Where a wallet is followed, as tags: SOL for a Solana wallet; for an EVM
 * wallet ETH, BSC and BASE, each a switch (`onPick`), the ones unticked dimmed.
 * At least one stays on.
 */
export function walletChainTags(w: Pick<TrackedWallet, "family" | "chains">, onPick?: (chains: EvmChain[]) => void): HTMLElement {
  const el = h("span", { class: "chain-picks" });
  if (w.family !== "evm") {
    el.append(chainTag("solana"));
    return el;
  }
  const picked = w.chains ?? [...EVM_CHAINS];
  for (const c of EVM_CHAINS) {
    const on = picked.includes(c);
    const chain = CHAINS[c];
    const tag = h("button", {
      class: `chain-tag pick ${on ? "on" : "off"}`,
      type: "button",
      text: chain.tag,
      style: `--chain:${chain.color}`,
      title: on ? t("Followed on {chain}: click to leave it out", { chain: chain.label }) : t("Not followed on {chain}: click to follow it there too", { chain: chain.label }),
    });
    tag.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = on ? picked.filter((x) => x !== c) : EVM_CHAINS.filter((x) => x === c || picked.includes(x));
      if (next.length === 0 || !onPick) return;
      onPick(next);
    });
    el.append(tag);
  }
  return el;
}

/**
 * Next to an address field: what the typed address is, as it is typed. A 0x
 * address is an EVM wallet, followed on Ethereum, BSC and Base; base58 is a
 * Solana one; anything else shows nothing.
 */
export function addressHint(input: HTMLInputElement): HTMLElement {
  const el = h("span", { class: "addr-hint" });
  const paint = () => {
    el.replaceChildren();
    const family = walletFamily(input.value);
    if (!family) return;
    el.append(walletChainTags({ family }));
  };
  input.addEventListener("input", paint);
  paint();
  return el;
}

type Tagged = Pick<WatchToken, "key" | "chainId"> & Partial<Pick<WatchToken, "coingecko">>;

/**
 * Next to a symbol: a major coin's rank by market cap ("#3"; its tracking
 * token's chain would mislead: BTC is not an Ethereum coin), else its chain
 * when that helps.
 */
export function tokenTag(tok: Tagged, showChain: boolean, q?: Quote | null): HTMLElement | null {
  if (majorFor(tok)) {
    const el = h("span", { class: "chain-tag major" });
    setMajorTag(el, tok, q);
    return el;
  }
  return showChain ? chainTag(tok.chainId) : null;
}

/** A major's tag as its quote has it: the rank once CoinGecko gave it, MAJOR until then. */
export function setMajorTag(el: HTMLElement, tok: Pick<WatchToken, "chainId">, q?: Quote | null) {
  const rank = q?.rank;
  el.textContent = rank ? `#${rank}` : t("MAJOR");
  el.title =
    (rank ? `${t("#{rank} by market cap right now (CoinGecko).", { rank })} ` : "") +
    t("A major coin: priced from a token that tracks it on {chain} (DexScreener); market cap and 24 h volume from CoinGecko.", {
      chain: CHAINS[tok.chainId].label,
    });
}

/** The RugCheck shield, or nothing for a major coin (no rug to check). */
export function safetyFor(tok: Tagged, onOpen: () => void): HTMLElement | null {
  return majorFor(tok) ? null : safetyBadge(tok, onOpen);
}

/** The RugCheck shield next to a symbol. Click → the full report. */
export function safetyBadge(token: Pick<WatchToken, "key" | "chainId">, onOpen: () => void): HTMLElement {
  if (!CHAINS[token.chainId].rugcheck) {
    return h(
      "span",
      { class: "safe unknown", title: t("No safety check on {chain} yet (RugCheck covers Solana only).", { chain: CHAINS[token.chainId].label }) },
      svg(ICONS.shield, 11),
    );
  }
  const r = State.safety[token.key];
  const level = r == null || r === "loading" ? "pending" : r === "error" ? "unknown" : r.level;
  const title =
    r == null || r === "loading"
      ? t("Checking with RugCheck…")
      : r === "error"
        ? t("RugCheck didn't answer. Will retry.")
        : describeSafety(r);
  const el = h("button", { class: `safe ${level}`, title, "aria-label": r && typeof r === "object" ? t(SAFETY_LABEL[r.level]) : t("Safety") }, svg(ICONS.shield, 11));
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (r && typeof r === "object") onOpen();
  });
  return el;
}

/** The 24 h mini chart for a watchlist row. */
/** The quote of a chain's own coin (SOL, BNB, ETH), when the app has it. */
function chainCoinQuote(chain: ChainId): Quote | null {
  const sym = CHAINS[chain].native.symbol;
  return State.natives[sym] ?? (sym === "SOL" ? State.sol : null) ?? null;
}

export function sparkline(mint: string, w = 56, h0 = 18): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, "svg");
  el.setAttribute("viewBox", `0 0 ${w} ${h0}`);
  el.setAttribute("width", String(w));
  el.setAttribute("height", String(h0));
  el.setAttribute("class", "spark");
  const q = State.quotes[mint];
  const now = Date.now();
  const series = q ? sparkSeries(q, State.history[mint] ?? [], now) : [];
  // Relative strength: the chain's coin (SOL, BNB, ETH) as a faint line on the same % scale.
  const token = State.token(mint);
  const coin = q && token && !q.major && State.companion.relativeStrength ? chainCoinQuote(token.chainId) : null;
  const pair = coin && coin.address !== q!.address ? sparkPair(series, sparkSeries(coin, [], now), w, h0) : null;
  const path = pair ? { d: pair.token, up: pair.up } : sparkPath(series, w, h0);
  if (path) {
    if (pair) {
      const base = document.createElementNS(ns, "polyline");
      base.setAttribute("points", pair.coin);
      base.setAttribute("class", "coin");
      el.append(base);
    }
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", path.d);
    line.setAttribute("class", path.up ? "up" : "down");
    el.append(line);
    const tip = document.createElementNS(ns, "title");
    const sym = token ? CHAINS[token.chainId].native.symbol : "";
    const rel = pair && coin ? relativeStrength(q!.change.h24, coin.change.h24) : null;
    tip.textContent =
      rel != null
        ? t("Last 24 h: {change} · {coin} {coinChange} (the faint line) · {rel} against {coin}", {
            change: formatPct(q!.change.h24),
            coin: sym,
            coinChange: formatPct(coin!.change.h24),
            rel: formatPct(rel),
          })
        : t("Last 24 h (recent hours stretched)");
    el.append(tip);
  }
  return el;
}

/**
 * A recap card being drawn, by whichever tab's links asked: one at a time,
 * since both tabs (My wallet, Discipline) carry the links and the clipboard
 * is one.
 */
let sharing = false;

/**
 * Share my day · my week ($ shown): today's and this week's recap cards,
 * with or without amounts. My wallet and Discipline both end with it, so the
 * PnL can be shared with Discipline turned off too. The note (drawing,
 * copied, or what went wrong) shows before the links; `onNote` says when it
 * is showing, for a line that has to make room for it. Replay today, the
 * end-of-day board again (src/share/dayend.ts), ends the links: from My
 * wallet the board's Share is then one click away with Discipline off.
 */
export function shareLinks(actions: ViewActions, onNote?: (showing: boolean) => void): { el: HTMLElement; sync(): void } {
  const note = h("span", { class: "share-note" });
  let clearNote = 0;
  const say = (text: string) => {
    window.clearTimeout(clearNote);
    note.textContent = text;
    note.title = text;
    onNote?.(text !== "");
  };
  const draw = (make: () => Promise<string>) => async () => {
    if (sharing) return;
    sharing = true;
    say(t("Drawing…"));
    try {
      say(await make());
      actions.blip();
    } catch (err) {
      say(t("Couldn't make the image: {error}", { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      sharing = false;
      clearNote = window.setTimeout(() => say(""), 4000);
    }
  };
  const day = h("a", {
    class: "share",
    text: t("Share my day"),
    title: t("A recap image of today, copied to paste on X or Telegram"),
    onclick: draw(() => actions.shareDay()),
  });
  // This week so far, as a 9:16 story.
  const week = h("a", {
    class: "share",
    text: t("my week"),
    title: t("This week so far as a story image (9:16), copied for Instagram, TikTok or Telegram"),
    onclick: draw(() => actions.shareWeek(weekRange(new Date(), "this"), "story")),
  });
  const money = h("a", {
    class: "money",
    title: t("Show or hide amounts on the image (signs and % stay)"),
    onclick: () => {
      State.companion.recapHideMoney = !State.companion.recapHideMoney;
      Companion.save();
      actions.blip();
      sync();
    },
  });
  const replay = h("a", {
    text: t("Replay today"),
    title: t("The end-of-day board again: today's numbers counting up, with Share"),
    onclick: () => {
      actions.blip();
      Companion.replayDayEnd();
    },
  });
  // The links stay together: where the line is short, the note gives way, not them.
  const el = h("span", { class: "share-links" }, note, h("span", { class: "links" }, day, " · ", week, " ", money, " · ", replay));
  function sync() {
    money.textContent = State.companion.recapHideMoney ? t("($ hidden)") : t("($ shown)");
  }
  sync();
  return { el, sync };
}
