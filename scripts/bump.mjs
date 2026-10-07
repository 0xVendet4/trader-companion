// npm run bump -- 0.1.2: sets Candy's version everywhere it is written —
// package.json and its lock, src-tauri/tauri.conf.json, Cargo.toml and
// Cargo.lock — so they agree (CI checks). Once pushed, every installed Candy
// older than it offers the update (src/core/update.ts).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run bump -- <x.y.z>   (e.g. npm run bump -- 0.1.2)");
  process.exit(1);
}

const file = (p) => join(root, p);
const edit = (p, fn) => {
  const before = readFileSync(file(p), "utf8");
  const after = fn(before);
  if (after === before) {
    console.error(`  ${p}: the version wasn't found where expected.`);
    process.exit(1);
  }
  writeFileSync(file(p), after);
  console.log(`  ${p}`);
};

const previous = JSON.parse(readFileSync(file("package.json"), "utf8")).version;
console.log(`\n  ${previous} → ${version}\n`);

edit("package.json", (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
edit("package-lock.json", (s) => {
  const lock = JSON.parse(s);
  lock.version = version;
  if (lock.packages?.[""]) lock.packages[""].version = version;
  return JSON.stringify(lock, null, 2) + "\n";
});
edit("src-tauri/tauri.conf.json", (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
edit("Cargo.toml", (s) => s.replace(/(\[workspace\.package\][^[]*?\nversion\s*=\s*")[^"]+(")/, `$1${version}$2`));
edit("Cargo.lock", (s) => s.replace(/(\[\[package\]\]\nname = "trader-companion"\nversion = ")[^"]+(")/, `$1${version}$2`));

console.log(`\n  Commit and push: installed Candys older than ${version} will offer the update.\n`);
