// The My wallet tab: the trader's own wallet (public address only). Holdings:
// what it holds, with value and profit, worked out by itself. Activity: every
// buy and sell seen, newest first, starting with the trades read from the
// wallet's history when it was added. A click on an entry price lets the
// trader type the real one over the estimate.

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { btn, field, iconBtn, pct, tokenImg, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { Bridge } from "../core/bridge";
import { formatAge, formatPct, formatPrice, formatUsd, pctClass, shortAddress } from "../core/format";
import { N_, t, tn } from "../core/i18n";
import { State, type ActivityItem, type WatchToken } from "../core/state";
import { todayKey } from "../discipline/discipline";
import { entrySource, formatMultiple, formatSignedUsd, sinceWords } from "../positions/positions";
import { allocation, byDay, progressOf, sortHeld, type PositionSort, type Progress } from "../positions/board";

/** The allocation bar's colours, biggest token first (SOL keeps its own). */
const ALLOC_COLORS = ["#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa"];

const SIDE_WORDS: Record<ActivityItem["side"], string> = {
  tracked: N_("Held"),
  opened: N_("Bought"),
  bought: N_("Bought more"),
  sold: N_("Sold part"),
  closed: N_("Sold all"),
};

/** A row's progress line, in words: one whole line for a target or a stop. */
function progressTitle(prog: Progress): string {
  const way = Math.round(prog.frac * 100);
  if (prog.kind === "stop") return t("{pct}% of the way to your stop", { pct: way });
  if (prog.kind === "target") return t("{pct}% of the way to your target", { pct: way });
  return t("{pct}% of the way to {level}x", { pct: way, level: prog.level ?? "" });
}

export function buildPositions(actions: ViewActions): ViewHost {
  // The wallet(s) this tab reads, and the Holdings / Activity switch.
  const mineLine = h("div", { class: "mine-line" });
  const segHoldings = h("button", { class: "seg-btn", text: t("Holdings") });
  const segActivity = h("button", { class: "seg-btn", text: t("Activity") });
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

  // The wallet at a glance: four cards, then each token's share of it.
  const summary = h("div", { class: "pos-cards" });
  const alloc = h("div", { class: "alloc" });
  // Column heads that sort the rows (kept between launches).
  const sortBtn = (by: PositionSort, label: string, cls: string, title: string) =>
    h("button", {
      class: `sort ${cls}`,
      type: "button",
      text: label,
      title,
      onclick: (e: Event) => {
        e.stopPropagation();
        State.companion.walletSort = by;
        Companion.save();
        actions.blip();
        key = "";
        sync();
      },
    });
  const sorts = {
    value: sortBtn("value", t("Value"), "c-val", t("Sort by value")),
    pnl: sortBtn("pnl", "PnL", "c-pnl2", t("Sort by profit")),
    pct: sortBtn("pct", "%", "c-pct2", t("Sort by %")),
    x: sortBtn("x", "x", "c-x", t("Sort by multiple")),
  };
  const head = h("div", { class: "row head pos-head" }, h("span", { class: "c-tok" }, t("Token"), h("span", { class: "narrow-off", text: ` · ${t("held · entry → now")}` })), sorts.value, sorts.pnl, sorts.pct, sorts.x);
  const rows = h("div", { class: "rows" });
  const activity = h("div", { class: "rows activity" });
  const quiet = h("div", { class: "empty" });
  // Reading the wallet's history: progress, then what it found.
  const historyLine = h("div", { class: "history-line" });
  // When the shared public RPC fails the wallet: where the fix is. One
  // sentence, the link's words in place of {link}.
  const [rpcBefore, rpcAfter = ""] = t("Solana's public RPC is shared and busy. A free RPC key (Helius, Alchemy) reads your wallet faster: {link}.").split("{link}");
  const rpcHint = h(
    "div",
    { class: "history-line err" },
    rpcBefore,
    h("a", { class: "link", text: t("add it in Settings"), onclick: () => actions.openSettings() }),
    rpcAfter,
  );
  const fine = h("div", {
    class: "fine-print",
    text: t("Click an entry to type yours · ○ held before tracking · the line under a row: the way to your target, stop or next x"),
  });

  // No wallet yet: add it right here.
  const address = field(actions, { placeholder: t("Your wallet address (public)"), class: "field" });
  const add = btn(t("Add my wallet"), "secondary", () => submit());
  const note = h("span", { class: "note" });
  const setup = h(
    "div",
    { class: "wallet-setup" },
    h("div", {
      class: "empty",
      text: t("Add your own wallet: its buys and sells are recorded, with the profit of every token, and closed trades go into your journal. Public address only — never a seed phrase or a key."),
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
      imageUrl: State.positionQuotes[mint]?.imageUrl ?? null,
    };
  }

  /** The entry: a price, or a field to type one into. */
  function entryCell(mint: string, entry: number, source: string): HTMLElement {
    const cell = h("span", { class: "entry", text: formatPrice(entry), title: `${source}\n${t("Click to type your real average entry.")}` });
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

  /** A position's own target and stop (USD prices), typed in place of its quick action. */
  function targetEditor(mint: string, target: number | undefined, stop: number | undefined, bar: HTMLElement) {
    clear(bar);
    bar.classList.add("editing");
    const num = (v: number | undefined) => (v ? String(Number(v.toPrecision(4))) : "");
    const targetIn = field(actions, { class: "field tiny", placeholder: t("target $"), value: num(target), inputmode: "decimal" });
    const stopIn = field(actions, { class: "field tiny", placeholder: t("stop $"), value: num(stop), inputmode: "decimal" });
    const read = (f: HTMLInputElement) => {
      const v = Number(f.value.replace(",", ".").replace("$", ""));
      return v > 0 ? v : null;
    };
    const save = () => {
      Companion.setTargets(mint, read(targetIn), read(stopIn));
      actions.blip();
      key = "";
      render();
    };
    for (const f of [targetIn, stopIn]) {
      f.addEventListener("click", (e) => e.stopPropagation());
      f.addEventListener("keydown", (e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") {
          key = "";
          render();
        }
      });
    }
    const ok = btn(t("Save"), "secondary", save);
    ok.addEventListener("click", (e) => e.stopPropagation());
    bar.append(targetIn, stopIn, ok);
    actions.focusInput(true);
    window.setTimeout(() => targetIn.focus(), 30);
  }

  /** What the last read of a wallet found: its SOL and value, or why it failed. */
  function walletStatus(address: string): { text: string; err: boolean } {
    const snap = State.wallets[address];
    if (!snap) return { text: t("reading…"), err: false };
    if (snap.error) return { text: t("couldn't read it: {error}", { error: snap.error }), err: true };
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
          iconBtn(ICONS.xmark, t("Remove this wallet"), () => {
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
        `${t("Couldn't read your recent trades ({error}).", { error: r.error })} `,
        h("a", { class: "link", text: t("Try again"), onclick: () => void Companion.readTradeHistory(r.address) }),
      );
    } else if (r.found != null) {
      historyLine.append(
        r.found
          ? tn(r.found, "Found {n} trade in your last {total} transactions: see Activity.", "Found {n} trades in your last {total} transactions: see Activity.", {
              total: r.total,
            })
          : t("No trades in your last {total} transactions. New ones show up within a minute.", { total: r.total }),
      );
    } else {
      historyLine.append(t("Reading your recent trades… {progress}", { progress: r.total ? `${r.done}/${r.total}` : "" }));
    }
  }

  function renderHoldings() {
    clear(rows);
    const c = State.companion;
    const list = sortHeld(Companion.positions(), c.walletSort);
    for (const [by, el] of Object.entries(sorts)) el.classList.toggle("on", by === c.walletSort);
    let value = 0;
    let cost = 0;
    for (const x of list) {
      value += x.s.valueUsd;
      cost += x.s.costUsd;
    }
    // The wallet's whole value: the SOL in it as well as the tokens.
    const mine = c.wallets.filter((w) => w.mine);
    const sol = mine.reduce((sum, w) => sum + (State.wallets[w.address]?.sol ?? 0), 0);
    const solValue = sol * (State.sol?.priceUsd ?? 0);
    const whole = value + solValue;

    for (const x of list) {
      const { p, price, s } = x;
      const tok = tokenFor(p.mint, p.symbol);
      const target = p.target ? formatPrice(p.target) : "";
      const stop = p.stop ? formatPrice(p.stop) : "";
      const goals =
        target && stop
          ? t("Your target {target} · stop {stop}", { target, stop })
          : target
            ? t("Your target {target}", { target })
            : stop
              ? t("Your stop {stop}", { stop })
              : "";
      const bar: HTMLElement = h(
        "span",
        { class: "row-actions" },
        iconBtn(ICONS.bell, goals ? t("{goals}: click to change", { goals }) : t("Set your target and stop: an alert when the price gets there"), (e) => {
          e.stopPropagation();
          targetEditor(p.mint, p.target, p.stop, bar);
        }),
        iconBtn(ICONS.copy, t("Copy the CA"), (e) => {
          e.stopPropagation();
          void Bridge.copy(p.mint).then((ok) => ok && actions.blip());
        }, 2),
        ...(State.token(tok.key)
          ? []
          : [
              iconBtn(ICONS.plus, t("Add to the watchlist"), (e) => {
                e.stopPropagation();
                void Companion.addToken(p.mint).then(() => actions.relayout());
              }),
            ]),
      );
      const prog = progressOf(x, c.positionAlerts.ups);
      const share = whole > 0 ? (s.valueUsd / whole) * 100 : 0;
      const row = h(
        "div",
        { class: "row pos-row", title: `${p.symbol} · ${sinceWords(p)}${goals ? `\n${goals}` : ""}\n${t("Click to open its page.")}` },
        h(
          "span",
          { class: "c-tok" },
          tokenImg(tok.imageUrl, p.symbol),
          h(
            "span",
            { class: "tok-lines" },
            h(
              "span",
              { class: "sym-line" },
              h("span", { class: "sym", text: p.symbol }),
              p.fromTracking ? h("span", { class: "since", text: "○", title: t("Held before tracking began: numbers start from then") }) : null,
              goals ? h("span", { class: "goal-mark", text: "◎", title: goals }) : null,
            ),
            h(
              "span",
              { class: "sub" },
              p.fromTracking ? "" : `${formatAge(p.openedAt)} · `,
              entryCell(p.mint, s.entry, entrySource(p)),
              " → ",
              h("span", { class: "now", text: formatPrice(price) }),
            ),
          ),
        ),
        h("span", { class: "c-val" }, h("b", { text: formatUsd(s.valueUsd) }), h("span", { class: "sub", text: `${share.toFixed(share >= 10 ? 0 : 1)}%` })),
        h("span", { class: `c-pnl2 ${pctClass(s.pnlUsd)}` }, h("b", { text: formatSignedUsd(s.pnlUsd) })),
        h("span", { class: `c-pct2 ${pctClass(s.pnlPct)}` }, pct(s.pnlPct)),
        h("span", {
          class: `c-x ${s.multiple != null && s.multiple >= 2 ? "big" : ""}`,
          text: s.multiple != null ? formatMultiple(Math.round(s.multiple * 10) / 10) : "",
        }),
        prog
          ? h("i", { class: `prog ${prog.kind}`, style: `width:${Math.round(prog.frac * 100)}%`, title: progressTitle(prog) })
          : null,
        bar,
      );
      row.addEventListener("click", () => actions.openToken(tok.key, tok));
      rows.append(row);
    }

    const unreal = value - cost;
    const book = c.book;
    const realized = book.day === todayKey() ? book.realizedToday : 0;
    const baseline = mine.reduce((sum, w) => sum + (w.baselineUsd ?? 0), 0);
    const totalNow = mine.reduce((sum, w) => sum + (State.wallets[w.address]?.totalUsd ?? 0), 0);
    const best = sortHeld(list, "x")[0];
    const card = (label: string, big: Node | string, sub: Node | string, cls: string, title: string) =>
      h("div", { class: `pos-card ${cls}`, title }, h("span", { class: "lbl", text: label }), h("b", {}, big), h("span", { class: "sub" }, sub));
    clear(summary);
    summary.append(
      card(
        t("Wallet"),
        formatUsd(whole),
        baseline > 0 && totalNow > 0
          ? h("span", {
              class: pctClass(totalNow - baseline),
              text: t("{amount} in all", { amount: formatSignedUsd(totalNow - baseline) }),
              title: t("Since you added the wallet"),
            })
          : `${sol.toFixed(sol < 10 ? 2 : 1)} SOL`,
        "",
        t("Tokens and SOL in your wallet"),
      ),
      card(
        t("Open PnL"),
        h("span", { class: pctClass(unreal), text: formatSignedUsd(unreal) }),
        cost > 0 ? h("span", { class: pctClass(unreal), text: formatPct((unreal / cost) * 100) }) : "",
        "",
        t("What the tokens held are up or down from their entries"),
      ),
      card(t("Taken today"), h("span", { class: pctClass(realized), text: formatSignedUsd(realized) }), t("from sales"), "", t("Profit or loss on today's sales")),
      card(
        t("Best"),
        best && best.s.multiple != null ? formatMultiple(Math.round(best.s.multiple * 10) / 10) : "—",
        best ? best.p.symbol : t("nothing held"),
        best && best.s.multiple != null && best.s.multiple >= 2 ? "hot" : "",
        t("The position with the biggest multiple"),
      ),
    );

    // Each token's share of the wallet, SOL included.
    clear(alloc);
    const slices = allocation(list, solValue);
    alloc.style.display = slices.length ? "" : "none";
    const barEl = h("div", { class: "alloc-bar" });
    const legend = h("div", { class: "alloc-legend" });
    slices.forEach((sl, i) => {
      const color = sl.key === "SOL" ? "#a78bfa" : sl.key === "others" ? "#4b5563" : ALLOC_COLORS[i % ALLOC_COLORS.length];
      const pctText = `${Math.round(sl.share * 100)}%`;
      barEl.append(h("i", { style: `flex:${sl.share};background:${color}`, title: `${sl.symbol} ${pctText} · ${formatUsd(sl.value)}` }));
      if (i < 5) legend.append(h("span", {}, h("i", { style: `background:${color}` }), `${sl.symbol} ${pctText}`));
    });
    alloc.append(barEl, legend);

    // Nothing held: say what the wallet does hold, and where its trades are.
    quiet.textContent =
      sol > 0
        ? t("No tokens held right now ({sol} SOL in the wallet). Buys show up here within a minute; your recent trades are under Activity.", { sol: sol.toFixed(3) })
        : t("No tokens held right now. Buys show up here within a minute; your recent trades are under Activity.");
    quiet.style.display = list.length ? "none" : "block";
    head.style.display = list.length ? "" : "none";
    fine.style.display = list.length ? "" : "none";
  }

  function renderActivity() {
    clear(activity);
    const items = State.companion.book.activity;
    if (items.length === 0) {
      activity.append(
        h(
          "div",
          { class: "empty" },
          `${t("No buys or sells seen yet. New ones show up here within a minute.")} `,
          State.historyRead
            ? null
            : h("a", {
                class: "link",
                text: t("Read my recent trades"),
                onclick: () => {
                  const w = State.companion.wallets.find((x) => x.mine);
                  if (w) void Companion.readTradeHistory(w.address);
                },
              }),
        ),
      );
      return;
    }
    // One heading per day, newest first; each row: time, what happened, the token, what moved, what it took.
    for (const group of byDay(items)) {
      activity.append(h("div", { class: "day-head", text: group.label }));
      for (const a of group.items) {
        const tok = tokenFor(a.mint, a.symbol);
        const took = a.side === "sold" || a.side === "closed";
        const d = new Date(a.t);
        const row = h(
          "div",
          { class: "row act-row" },
          h("span", {
            class: "c-when",
            text: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
            title: a.history ? t("Read from your wallet's history") : t("{age} ago", { age: formatAge(a.t) }),
          }),
          h("span", { class: `c-side side-${a.side}`, text: t(SIDE_WORDS[a.side]) }),
          h("span", { class: "c-tok" }, tokenImg(tok.imageUrl, a.symbol), h("span", { class: "sym", text: a.symbol })),
          h("span", { class: "c-mc", text: formatUsd(a.usd), title: t("Value of what moved") }),
          h(
            "span",
            {
              class: `c-pnl pct ${took ? pctClass(a.realizedUsd) : ""}`,
              title: a.side === "closed" ? t("What the whole position took") : took ? t("What this sell took") : "",
            },
            // Bought before the history began: what it took is unknown.
            took ? (a.costUnknown ? "—" : formatSignedUsd(a.realizedUsd)) : "",
          ),
        );
        row.addEventListener("click", () => actions.openToken(tok.key, tok));
        activity.append(row);
      }
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
    for (const e of [summary, alloc, head, rows, quiet, fine]) e.style.display = showHold ? "" : "none";
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

  const el = h("div", { class: "view positions" }, seg, mineLine, historyLine, rpcHint, setup, summary, alloc, head, rows, quiet, activity, fine);

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
      `|${JSON.stringify(State.historyRead)}|${publicRpcFailing()}|${State.companion.walletSort}` +
      "|" +
      Object.values(book.positions)
        .map((p) => `${p.mint}:${p.costUsd}:${Companion.positionPrice(p.mint) ?? ""}:${Object.values(p.amounts).join("+")}:${p.target ?? ""}:${p.stop ?? ""}`)
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
