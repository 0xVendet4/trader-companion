// The event card (a fired alert, a wallet move, a discipline reminder or what
// changed while the trader was away) and the launch greeting. Both use the
// whole island, with no header.

import { h, clear, svg } from "./dom";
import { ICONS } from "./icons";
import { btn, type CandyAct, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { APP_NAME, MASCOT_NAME } from "../core/brand";
import { formatDuration, formatPct, formatPnl, pctClass } from "../core/format";
import { Bridge, IS_TAURI } from "../core/bridge";
import { t, tn } from "../core/i18n";
import { State, type CompanionEvent, type TradePlan } from "../core/state";
import { WHATS_NEW_URL } from "../core/update";
import { TERMINALS } from "../market/links";
import { headsUpTitle } from "../market/calendar";
import { RUGCHECK_WAIT_MS, checklistFor, checklistSummary, stopWaiting, type CheckItem, type CheckSummary } from "../market/checklist";
import type { AwayMove } from "../away/away";
import type { CardFormat } from "../share/card";
import { buildWeekRecap } from "../share/recap";
import type { MascotState } from "../mascot/mascot";

/** Candy going over a checklist card (see buildEvent). */
interface Pass {
  id: string;
  key: string;
  lines: { row: HTMLElement; mark: HTMLElement; detail: HTMLElement }[];
  /** Lines read out so far. */
  done: number;
  /** His eyes are on the next one. */
  looking: boolean;
  /** Since when he has waited on RugCheck for that line. */
  waitSince: number | null;
  /** He stopped waiting: what RugCheck would say reads as unknown. */
  gaveUp: boolean;
  finished: boolean;
  /** The card went out of sight mid-way. */
  paused: boolean;
  timer: number | null;
}

/** The card opens and he settles in, then each line: eyes on it, its mark, a beat before the next. */
const PASS_START_MS = 900;
const PASS_LOOK_MS = 450;
const PASS_NEXT_MS = 350;
const PASS_NEXT_LONG_MS = 800;
const CHECK_MARK: Record<CheckItem["state"], string> = { ok: "✓", warn: "!", unknown: "?" };
/** How he takes each line: a check off his head, a drop of sweat, a puzzled face (until the next line). */
const CHECK_REACTION: Record<CheckItem["state"], CandyAct> = {
  ok: { emit: "check", hop: true, sound: "blip" },
  warn: { react: "nervous", ms: 1200, sound: "hmm" },
  unknown: { react: "confused", ms: 1200 },
};
const SUMMARY_FACE: Record<CheckSummary["tone"], MascotState> = { ok: "proud", warn: "worried", unknown: "confused" };

function eventCopy(e: CompanionEvent): { eyebrow: string; title: string; detail: string; tone: string } {
  switch (e.kind) {
    case "alert":
      return { eyebrow: t("Alert"), title: e.title, detail: e.detail, tone: e.tone };
    case "break":
      return {
        eyebrow: t("Break"),
        title: t("{duration} of screen time. How about 5 minutes away from the charts?", { duration: formatDuration(e.minutes * 60_000) }),
        detail: t("Water, stretch, look out the window. The market will still be there."),
        tone: "calm",
      };
    case "lossLimit":
      return {
        eyebrow: t("Discipline"),
        title: t("Daily loss limit hit ({pnl}).", { pnl: formatPnl(e.total, e.unit) }),
        detail: t("You set {limit} as your limit. Time to stop for today.", { limit: formatPnl(-e.limit, e.unit) }),
        tone: "down",
      };
    case "maxTrades":
      return {
        eyebrow: t("Discipline"),
        title: tn(e.count, "{n} trades today: the max you set.", "{n} trades today: the max you set."),
        detail: t("Overtrading gets expensive. Worth a review before the next one."),
        tone: "warn",
      };
    case "cooldown":
      return {
        eyebrow: t("Cooldown"),
        title: t("Loss logged. Breathe: {minutes} min before the next trade.", { minutes: e.minutes }),
        detail: t("Revenge trades are the most expensive losses."),
        tone: "calm",
      };
    case "tilt":
      return {
        eyebrow: t("Tilt check"),
        title: tn(
          e.losses,
          "{n} losses in a row. Time for a longer break: {minutes} min.",
          "{n} losses in a row. Time for a longer break: {minutes} min.",
          { minutes: e.minutes },
        ),
        detail: t("Streaks feed on themselves. Step away, come back with a clear head."),
        tone: "warn",
      };
    case "sessionEnd":
      return {
        eyebrow: t("Session"),
        title: t("The {duration} session you set is over.", { duration: formatDuration(e.minutes * 60_000) }),
        detail: t("That was the plan. Log off, or set a new end in Discipline."),
        tone: "calm",
      };
    case "checklist": {
      const symbol = State.token(e.key)?.symbol;
      return {
        eyebrow: t("Checklist"),
        title: symbol != null ? t("Before an entry on {symbol}", { symbol }) : t("Before an entry on this token"),
        detail: "",
        tone: "calm",
      };
    }
    case "checkin":
      return {
        eyebrow: t("Check-in"),
        title: e.symbol
          ? t("Closed {symbol} at {pnl}. Did you follow your plan?", { symbol: e.symbol, pnl: formatPnl(e.pnl, e.unit) })
          : t("Closed a trade at {pnl}. Did you follow your plan?", { pnl: formatPnl(e.pnl, e.unit) }),
        detail: t("Your answer goes into the journal, next to the trade."),
        tone: e.pnl >= 0 ? "up" : "down",
      };
    case "weekRecap": {
      const c = State.companion;
      const r = buildWeekRecap({ range: e, hideMoney: c.recapHideMoney, unit: c.discipline.unit, trades: c.journal }, "");
      return {
        eyebrow: e.period === "month" ? t("Your month · {label}", { label: e.label }) : t("Your week · {label}", { label: e.label }),
        title: r.headline,
        detail: r.tiles
          .slice(0, 3)
          .map((tile) => `${tile.label}: ${tile.value}${tile.sub ? ` (${tile.sub})` : ""}`)
          .join("\n"),
        tone: r.total > 0 ? "up" : r.total < 0 ? "down" : "calm",
      };
    }
    case "away":
      return {
        eyebrow: t("Welcome back"),
        title: t("While you were away ({away}):", { away: e.away }),
        detail: e.lines.join("\n"),
        tone: "calm",
      };
    case "macro":
      return {
        eyebrow: t("Calendar"),
        title: headsUpTitle(e.label, e.at - Date.now()),
        detail: [...e.lines, t("The whole market often moves around it.")].join("\n"),
        tone: "warn",
      };
    case "update":
      return {
        eyebrow: t("Update"),
        title: t("{app} {version} is out (you have {current}).", { app: APP_NAME, version: e.version, current: State.version }),
        detail:
          IS_TAURI && State.os === "windows"
            ? t("Update now: it downloads the new code from GitHub, builds it on this PC (about a minute) and starts again. Your settings stay.")
            : t("To update: in the Candy folder, get the new code (git pull, or a new ZIP), then run npm ci and npm run setup. Your settings stay."),
        tone: "calm",
      };
  }
}

export function buildEvent(actions: ViewActions): ViewHost {
  const eyebrow = h("div", { class: "eyebrow" });
  const title = h("div", { class: "title" });
  const detail = h("div", { class: "detail" });
  const more = h("span", { class: "more" });
  const buttons = h("div", { class: "buttons" });
  // ⌃ folds the card away for later; opening the island shows it again.
  const fold = h("button", { class: "event-fold", title: t("Later: fold it into the ticker"), onclick: () => actions.foldEvent() }, svg(ICONS.chevronUp, 12, { stroke: 2.2 }));
  // What some cards add under the words: the checklist's lines, the tokens
  // that moved while the trader was away.
  const extra = h("div", { class: "event-extra" });
  const el = h("div", { class: "view event" }, fold, eyebrow, title, detail, extra, h("div", { class: "event-foot" }, buttons, more));
  let shown = "";

  // ── The checklist, gone over by Candy ──
  // He reads the lines out one at a time: his eyes go to the line, then its
  // mark comes up with a reaction (a check off his head, a drop of sweat, a
  // puzzled face). He waits on RugCheck while it loads, and sums it all up.
  let pass: Pass | null = null;

  function checkItems(p: Pass): CheckItem[] {
    const t = State.token(p.key);
    // RugCheck covers Solana only; elsewhere there is no report to wait for.
    const safety = t?.chainId === "solana" ? State.safety[p.key] : null;
    const report = safety === "loading" ? undefined : safety === "error" ? null : safety;
    const items = checklistFor(State.quotes[p.key], report);
    return p.gaveUp ? stopWaiting(items) : items;
  }

  const onScreen = (p: Pass) => State.mode === "expanded" && State.view === "event" && State.events[0]?.id === p.id;

  function later(p: Pass, ms: number) {
    if (p.timer != null) window.clearTimeout(p.timer);
    p.timer = window.setTimeout(() => stepPass(p), ms);
  }

  function startPass(id: string, key: string) {
    stopPass();
    const p: Pass = { id, key, lines: [], done: 0, looking: false, waitSince: null, gaveUp: false, finished: false, paused: false, timer: null };
    pass = p;
    // The card stays up until he is done.
    actions.holdOpen(true);
    clear(extra);
    extra.className = "event-extra checklist";
    for (const item of checkItems(p)) {
      const line = { row: h("div", { class: "check-line todo" }), mark: h("span", { class: "check-state" }), detail: h("span", { class: "check-detail" }) };
      line.row.append(h("span", { class: "check-label", text: item.label }), line.mark, line.detail);
      p.lines.push(line);
      extra.append(line.row);
    }
    detail.textContent = t("{name} is going over it…", { name: MASCOT_NAME });
    paintPass(p);
    later(p, PASS_START_MS);
  }

  function stopPass() {
    const p = pass;
    if (!p) return;
    pass = null;
    if (p.timer != null) window.clearTimeout(p.timer);
    if (!p.finished && !p.paused) actions.holdOpen(false);
    actions.candy(p.waitSince != null ? { look: null, say: null } : { look: null });
  }

  /** Every line as far as he has got: read out, being read, or still to come. */
  function paintPass(p: Pass) {
    const items = checkItems(p);
    items.forEach((item, i) => {
      const line = p.lines[i];
      if (!line) return;
      const read = i < p.done;
      const state = read ? item.state : i === p.done && p.looking ? "looking" : "todo";
      line.row.classList.remove("ok", "warn", "unknown", "looking", "todo");
      line.row.classList.add(state);
      line.row.title = read ? item.detail : "";
      line.mark.textContent = read ? CHECK_MARK[item.state] : "";
      line.detail.textContent = read ? item.detail : state === "looking" && p.waitSince != null ? t("Asking RugCheck…") : "";
    });
    if (!p.finished) return;
    const s = checklistSummary(items, MASCOT_NAME);
    detail.textContent = s.line;
    el.dataset.tone = s.tone === "warn" ? "warn" : "calm";
  }

  function stepPass(p: Pass) {
    p.timer = null;
    if (pass !== p || p.finished) return;
    // Folded into the ticker, or a tab opened over it: he carries on when it is back (see sync).
    if (!onScreen(p)) {
      p.paused = true;
      actions.holdOpen(false);
      return;
    }
    const line = p.lines[p.done];
    if (!p.looking) {
      p.looking = true;
      paintPass(p);
      // Focused the whole way through: no idle humming or yawning mid-check.
      actions.candy({ look: line.row, react: "focused", ms: 4000 });
      return later(p, PASS_LOOK_MS);
    }
    if (checkItems(p)[p.done].waiting) {
      const now = Date.now();
      if (p.waitSince == null) {
        p.waitSince = now;
        paintPass(p);
        actions.candy({ react: "focused", say: t("asking RugCheck…"), ms: RUGCHECK_WAIT_MS });
      }
      // sync() comes back sooner if the report comes in.
      if (now - p.waitSince < RUGCHECK_WAIT_MS) return later(p, p.waitSince + RUGCHECK_WAIT_MS - now);
      p.gaveUp = true;
    }
    const item = checkItems(p)[p.done];
    if (p.waitSince != null) {
      p.waitSince = null;
      actions.candy({ say: null });
    }
    p.looking = false;
    p.done++;
    if (p.done === p.lines.length) p.finished = true;
    paintPass(p);
    line.row.classList.add("pop");
    actions.candy(CHECK_REACTION[item.state]);
    // A line worth a look gets a longer beat: the sweat or the puzzled face plays out.
    if (!p.finished) return later(p, item.state === "ok" ? PASS_NEXT_MS : PASS_NEXT_LONG_MS);
    const s = checklistSummary(checkItems(p), MASCOT_NAME);
    window.setTimeout(() => {
      if (pass !== p) return;
      actions.candy({ look: null, say: s.say, react: SUMMARY_FACE[s.tone], ms: 3200 });
      // Done: the card folds as any other would.
      actions.holdOpen(false);
    }, 420);
  }

  function renderMoves(moves: AwayMove[]) {
    clear(extra);
    extra.className = "event-extra moves";
    if (!moves.length) return;
    extra.append(h("span", { class: "moves-label", text: t("Moves:") }));
    for (const m of moves) {
      extra.append(
        h(
          "button",
          {
            class: `move-chip ${pctClass(m.pct)}`,
            type: "button",
            title: t("Open {symbol}", { symbol: m.symbol }),
            onclick: () => actions.openToken(m.key),
          },
          h("b", { text: m.symbol }),
          ` ${formatPct(m.pct)}`,
        ),
      );
    }
  }

  return {
    el,
    sync() {
      const e = State.events[0];
      if (!e) return;
      const pending = State.events.length - 1;
      more.textContent = pending > 0 ? tn(pending, "+{n} more", "+{n} more") : "";
      if (shown === e.id) {
        const p = pass;
        if (e.kind === "checklist" && p?.id === e.id) {
          // Back in sight: he picks up where he was. RugCheck answered while he
          // waited on it: on to that line now. The lines follow its report.
          if (p.paused) {
            p.paused = false;
            actions.holdOpen(true);
            later(p, 300);
          } else if (p.waitSince != null && !checkItems(p)[p.done]?.waiting) later(p, 250);
          paintPass(p);
        }
        return;
      }
      shown = e.id;
      if (e.kind !== "checklist") stopPass();
      const copy = eventCopy(e);
      el.dataset.tone = copy.tone;
      el.dataset.kind = e.kind;
      eyebrow.textContent = copy.eyebrow;
      title.textContent = copy.title;
      detail.textContent = copy.detail;
      clear(extra);
      extra.className = "event-extra";
      clear(buttons);
      const terminal = TERMINALS[State.companion.terminal]?.label ?? "GMGN";
      switch (e.kind) {
        case "alert": {
          const watched = !!State.token(e.address);
          const x2 = btn(t("2x alert"), "secondary", () => {
            const msg = Companion.addMultipleAlert(e.address, 2);
            actions.blip();
            x2.replaceWith(h("span", { class: "done-note", text: msg ?? t("No price yet") }));
          });
          x2.title = t("An alert at twice the market cap");
          const mute = btn(t("Mute 1 h"), "secondary", () => {
            Companion.muteToken(e.address, 60);
            actions.dismissEvent();
          });
          mute.title = t("No alerts for this token for an hour");
          buttons.append(
            btn(t("Open on {terminal}", { terminal }), "primary", () => {
              actions.openToken(e.address, e.token);
              actions.dismissEvent();
            }),
            ...(watched ? [x2] : []),
            mute,
            btn(t("OK"), "secondary", () => actions.dismissEvent()),
          );
          break;
        }
        case "checklist":
          startPass(e.id, e.key);
          buttons.append(
            btn(t("Done"), "primary", () => {
              stopPass();
              actions.dismissEvent();
            }),
            btn(t("Open on {terminal}", { terminal }), "secondary", () => actions.openToken(e.key)),
          );
          break;
        case "checkin": {
          const answer = (plan: TradePlan, label: string, kind: "primary" | "secondary") =>
            btn(label, kind, () => {
              Companion.setPlan(e.entryId, plan);
              actions.dismissEvent();
            });
          buttons.append(
            answer("yes", t("Yes"), "primary"),
            answer("partly", t("Partly"), "secondary"),
            answer("no", t("No"), "secondary"),
            btn(t("Skip"), "ghost", () => actions.dismissEvent()),
          );
          break;
        }
        case "weekRecap": {
          const share = (format: CardFormat, label: string) => {
            const b = btn(label, format === "story" ? "primary" : "secondary", async () => {
              b.disabled = true;
              detail.textContent = t("Drawing…");
              try {
                detail.textContent = await actions.shareWeek(e, format);
                actions.blip();
              } catch (err) {
                detail.textContent = t("Couldn't make the image: {error}", { error: err instanceof Error ? err.message : String(err) });
              } finally {
                b.disabled = false;
              }
            });
            return b;
          };
          buttons.append(share("story", t("Share as a story")), share("wide", t("Wide image")), btn(t("Got it"), "secondary", () => actions.dismissEvent()));
          break;
        }
        case "away":
          renderMoves(e.moves ?? []);
          buttons.append(btn(t("Got it"), "primary", () => actions.dismissEvent()));
          break;
        case "break":
          buttons.append(
            btn(t("Took a break"), "primary", () => {
              Companion.ackBreak();
              actions.dismissEvent();
            }),
            btn(t("15 more min"), "secondary", () => {
              Companion.snoozeBreak(15);
              actions.dismissEvent();
            }),
          );
          break;
        case "update": {
          const whatsNew = btn(t("What's new"), "secondary", () => actions.openUrl(WHATS_NEW_URL));
          if (IS_TAURI && State.os === "windows") {
            const go = btn(t("Update now"), "primary", async () => {
              go.disabled = true;
              detail.textContent = t("Downloading the new code…");
              const failed = await Bridge.startUpdate();
              if (failed) {
                go.disabled = false;
                detail.textContent = t("The update didn't start: {error}", { error: failed });
                return;
              }
              detail.textContent = t("Building in its own window: Candy starts again when it's done.");
            });
            buttons.append(go, whatsNew, btn(t("Later"), "secondary", () => actions.dismissEvent()));
          } else {
            buttons.append(whatsNew, btn(t("OK"), "primary", () => actions.dismissEvent()));
          }
          break;
        }
        default:
          buttons.append(btn(t("Got it"), "primary", () => actions.dismissEvent()));
      }
    },
  };
}

// ── Greeting ──────────────────────────────────────────────────────────────────

export function buildGreeting(): ViewHost {
  // By first name when the OS account has a real one (src-tauri/src/identity.rs).
  const title = h("div", { class: "title" });
  const el = h(
    "div",
    { class: "view greeting" },
    title,
    h(
      "div",
      { class: "detail", text: t("I live up here and keep an eye on your memecoins. Hover here to open me.") },
    ),
    h("div", { class: "fine", text: t("{app} only reads public data. It never asks for your wallet or private key.", { app: APP_NAME }) }),
  );
  return {
    el,
    sync() {
      title.textContent = State.firstName
        ? t("Hi {name}! I'm {mascot}.", { name: State.firstName, mascot: MASCOT_NAME })
        : t("Hi! I'm {mascot}.", { mascot: MASCOT_NAME });
    },
  };
}

