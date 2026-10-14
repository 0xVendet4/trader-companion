// The watchlist tab: folders on top (All, Runners, Holds…), then one row per
// token with its chain, safety badge, 24 h mini
// chart, market cap, volume and buys / sells over a window the trader picks
// (as GMGN shows them), and 5m / 1h / 24h change. Hovering a row shows its
// quick actions: copy the CA, a one-click 2x alert, a custom alert, remove.
//
// The field below takes an address or a link (added at once) or a name, which
// opens search results in place of the list — the user picks; nothing is added
// on a name alone, because every popular token has copycats.

import { wireChartHover } from "./chart-popover";
import { h, clear } from "./dom";
import { ICONS } from "./icons";
import {
  btn,
  setMajorTag,
  tokenTag,
  safetyFor,
  field,
  iconBtn,
  liquidityCell,
  pct,
  sparkline,
  tokenImg,
  type ViewActions,
  type ViewHost,
} from "./shared";
import { Companion } from "../companion";
import { Bridge } from "../core/bridge";
import { compact, formatAge, formatPct, formatUsd, valueCell, valueHead } from "../core/format";
import { t } from "../core/i18n";
import { MAX_ROWS, density } from "../core/layout";
import { shareEntry, shareText } from "../core/share";
import { MAX_NOTE, State, uid, type Quote, type Timeframe, type TrendingItem, type ValueColumn, type WatchSortKey, type WatchToken } from "../core/state";
import { CHAINS } from "../market/chains";
import { nextSort, sortWatchlist } from "../market/watchsort";
import { parseInput } from "../market/dexscreener";
import { folderMood, folderTokens } from "../market/folders";
import { terminalLabel } from "../market/links";
import { rugcheckUrl } from "../market/safety";

/** A tiny Candy (a candle with eyes), coloured by how a folder moved: green, red or grey. */
function miniCandy(tone: "up" | "down" | "flat"): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag: string, attrs: Record<string, string>) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const s = el("svg", { viewBox: "0 0 12 16", width: "9", height: "12", class: `folder-candy ${tone}`, "aria-hidden": "true" }) as SVGElement;
  s.append(
    el("path", { d: "M6 0.5v3M6 12.5v3", stroke: "currentColor", "stroke-width": "1.4", "stroke-linecap": "round" }),
    el("rect", { x: "1.5", y: "3", width: "9", height: "9.5", rx: "3", fill: "currentColor" }),
    el("circle", { cx: "4.4", cy: "7.3", r: "0.95", fill: "#0b1f12" }),
    el("circle", { cx: "7.6", cy: "7.3", r: "0.95", fill: "#0b1f12" }),
  );
  return s;
}

/** A major coin's volume: its own 24 h volume (CoinGecko); nothing for shorter frames. */
function majorVolume(q: Quote, frame: Timeframe): string {
  return frame === "h24" && q.volume.h24 > 0 ? formatUsd(q.volume.h24) : "—";
}

const FRAMES: Timeframe[] = ["m5", "h1", "h6", "h24"];
const FRAME_LABEL: Record<Timeframe, string> = { m5: "5m", h1: "1h", h6: "6h", h24: "24h" };

const VALUE_MODES: ValueColumn[] = ["auto", "price", "mcap"];

/** Trades over the volume window: the window's own count, or the 5-minute one; none for a major coin. */
function tradesIn(q: Quote | undefined, frame: Timeframe): { buys: number; sells: number } | undefined {
  return q?.major ? undefined : (q?.txns?.[frame] ?? (frame === "m5" ? q?.txnsM5 : undefined));
}

/** What a column sorts by for a token (see src/market/watchsort.ts). */
function sortReading(tok: WatchToken, by: WatchSortKey): number | string | null {
  const q = State.quotes[tok.key];
  const frame = State.companion.volumeFrame;
  switch (by) {
    case "token":
      return tok.symbol.toLowerCase();
    case "value":
      return (State.companion.valueColumn === "price" ? q?.priceUsd : q?.marketCap) ?? null;
    case "volume":
      return q?.major ? (frame === "h24" ? q.volume.h24 : null) : (q?.volume[frame] ?? null);
    case "txns": {
      const tx = tradesIn(q, frame);
      return tx ? tx.buys + tx.sells : null;
    }
    default:
      return q?.change[by] ?? null;
  }
}

