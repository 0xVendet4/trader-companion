// The event card (a fired alert, a wallet move, a discipline reminder or what
// changed while the trader was away) and the launch greeting. Both use the
// whole island, with no header.

import { h, clear } from "./dom";
import { btn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { APP_NAME, MASCOT_NAME } from "../core/brand";
import { formatDuration, formatPnl } from "../core/format";
import { Bridge, IS_TAURI } from "../core/bridge";
import { State, type CompanionEvent } from "../core/state";
import { WHATS_NEW_URL } from "../core/update";
import { TERMINALS } from "../market/links";

function eventCopy(e: CompanionEvent): { eyebrow: string; title: string; detail: string; tone: string } {
  switch (e.kind) {
    case "alert":
      return { eyebrow: "Alert", title: e.title, detail: e.detail, tone: e.tone };
    case "break":
      return {
        eyebrow: "Break",
        title: `${formatDuration(e.minutes * 60_000)} of screen time. How about 5 minutes away from the charts?`,
        detail: "Water, stretch, look out the window. The market will still be there.",
        tone: "calm",
      };
    case "lossLimit":
      return {
        eyebrow: "Discipline",
        title: `Daily loss limit hit (${formatPnl(e.total, e.unit)}).`,
        detail: `You set ${formatPnl(-e.limit, e.unit)} as your limit. Time to stop for today.`,
        tone: "down",
      };
    case "maxTrades":
      return {
        eyebrow: "Discipline",
        title: `${e.count} trades today: the max you set.`,
        detail: "Overtrading gets expensive. Worth a review before the next one.",
        tone: "warn",
      };
    case "cooldown":
      return {
        eyebrow: "Cooldown",
        title: `Loss logged. Breathe: ${e.minutes} min before the next trade.`,
        detail: "Revenge trades are the most expensive losses.",
        tone: "calm",
      };
    case "away":
      return { eyebrow: "Welcome back", title: `While you were away (${e.away}):`, detail: e.lines.join("\n"), tone: "calm" };
    case "update":
      return {
        eyebrow: "Update",
        title: `${APP_NAME} ${e.version} is out (you have ${State.version}).`,
        detail:
          IS_TAURI && State.os === "windows"
            ? "Update now: it downloads the new code from GitHub, builds it on this PC (about a minute) and starts again. Your settings stay."
            : "To update: in the Candy folder, get the new code (git pull, or a new ZIP), then run npm ci and npm run setup. Your settings stay.",
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
  const el = h("div", { class: "view event" }, eyebrow, title, detail, h("div", { class: "event-foot" }, buttons, more));
  let shown = "";

  return {
    el,
    sync() {
      const e = State.events[0];
      if (!e) return;
      const pending = State.events.length - 1;
      more.textContent = pending > 0 ? `+${pending} more` : "";
      if (shown === e.id) return;
      shown = e.id;
      const copy = eventCopy(e);
      el.dataset.tone = copy.tone;
      eyebrow.textContent = copy.eyebrow;
      title.textContent = copy.title;
      detail.textContent = copy.detail;
      clear(buttons);
      switch (e.kind) {
        case "alert": {
          const label = TERMINALS[State.companion.terminal]?.label ?? "GMGN";
          buttons.append(
            btn(`Open on ${label}`, "primary", () => {
              actions.openToken(e.address, e.token);
              actions.dismissEvent();
            }),
            btn("OK", "secondary", () => actions.dismissEvent()),
          );
          break;
        }
        case "break":
          buttons.append(
            btn("Took a break", "primary", () => {
              Companion.ackBreak();
              actions.dismissEvent();
            }),
            btn("15 more min", "secondary", () => {
              Companion.snoozeBreak(15);
              actions.dismissEvent();
            }),
          );
          break;
        case "update": {
          const whatsNew = btn("What's new", "secondary", () => actions.openUrl(WHATS_NEW_URL));
          if (IS_TAURI && State.os === "windows") {
            const go = btn("Update now", "primary", async () => {
              go.disabled = true;
              detail.textContent = "Downloading the new code…";
              const failed = await Bridge.startUpdate();
              if (failed) {
                go.disabled = false;
                detail.textContent = `The update didn't start: ${failed}`;
                return;
              }
              detail.textContent = "Building in its own window: Candy starts again when it's done.";
            });
            buttons.append(go, whatsNew, btn("Later", "secondary", () => actions.dismissEvent()));
          } else {
            buttons.append(whatsNew, btn("OK", "primary", () => actions.dismissEvent()));
          }
          break;
        }
        default:
          buttons.append(btn("Got it", "primary", () => actions.dismissEvent()));
      }
    },
  };
}

// ── Greeting ──────────────────────────────────────────────────────────────────

export function buildGreeting(): ViewHost {
  const el = h(
    "div",
    { class: "view greeting" },
    h("div", { class: "title", text: `Hi! I'm ${MASCOT_NAME}.` }),
    h(
      "div",
      { class: "detail", text: "I live up here and keep an eye on your memecoins. Hover here to open me." },
    ),
    h("div", { class: "fine", text: `${APP_NAME} only reads public data. It never asks for your wallet or private key.` }),
  );
  return { el, sync() {} };
}

