import { t } from "../core/i18n";
import { State } from "../core/state";
import { OpenAiProvider } from "../ai/openai";
import { AiError, type ChatMessage } from "../ai/types";
import { pushChatMessages, registerClearHandler } from "../ai/chat-channel";
import type { VoiceState } from "./types";

export interface VoiceChatHost {
  react(state: string, ms: number): void;
  say(text: string | null, ms: number): void;
  /** Called when the mascot is on the desktop: also push the bubble there. */
  desktopSay?(text: string, ms: number): void;
}

/** Keep at most this many user+assistant pairs in voice context. */
const MAX_HISTORY_PAIRS = 8;

export class VoiceChat {
  private _state: VoiceState = "idle";
  private history: ChatMessage[] = [];

  get state() { return this._state; }

  constructor(private host: VoiceChatHost) {
    registerClearHandler(() => { this.history = []; });
  }

  toggle(start: () => Promise<string | null>, stop: () => void) {
    if (this._state === "idle") {
      void this.beginListening(start);
    } else if (this._state === "listening") {
      stop();
    }
    // "processing" → ignore second press
  }

  private bubble(text: string, ms: number) {
    this.host.say(text, ms);
    this.host.desktopSay?.(text, ms);
  }

  private async beginListening(start: () => Promise<string | null>) {
    const key = State.settings.companion.openaiKey;
    if (!key) {
      this.bubble(t("Set up your OpenAI key in Settings to use voice chat"), 5000);
      this.host.react("worried", 3000);
      return;
    }

    this._state = "listening";
    this.host.react("focused", 60_000);
    this.bubble(t("Listening…"), 60_000);

    const err = await start();
    if (err) {
      this._state = "idle";
      this.bubble(this.startErrMsg(err), 5000);
      this.host.react("worried", 3000);
    }
  }

  async onTranscript(text: string) {
    this._state = "processing";
    this.host.react("focused", 30_000);
    this.bubble(t("Thinking…"), 30_000);

    const key = State.settings.companion.openaiKey;
    if (!key) {
      this._state = "idle";
      this.bubble(t("Set up your OpenAI key in Settings to use voice chat"), 5000);
      return;
    }

    try {
      const provider = new OpenAiProvider(key);
      const reply = await provider.voiceChat(text, [...this.history]);
      this._state = "idle";

      // Persist to context (trim to avoid growing unbounded).
      this.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
      if (this.history.length > MAX_HISTORY_PAIRS * 2) {
        this.history.splice(0, this.history.length - MAX_HISTORY_PAIRS * 2);
      }

      const words = reply.trim().split(/\s+/).length;
      const ms = Math.min(Math.max(words * 420, 4000), 12_000);
      this.host.react("happy", Math.min(ms, 4000));
      this.bubble(reply, ms);
      pushChatMessages([
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ], false);
    } catch (err) {
      this._state = "idle";
      const msg = err instanceof AiError ? err.message : t("Could not reach OpenAI");
      this.host.react("worried", 3000);
      this.bubble(msg, 4500);
    }
  }

  onError(err: string) {
    this._state = "idle";
    this.bubble(this.transcriptErrMsg(err), 4000);
    this.host.react("worried", 2500);
  }

  private startErrMsg(err: string): string {
    if (err.includes("permission") || err.includes("denied") || err.includes("restricted")) {
      return t("Microphone permission denied — allow it in System Settings → Privacy");
    }
    if (err.includes("unavailable") || err.includes("not-available")) {
      return t("Voice chat is not available on this platform");
    }
    return t("Could not start the microphone");
  }

  private transcriptErrMsg(err: string): string {
    if (err.includes("no-speech") || err.includes("empty")) return t("I didn't catch that — try again");
    if (err.includes("permission") || err.includes("denied")) {
      return t("Microphone permission denied — allow it in System Settings → Privacy");
    }
    return t("Could not transcribe speech");
  }
}
