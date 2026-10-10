// Finds the lines the code hands to t(), tn() and N_() (see i18n.ts), for the
// test that keeps every language complete and for `npm run i18n`, which lists
// what a language is missing. Only string literals in double quotes count: a
// line built at runtime can't be translated, so the test flags t(`…`).

/** A line to translate: its English, and for tn() its singular. */
export interface Key {
  text: string;
  one?: string;
  file: string;
}

const STR = String.raw`"(?:[^"\\\n]|\\.)*"`;
const T_CALL = new RegExp(String.raw`(?<![\w.$])(?:t|N_)\(\s*(${STR})`, "g");
const TN_CALL = new RegExp(String.raw`(?<![\w.$])tn\(\s*[^"]*?,\s*(${STR})\s*,\s*(${STR})`, "g");
// \x60 is the backtick: written out, it would read as a template to stripComments.
const TEMPLATE_CALL = /(?<![\w.$])(?:t|N_)\(\s*\x60/g;

const unquote = (s: string): string => JSON.parse(s) as string;

/**
 * The source without its comments (they show t("…") as examples), strings
 * kept whole so a "https://" stays. Regular expressions are taken for code:
 * none in this project holds a quote or two slashes.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      // Keep the line breaks, so nothing else moves.
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** The lines in one file's source. */
export function extractKeys(source: string, file = ""): Key[] {
  const code = stripComments(source);
  const keys: Key[] = [];
  for (const m of code.matchAll(T_CALL)) keys.push({ text: unquote(m[1]), file });
  for (const m of code.matchAll(TN_CALL)) keys.push({ text: unquote(m[2]), one: unquote(m[1]), file });
  return keys;
}

/** t(`…`) calls: a template can't be looked up. */
export function templateCalls(source: string): number {
  return [...stripComments(source).matchAll(TEMPLATE_CALL)].length;
}

/** The {names} a line puts values in, sorted. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}
