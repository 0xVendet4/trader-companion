// The discipline tab. "Today": session time, today's trades against the loss
// limit, cooldown; with the trader's own wallet set, its sales count by
// themselves (typing one in stays one click away), otherwise quick logging. "Journal": the last 7 days as a bar
// chart, win rate, recent trades with notes, and a CSV export. Both share a
// footer with "Share my day": a recap image to post (see src/share).

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { btn, field, iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { Bridge, IS_TAURI } from "../core/bridge";
import { formatClock, formatDuration, formatPnl, parseAmount } from "../core/format";
import { State, type JournalEntry } from "../core/state";
import {
  currentLog,
  journalCsv,
  lastTypedTrade,
  lossLimitUsed,
  nextBreakIn,
  summarize,
  weekStats,
} from "../discipline/discipline";

const RECENT = 5;

export function buildDiscipline(actions: ViewActions): ViewHost {
  // ── Today ─────────────────────────────────────────────────────────────────
  const session = h("div", { class: "line" });
  const today = h("div", { class: "line" });
  const barFill = h("i");
  const bar = h("div", { class: "limit-bar" }, barFill);
  const barLabel = h("span", { class: "limit-label" });
  const amount = field(actions, { placeholder: "0.5", class: "field small" });
  const noteIn = field(actions, { placeholder: "Note (optional)", class: "field note-in" });
  const unit = h("span", { class: "unit" });
  const status = h("div", { class: "line status" });

  function log(sign: 1 | -1) {
    const v = parseAmount(amount.value);
    if (v == null || v === 0) {
      amount.focus();
      amount.classList.add("shake");
      window.setTimeout(() => amount.classList.remove("shake"), 400);
      return;
    }
    Companion.recordTrade(sign * Math.abs(v), noteIn.value.trim());
    amount.value = "";
    noteIn.value = "";
    byHand = false;
    actions.blip();
    update();
  }

  /** The wallet counts the trades: the day follows its sales by itself. */
  const fromWallet = () => State.companion.autoJournal && State.companion.wallets.some((w) => w.mine);
  /** Typing a trade in while the wallet counts (one it can't see). */
  let byHand = false;
  const autoLine = h(
    "div",
    { class: "line auto-line" },
    "Counted from My wallet: each sale adds its profit, each closed position is a trade. ",
    h("a", {
      text: "Log one by hand",
      onclick: () => {
        byHand = true;
        actions.blip();
        update();
      },
    }),
  );

  const win = btn("+ Win", "secondary", () => log(1));
  win.classList.add("win");
  const loss = btn("− Loss", "secondary", () => log(-1));
  loss.classList.add("loss");
  const undo = iconBtn(ICONS.undo, "Undo last", () => {
    Companion.undoTrade();
    actions.blip();
  }, 2);
  const endCooldown = btn("End", "ghost", () => Companion.endCooldown());

  const logBar = h("div", { class: "log-bar" }, amount, unit, noteIn, win, loss, undo);
  const todayEl = h(
    "div",
    { class: "pane today" },
    session,
    today,
    h("div", { class: "line" }, bar, barLabel),
    autoLine,
    logBar,
    status,
  );

  // ── Journal ───────────────────────────────────────────────────────────────
  const chart = h("div", { class: "week-chart" });
  const stats = h("div", { class: "line week-stats" });
  const recent = h("div", { class: "recent" });
  const exportBtn = btn("Export CSV", "secondary", () => void exportCsv());
  const exportNote = h("span", { class: "note" });
  const journalEl = h(
    "div",
    { class: "pane journal" },
    chart,
    stats,
    recent,
    h("div", { class: "journal-foot" }, exportBtn, exportNote),
  );

  async function exportCsv() {
    const c = State.companion;
    if (c.journal.length === 0) {
      exportNote.textContent = "Nothing to export yet.";
      return;
    }
    const csv = journalCsv(c.journal, c.discipline.unit);
    if (IS_TAURI) {
      // No save dialog in the app yet: the CSV goes to the clipboard instead.
      const ok = await Bridge.copy(csv);
      exportNote.textContent = ok ? "CSV copied. Paste it into a spreadsheet." : "Couldn't copy the CSV.";
    } else {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = h("a", { href: url, download: `trades-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      exportNote.textContent = "Downloaded.";
    }
    actions.blip();
    window.setTimeout(() => (exportNote.textContent = ""), 3500);
  }

  function editNote(e: JournalEntry, span: HTMLElement) {
    const input = field(actions, { class: "field note-edit", value: e.note });
    const done = () => {
      Companion.setJournalNote(e.id, input.value.trim());
      renderJournal();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") done();
    });
    input.addEventListener("blur", done);
    span.replaceWith(input);
    actions.focusInput(true);
    window.setTimeout(() => input.focus(), 30);
  }

  function renderJournal() {
    const c = State.companion;
    const unitTxt = c.discipline.unit;
    const w = weekStats(c.journal);

    // Bars grow up (wins) or down (losses) from a middle baseline.
    clear(chart);
    const max = Math.max(0.0001, ...w.days.map((d) => Math.abs(d.pnl)));
    for (const d of w.days) {
      const hPct = (Math.abs(d.pnl) / max) * 100;
      chart.append(
        h(
          "div",
          { class: "day", title: `${d.label}: ${formatPnl(d.pnl, unitTxt)} · ${d.count} trade${d.count === 1 ? "" : "s"}` },
          h("div", { class: "half up" }, d.pnl > 0 ? h("i", { style: `height:${hPct}%` }) : null),
          h("div", { class: "half down" }, d.pnl < 0 ? h("i", { style: `height:${hPct}%` }) : null),
          h("span", { class: "lbl", text: d.label }),
        ),
      );
    }

    clear(stats);
    stats.append(
      "7 days: ",
      h("span", { class: w.total > 0 ? "up" : w.total < 0 ? "down" : "", text: formatPnl(w.total, unitTxt) }),
      ` · ${w.count} trade${w.count === 1 ? "" : "s"}`,
      w.count ? ` · ${Math.round(w.winRate * 100)}% wins` : "",
      w.best > 0 ? ` · best ${formatPnl(w.best, unitTxt)}` : "",
      w.worst < 0 ? ` · worst ${formatPnl(w.worst, unitTxt)}` : "",
    );

    clear(recent);
    const last = [...c.journal].sort((a, b) => b.t - a.t).slice(0, RECENT);
    if (last.length === 0) {
      const text = fromWallet()
        ? "Positions your wallet closes land here, with notes."
        : "Log trades in Today and they land here, with notes.";
      recent.append(h("div", { class: "empty", text }));
    }
    for (const e of last) {
      const d = new Date(e.t);
      const when = `${d.toLocaleDateString("en-US", { weekday: "short" })} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const noteSpan = h("span", { class: `j-note ${e.note ? "" : "dim"}`, text: e.note || "add a note…", title: "Click to edit" });
      noteSpan.addEventListener("click", () => editNote(e, noteSpan));
      recent.append(
        h(
          "div",
          { class: "j-row" },
          h("span", { class: "j-when", text: when }),
          h("span", { class: `j-pnl ${e.pnl > 0 ? "up" : e.pnl < 0 ? "down" : ""}`, text: formatPnl(e.pnl, unitTxt) }),
          noteSpan,
        ),
      );
    }
  }

  // ── Shared ────────────────────────────────────────────────────────────────
  const segToday = h("button", { class: "seg-btn", text: "Today" });
  const segJournal = h("button", { class: "seg-btn", text: "Journal" });
  const setMode = (journal: boolean) => {
    if (State.journalOpen === journal) return;
    State.journalOpen = journal;
    actions.blip();
    actions.relayout();
    update();
  };
  segToday.addEventListener("click", () => setMode(false));
  segJournal.addEventListener("click", () => setMode(true));

  // Share my day: the recap card, with or without amounts.
  const shareNote = h("span", { class: "share-note" });
  let sharing = false;
  const shareLink = h("a", {
    class: "share",
    text: "Share my day",
    title: "A recap image of today, copied to paste on X or Telegram",
    onclick: async () => {
      if (sharing) return;
      sharing = true;
      shareNote.textContent = "Drawing…";
      try {
        shareNote.textContent = await actions.shareDay();
        actions.blip();
      } catch (err) {
        shareNote.textContent = `Couldn't make the image: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        sharing = false;
        window.setTimeout(() => (shareNote.textContent = ""), 4000);
      }
    },
  });
  const moneyToggle = h("a", {
    class: "money",
    title: "Show or hide amounts on the image (signs and % stay)",
    onclick: () => {
      State.companion.recapHideMoney = !State.companion.recapHideMoney;
      Companion.save();
      actions.blip();
      update();
    },
  });

  const el = h(
    "div",
    { class: "view discipline" },
    h("div", { class: "seg corner" }, segToday, segJournal),
    todayEl,
    journalEl,
    h(
      "div",
      { class: "foot" },
      shareNote,
      shareLink,
      " ",
      moneyToggle,
      " · Your rules. ",
      h("a", { onclick: () => actions.openSettings(), text: "Edit" }),
    ),
  );

  let journalKey = "";

  function update() {
    moneyToggle.textContent = State.companion.recapHideMoney ? "($ hidden)" : "($ shown)";
    segToday.classList.toggle("on", !State.journalOpen);
    segJournal.classList.toggle("on", State.journalOpen);
    todayEl.style.display = State.journalOpen ? "none" : "";
    journalEl.style.display = State.journalOpen ? "" : "none";

    const c = State.companion;
    if (State.journalOpen) {
      const k = c.journal.map((e) => `${e.id}${e.note}`).join("|") + c.discipline.unit;
      // Never re-render under an open note editor.
      if (k !== journalKey && !journalEl.querySelector(".note-edit")) {
        journalKey = k;
        renderJournal();
      }
      return;
    }

    const rules = c.discipline;
    const now = Date.now();
    const brk = nextBreakIn(rules, State.lastBreakAt, now);
    session.textContent =
      `Session: ${formatDuration(now - State.sessionStart)}` +
      (brk == null ? " · breaks off" : brk > 0 ? ` · next break in ${formatDuration(brk)}` : " · break time");

    const s = summarize(currentLog(c.log));
    clear(today);
    today.append(
      `Today: ${s.count} trade${s.count === 1 ? "" : "s"} · `,
      h("span", { class: s.total > 0 ? "up" : s.total < 0 ? "down" : "", text: formatPnl(s.total, rules.unit) }),
      ` · ${s.wins}W / ${s.losses}L`,
      rules.maxTradesPerDay > 0 ? ` · max ${rules.maxTradesPerDay}` : "",
    );

    const used = lossLimitUsed(rules, s);
    bar.style.display = rules.dailyLossLimit > 0 ? "" : "none";
    barFill.style.width = `${used * 100}%`;
    barFill.className = used >= 1 ? "full" : used >= 0.7 ? "high" : "";
    barLabel.textContent =
      rules.dailyLossLimit > 0 ? `loss limit: ${formatPnl(-rules.dailyLossLimit, rules.unit)}` : "no daily loss limit";
    unit.textContent = rules.unit;
    undo.disabled = lastTypedTrade(c.log) == null;
    const auto = fromWallet();
    autoLine.style.display = auto && !byHand ? "" : "none";
    logBar.style.display = !auto || byHand ? "" : "none";

    clear(status);
    if (Companion.stoppedToday) {
      status.className = "line status stop";
      status.append("Daily loss limit hit. Time to stop for today.");
    } else if (State.cooldownUntil > now) {
      status.className = "line status cool";
      status.append(`Cooldown: ${formatClock(State.cooldownUntil - now)} `, endCooldown);
    } else {
      status.className = "line status";
    }
  }

  return { el, sync: update, tick: update };
}
