// npm run i18n: what each language is missing, or has left over, against the
// lines the code hands to t(), tn() and N_() (src/core/i18n.ts).
//
//   npm run i18n               a count per language, and the missing lines
//   npm run i18n -- --keys     every English line, as JSON (to translate)
//
// Reads the TypeScript directly: Node 22.18 or newer.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractKeys } from "../src/core/i18n-extract.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "i18n" ? [] : sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const keys = new Map();
for (const path of sources(src)) {
  for (const k of extractKeys(readFileSync(path, "utf8"), relative(src, path).replaceAll("\\", "/"))) {
    const seen = keys.get(k.text);
    if (seen) seen.files.add(k.file);
    else keys.set(k.text, { text: k.text, ...(k.one ? { one: k.one } : {}), files: new Set([k.file]) });
  }
}

if (process.argv.includes("--keys")) {
  const out = [...keys.values()].map((k) => ({ text: k.text, ...(k.one ? { one: k.one } : {}), files: [...k.files] }));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

let complete = true;
for (const name of readdirSync(join(src, "i18n")).filter((f) => f.endsWith(".ts")).sort()) {
  const dict = (await import(pathToFileURL(join(src, "i18n", name)).href)).default;
  const missing = [...keys.keys()].filter((k) => !(k in dict));
  const stale = Object.keys(dict).filter((k) => !keys.has(k));
  if (missing.length || stale.length) complete = false;
  console.log(`${name.replace(".ts", "")}: ${keys.size - missing.length}/${keys.size}${stale.length ? `, ${stale.length} left over` : ""}`);
  for (const k of missing.slice(0, 20)) console.log(`  missing: ${JSON.stringify(k)}`);
  if (missing.length > 20) console.log(`  … and ${missing.length - 20} more`);
  for (const k of stale.slice(0, 10)) console.log(`  left over: ${JSON.stringify(k)}`);
}
process.exit(complete ? 0 : 1);
