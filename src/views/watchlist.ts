// The watchlist tab: folders on top (All, Runners, Holds…), then one row per
// token with its chain, safety badge, 24 h mini
// chart, market cap, volume and buys / sells over a window the trader picks
// (as GMGN shows them), and 5m / 1h / 24h change. Hovering a row shows its
// quick actions: copy the CA, a one-click 2x alert, a custom alert, remove.
//
// The field below takes an address or a link (added at once) or a name, which
// opens search results in place of the list — the user picks; nothing is added
// on a name alone, because every popular token has copycats.

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
import { compact, formatAge, formatUsd, valueCell, valueHead } from "../core/format";
import { MAX_ROWS, ROW_H } from "../core/layout";
import { shareEntry, shareText } from "../core/share";
import { State, type Quote, type Timeframe, type TrendingItem, type ValueColumn, type WatchToken } from "../core/state";
import { CHAINS } from "../market/chains";
import { folderTokens } from "../market/folders";
import { terminalLabel } from "../market/links";
import { rugcheckUrl } from "../market/safety";

/** A major coin's volume: its own 24 h volume (CoinGecko); nothing for shorter frames. */
function majorVolume(q: Quote, frame: Timeframe): string {
  return frame === "h24" && q.volume.h24 > 0 ? formatUsd(q.volume.h24) : "—";
}

const FRAMES: Timeframe[] = ["m5", "h1", "h6", "h24"];
const FRAME_LABEL: Record<Timeframe, string> = { m5: "5m", h1: "1h", h6: "6h", h24: "24h" };

const VALUE_MODES: ValueColumn[] = ["auto", "price", "mcap"];

