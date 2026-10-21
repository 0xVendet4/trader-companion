import { describe, expect, it } from "vitest";
import { LANGS } from "../core/i18n";
import { buildAnalyzeMessages, buildSummarizeMessages, buildSystemMessage, buildVoiceSystemMessage, languageName } from "./prompts";

describe("the prompts ask for Candy's language", () => {
  it("names every language the trader can pick, in that language", () => {
    for (const [id, name] of LANGS) {
      expect(languageName(id)).toBe(name);
      expect(buildSystemMessage(id).content).toContain(`Reply in ${name}`);
      expect(buildVoiceSystemMessage(id).content).toContain(name);
      expect(buildSummarizeMessages("a site", id)[0].content).toContain(name);
    }
    expect(buildSystemMessage("pt").content).toContain("Português (Brasil)");
    expect(buildSystemMessage("ja").content).toContain("日本語");
  });

  it("never advises, and keeps the voice short", () => {
    expect(buildSystemMessage("en").content).toMatch(/never recommend buying or selling/i);
    expect(buildVoiceSystemMessage("en").content).toMatch(/at most two sentences/i);
  });
});

describe("the site analysis carries the domain's facts", () => {
  const rdap = { registrar: "Namecheap", createdAt: Date.UTC(2024, 0, 15), expiresAt: Date.UTC(2027, 0, 15), updatedAt: null, country: "US", nameservers: ["ns1.example.com"] };

  it("puts the URL, the registration, the mail record and the page in the user message", () => {
    const [system, user] = buildAnalyzeMessages("https://www.example.com/x", "Hello world", rdap, ["mx1.example.com"], "en");
    expect(user.content).toContain("URL: https://www.example.com/x");
    expect(user.content).toContain("Domain: example.com");
    expect(user.content).toContain("Registered: 2024-01-15 (");
    expect(user.content).toContain("United States · via Namecheap");
    expect(user.content).toContain("Expires: 2027-01-15");
    expect(user.content).toContain("Nameservers: ns1.example.com");
    expect(user.content).toContain("Mail (MX): mx1.example.com");
    expect(user.content).toContain("Site content:\nHello world");
    for (const label of ["📌", "🏷️", "🌐", "🔧", "⚠️"]) expect(system.content).toContain(label);
    expect(system.content).toMatch(/reply in English/);
  });

  it("says so when nothing is known, and cuts a long page", () => {
    const [, user] = buildAnalyzeMessages("https://example.com", "x".repeat(10_000), undefined, [], "pt");
    expect(user.content).toContain("Mail (MX): none");
    expect(user.content).not.toContain("Registrar:");
    expect(user.content).toContain("x".repeat(6_000) + "…");
    expect(user.content).not.toContain("x".repeat(6_001));
  });
});
