// The prompts behind the Chat tab, the voice chat and the site analysis: pure
// functions of their inputs, written in English and each asking for the answer
// in Candy's language, so a trader in Tokyo and one in São Paulo get their own.

import { LANGS, type Lang } from "../core/i18n";
import type { RdapInfo } from "./rdap";
import { countryName } from "./rdap";
import type { ChatMessage } from "./types";

/** Page text past this is cut: enough to read a site, cheap enough to send. */
const MAX_CONTENT = 6_000;

const NEVER_ADVISE = "Never recommend buying or selling anything.";

/** A language's own name, as the trader picked it ("Português (Brasil)"). */
export function languageName(lang: Lang): string {
  return LANGS.find(([id]) => id === lang)?.[1] ?? "English";
}

/** The Chat tab: a trading companion, neutral and brief. */
export function buildSystemMessage(lang: Lang): ChatMessage {
  return {
    role: "system",
    content: `You are Candy, a desktop companion for crypto traders. Reply in ${languageName(lang)}. Be direct, concise and neutral. ${NEVER_ADVISE}`,
  };
}

/** The voice: a general assistant whose answers fit a speech bubble. */
export function buildVoiceSystemMessage(lang: Lang): ChatMessage {
  return {
    role: "system",
    content: `You are Candy, a friendly desktop companion. Reply in ${languageName(lang)}, in at most two sentences and with no preamble. Answer any question directly.`,
  };
}

function cut(content: string): string {
  return content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) + "…" : content;
}

export function buildSummarizeMessages(content: string, lang: Lang): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are Candy, an assistant that reads crypto projects' websites. Reply in ${languageName(lang)}. Be objective and neutral. ${NEVER_ADVISE}`,
    },
    { role: "user", content: `Sum up this crypto project's website in two or three direct sentences:\n\n${cut(content)}` },
  ];
}

/** A date for the model: the day alone, unambiguous in any language. */
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The full look at a project: its site's text, the domain's RDAP record and
 * its mail records, for an answer in a fixed five-line format.
 */
export function buildAnalyzeMessages(url: string, content: string, rdap: RdapInfo | undefined, mx: string[], lang: Lang): ChatMessage[] {
  const domain = new URL(url).hostname.replace(/^www\./, "");
  const lines: string[] = [`URL: ${url}`, `Domain: ${domain}`];

  if (rdap) {
    const country = rdap.country ? countryName(rdap.country, lang) : null;
    const registrar = rdap.registrar ?? "unknown";
    if (rdap.createdAt) {
      const days = Math.floor((Date.now() - rdap.createdAt) / 86_400_000);
      lines.push(`Registered: ${day(rdap.createdAt)} (${days} days ago)${country ? ` · ${country}` : ""} · via ${registrar}`);
    } else {
      lines.push(`Registrar: ${registrar}${country ? ` · ${country}` : ""}`);
    }
    if (rdap.expiresAt) lines.push(`Expires: ${day(rdap.expiresAt)}`);
    if (rdap.nameservers.length) lines.push(`Nameservers: ${rdap.nameservers.join(", ")}`);
  }

  lines.push(`Mail (MX): ${mx.length ? mx[0] : "none"}`);
  lines.push(`\nSite content:\n${cut(content)}`);

  return [
    {
      role: "system",
      content: `You are Candy, an assistant that looks into crypto projects. Read the facts below and reply in ${languageName(lang)}, in EXACTLY this format and nothing else, with the labels translated into that language:

📌 **Summary:** [one or two sentences on what the project does]
🏷️ **Category:** [DeFi | NFT | Layer 1/2 | Exchange | Memecoin | GameFi | Infrastructure | Other]
🌐 **Domain:** [country · registrar · registered on · expires]
🔧 **Infrastructure:** [nameservers or hosting provider · mail: yes or no]
⚠️ **Flags:** [the red flags, or "None"]

Be direct. ${NEVER_ADVISE}`,
    },
    { role: "user", content: lines.join("\n") },
  ];
}
