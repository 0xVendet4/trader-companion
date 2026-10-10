// Pieces every island view uses: the actions the island hands them, buttons,
// keyboard-borrowing fields, token images, % labels, the safety badge and the
// mini chart.

import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { formatPct, formatUsd, pctClass } from "../core/format";
import { State, type Companion, type IslandViewName, type Quote, type WatchToken } from "../core/state";
import type { CardFormat } from "../share/card";
import type { WeekRange } from "../share/recap";
import type { SoundName } from "../core/sound";
import type { MascotState } from "../mascot/mascot";
import type { ParticleKind } from "../mascot/particles";
import { CHAINS, type ChainId } from "../market/chains";
import { majorFor } from "../market/majors";
import { SAFETY_LABEL, describeSafety } from "../market/safety";
import { relativeStrength, sparkPair, sparkPath, sparkSeries } from "../market/sparkline";

export interface ViewActions {
  setView(v: IslandViewName): void;
  blip(): void;
  toggleSound(): void;
  openSettings(): void;
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
  previewLook(apply: ((c: Companion) => void) | null): void;
  /** Hides the island until the show/hide shortcut, or Open in the tray, brings it back. */
  minimize(): void;
  /** Draws today's recap card and copies (or downloads) it; resolves to a note. */
  shareDay(): Promise<string>;
  /** A week's recap card, wide or a 9:16 story, copied (see Island.shareWeek); resolves to what to tell the trader. */
  shareWeek(range: WeekRange, format: CardFormat): Promise<string>;
  /** Candy doing his part in a card (going over the checklist). */
  candy(act: CandyAct): void;
  /** Keeps the card from folding away while he does (see IslandStateMachine.hold). */
  holdOpen(on: boolean): void;
}

export interface CandyAct {
  /** A short reaction, for `ms`. */
  react?: MascotState;
  /** A line in his bubble for `ms`; null hides it. */
  say?: string | null;
  ms?: number;
  /** One of these off his head. */
  emit?: ParticleKind;
  hop?: boolean;
  sound?: SoundName;
  /** His eyes on an element of the card; null: back to the cursor's way. */
  look?: HTMLElement | null;
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
    ? "Fake-looking liquidity: the pool reports far more than the SOL / USDC / ETH actually in it. This shows the real part."
    : "Liquidity backed by SOL / USDC / ETH / BNB in the pool";
  if (q?.suspectLiquidity) el.prepend("⚠ ");
  return el;
}

/** A small chain tag (SOL / BSC / ETH / HOOD) next to a symbol. */
export function chainTag(chainId: ChainId): HTMLElement {
  const c = CHAINS[chainId];
  return h("span", { class: "chain-tag", text: c.tag, title: c.label, style: `--chain:${c.color}` });
}

type Tagged = Pick<WatchToken, "key" | "chainId"> & Partial<Pick<WatchToken, "coingecko">>;

/**
 * Next to a symbol: a major coin's rank by market cap ("#3"; its tracking
 * token's chain would mislead: BTC is not an Ethereum coin), else its chain
 * when that helps.
 */
export function tokenTag(t: Tagged, showChain: boolean, q?: Quote | null): HTMLElement | null {
  if (majorFor(t)) {
    const el = h("span", { class: "chain-tag major" });
    setMajorTag(el, t, q);
    return el;
  }
  return showChain ? chainTag(t.chainId) : null;
}

/** A major's tag as its quote has it: the rank once CoinGecko gave it, MAJOR until then. */
export function setMajorTag(el: HTMLElement, t: Pick<WatchToken, "chainId">, q?: Quote | null) {
  const rank = q?.rank;
  el.textContent = rank ? `#${rank}` : "MAJOR";
  el.title =
    (rank ? `#${rank} by market cap right now (CoinGecko). ` : "") +
    `A major coin: priced from a token that tracks it on ${CHAINS[t.chainId].label} (DexScreener); market cap and 24 h volume from CoinGecko.`;
}

/** The RugCheck shield, or nothing for a major coin (no rug to check). */
export function safetyFor(t: Tagged, onOpen: () => void): HTMLElement | null {
  return majorFor(t) ? null : safetyBadge(t, onOpen);
}

/** The RugCheck shield next to a symbol. Click → the full report. */
export function safetyBadge(token: Pick<WatchToken, "key" | "chainId">, onOpen: () => void): HTMLElement {
  if (!CHAINS[token.chainId].rugcheck) {
    return h(
      "span",
      { class: "safe unknown", title: `No safety check on ${CHAINS[token.chainId].label} yet (RugCheck covers Solana only).` },
      svg(ICONS.shield, 11),
    );
  }
  const r = State.safety[token.key];
  const level = r == null || r === "loading" ? "pending" : r === "error" ? "unknown" : r.level;
  const title =
    r == null || r === "loading"
      ? "Checking with RugCheck…"
      : r === "error"
        ? "RugCheck didn't answer. Will retry."
        : describeSafety(r);
  const el = h("button", { class: `safe ${level}`, title, "aria-label": r && typeof r === "object" ? SAFETY_LABEL[r.level] : "Safety" }, svg(ICONS.shield, 11));
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
    const t = document.createElementNS(ns, "title");
    const sym = token ? CHAINS[token.chainId].native.symbol : "";
    const rel = pair && coin ? relativeStrength(q!.change.h24, coin.change.h24) : null;
    t.textContent =
      rel != null
        ? `Last 24 h: ${formatPct(q!.change.h24)} · ${sym} ${formatPct(coin!.change.h24)} (the faint line) · ${formatPct(rel)} against ${sym}`
        : "Last 24 h (recent hours stretched)";
    el.append(t);
  }
  return el;
}
