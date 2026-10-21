import { Bridge, IS_TAURI } from "../core/bridge";
import { currentLang, t, type Lang } from "../core/i18n";
import { blobToBase64, extFor } from "../voice/recorder";
import { buildAnalyzeMessages, buildSummarizeMessages, buildSystemMessage, buildVoiceSystemMessage } from "./prompts";
import type { RdapInfo } from "./rdap";
import { AiError, type AiProvider, type ChatMessage } from "./types";

const MODEL = "gpt-4o-mini";
/** The model that writes a voice recording down (OpenAI's transcription endpoint). */
export const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

function mapRustError(err: unknown): AiError {
  const s = String(err);
  if (s === "invalid-key" || s.includes("invalid-key")) return new AiError("invalid-key", t("Invalid API key"));
  if (s === "rate-limit" || s.includes("rate-limit")) return new AiError("rate-limit", t("Rate limit — wait a moment"));
  if (s.includes("status:")) {
    const code = s.split("status:")[1]?.trim() ?? "?";
    return new AiError("generic", t("OpenAI returned an error ({status})", { status: code }));
  }
  if (s.includes("network:")) return new AiError("network", t("Could not reach OpenAI"));
  if (s.includes("bad-audio")) return new AiError("generic", t("Could not transcribe speech"));
  console.warn("[AI] unmapped Rust error:", s);
  return new AiError("network", t("Could not reach OpenAI"));
}

async function callCompletions(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const body = JSON.stringify({ model: MODEL, messages });

  // In the Tauri app the call goes through Rust to bypass the webview's CSP.
  if (IS_TAURI) {
    let raw: string;
    try {
      raw = await Bridge.openaiChat(apiKey, body);
    } catch (err) {
      throw mapRustError(String(err));
    }
    const json = (JSON.parse(raw) as { choices?: { message?: { content?: string } }[] } | null);
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new AiError("generic", t("OpenAI returned an error ({status})", { status: "?" }));
    return content.trim();
  }

  // Browser dev mode: use the Vite proxy (/api/openai → api.openai.com).
  let res: Response;
  try {
    res = await fetch("/api/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body,
    });
  } catch {
    throw new AiError("network", t("Could not reach OpenAI"));
  }
  if (res.status === 401) throw new AiError("invalid-key", t("Invalid API key"));
  if (res.status === 429) throw new AiError("rate-limit", t("Rate limit — wait a moment"));
  if (!res.ok) throw new AiError("generic", t("OpenAI returned an error ({status})", { status: res.status }));
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new AiError("generic", t("OpenAI returned an error ({status})", { status: res.status }));
  return content.trim();
}

export class OpenAiProvider implements AiProvider {
  constructor(private readonly apiKey: string) {}

  sendMessage(messages: ChatMessage[]): Promise<string> {
    return callCompletions(this.apiKey, [buildSystemMessage(currentLang()), ...messages]);
  }

  summarize(text: string): Promise<string> {
    return callCompletions(this.apiKey, buildSummarizeMessages(text, currentLang()));
  }

  analyze(url: string, content: string, rdap: RdapInfo | undefined, mx: string[]): Promise<string> {
    return callCompletions(this.apiKey, buildAnalyzeMessages(url, content, rdap, mx, currentLang()));
  }

  /** Short general-purpose reply for voice chat; history keeps multi-turn context. */
  voiceChat(text: string, history: ChatMessage[] = []): Promise<string> {
    return callCompletions(this.apiKey, [buildVoiceSystemMessage(currentLang()), ...history, { role: "user", content: text }]);
  }

  /** What a voice recording (src/voice/recorder.ts) says, in `lang`. */
  async transcribe(audio: Blob, mime: string, lang: Lang): Promise<string> {
    // In the Tauri app the upload goes through Rust, like the chat.
    if (IS_TAURI) {
      const b64 = await blobToBase64(audio);
      try {
        return (await Bridge.openaiTranscribe(this.apiKey, b64, mime, lang)).trim();
      } catch (err) {
        throw mapRustError(String(err));
      }
    }

    // Browser dev mode: the Vite proxy.
    const form = new FormData();
    form.append("model", TRANSCRIBE_MODEL);
    form.append("language", lang);
    form.append("file", audio, `speech.${extFor(mime)}`);
    let res: Response;
    try {
      res = await fetch("/api/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}` }, body: form });
    } catch {
      throw new AiError("network", t("Could not reach OpenAI"));
    }
    if (res.status === 401) throw new AiError("invalid-key", t("Invalid API key"));
    if (res.status === 429) throw new AiError("rate-limit", t("Rate limit — wait a moment"));
    if (!res.ok) throw new AiError("generic", t("OpenAI returned an error ({status})", { status: res.status }));
    const json = (await res.json().catch(() => null)) as { text?: string } | null;
    if (typeof json?.text !== "string") throw new AiError("generic", t("Could not transcribe speech"));
    return json.text.trim();
  }
}

/**
 * Validate an API key with a lightweight call (list models).
 * Returns null on success, or a user-facing error string.
 */
export async function validateOpenAiKey(apiKey: string): Promise<string | null> {
  if (!apiKey.trim()) return t("No API key");
  const url = IS_TAURI ? "https://api.openai.com/v1/models" : "/api/openai/v1/models";
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch {
    return null; // network error — don't block saving
  }
  if (res.status === 401) return t("Invalid API key");
  return null;
}
