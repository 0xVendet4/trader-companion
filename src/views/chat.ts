import { h } from "./dom";
import { btn, type ViewActions, type ViewHost } from "./shared";
import { t } from "../core/i18n";
import { State } from "../core/state";
import type { ChatMessage } from "../ai/types";
import { OpenAiProvider } from "../ai/openai";
import { clearChat, registerChatChannel, registerClearHandler, type ChannelMsg } from "../ai/chat-channel";

/**
 * Invisible height-spacer: keeps the island expanding to viewHeight("chat")
 * when chat is the active tab. The real UI lives in buildChatOverlay below.
 */
export function buildChat(_actions: ViewActions): ViewHost {
  const el = h("div", { class: "view chat" });
  return { el, sync() {} };
}

/**
 * Floating chat panel — mounted inside #island, outside #island-clip, so it
 * paints beside the mascot instead of inside the clipped content area.
 * Shown while the open island is on the Chat tab and no panel (Settings, the
 * Closet) is over the content: those live inside the clip, under this one.
 */
export function buildChatOverlay(actions: ViewActions): { el: HTMLElement; sync(panelOpen: boolean): void } {
  const messages: ChatMessage[] = [];
  let loading = false;

  // ── message list ─────────────────────────────────────────────────────────
  const list = h("div", { class: "chat-ol-list" });

  // Declared early so appendMsg can reference it.
  const clearBtn = btn(t("New conversation"), "ghost", () => clearChat());
  clearBtn.className += " chat-ol-clear";
  clearBtn.style.display = "none";

  function appendMsg(msg: { role: string; content: string; id?: string }) {
    const el = h("div", { class: `chat-msg ${msg.role}`, text: msg.content });
    if (msg.id) el.dataset.id = msg.id;
    list.append(el);
    list.scrollTop = list.scrollHeight;
    clearBtn.style.display = "";
  }

  function upsertMsg(msg: ChannelMsg) {
    if (msg.id) {
      const existing = list.querySelector(`[data-id="${msg.id}"]`);
      if (existing) {
        existing.textContent = msg.content;
        list.scrollTop = list.scrollHeight;
        return;
      }
    }
    // Also track in messages array for context.
    messages.push({ role: msg.role, content: msg.content });
    appendMsg(msg);
  }

  // ── error ─────────────────────────────────────────────────────────────────
  const errorEl = h("div", { class: "chat-ol-error" });

  // ── input + send ──────────────────────────────────────────────────────────
  const input = document.createElement("textarea");
  input.className = "chat-ol-input";
  input.placeholder = t("Ask Candy…");
  input.rows = 2;
  input.spellcheck = false;
  input.addEventListener("mousedown", () => {
    actions.focusInput(true);
    window.setTimeout(() => input.focus(), 30);
  });
  input.addEventListener("blur", () => actions.focusInput(false));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { input.blur(); return; }
    // Let global number-key shortcuts pass through.
    if (e.ctrlKey && !e.altKey && (/^Digit[1-9]$/.test(e.code) || e.code === "Comma")) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); return; }
    e.stopPropagation();
  });

  const sendBtn = btn(t("Send"), "primary", () => { void send(); });

  function setLoading(on: boolean) {
    loading = on;
    input.disabled = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? t("Candy is thinking…") : t("Send");
  }

  async function send() {
    const text = input.value.trim();
    if (!text || loading) return;
    const key = State.settings.companion.openaiKey;
    if (!key) return;
    errorEl.textContent = "";
    const userMsg: ChatMessage = { role: "user", content: text };
    messages.push(userMsg);
    appendMsg(userMsg);
    input.value = "";
    setLoading(true);
    actions.candy({ react: "focused", ms: 30_000 });
    try {
      const reply = await new OpenAiProvider(key).sendMessage(messages);
      const aMsg: ChatMessage = { role: "assistant", content: reply };
      messages.push(aMsg);
      appendMsg(aMsg);
      actions.candy({ react: "happy", ms: 2000 });
    } catch (e) {
      errorEl.textContent = e instanceof Error ? e.message : String(e);
      actions.candy({ react: "worried", ms: 3000 });
    } finally {
      setLoading(false);
    }
  }

  // ── external message injection (site analysis results, etc.) ───────────
  registerChatChannel((msgs, openChat) => {
    if (openChat) actions.setView("chat");
    for (const msg of msgs) upsertMsg(msg);
  });

  // ── clear / new conversation ──────────────────────────────────────────────
  registerClearHandler(() => {
    messages.length = 0;
    list.innerHTML = "";
    errorEl.textContent = "";
    clearBtn.style.display = "none";
  });

  // ── no-key card ───────────────────────────────────────────────────────────
  const noKey = h(
    "div",
    { class: "chat-ol-nokey" },
    h("p", { text: t("No API key — add one in Settings → AI") }),
    btn(t("Settings"), "primary", () => actions.openSettings()),
  );

  // ── chat body (list + error + input row) ──────────────────────────────────
  const chatBody = h(
    "div",
    { class: "chat-ol-body" },
    list,
    errorEl,
    h("div", { class: "chat-ol-foot" }, clearBtn, input, sendBtn),
  );

  // ── root element (positioned outside #island-clip in island.ts) ───────────
  const el = h("div", { id: "chat-overlay" }, noKey, chatBody);

  let lastHasKey: boolean | null = null;
  let lastShow = false;

  return {
    el,
    sync(panelOpen: boolean) {
      const show = State.view === "chat" && State.mode === "expanded" && !panelOpen;
      el.classList.toggle("chat-visible", show);

      const hasKey = !!State.settings.companion.openaiKey;
      if (hasKey !== lastHasKey) {
        lastHasKey = hasKey;
        noKey.style.display = hasKey ? "none" : "";
        chatBody.style.display = hasKey ? "" : "none";
      }
      // Auto-focus only on the first frame the panel opens.
      if (show && !lastShow && hasKey) window.setTimeout(() => input.focus(), 280);
      lastShow = show;
    },
  };
}
