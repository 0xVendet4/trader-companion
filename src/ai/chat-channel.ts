// Thin pub/sub channel: companion.ts pushes analysis results here;
// buildChatOverlay() registers the handler that injects them into the UI.
// Both sides import from this file — no circular deps between view and logic.

export interface ChannelMsg {
  role: "user" | "assistant";
  content: string;
  /** When set, an existing message with the same id is updated in place. */
  id?: string;
}

type Handler = (msgs: ChannelMsg[], openChat?: boolean) => void;

let _handler: Handler | null = null;
const _clearHandlers: (() => void)[] = [];

export function registerChatChannel(fn: Handler) {
  _handler = fn;
}

/** Push messages into the chat overlay (and optionally switch to the chat tab). */
export function pushChatMessages(msgs: ChannelMsg[], openChat = false) {
  _handler?.(msgs, openChat);
}

/** Register a callback that fires when clearChat() is called. */
export function registerClearHandler(fn: () => void) {
  _clearHandlers.push(fn);
}

/** Clear all conversation history — notifies every registered handler. */
export function clearChat() {
  _clearHandlers.forEach(fn => fn());
}