export function buildWatchlist(actions: ViewActions): ViewHost {
  // The value column: price for major coins and market cap for the rest, or
  // one of them for all. A click on its head steps through the three.
  const valueHeadEl = () =>
    h("span", {
      class: "c-mc pick",
      title: "Market cap, or price. Click to change: price for major coins and market cap for the rest, price for all, market cap for all.",
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
  const resultsValueHead = valueHeadEl();
  // The volume window: a click on the column head steps through them.
  const volHead = h("span", {
    class: "c-vol pick",
    title: "Volume over this window. Click to change it.",
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
  const folderField = field(actions, { class: "field folder-field", placeholder: "Folder name", maxlength: "16" });
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
      const b = h("button", { class: `folder ${c.activeFolder === name ? "on" : ""}`, type: "button" }, labelText, h("span", { class: "count", text: String(count) }));
      b.addEventListener("click", () => {
        if (c.activeFolder === name) return;
        Companion.showFolder(name);
        actions.blip();
        actions.relayout();
      });
      return b;
    };
    folders.append(chip("", "All", c.watchlist.length));
    for (const f of c.folders) folders.append(chip(f, f, c.watchlist.filter((t) => t.folder === f).length));
    const plus = h("button", { class: "folder add", type: "button", title: "New folder", text: "+" });
    plus.addEventListener("click", () => {
      folderField.style.display = "";
      folderField.dispatchEvent(new MouseEvent("mousedown"));
    });
    folders.append(plus, folderField);
  }

  /** The row's "move to folder" picker, in place of its quick actions. */
  function folderPicker(t: WatchToken, bar: HTMLElement, restore: () => void) {
    clear(bar);
    const choices: [string | undefined, string][] = [[undefined, "None"], ...State.companion.folders.map((f): [string, string] => [f, f])];
    for (const [f, text] of choices) {
      const b = h("button", { class: `folder mini ${t.folder === f ? "on" : ""}`, type: "button", text });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        Companion.moveToFolder(t.key, f);
        actions.blip();
        actions.relayout();
      });
      bar.append(b);
    }
    bar.closest(".row")?.addEventListener("mouseleave", restore, { once: true });
  }

  const rows = h("div", { class: "rows" });
  rows.style.maxHeight = `${MAX_ROWS * ROW_H}px`;
  const head = h(
    "div",
    { class: "row head" },
    h("span", { class: "c-tok", text: "Token" }),
    h("span", { class: "c-spark", text: "Chart" }),
    listValueHead,
    volHead,
    h("span", { class: "c-txns", text: "Txns", title: "Buys / sells over the same window" }),
    h("span", { class: "c-pct", text: "5m" }),
    h("span", { class: "c-pct", text: "1h" }),
    h("span", { class: "c-pct", text: "24h" }),
  );
  const empty = h("div", { class: "empty" }, "Search a token by name, or paste its address (CA) or a link, then hit Enter.");

  // Search results, shown in place of the list.
  const resultsTitle = h("span", { class: "results-title" });
  const closeResults = iconBtn(ICONS.xmark, "Close the results", () => {
    Companion.closeSearch();
    actions.relayout();
  });
  const resultsHead = h("div", { class: "results-head" }, resultsTitle, closeResults);
  const resultsCols = h(
    "div",
    { class: "row head" },
    h("span", { class: "c-tok", text: "Token" }),
    resultsValueHead,
    h("span", { class: "c-liq", text: "Liq", title: "Liquidity backed by SOL / USDC / ETH / BNB" }),
    h("span", { class: "c-vol", text: "Vol 24h" }),
    h("span", { class: "c-age", text: "Age" }),
    h("span", { class: "c-add" }),
  );
  const results = h("div", { class: "rows results" });
  // One row fewer than the list: the title and column names take its place.
  results.style.maxHeight = `${(MAX_ROWS - 1) * ROW_H}px`;
  const resultsEl = h("div", { class: "results-pane" }, resultsHead, resultsCols, results);

  const input = field(actions, { placeholder: "Search a token, or paste its address (CA) or link…" });
  const add = btn("Add", "secondary", () => void submit());
  const share = iconBtn(ICONS.link, "Copy a link to this watchlist", () => void shareList(), 2.2);
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
    note.textContent = "Looking it up…";
    const res = await Companion.addToken(text);
    busy = false;
    add.disabled = false;
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
    if (entries.length === 0) return flash("Add a token first.", false);
    const ok = await Bridge.copy(shareText(entries));
    flash(ok ? "Token list copied: paste it into Import." : "Couldn't copy the list.", ok);
    if (ok) actions.blip();
  }

  /** The chain tag is worth its room only once more than one chain is in play. */
  const showChain = (t: WatchToken) => State.companion.chains.length > 1 || t.chainId !== "solana";

  function tokenCell(t: WatchToken, tag: HTMLElement | null): HTMLElement {
    return h(
      "span",
      { class: "c-tok" },
      tokenImg(t.imageUrl, t.symbol),
      h("span", { class: "sym", text: t.symbol }),
      tag,
      safetyFor(t, () => actions.openUrl(rugcheckUrl(t.address))),
    );
  }

  let key = "";
  let lastFolders = "";

  function renderList() {
    clear(rows);
    liveCells.clear();
    filledAt.clear();
    for (const t of folderTokens(State.companion.watchlist, State.companion.activeFolder)) {
      const q = State.quotes[t.key];
      const quick = (): Node[] => [
        iconBtn(ICONS.folder, "Move to a folder", (e) => {
          e.stopPropagation();
          folderPicker(t, actionsEl, () => actionsEl.replaceChildren(...quick()));
        }, 2),
        iconBtn(ICONS.copy, "Copy the CA", (e) => {
          e.stopPropagation();
          void Bridge.copy(t.address).then((ok) => flash(ok ? `${t.symbol} CA copied.` : "Couldn't copy.", ok));
        }, 2),
        h(
          "button",
          {
            class: "icon-btn x2",
            title: "Alert me at 2x market cap",
            onclick: (e: Event) => {
              e.stopPropagation();
              const msg = Companion.addMultipleAlert(t.key, 2);
              if (msg) {
                actions.blip();
                flash(`${t.symbol}: ${msg}.`);
              } else flash("No price yet. Try again in a moment.", false);
            },
          },
          "2x",
        ),
        iconBtn(ICONS.bell, "Custom alert", (e) => {
          e.stopPropagation();
          State.alertDraftAddress = t.key;
          actions.blip();
          actions.setView("alerts");
        }),
        iconBtn(ICONS.xmark, "Remove", (e) => {
          e.stopPropagation();
          Companion.removeToken(t.key);
          actions.relayout();
        }),
      ];
      const actionsEl = h("span", { class: "row-actions" }, ...quick());
      const cells = {
        // A major's tag shows its rank, which comes with the quotes.
        tag: tokenTag(t, showChain(t), q),
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
        { class: "row", title: `Open ${t.symbol} on ${terminalLabel(State.companion.terminal, t)}` },
        tokenCell(t, cells.tag),
        cells.spark,
        cells.mc,
        cells.vol,
        cells.txns,
        cells.m5,
        cells.h1,
        cells.h24,
        actionsEl,
      );
      row.addEventListener("click", () => actions.openToken(t.key));
      rows.append(row);
      liveCells.set(t.key, cells);
      fillCells(t.key, q?.updatedAt ?? -1);
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
    const t = State.token(key);
    if (c.tag && q?.major && t) setMajorTag(c.tag, t, q);
    c.spark.replaceChildren(sparkline(key));
    const value = valueCell(State.companion.valueColumn, q);
    c.mc.textContent = value.text;
    c.mc.title = value.title;
    // A major coin: only its 24 h volume (CoinGecko), and no trade count.
    c.vol.textContent = q?.major ? majorVolume(q, frame) : formatUsd(q?.volume[frame]);
    const tx = q?.major ? undefined : (q?.txns?.[frame] ?? (frame === "m5" ? q?.txnsM5 : undefined));
    c.txns.replaceChildren();
    if (tx) {
      c.txns.append(h("span", { class: "buys", text: compact(tx.buys) }), "/", h("span", { class: "sells", text: compact(tx.sells) }));
      c.txns.title = `${tx.buys} buys · ${tx.sells} sells, ${FRAME_LABEL[frame]}`;
    } else c.txns.textContent = "—";
    c.m5.replaceChildren(pct(q?.change.m5));
    c.h1.replaceChildren(pct(q?.change.h1));
    c.h24.replaceChildren(pct(q?.change.h24));
  }

  function resultRow(item: TrendingItem, first: boolean): HTMLElement {
    const t = item.token;
    const q = item.quote;
    const watched = !!State.token(t.key);
    const plus = h(
      "button",
      {
        class: `icon-btn add ${watched ? "done" : ""}`,
        title: watched ? "On your watchlist" : `Add ${t.symbol} (${CHAINS[t.chainId].label})`,
        onclick: (e: Event) => {
          e.stopPropagation();
          if (watched) return;
          const res = Companion.addWatchToken(t);
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
      { class: `row ${first ? "top" : ""}`, title: `${t.name} · ${t.address}\nClick to open its page; + to add it.` },
      h(
        "span",
        { class: "c-tok" },
        tokenImg(t.imageUrl, t.symbol),
        h("span", { class: "sym", text: t.symbol }),
        tokenTag(t, true, q),
        safetyFor(t, () => actions.openUrl(rugcheckUrl(t.address))),
        h("span", { class: "tok-name", text: t.name }),
      ),
      h("span", { class: "c-mc", ...valueCell(State.companion.valueColumn, q) }),
      liquidityCell(q),
      h("span", { class: "c-vol", text: q?.major ? majorVolume(q, "h24") : formatUsd(q?.volume.h24), title: "Volume, 24 h" }),
      h("span", { class: "c-age", text: formatAge(item.pairCreatedAt), title: "Pair age" }),
      h("span", { class: "c-add" }, plus),
    );
    el.addEventListener("click", () => actions.openToken(t.key, t));
    return el;
  }

  function renderResults() {
    const s = State.search!;
    clear(results);
    const chains = State.companion.chains.map((c) => CHAINS[c].tag).join(" · ");
    resultsTitle.textContent = s.loading
      ? `Searching “${s.query}” on ${chains}…`
      : s.error
        ? `Search failed: ${s.error}`
        : s.results.length
          ? `“${s.query}” on ${chains} · real liquidity first · check the address before adding`
          : `Nothing called “${s.query}” on ${chains}.`;
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
      const c = State.companion;
      const list = folderTokens(c.watchlist, c.activeFolder);
      listValueHead.textContent = valueHead(c.valueColumn, list.map((t) => State.quotes[t.key]));
      resultsValueHead.textContent = valueHead(c.valueColumn, State.search?.results.map((r) => r.quote) ?? []);
      const searching = State.search != null;
      folders.style.display = searching ? "none" : "";
      const foldersKey = `${c.activeFolder}|${c.folders.join(",")}|${c.watchlist.map((t) => t.folder ?? "").join(",")}`;
      if (foldersKey !== lastFolders && document.activeElement !== folderField) {
        lastFolders = foldersKey;
        renderFolders();
      }
      empty.textContent = c.activeFolder && c.watchlist.length
        ? `Nothing in ${c.activeFolder} yet. Add a token below, or move one here from All with the folder button on its row.`
        : "Search a token by name, or paste its address (CA) or a link, then hit Enter.";
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

      // The list itself (which tokens, in what order, how they're labelled) is
      // rebuilt when it changes — that only follows a click or a setting. The
      // numbers update in place on every poll, so prices never freeze under
      // the mouse and the hover actions never flicker.
      const structure =
        c.activeFolder +
        list.map((t) => t.key).join("|") +
        safety(list.map((t) => t.key)).join(",") +
        State.companion.terminal +
        State.companion.chains.join();
      if (structure !== key) {
        key = structure;
        renderList();
        return;
      }
      for (const t of list) fillCells(t.key, State.quotes[t.key]?.updatedAt ?? -1);
    },
    tick() {
      this.sync();
    },
  };
}
