// The Following tab: other people's wallets, by public address, for an alert
// when they buy or sell. Nothing more is worked out about them — no value, no
// profit: the trader's own wallet lives in the My wallet tab. Read-only: the
// app never asks for a key.

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { btn, field, iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { formatAge, formatUsd, shortAddress } from "../core/format";
import { State, type TrackedWallet } from "../core/state";

export function buildWallets(actions: ViewActions): ViewHost {
  const list = h("div", { class: "wallet-list" });
  const empty = h(
    "div",
    { class: "empty" },
    "Follow a trader's wallet by its public address: you get an alert when it buys or sells. Checked once a minute. Your own wallet goes in the My wallet tab.",
  );
  const address = field(actions, { placeholder: "Wallet address to follow (public)", class: "field" });
  const label = field(actions, { placeholder: "Name", class: "field small" });
  const track = btn("Follow", "secondary", () => submit());
  const note = h("span", { class: "note" });
  const fine = h("div", { class: "fine-print", text: "Public address only. Never paste a seed phrase or private key anywhere." });

  function submit() {
    const res = Companion.addWallet(address.value, label.value, false);
    note.className = res.ok ? "note ok" : "note err";
    note.textContent = res.message;
    window.setTimeout(() => (note.textContent = ""), 3500);
    if (res.ok) {
      address.value = "";
      label.value = "";
      actions.blip();
      actions.relayout();
    }
  }
  for (const f of [address, label]) f.addEventListener("keydown", (e) => e.key === "Enter" && submit());

  function row(w: TrackedWallet): HTMLElement {
    const snap = State.wallets[w.address];
    const move = State.walletMoves[w.address];
    const detail = h("div", { class: "w-detail" });
    if (!snap) detail.append("Reading…");
    else if (snap.error && snap.top.length === 0 && snap.sol === 0) detail.append(`Couldn't read: ${snap.error}`);
    else {
      detail.append(
        move
          ? h("span", { class: `w-move ${move.side === "bought" ? "up" : "down"}`, text: `${move.side} ${move.symbol} · ${formatAge(move.t)} ago` })
          : h("span", { class: "dim", text: "No buys or sells seen yet" }),
      );
      // What it holds, for context.
      for (const t of snap.top) detail.append(h("span", { class: "chip", text: `${t.symbol} ${formatUsd(t.usd)}` }));
      if (snap.error) detail.append(h("span", { class: "err", text: "· retrying" }));
    }
    return h(
      "div",
      { class: "wallet-row" },
      h(
        "div",
        { class: "w-line" },
        h("span", { class: "w-name", text: w.label }),
        h("code", { class: "w-addr", text: shortAddress(w.address), title: w.address }),
        h("span", { class: "w-checked dim", text: snap ? `checked ${formatAge(snap.checkedAt)} ago` : "" }),
        iconBtn(ICONS.trash, "Stop following", () => {
          Companion.removeWallet(w.address);
          actions.relayout();
        }, 2),
      ),
      detail,
    );
  }

  const el = h(
    "div",
    { class: "view wallets" },
    list,
    empty,
    h("div", { class: "add-bar" }, address, label, track, note),
    fine,
  );

  let key = "";
  return {
    el,
    sync() {
      const wallets = State.companion.wallets.filter((w) => !w.mine);
      empty.style.display = wallets.length ? "none" : "block";
      list.style.display = wallets.length ? "flex" : "none";
      const next = wallets
        .map((w) => `${w.address}${w.label}${State.wallets[w.address]?.checkedAt ?? 0}${State.walletMoves[w.address]?.t ?? 0}`)
        .join("|");
      if (next !== key) {
        key = next;
        clear(list);
        for (const w of wallets) list.append(row(w));
      }
    },
  };
}
