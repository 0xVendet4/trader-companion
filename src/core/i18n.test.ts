/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS, pickLang, t, tn, useWords, type Dict } from "./i18n";
import { extractKeys, placeholders, templateCalls, type Key } from "./i18n-extract";

const SRC = join(__dirname, "..");

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = sources().map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }));
const keys: Key[] = files.flatMap((f) => extractKeys(f.text, f.path));
const byText = new Map(keys.map((k) => [k.text, k]));

describe("i18n", () => {
  it("puts values in and picks the plural form", () => {
    useWords("en", {});
    expect(t("Got it")).toBe("Got it");
    expect(t("{symbol} crossed {level}", { symbol: "WIF", level: "$1M" })).toBe("WIF crossed $1M");
    expect(tn(1, "{n} trade", "{n} trades")).toBe("1 trade");
    expect(tn(3, "{n} trade", "{n} trades")).toBe("3 trades");
    useWords("ru", { "{n} trades": { one: "{n} сделка", few: "{n} сделки", many: "{n} сделок", other: "{n} сделки" }, "Got it": "Понятно" });
    expect(t("Got it")).toBe("Понятно");
    expect(tn(21, "{n} trade", "{n} trades")).toBe("21 сделка");
    expect(tn(3, "{n} trade", "{n} trades")).toBe("3 сделки");
    expect(tn(5, "{n} trade", "{n} trades")).toBe("5 сделок");
    expect(t("Not in the dictionary")).toBe("Not in the dictionary");
    useWords("en", {});
  });

  it("picks the language the trader chose, else the system's", () => {
    expect(pickLang("de", ["pt-BR"])).toBe("de");
    expect(pickLang("auto", ["pt-BR", "en-US"])).toBe("pt");
    expect(pickLang("auto", ["nl-NL", "zh-CN"])).toBe("zh");
    expect(pickLang("auto", ["nl-NL"])).toBe("en");
    expect(pickLang("xx", [])).toBe("en");
  });

  it("finds the lines in the code", () => {
    const found = extractKeys(`t("Hi {name}", { name }); tn(list.length, "{n} token", "{n} tokens"); x.t("no"); N_("Cat ears")`);
    expect(found.map((k) => k.text)).toEqual(["Hi {name}", "Cat ears", "{n} tokens"]);
    expect(found[2].one).toBe("{n} token");
    expect(templateCalls("t(`Hi ${name}`)")).toBe(1);
    // Not in comments; a URL in a string stays whole.
    expect(extractKeys(`// t("Example")\n/* N_("Old") */ const u = "https://x.y"; t("Real")`).map((k) => k.text)).toEqual(["Real"]);
  });

  it("never hands t() a template", () => {
    const bad = files.filter((f) => templateCalls(f.text) > 0).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it("gives a plural line the same {names} in both its forms", () => {
    const bad = keys.filter((k) => k.one != null && placeholders(k.one).join() !== placeholders(k.text).join()).map((k) => k.text);
    expect(bad).toEqual([]);
  });

  for (const [lang] of LANGS.filter(([l]) => l !== "en")) {
    it(`has every line in ${lang}, with the same {names}`, async () => {
      const dict = ((await import(`../i18n/${lang}.ts`)) as { default: Dict }).default;
      const missing = [...byText.keys()].filter((text) => !(text in dict));
      expect(missing).toEqual([]);
      const stale = Object.keys(dict).filter((text) => !byText.has(text));
      expect(stale).toEqual([]);
      const wrong: string[] = [];
      for (const [text, value] of Object.entries(dict)) {
        const want = placeholders(text);
        if (typeof value === "string") {
          if (placeholders(value).join() !== want.join()) wrong.push(text);
          continue;
        }
        if (!value.other) wrong.push(`${text} (no "other" form)`);
        // A plural form may leave {n} out (some languages say "one trade" in words).
        const rest = want.filter((p) => p !== "n").join();
        for (const f of Object.values(value)) if (placeholders(f).filter((p) => p !== "n").join() !== rest) wrong.push(text);
      }
      expect([...new Set(wrong)]).toEqual([]);
    });
  }
});
