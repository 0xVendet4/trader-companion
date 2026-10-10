// Candy's words in ten languages. English is the key: t("Got it") shows the
// trader's language when it has the line, English otherwise. {name} marks a
// value put in: t("{symbol} crossed {level}", { symbol, level }). A line that
// changes with a number goes through tn(n, "{n} trade", "{n} trades"): each
// language picks its own form for n (Russian has three). N_("Cat ears") only
// marks a line held in a table for translation; t(label) translates it where
// it is shown. src/core/i18n.test.ts checks that every language has every line
// the code uses, with the same {names}.
//
// What is never translated: token names and symbols, brand and site names,
// numbers and prices (format.ts), and the log.

export const LANGS = [
  ["en", "English"],
  ["pt", "Português (Brasil)"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["ru", "Русский"],
  ["tr", "Türkçe"],
  ["zh", "简体中文"],
  ["ja", "日本語"],
  ["ko", "한국어"],
] as const;

export type Lang = (typeof LANGS)[number][0];
/** The setting: a language, or "auto" (the system's, when Candy has it). */
export type LangSetting = Lang | "auto";
export const LANG_SETTINGS: readonly LangSetting[] = ["auto", ...LANGS.map(([id]) => id)];

/** A line whose words change with a number: one form per plural category, `other` always. */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Dict = Record<string, string | Plural>;
export type Params = Record<string, string | number>;

let lang: Lang = "en";
let words: Dict = {};
let rules = new Intl.PluralRules("en");

/** Puts the values in: "{symbol}" → params.symbol. An unknown name stays as written. */
function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** A line in the trader's language. */
export function t(text: string, params?: Params): string {
  const w = words[text];
  return fill(typeof w === "string" ? w : text, params);
}

/** A line that changes with `n` ("{n} trade" / "{n} trades"); `params.n` can give n already formatted. */
export function tn(n: number, one: string, other: string, params?: Params): string {
  const all = { n, ...params };
  const w = words[other];
  if (w && typeof w === "object") return fill(w[rules.select(n)] ?? w.other, all);
  if (typeof w === "string") return fill(w, all);
  return fill(n === 1 ? one : other, all);
}

/** Marks a line for translation without translating it (a table's labels); t() it where it shows. */
export const N_ = (text: string): string => text;

export function currentLang(): Lang {
  return lang;
}

/** The language for a setting: the one picked, or the first of the system's that Candy has. */
export function pickLang(setting: string, system: readonly string[]): Lang {
  const known = (id: string) => LANGS.some(([l]) => l === id);
  if (setting !== "auto" && known(setting)) return setting as Lang;
  for (const tag of system) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (known(base)) return base as Lang;
  }
  return "en";
}

/**
 * The dev server only: `?lang=de` on a page's address picks its language
 * without touching the settings, to check a layout in each language.
 */
export function devLang(): string | null {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  return new URLSearchParams(location.search).get("lang");
}

/** The system's languages, as the page sees them. */
export function systemLangs(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

const LOADERS: Record<Exclude<Lang, "en">, () => Promise<{ default: Dict }>> = {
  pt: () => import("../i18n/pt"),
  es: () => import("../i18n/es"),
  fr: () => import("../i18n/fr"),
  de: () => import("../i18n/de"),
  ru: () => import("../i18n/ru"),
  tr: () => import("../i18n/tr"),
  zh: () => import("../i18n/zh"),
  ja: () => import("../i18n/ja"),
  ko: () => import("../i18n/ko"),
};

/** Switches to `l`: its words load first (each language is its own file, read when picked). */
export async function useLang(l: Lang): Promise<void> {
  let next: Dict = {};
  if (l !== "en") {
    try {
      next = (await LOADERS[l]()).default;
    } catch {
      l = "en";
    }
  }
  lang = l;
  words = next;
  rules = new Intl.PluralRules(l);
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

/** For tests: a language's words without loading a file. */
export function useWords(l: Lang, dict: Dict) {
  lang = l;
  words = dict;
  rules = new Intl.PluralRules(l);
}
