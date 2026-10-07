// The My wallet tab: the trader's own wallet (public address only). Holdings:
// what it holds, with value and profit, worked out by itself. Activity: every
// buy and sell seen, newest first, starting with the trades read from the
// wallet's history when it was added. A click on an entry price lets the
// trader type the real one over the estimate.

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { btn, field, iconBtn, pct, tokenImg, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { formatAge, formatPrice, formatUsd, pctClass, shortAddress } from "../core/format";
import { State, type ActivityItem, type WatchToken } from "../core/state";
import { todayKey } from "../discipline/discipline";
import { entrySource, formatMultiple, formatSignedUsd, sinceWords } from "../positions/positions";

const SIDE_WORDS: Record<ActivityItem["side"], string> = {
  tracked: "Held",
  opened: "Bought",
  bought: "Bought more",
  sold: "Sold part",
  closed: "Sold all",
};

export function buildPositions(actions: ViewActions): ViewHost {
  // The wallet(s) this tab reads, and the Holdings / Activity switch.
  const mineLine = h("div", { class: "mine-line" });
  const segHoldings = h("button", { class: "seg-btn", text: "Holdings" });
  const segActivity = h("button", { class: "seg-btn", text: "Activity" });
  const setMode = (activity: boolean) => {
    State.walletActivity = activity;
    actions.blip();
    key = "";
    sync();
    actions.relayout();
  };
  segHoldings.addEventListener("click", () => setMode(false));
  segActivity.addEventListener("click", () => setMode(true));
  const seg = h("div", { class: "seg corner" }, segHoldings, segActivity);

  const summary = h("div", { class: "pos-summary" });
  const head = h(
    "div",
    { class: "row head" },
    h("span", { class: "c-tok", text: "Token" }),
    h("span", { class: "c-mc", text: "Value" }),
    h("span", { class: "c-price", text: "Avg entry" }),
    h("span", { class: "c-price", text: "Now" }),
    h("span", { class: "c-pnl", text: "PnL" }),
    h("span", { class: "c-pct", text: "%" }),
    h("span", { class: "c-x", text: "" }),
  );
  const rows = h("div", { class: "rows" });
  const activity = h("div", { class: "rows activity" });
  const quiet = h("div", { class: "empty" });
  // Reading the wallet's history: progress, then what it found.
  const historyLine = h("div", { class: "history-line" });
  // When the shared public RPC fails the wallet: where the fix is.
  const rpcHint = h(
    "div",
    { class: "history-line err" },
    "Solana's public RPC is shared and busy. A free RPC key (Helius, Alchemy) reads your wallet faster: ",
    h("a", { class: "link", text: "add it in Settings", onclick: () => actions.openSettings() }),
    ".",
  );
  const fine = h("div", {
    class: "fine-print",
    text: "○ held before tracking, history not found. Hover an entry to see where it comes from; click it to type yours.",
  });

  // No wallet yet: add it right here.
  const address = field(actions, { placeholder: "Your wallet address (public)", class: "field" });
  const add = btn("Add my wallet", "secondary", () => submit());
  const note = h("span", { class: "note" });
  const setup = h(
    "div",
    { class: "wallet-setup" },
    h("div", {
      class: "empty",
      text: "Add your own wallet: its buys and sells are recorded, with the profit of every token, and closed trades go into your journal. Public address only — never a seed phrase or a key.",
    }),
    h("div", { class: "add-bar" }, address, add, note),
  );
  function submit() {
    const res = Companion.addWallet(address.value, "", true);
    note.className = res.ok ? "note ok" : "note err";
    note.textContent = res.message;
    window.setTimeout(() => (note.textContent = ""), 3500);
    if (res.ok) {
      address.value = "";
      address.blur();
      actions.blip();
      actions.relayout();
    }
  }
  address.addEventListener("keydown", (e) => e.key === "Enter" && submit());

  function tokenFor(mint: string, symbol: string): WatchToken {
    return State.token(mint) ?? {
      key: mint,
      chainId: "solana",
      address: mint,
      symbol,
      name: symbol,
      pairAddress: State.positionQuotes[mint]?.pairAddress ?? "",
      dexId: "",
      imageUrl: null,
    };
  }

  /** The entry cell: a price, or a field to type one into. */
  function entryCell(mint: string, entry: number, source: string): HTMLElement {
    const cell = h("span", { class: "c-price entry", text: formatPrice(entry), title: `${source}\nClick to type your real average entry.` });
    cell.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = field(actions, { class: "field entry-field", value: String(Number(entry.toPrecision(4))), inputmode: "decimal" });
      let finished = false;
      const done = (commit: boolean) => {
        if (finished) return;
        finished = true;
        const v = Number(input.value.replace(",", "."));
        if (commit && v > 0 && v !== entry) {
          Companion.setPositionEntry(mint, v);
          actions.blip();
        }
        key = "";
        render();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") done(true);
        if (ev.key === "Escape") done(false);
      });
      input.addEventListener("blur", () => done(true));
      input.addEventListener("click", (ev) => ev.stopPropagation());
      cell.replaceChildren(input);
      input.dispatchEvent(new MouseEvent("mousedown"));
    });
    return cell;
  }

  /** What the last read of a wallet found: its SOL and value, or why it failed. */
  function walletStatus(address: string): { text: string; err: boolean } {
    const snap = State.wallets[address];
    if (!snap) return { text: "reading…", err: false };
    if (snap.error) return { text: `couldn't read it: ${snap.error}`, err: true };
    return { text: `${snap.sol.toFixed(snap.sol < 10 ? 3 : 1)} SOL · ${formatUsd(snap.totalUsd)}`, err: false };
  }

  function renderMine() {
    clear(mineLine);
    for (const w of State.companion.wallets.filter((x) => x.mine)) {
      const status = walletStatus(w.address);
      mineLine.append(
        h(
          "span",
          { class: "mine-chip", title: w.address },
          h("b", { text: w.label }),
          ` ${shortAddress(w.address)}`,
          h("span", { class: `mine-status ${status.err ? "err" : ""}`, text: ` · ${status.text}` }),
          iconBtn(ICONS.xmark, "Remove this wallet", () => {
            Companion.removeWallet(w.address);
            actions.relayout();
          }),
        ),
      );
    }
  }

  function renderHistoryLine() {
    clear(historyLine);
    const r = State.historyRead;
    if (!r) {
      historyLine.style.display = "none";
      return;
    }
    historyLine.style.display = "";
    historyLine.classList.toggle("err", !!r.error);
    if (r.error) {
      historyLine.append(
        `Couldn't read your recent trades (${r.error}). `,
        h("a", { class: "link", text: "Try again", onclick: () => void Companion.readTradeHistory(r.address) }),
      );
    } else if (r.found != null) {
      historyLine.append(
        r.found
          ? `Found ${r.found} trade${r.found === 1 ? "" : "s"} in your last ${r.total} transactions: see Activity.`
          : `No trades in your last ${r.total} transactions. New ones show up within a minute.`,
      );
    } else {
      historyLine.append(`Reading your recent trades… ${r.total ? `${r.done}/${r.total}` : ""}`);
    }
  }

  function renderHoldings() {
    clear(rows);
    const list = Companion.positions();
    let value = 0;
    let cost = 0;
    for (const { p, price, s } of list) {
      value += s.valueUsd;
      cost += s.costUsd;
      const t = tokenFor(p.mint, p.symbol);
      const row = h(
        "div",
        { class: "row", title: `${p.symbol} · ${sinceWords(p)}\nClick to open its page.` },
        h(
          "span",
          { class: "c-tok" },
          tokenImg(t.imageUrl, p.symbol),
          h("span", { class: "sym", text: p.symbol }),
          p.fromTracking ? h("span", { class: "since", text: "○", title: "Held before tracking began: numbers start from then" }) : null,
        ),
        h("span", { class: "c-mc", text: formatUsd(s.valueUsd) }),
        entryCell(p.mint, s.entry, entrySource(p)),
        h("span", { class: "c-price", text: formatPrice(price) }),
        h("span", { class: `c-pnl pct ${pctClass(s.pnlUsd)}`, text: formatSignedUsd(s.pnlUsd) }),
        h("span", { class: "c-pct" }, pct(s.pnlPct)),
        h("span", {
          class: `c-x ${s.multiple != null && s.multiple >= 2 ? "big" : ""}`,
          text: s.multiple != null ? formatMultiple(Math.round(s.multiple * 10) / 10) : "",
        }),
      );
      row.addEventListener("click", () => actions.openToken(t.key, t));
      rows.append(row);
    }
    const unreal = value - cost;
    const book = State.companion.book;
    const realized = book.day === todayKey() ? book.realizedToday : 0;
    // The wallet's whole value: the SOL in it as well as the tokens.
    const sol = State.companion.wallets.filter((w) => w.mine).reduce((sum, w) => sum + (State.wallets[w.address]?.sol ?? 0), 0);
    const solValue = sol * (State.sol?.priceUsd ?? 0);
    clear(summary);
    summary.append(
      h("span", { title: "SOL and tokens in the wallet" }, "Value ", h("b", { text: formatUsd(value + solValue) })),
      h("span", {}, "Open PnL ", h("b", { class: `pct ${pctClass(unreal)}`, text: formatSignedUsd(unreal) })),
      h("span", {}, "Taken today ", h("b", { class: `pct ${pctClass(realized)}`, text: formatSignedUsd(realized) })),
    );
    // Nothing held: say what the wallet does hold, and where its trades are.
    quiet.textContent = `No tokens held right now${sol > 0 ? ` (${sol.toFixed(3)} SOL in the wallet)` : ""}. Buys show up here within a minute; your recent trades are under Activity.`;
    quiet.style.display = list.length ? "none" : "block";
    head.style.display = list.length ? "" : "none";
    fine.style.display = list.length ? "" : "none";
  }

  function renderActivity() {
    clear(activity);
    const items = [...State.companion.book.activity].reverse();
    if (items.length === 0) {
      activity.append(
        h(
          "div",
          { class: "empty" },
          "No buys or sells seen yet. New ones show up here within a minute. ",
          State.historyRead
            ? null
            : h("a", {
                class: "link",
                text: "Read my recent trades",
                onclick: () => {
                  const w = State.companion.wallets.find((x) => x.mine);
                  if (w) void Companion.readTradeHistory(w.address);
                },
              }),
        ),
      );
      return;
    }
    for (const a of items) {
      const t = tokenFor(a.mint, a.symbol);
      const took = a.side === "sold" || a.side === "closed";
      const row = h(
        "div",
        { class: "row" },
        h("span", { class: "c-when", text: `${formatAge(a.t)} ago`, title: a.history ? "Read from your wallet's history" : "" }),
        h("span", { class: `c-side side-${a.side}`, text: SIDE_WORDS[a.side] }),
        h("span", { class: "c-tok" }, h("span", { class: "sym", text: a.symbol })),
        h("span", { class: "c-mc", text: formatUsd(a.usd), title: "Value of what moved" }),
        h(
          "span",
          {
            class: `c-pnl pct ${took ? pctClass(a.realizedUsd) : ""}`,
            title: a.side === "closed" ? "What the whole position took" : took ? "What this sell took" : "",
          },
          // Bought before the history began: what it took is unknown.
          took ? (a.costUnknown ? "—" : formatSignedUsd(a.realizedUsd)) : "",
        ),
      );
      row.addEventListener("click", () => actions.openToken(t.key, t));
      activity.append(row);
    }
  }

  function render() {
    const has = State.companion.wallets.some((w) => w.mine);
    const showAct = has && State.walletActivity;
    const showHold = has && !State.walletActivity;
    setup.style.display = has ? "none" : "";
    seg.style.display = has ? "" : "none";
    mineLine.style.display = has ? "" : "none";
    segHoldings.classList.toggle("on", !State.walletActivity);
    segActivity.classList.toggle("on", State.walletActivity);
    for (const e of [summary, head, rows, quiet, fine]) e.style.display = showHold ? "" : "none";
    activity.style.display = showAct ? "" : "none";
    rpcHint.style.display = has && publicRpcFailing() ? "" : "none";
    if (!has) {
      historyLine.style.display = "none";
      return;
    }
    renderMine();
    renderHistoryLine();
    if (showHold) renderHoldings();
    else renderActivity();
  }

  /** An own wallet couldn't be read, and the app is on the public RPC. */
  function publicRpcFailing(): boolean {
    if (State.settings.rpcUrl) return false;
    const mine = State.companion.wallets.filter((w) => w.mine);
    return !!State.historyRead?.error || mine.some((w) => !!State.wallets[w.address]?.error);
  }

  const el = h("div", { class: "view positions" }, seg, mineLine, historyLine, rpcHint, setup, summary, head, rows, quiet, activity, fine);

  let key = "";
  function sync() {
    // Don't redraw under a field being typed in.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && el.contains(active)) return;
    const book = State.companion.book;
    const next =
      `${State.walletActivity}|` +
      State.companion.wallets
        .filter((w) => w.mine)
        .map((w) => `${w.address}${w.label}:${walletStatus(w.address).text}`)
        .join(",") +
      `|${JSON.stringify(State.historyRead)}|${publicRpcFailing()}` +
      "|" +
      Object.values(book.positions)
        .map((p) => `${p.mint}:${p.costUsd}:${Companion.positionPrice(p.mint) ?? ""}:${Object.values(p.amounts).join("+")}`)
        .join("|") +
      `#${book.day}:${book.realizedToday}#${book.activity.length}:${book.activity.at(-1)?.t ?? 0}` +
      // The SOL in the wallet counts in its Value.
      `#${State.companion.wallets.filter((w) => w.mine).map((w) => State.wallets[w.address]?.sol ?? 0).join("+")}:${State.sol?.priceUsd ?? 0}`;
    if (next === key) return;
    key = next;
    render();
  }
  return { el, sync };
}
