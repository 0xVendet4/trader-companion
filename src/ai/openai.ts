import { Bridge, IS_TAURI } from "../core/bridge";
import { t } from "../core/i18n";
import { buildAnalyzeMessages, buildSummarizeMessages, buildSystemMessage, buildVoiceSystemMessage } from "./prompts";
import type { RdapInfo } from "./rdap";
import { AiError, type AiProvider, type ChatMessage } from "./types";

const MODEL = "gpt-4o-mini";

function mapRustError(err: unknown): AiError {
  const s = String(err);
  if (s === "invalid-key" || s.includes("invalid-key")) return new AiError("invalid-key", t("Invalid API key"));
  if (s === "rate-limit" || s.includes("rate-limit")) return new AiError("rate-limit", t("Rate limit — wait a moment"));
  if (s.includes("status:")) {
    const code = s.split("status:")[1]?.trim() ?? "?";
    return new AiError("generic", t("OpenAI returned an error ({status})", { status: code }));
  }
  if (s.includes("network:")) return new AiError("network", t("Could not reach OpenAI"));
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
    return callCompletions(this.apiKey, [buildSystemMessage(), ...messages]);
  }

  summarize(text: string): Promise<string> {
    return callCompletions(this.apiKey, buildSummarizeMessages(text));
  }

  analyze(url: string, content: string, rdap: RdapInfo | undefined, mx: string[]): Promise<string> {
    return callCompletions(this.apiKey, buildAnalyzeMessages(url, content, rdap, mx));
  }

  /** Short general-purpose reply for voice chat; history keeps multi-turn context. */
  voiceChat(text: string, history: ChatMessage[] = []): Promise<string> {
    return callCompletions(this.apiKey, [buildVoiceSystemMessage(), ...history, { role: "user", content: text }]);
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
