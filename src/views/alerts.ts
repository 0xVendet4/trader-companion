// The alerts tab: the rules, each with an on/off switch, and a form to add one.

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { borrowKeyboard, btn, field, iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { KIND_LABELS, WINDOW_CHOICES, describeRule, usesPercent, usesWindow } from "../alerts/alerts";
import { formatPct, formatPrice, formatUsd, parseAmount } from "../core/format";
import { State, type AlertKind } from "../core/state";

const KIND_ORDER: AlertKind[] = ["mcapAbove", "mcapBelow", "priceAbove", "priceBelow", "pctUp", "pctDown", "liqDrop"];

export function buildAlerts(actions: ViewActions): ViewHost {
  const list = h("div", { class: "alert-list" });
  const empty = h("div", { class: "empty", text: "No alerts yet. Create one below, or with the bell on a token." });

  const tokenSel = h("select", { class: "field sel" }) as HTMLSelectElement;
  const kindSel = h("select", { class: "field sel" }) as HTMLSelectElement;
  for (const k of KIND_ORDER) kindSel.append(h("option", { value: k, text: KIND_LABELS[k] }));
  const value = field(actions, { placeholder: "1.5M", class: "field small" });
  const winSel = h("select", { class: "field sel small" }) as HTMLSelectElement;
  for (const w of WINDOW_CHOICES) winSel.append(h("option", { value: String(w), text: `in ${w} min` }));
  const create = btn("Create", "secondary", () => submit());
  const note = h("span", { class: "note" });
  const now = h("div", { class: "now" });

  // Selects open a native popup; it needs the keyboard like a text field.
  for (const s of [tokenSel, kindSel, winSel]) borrowKeyboard(actions, s);

  function placeholder() {
    const k = kindSel.value as AlertKind;
    value.placeholder = usesPercent(k) ? "20 (%)" : k.startsWith("mcap") ? "1.5M" : "0.0012";
    winSel.style.display = usesWindow(k) ? "" : "none";
    updateNow();
  }
  kindSel.addEventListener("change", placeholder);
  tokenSel.addEventListener("change", updateNow);
  value.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  function updateNow() {
    const q = State.quotes[tokenSel.value];
    now.textContent = q
      ? `now: MC ${formatUsd(q.marketCap)} · ${formatPrice(q.priceUsd)} · liq ${formatUsd(q.liquidityUsd)} · 5m ${formatPct(q.change.m5)}`
      : "";
  }

  function submit() {
    const address = tokenSel.value;
    const kind = kindSel.value as AlertKind;
    const v = parseAmount(value.value);
    note.className = "note err";
    if (!address) {
      note.textContent = "Add a token to the watchlist first.";
      return;
    }
    if (v == null || v <= 0) {
      note.textContent = usesPercent(kind) ? "Enter a percentage, e.g. 20" : "Enter a value, e.g. 1.5M or 0.0012";
      return;
    }
    if (usesPercent(kind) && v > 1000) {
      note.textContent = "That percentage is too high.";
      return;
    }
    Companion.addAlert({ address, kind, value: v, windowMin: Number(winSel.value) });
    value.value = "";
    note.className = "note ok";
    note.textContent = "Alert created.";
    actions.blip();
    actions.relayout();
    window.setTimeout(() => (note.textContent = ""), 3000);
  }

  let key = "";
  function render() {
    clear(list);
    for (const rule of State.companion.alerts) {
      const token = State.token(rule.address);
      const row = h(
        "div",
        { class: `alert-row ${rule.enabled ? "" : "off"}` },
        h("span", { class: "sym", text: token?.symbol ?? "?" }),
        h("span", { class: "desc", text: describeRule(rule) }),
        h(
          "button",
          {
            class: `toggle ${rule.enabled ? "on" : ""}`,
            title: rule.enabled ? "Turn off" : "Turn on",
            onclick: () => {
              Companion.toggleAlert(rule.id);
              actions.blip();
            },
          },
          h("i"),
        ),
        iconBtn(ICONS.trash, "Delete", () => {
          Companion.removeAlert(rule.id);
          actions.relayout();
        }, 2),
      );
      list.append(row);
    }
  }

  const el = h(
    "div",
    { class: "view alerts" },
    list,
    empty,
    h("div", { class: "alert-form" }, tokenSel, kindSel, value, winSel, create),
    h("div", { class: "form-foot" }, now, note),
  );

  return {
    el,
    sync() {
      const rules = State.companion.alerts;
      empty.style.display = rules.length ? "none" : "block";
      list.style.display = rules.length ? "flex" : "none";
      const next = rules.map((r) => `${r.id}${r.enabled}`).join("|") + State.companion.watchlist.length;
      if (next !== key) {
        key = next;
        render();
      }
      // Token options follow the watchlist; keep the selection when possible.
      const want = State.alertDraftAddress ?? tokenSel.value;
      const opts = State.companion.watchlist.map((t) => t.key).join("|");
      if (tokenSel.dataset.opts !== opts) {
        tokenSel.dataset.opts = opts;
        clear(tokenSel);
        for (const t of State.companion.watchlist) tokenSel.append(h("option", { value: t.key, text: t.symbol }));
      }
      if (want && State.token(want)) tokenSel.value = want;
      State.alertDraftAddress = null;
      placeholder();
    },
  };
}