export function buildWatchlist(actions: ViewActions): ViewHost {
  // Sorting: a click on a column head (or its arrow, for the two heads whose
  // own click changes what they show) steps it through both ways and off.
  const sortMarks: [WatchSortKey, HTMLElement][] = [];
  const sortBy = (by: WatchSortKey) => {
    Companion.setWatchlistSort(nextSort(State.companion.watchlistSort, by));
    actions.blip();
  };
  const sortMark = (by: WatchSortKey, button: boolean) => {
    const el = button
      ? h("button", {
          class: "sort-btn",
          type: "button",
          title: t("Sort by this column"),
          onclick: (e: Event) => {
            e.stopPropagation();
            sortBy(by);
          },
        })
      : h("span", { class: "sort-mark" });
    sortMarks.push([by, el]);
    return el;
  };
  const sortHead = (cls: string, label: string, by: WatchSortKey, title?: string) =>
    h("span", { class: `${cls} sortable`, title: title ?? t("Sort by this column"), onclick: () => sortBy(by) }, label, sortMark(by, false));
  // The value column: price for major coins and market cap for the rest, or
  // one of them for all. A click on its head steps through the three.
  const valueHeadEl = () =>
    h("span", {
      class: "c-mc pick",
      title: t("Market cap, or price. Click to change: price for major coins and market cap for the rest, price for all, market cap for all."),
      onclick: () => {
        const c = State.companion;
        c.valueColumn = VALUE_MODES[(VALUE_MODES.indexOf(c.valueColumn) + 1) % VALUE_MODES.length];
        Companion.save();
        actions.blip();
        filledAt.clear();
        if (State.search) renderResults();
      },
    });
  const listValueHead = valueHeadEl();
  listValueHead.className = "pick";
  const resultsValueHead = valueHeadEl();
  // The volume window: a click on the column head steps through them.
  const volHead = h("span", {
    class: "pick",
    title: t("Volume over this window. Click to change it."),
    onclick: () => {
      const c = State.companion;
      c.volumeFrame = FRAMES[(FRAMES.indexOf(c.volumeFrame) + 1) % FRAMES.length];
      Companion.save();
      actions.blip();
      filledAt.clear();
    },
  });
  // Folders: All, then the trader's own; "+" names a new one.
  const folders = h("div", { class: "folders" });
  const folderField = field(actions, { class: "field folder-field", placeholder: t("Folder name"), maxlength: "16" });
  folderField.style.display = "none";
  folderField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const err = Companion.addFolder(folderField.value);
      if (err) return flash(err, false);
      folderField.value = "";
      folderField.blur();
      folderField.style.display = "none";
      actions.blip();
      actions.relayout();
    }
    if (e.key === "Escape") folderField.style.display = "none";
  });
  folderField.addEventListener("blur", () => window.setTimeout(() => (folderField.style.display = "none"), 150));

  function renderFolders() {
    clear(folders);
    const c = State.companion;
    const chip = (name: string, labelText: string, count: number) => {
      // A mini Candy in the folder's mood: its tokens' average move in the hour.
      const mood = folderMood(name ? c.watchlist.filter((tok) => tok.folder === name) : c.watchlist, State.quotes);
      const b = h(
        "button",
        {
          class: `folder ${c.activeFolder === name ? "on" : ""}`,
          type: "button",
          title: mood.pct == null ? labelText : t("{folder}: {pct} in the hour, on average", { folder: labelText, pct: formatPct(mood.pct) }),
        },
        count ? miniCandy(mood.tone) : null,
        labelText,
        h("span", { class: "count", text: String(count) }),
      );
      b.addEventListener("click", () => {
        if (c.activeFolder === name) return;
        Companion.showFolder(name);
        actions.blip();
        actions.relayout();
      });
      return b;
    };
    folders.append(chip("", t("All"), c.watchlist.length));
    for (const f of c.folders) folders.append(chip(f, f, c.watchlist.filter((tok) => tok.folder === f).length));
    const plus = h("button", { class: "folder add", type: "button", title: t("New folder"), text: "+" });
    plus.addEventListener("click", () => {
      folderField.style.display = "";
      folderField.dispatchEvent(new MouseEvent("mousedown"));
    });
    folders.append(plus, folderField);
  }

  /** The row's "move to folder" picker, in place of its quick actions. */
  function folderPicker(tok: WatchToken, bar: HTMLElement, restore: () => void) {
    clear(bar);
    const choices: [string | undefined, string][] = [[undefined, t("None")], ...State.companion.folders.map((f): [string, string] => [f, f])];
    for (const [f, text] of choices) {
      const b = h("button", { class: `folder mini ${tok.folder === f ? "on" : ""}`, type: "button", text });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        Companion.moveToFolder(tok.key, f);
        actions.blip();
        actions.relayout();
      });
      bar.append(b);
    }
    bar.closest(".row")?.addEventListener("mouseleave", restore, { once: true });
  }

  /** The row's note (why you're in, the exit plan), typed in place of its quick actions. */
  function noteEditor(tok: WatchToken, bar: HTMLElement, restore: () => void) {
    clear(bar);
    const input = field(actions, { class: "field note-field", placeholder: t("Why you're in, the exit plan…"), maxlength: String(MAX_NOTE), value: tok.note ?? "" });
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      if (keep && input.value.trim() !== (tok.note ?? "")) {
        Companion.setNote(tok.key, input.value);
        actions.blip();
      }
      restore();
    };
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    bar.append(input);
    bar.classList.add("editing");
    actions.focusInput(true);
    window.setTimeout(() => input.focus(), 30);
  }

  const rows = h("div", { class: "rows" });
  const head = h(
    "div",
    { class: "row head" },
    sortHead("c-tok", t("Token"), "token"),
    h("span", { class: "c-spark", text: t("Chart") }),
    h("span", { class: "c-mc" }, listValueHead, sortMark("value", true)),
    h("span", { class: "c-vol" }, volHead, sortMark("volume", true)),
    sortHead("c-txns", "Txns", "txns", t("Buys / sells over the same window. Click to sort.")),
    sortHead("c-pct", "5m", "m5"),
    sortHead("c-pct", "1h", "h1"),
    sortHead("c-pct", "24h", "h24"),
  );
  const empty = h("div", { class: "empty" }, t("Search a token by name, or paste its address (CA) or a link, then hit Enter."));

  // Search results, shown in place of the list.
  const resultsTitle = h("span", { class: "results-title" });
  const closeResults = iconBtn(ICONS.xmark, t("Close the results"), () => {
    Companion.closeSearch();
    actions.relayout();
  });
  const resultsHead = h("div", { class: "results-head" }, resultsTitle, closeResults);
  const resultsCols = h(
    "div",
    { class: "row head" },
    h("span", { class: "c-tok", text: t("Token") }),
    resultsValueHead,
    h("span", { class: "c-liq", text: "Liq", title: t("Liquidity backed by SOL / USDC / ETH / BNB") }),
    h("span", { class: "c-vol", text: "Vol 24h" }),
    h("span", { class: "c-age", text: t("Age") }),
    h("span", { class: "c-add" }),
  );
  const results = h("div", { class: "rows results" });
  const resultsEl = h("div", { class: "results-pane" }, resultsHead, resultsCols, results);

  const input = field(actions, { placeholder: t("Search a token, or paste its address (CA) or link…") });
  const add = btn(t("Add"), "secondary", () => void submit());
  const share = iconBtn(ICONS.link, t("Copy a link to this watchlist"), () => void shareList(), 2.2);
  const note = h("span", { class: "note" });
  let busy = false;
  let noteTimer: number | null = null;

  function flash(text: string, ok = true) {
    note.className = ok ? "note ok" : "note err";
    note.textContent = text;
    if (noteTimer != null) window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => (note.textContent = ""), 3500);
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    add.disabled = true;
    note.className = "note";
    note.textContent = t("Looking it up…");
    // An address (or a token link) pasted here is swallowed like a dropped one; a search is not.
    const byAddress = parseInput(text).kind === "address";
    if (byAddress) actions.mouth("open");
    const res = await Companion.addToken(text);
    busy = false;
    add.disabled = false;
    if (byAddress) actions.mouth(res.ok ? "gulp" : "shut");
    if (res.searched) {
      note.textContent = "";
      actions.relayout();
      return;
    }
    flash(res.message, res.ok);
    if (res.ok) {
      input.value = "";
      actions.blip();
      actions.relayout();
    }
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape" && State.search) Companion.closeSearch();
  });

  async function shareList() {
    // Shares what is on screen: the folder shown, or everything under All.
    const entries = folderTokens(State.companion.watchlist, State.companion.activeFolder).map(shareEntry);
    if (entries.length === 0) return flash(t("Add a token first."), false);
    const ok = await Bridge.copy(shareText(entries));
    flash(ok ? t("Token list copied: paste it into Import.") : t("Couldn't copy the list."), ok);
    if (ok) actions.blip();
  }

  /** The chain tag is worth its room only once more than one chain is in play. */
  const showChain = (tok: WatchToken) => State.companion.chains.length > 1 || tok.chainId !== "solana";

  function tokenCell(tok: WatchToken, tag: HTMLElement | null): HTMLElement {
    return h(
      "span",
      { class: "c-tok" },
      tokenImg(tok.imageUrl, tok.symbol),
      h("span", { class: "sym", text: tok.symbol }),
      tok.pinned ? h("span", { class: "pin-mark", text: "★", title: t("Pinned to the top") }) : null,
      tok.note ? h("span", { class: "note-mark", text: "✎", title: t("Note: {note}", { note: tok.note }) }) : null,
      tag,
      safetyFor(tok, () => actions.openUrl(rugcheckUrl(tok.address))),
    );
  }

  let key = "";
  let lastFolders = "";
  /** The row order last drawn (see sync). */
  let shownOrder = "";

  /** The folder's tokens in the order to show them: pinned first, then the sort or the trader's order. */
  const shownTokens = () => sortWatchlist(folderTokens(State.companion.watchlist, State.companion.activeFolder), State.companion.watchlistSort, sortReading);

  function renderList() {
    clear(rows);
    liveCells.clear();
    filledAt.clear();
    for (const tok of shownTokens()) {
      const q = State.quotes[tok.key];
      const restoreBar = () => {
        actionsEl.classList.remove("editing");
        actionsEl.replaceChildren(...quick());
      };
      const quick = (): Node[] => [
        iconBtn(tok.pinned ? ICONS.star : ICONS.starOutline, tok.pinned ? t("Unpin") : t("Pin to the top"), (e) => {
          e.stopPropagation();
          Companion.togglePin(tok.key);
          actions.blip();
        }, 2),
        iconBtn(ICONS.pencil, tok.note ? t("Note: {note}", { note: tok.note }) : t("Add a note: why you're in, the exit plan"), (e) => {
          e.stopPropagation();
          noteEditor(tok, actionsEl, restoreBar);
        }, 2),
        ...(tok.coingecko
          ? []
          : [
              iconBtn(ICONS.shield, t("Checklist before an entry"), (e) => {
                e.stopPropagation();
                actions.blip();
                Companion.raise({ kind: "checklist", id: uid(), key: tok.key });
              }),
            ]),
        iconBtn(ICONS.folder, t("Move to a folder"), (e) => {
          e.stopPropagation();
          folderPicker(tok, actionsEl, restoreBar);
        }, 2),
        iconBtn(ICONS.copy, t("Copy the CA"), (e) => {
          e.stopPropagation();
          void Bridge.copy(tok.address).then((ok) => flash(ok ? t("{symbol} CA copied.", { symbol: tok.symbol }) : t("Couldn't copy."), ok));
        }, 2),
        h(
          "button",
          {
            class: "icon-btn x2",
            title: t("Alert me at 2x market cap"),
            onclick: (e: Event) => {
              e.stopPropagation();
              const msg = Companion.addMultipleAlert(tok.key, 2);
              if (msg) {
                actions.blip();
                flash(`${tok.symbol}: ${msg}.`);
              } else flash(t("No price yet. Try again in a moment."), false);
            },
          },
          "2x",
        ),
        iconBtn(ICONS.bell, t("Custom alert"), (e) => {
          e.stopPropagation();
          State.alertDraftAddress = tok.key;
          actions.blip();
          actions.setView("alerts");
        }),
        iconBtn(ICONS.xmark, t("Remove"), (e) => {
          e.stopPropagation();
          Companion.removeToken(tok.key);
          actions.relayout();
        }),
      ];
      const actionsEl = h("span", { class: "row-actions" }, ...quick());
      const cells = {
        // A major's tag shows its rank, which comes with the quotes.
        tag: tokenTag(tok, showChain(tok), q),
        spark: h("span", { class: "c-spark" }),
        mc: h("span", { class: "c-mc" }),
        vol: h("span", { class: "c-vol" }),
        txns: h("span", { class: "c-txns" }),
        m5: h("span", { class: "c-pct" }),
        h1: h("span", { class: "c-pct" }),
        h24: h("span", { class: "c-pct" }),
      };
      const row = h(
        "div",
        {
          class: "row",
          title:
            t("Open {symbol} on {terminal}", { symbol: tok.symbol, terminal: terminalLabel(State.companion.terminal, tok) }) +
            (tok.note ? `\n${t("Note: {note}", { note: tok.note })}` : ""),
        },
        tokenCell(tok, cells.tag),
        cells.spark,
        cells.mc,
        cells.vol,
        cells.txns,
        cells.m5,
        cells.h1,
        cells.h24,
        actionsEl,
      );
      row.addEventListener("click", () => actions.openToken(tok.key));
      // The pointer resting on the row opens its candles (src/views/chart-popover.ts).
      wireChartHover(row, tok.key, () => ({ symbol: tok.symbol, chainId: tok.chainId, pairAddress: State.token(tok.key)?.pairAddress ?? tok.pairAddress }), actions);
      rows.append(row);
      liveCells.set(tok.key, cells);
      fillCells(tok.key, q?.updatedAt ?? -1);
    }
  }

  /** Each row's number cells, so prices update in place (see sync). */
  const liveCells = new Map<string, Record<"spark" | "mc" | "vol" | "txns" | "m5" | "h1" | "h24", HTMLElement> & { tag: HTMLElement | null }>();
  const filledAt = new Map<string, string>();

  function fillCells(key: string, stamp: number) {
    const c = liveCells.get(key);
    const frame = State.companion.volumeFrame;
    const stampKey = `${stamp}:${frame}`;
    if (!c || filledAt.get(key) === stampKey) return;
    filledAt.set(key, stampKey);
    const q = State.quotes[key];
    const tok = State.token(key);
    if (c.tag && q?.major && tok) setMajorTag(c.tag, tok, q);
    c.spark.replaceChildren(sparkline(key));
    const value = valueCell(State.companion.valueColumn, q);
    c.mc.textContent = value.text;
    c.mc.title = value.title;
    // A major coin: only its 24 h volume (CoinGecko), and no trade count.
    c.vol.textContent = q?.major ? majorVolume(q, frame) : formatUsd(q?.volume[frame]);
    const tx = tradesIn(q, frame);
    c.txns.replaceChildren();
    if (tx) {
      c.txns.append(h("span", { class: "buys", text: compact(tx.buys) }), "/", h("span", { class: "sells", text: compact(tx.sells) }));
      c.txns.title = t("{buys} buys · {sells} sells, {window}", { buys: tx.buys, sells: tx.sells, window: FRAME_LABEL[frame] });
    } else c.txns.textContent = "—";
    c.m5.replaceChildren(pct(q?.change.m5));
    c.h1.replaceChildren(pct(q?.change.h1));
    c.h24.replaceChildren(pct(q?.change.h24));
  }

  function resultRow(item: TrendingItem, first: boolean): HTMLElement {
    const tok = item.token;
    const q = item.quote;
    const watched = !!State.token(tok.key);
    const plus = h(
      "button",
      {
        class: `icon-btn add ${watched ? "done" : ""}`,
        title: watched ? t("On your watchlist") : t("Add {symbol} ({chain})", { symbol: tok.symbol, chain: CHAINS[tok.chainId].label }),
        onclick: (e: Event) => {
          e.stopPropagation();
          if (watched) return;
          const res = Companion.addWatchToken(tok);
          flash(res.message, res.ok);
          if (res.ok) {
            actions.blip();
            input.value = "";
            Companion.closeSearch();
            actions.relayout();
          }
        },
      },
      watched ? "✓" : "+",
    );
    const el = h(
      "div",
      { class: `row ${first ? "top" : ""}`, title: `${tok.name} · ${tok.address}\n${t("Click to open its page; + to add it.")}` },
      h(
        "span",
        { class: "c-tok" },
        tokenImg(tok.imageUrl, tok.symbol),
        h("span", { class: "sym", text: tok.symbol }),
        tokenTag(tok, true, q),
        safetyFor(tok, () => actions.openUrl(rugcheckUrl(tok.address))),
        h("span", { class: "tok-name", text: tok.name }),
      ),
      h("span", { class: "c-mc", ...valueCell(State.companion.valueColumn, q) }),
      liquidityCell(q),
      h("span", { class: "c-vol", text: q?.major ? majorVolume(q, "h24") : formatUsd(q?.volume.h24), title: t("Volume, 24 h") }),
      h("span", { class: "c-age", text: formatAge(item.pairCreatedAt), title: t("Pair age") }),
      h("span", { class: "c-add" }, plus),
    );
    el.addEventListener("click", () => actions.openToken(tok.key, tok));
    return el;
  }

  function renderResults() {
    const s = State.search!;
    clear(results);
    const chains = State.companion.chains.map((c) => CHAINS[c].tag).join(" · ");
    resultsTitle.textContent = s.loading
      ? t("Searching “{query}” on {chains}…", { query: s.query, chains })
      : s.error
        ? t("Search failed: {error}", { error: s.error })
        : s.results.length
          ? t("“{query}” on {chains} · real liquidity first · check the address before adding", { query: s.query, chains })
          : t("Nothing called “{query}” on {chains}.", { query: s.query, chains });
    resultsCols.style.display = s.results.length ? "flex" : "none";
    s.results.forEach((item, i) => results.append(resultRow(item, i === 0)));
  }

  const el = h(
    "div",
    { class: "view watchlist" },
    folders,
    head,
    rows,
    empty,
    resultsEl,
    h("div", { class: "add-bar" }, input, add, share, note),
  );

  return {
    el,
    sync() {
      volHead.textContent = `Vol ${FRAME_LABEL[State.companion.volumeFrame]}`;
      // The lists scroll past MAX_ROWS rows, of the island's density (compact
      // or not); the results show one fewer: their title and heads take its place.
      const rowH = density(State.compact).rowH;
      rows.style.maxHeight = `${MAX_ROWS * rowH}px`;
      results.style.maxHeight = `${(MAX_ROWS - 1) * rowH}px`;
      const c = State.companion;
      const list = folderTokens(c.watchlist, c.activeFolder);
      listValueHead.textContent = valueHead(c.valueColumn, list.map((tok) => State.quotes[tok.key]));
      resultsValueHead.textContent = valueHead(c.valueColumn, State.search?.results.map((r) => r.quote) ?? []);
      const searching = State.search != null;
      folders.style.display = searching ? "none" : "";
      const moods = ["", ...c.folders].map((f) => folderMood(f ? c.watchlist.filter((tok) => tok.folder === f) : c.watchlist, State.quotes).tone).join("");
      const foldersKey = `${c.activeFolder}|${c.folders.join(",")}|${c.watchlist.map((tok) => tok.folder ?? "").join(",")}|${moods}`;
      if (foldersKey !== lastFolders && document.activeElement !== folderField) {
        lastFolders = foldersKey;
        renderFolders();
      }
      empty.textContent = c.activeFolder && c.watchlist.length
        ? t("Nothing in {folder} yet. Add a token below, or move one here from All with the folder button on its row.", { folder: c.activeFolder })
        : t("Search a token by name, or paste its address (CA) or a link, then hit Enter.");
      head.style.display = !searching && list.length ? "flex" : "none";
      rows.style.display = searching ? "none" : "";
      empty.style.display = !searching && !list.length ? "block" : "none";
      resultsEl.style.display = searching ? "" : "none";
      share.style.display = list.length ? "" : "none";

      const safety = (keys: string[]) =>
        keys.map((k) => {
          const r = State.safety[k];
          return typeof r === "object" ? r.level : String(r);
        });
      if (searching) {
        const next = `s:${State.search!.query}:${State.search!.loading}:${State.search!.results.length}:${safety(State.search!.results.map((r) => r.token.key)).join(",")}:${list.length}`;
        // Results don't change once loaded; only redraw when the mouse is off them.
        if (next !== key && !results.matches(":hover")) {
          key = next;
          renderResults();
        }
        return;
      }

      for (const [by, mark] of sortMarks) {
        const on = c.watchlistSort?.by === by;
        mark.textContent = on ? (c.watchlistSort!.desc ? "▾" : "▴") : mark.tagName === "BUTTON" ? "↕" : "";
        mark.classList.toggle("on", on);
      }

      // The list itself (which tokens, in what order, how they're labelled) is
      // rebuilt when it changes: a click, a setting, or a sorted column whose
      // numbers moved. The numbers update in place on every poll, so prices
      // never freeze under the mouse and the hover actions never flicker; a
      // sorted list waits to reorder until the mouse is off it.
      const shown = shownTokens();
      const order = shown.map((tok) => tok.key).join("|");
      const structure =
        c.activeFolder +
        shown.map((tok) => `${tok.key}${tok.note ?? ""}${tok.pinned ? "*" : ""}`).sort().join("|") +
        safety(list.map((tok) => tok.key)).join(",") +
        State.companion.terminal +
        State.companion.chains.join() +
        JSON.stringify(c.watchlistSort);
      if (structure !== key || (order !== shownOrder && !rows.matches(":hover"))) {
        key = structure;
        shownOrder = order;
        renderList();
        return;
      }
      for (const tok of list) fillCells(tok.key, State.quotes[tok.key]?.updatedAt ?? -1);
    },
    tick() {
      this.sync();
    },
  };
}
