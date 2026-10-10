// The trending tab: DexScreener's most boosted tokens ("Hot") and its newest
// profiles ("New") on the chosen chains, sorted by volume, market cap,
// liquidity or age, with volume and % change over a chosen window. Each row
// has its chain, a safety badge and a one-click add.

import { h, clear } from "./dom";
import { chainTag, liquidityCell, pct, safetyBadge, tokenImg, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { formatAge, formatUsd } from "../core/format";
import { N_, t } from "../core/i18n";
import { MAX_ROWS, ROW_H } from "../core/layout";
import { State, type Timeframe, type TrendingItem, type TrendingSort } from "../core/state";
import { ALL_CHAINS, CHAINS, type ChainId } from "../market/chains";
import { rugcheckUrl } from "../market/safety";
import { sortTrending } from "../market/trending";

// "Vol", "MC" and "Liq" are trading shorthand, the same everywhere: not marked.
const SORTS: [TrendingSort, string, string][] = [
  ["volume", "Vol", N_("Volume in the chosen window")],
  ["mcap", "MC", N_("Market cap")],
  ["liquidity", "Liq", N_("Liquidity")],
  ["newest", N_("New"), N_("Newest pairs first")],
];

const FRAMES: [Timeframe, string][] = [
  ["m5", "5m"],
  ["h1", "1h"],
  ["h6", "6h"],
  ["h24", "24h"],
];

/** A row of segment buttons; `on` says which are lit. */
function segment<T extends string>(items: [T, string, string?][], on: (v: T) => boolean, pick: (v: T) => void) {
  const el = h("div", { class: "seg" });
  const buttons = items.map(([v, label, title]) => {
    const b = h("button", { class: "seg-btn", text: label, title: title ?? label });
    b.addEventListener("click", () => pick(v));
    el.append(b);
    return [v, b] as const;
  });
  return { el, paint: () => buttons.forEach(([v, b]) => b.classList.toggle("on", on(v))) };
}

export function buildTrending(actions: ViewActions): ViewHost {
  const rows = h("div", { class: "rows" });
  rows.style.maxHeight = `${MAX_ROWS * ROW_H}px`;
  const status = h("div", { class: "empty" });
  const note = h("span", { class: "note trending-note" });
  let key = "";

  const changed = (refresh: boolean) => {
    actions.blip();
    key = "";
    Companion.save();
    if (refresh) {
      void Companion.refreshTrending(true);
      void Companion.pollNow(); // the header prices follow the chains
    }
    actions.relayout();
  };

  const lists = segment<"hot" | "fresh">(
    [
      ["hot", t("Hot"), t("Most boosted on DexScreener. Boosts are paid promotion: what's being pushed, not what's good.")],
      ["fresh", t("New"), t("Newest token profiles")],
    ],
    (v) => State.trendingList === v,
    (v) => {
      State.trendingList = v;
      changed(false);
    },
  );

  // Chains: "All", or any combination (at least one stays on).
  const chainItems: [ChainId | "all", string, string][] = [
    ["all", t("All"), t("Every chain")],
    ...ALL_CHAINS.map((c): [ChainId, string, string] => [c, CHAINS[c].tag, CHAINS[c].label]),
  ];
  const chains = segment<ChainId | "all">(
    chainItems,
    (v) => (v === "all" ? State.companion.chains.length === ALL_CHAINS.length : State.companion.chains.includes(v)),
    (v) => {
      const cur = State.companion.chains;
      if (v === "all") State.companion.chains = [...ALL_CHAINS];
      else if (cur.includes(v)) {
        if (cur.length === 1) return; // never zero chains
        State.companion.chains = cur.filter((c) => c !== v);
      } else State.companion.chains = ALL_CHAINS.filter((c) => c === v || cur.includes(c));
      changed(true);
    },
  );
  chains.el.classList.add("chains");

  const sorts = segment<TrendingSort>(
    SORTS.map(([v, label, title]): [TrendingSort, string, string] => [v, t(label), t(title)]),
    (v) => State.companion.trendingSort === v,
    (v) => {
      State.companion.trendingSort = v;
      changed(false);
    },
  );
  const frames = segment<Timeframe>(
    FRAMES,
    (v) => State.companion.trendingFrame === v,
    (v) => {
      State.companion.trendingFrame = v;
      changed(false);
    },
  );

  const volHead = h("span", { class: "c-vol" });
  const pctHead = h("span", { class: "c-pct" });
  const head = h(
    "div",
    { class: "row head" },
    h("span", { class: "c-tok", text: t("Token") }),
    h("span", { class: "c-age", text: t("Age") }),
    h("span", { class: "c-mc", text: "MC" }),
    h("span", { class: "c-liq", text: "Liq" }),
    volHead,
    pctHead,
    h("span", { class: "c-add" }),
  );

  function add(item: TrendingItem) {
    const res = Companion.addWatchToken(item.token);
    note.className = res.ok ? "note trending-note ok" : "note trending-note err";
    note.textContent = res.message;
    window.setTimeout(() => (note.textContent = ""), 3000);
    if (res.ok) actions.blip();
    key = "";
    State.notify();
  }

  function row(item: TrendingItem): HTMLElement {
    const tok = item.token;
    const q = item.quote;
    const frame = State.companion.trendingFrame;
    const watched = !!State.token(tok.key);
    const plus = h(
      "button",
      {
        class: `icon-btn add ${watched ? "done" : ""}`,
        title: watched ? t("On your watchlist") : t("Add to watchlist"),
        onclick: (e: Event) => {
          e.stopPropagation();
          if (!watched) add(item);
        },
      },
      watched ? "✓" : "+",
    );
    const el = h(
      "div",
      { class: "row", title: t("{name} · open its page", { name: tok.name }) },
      h(
        "span",
        { class: "c-tok" },
        tokenImg(tok.imageUrl, tok.symbol),
        h("span", { class: "sym", text: tok.symbol }),
        State.companion.chains.length > 1 ? chainTag(tok.chainId) : null,
        safetyBadge(tok, () => actions.openUrl(rugcheckUrl(tok.address))),
      ),
      h("span", { class: "c-age", text: formatAge(item.pairCreatedAt), title: t("Pair age") }),
      h("span", { class: "c-mc", text: formatUsd(q?.marketCap) }),
      liquidityCell(q),
      h("span", { class: "c-vol", text: formatUsd(q?.volume[frame]), title: t("Volume in the chosen window") }),
      h("span", { class: "c-pct" }, pct(q?.change[frame])),
      h("span", { class: "c-add" }, plus),
    );
    el.addEventListener("click", () => actions.openToken(tok.key, tok));
    return el;
  }

  const el = h(
    "div",
    { class: "view trending" },
    h("div", { class: "seg-bar" }, lists.el, chains.el, note),
    // Each label stays with its buttons when a narrow island wraps the bar.
    h(
      "div",
      { class: "seg-bar" },
      h("span", { class: "seg-group" }, h("span", { class: "seg-label", text: t("Sort") }), sorts.el),
      h("span", { class: "seg-group" }, h("span", { class: "seg-label", text: t("Window") }), frames.el),
    ),
    head,
    rows,
    status,
  );

  return {
    el,
    sync() {
      void Companion.refreshTrending();
      for (const s of [lists, chains, sorts, frames]) s.paint();
      const frame = FRAMES.find(([f]) => f === State.companion.trendingFrame)?.[1] ?? "1h";
      volHead.textContent = `Vol ${frame}`;
      pctHead.textContent = frame;

      const list = sortTrending(State.trending[State.trendingList], State.companion.trendingSort, State.companion.trendingFrame);
      head.style.display = list.length ? "flex" : "none";
      status.style.display = list.length ? "none" : "block";
      status.textContent = State.trending.error
        ? t("DexScreener didn't answer ({error}). Retrying…", { error: State.trending.error })
        : State.trending.updatedAt
          ? t("Nothing trending on these chains right now.")
          : t("Loading trending tokens…");
      const safety = list.map((x) => {
        const r = State.safety[x.token.key];
        return typeof r === "object" ? r.level : String(r);
      });
      const next = [
        State.trendingList,
        State.trending.updatedAt,
        State.companion.trendingSort,
        State.companion.trendingFrame,
        State.companion.chains.join(),
        safety.join(","),
        State.companion.watchlist.length,
      ].join("|");
      // Redraw when the mouse is off the rows, or at once after a click here
      // (a sort, a chain, an add) cleared the key.
      if (next !== key && (key === "" || !rows.matches(":hover"))) {
        key = next;
        clear(rows);
        for (const item of list) rows.append(row(item));
      }
    },
    tick() {
      this.sync();
    },
  };
}
