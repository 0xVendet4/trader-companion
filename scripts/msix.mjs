// npm run store: Candy as a Microsoft Store package (MSIX), the way the build
// workflow makes it on main (.github/workflows/build.yml, job `store`).
//
//   npm run store                  stage, then winapp pack → release/Candy-Store-<version>.msix
//   npm run store -- --run         stage, then run it as the package (winapp run): no
//                                  certificate needed, and `winapp unregister` undoes it
//   npm run store -- --exe <path>  the built Candy.exe to package (else the newest build found)
//
// Staged in release/store/: Candy.exe, msix/Package.appxmanifest with its
// tokens filled from msix/identity.json (the identity Partner Center gave the
// app, and the name reserved there) and the version (four parts: 0.1.16.0),
// and msix/Assets. The package is unsigned on purpose: the Store signs it at
// submission (Partner Center), which is the only place it installs from.
// It needs the winapp CLI: winget install Microsoft.winappcli --source winget

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const run = args.includes("--run");
const exeArg = args.includes("--exe") ? args[args.indexOf("--exe") + 1] : null;

const say = (text) => console.log(`  ${text}`);
function fail(text) {
  console.error(`\nCandy: ${text}\n`);
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const identity = JSON.parse(readFileSync(join(root, "msix", "identity.json"), "utf8"));
for (const key of ["displayName", "name", "publisher", "publisherDisplayName"]) {
  if (typeof identity[key] !== "string" || !identity[key]) fail(`msix/identity.json has no "${key}".`);
}
// MSIX versions have four parts; the Store wants each submission's higher.
const packageVersion = `${version}.0`;

/** The newest built Candy: --exe, else the usual places (CI's artifact folder, the build caches). */
function findExe() {
  if (exeArg) return resolve(root, exeArg);
  const dirs = [
    join(root, "release"),
    process.env.CARGO_TARGET_DIR && join(resolve(process.env.CARGO_TARGET_DIR), "release"),
    join(root, "target", "release"),
    join(root, "src-tauri", "target", "release"),
    join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Candy-build", "release"),
  ].filter(Boolean);
  const found = [];
  for (const dir of dirs) {
    for (const name of ["Candy.exe", "trader-companion.exe"]) {
      const path = join(dir, name);
      if (existsSync(path)) found.push({ path, mtime: statSync(path).mtimeMs });
    }
  }
  if (found.length === 0) fail("no built Candy.exe: run `npm run pack` first, or pass --exe <path>.");
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0].path;
}

const exe = findExe();
if (!existsSync(exe)) fail(`no app at ${exe}.`);

const stage = join(root, "release", "store");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
copyFileSync(exe, join(stage, "Candy.exe"));
cpSync(join(root, "msix", "Assets"), join(stage, "Assets"), { recursive: true });
const manifest = readFileSync(join(root, "msix", "Package.appxmanifest"), "utf8")
  .replace(/\{\{DISPLAY_NAME\}\}/g, identity.displayName)
  .replace("{{NAME}}", identity.name)
  .replace("{{PUBLISHER}}", identity.publisher)
  .replace("{{PUBLISHER_DISPLAY}}", identity.publisherDisplayName)
  .replace("{{VERSION}}", packageVersion);
if (/\{\{[A-Z_]+\}\}/.test(manifest)) fail("a token in msix/Package.appxmanifest has no value.");
writeFileSync(join(stage, "Package.appxmanifest"), manifest);
say(`Staged ${exe}`);
say(`as ${identity.name} ${packageVersion} by ${identity.publisher} in ${stage}`);

if (process.platform !== "win32") {
  say("Staged only: winapp packs and runs it on Windows.");
  process.exit(0);
}

/** winapp, with its output shown; a missing winapp says how to get it. */
function winapp(cmdArgs) {
  const res = spawnSync("winapp", cmdArgs, { cwd: root, stdio: "inherit" });
  if (res.error?.code === "ENOENT") fail("winapp isn't installed: winget install Microsoft.winappcli --source winget (then open a new terminal).");
  if (res.status !== 0) fail(`winapp ${cmdArgs[0]} failed (exit code ${res.status}).`);
}

const manifestPath = join(stage, "Package.appxmanifest");
if (run) {
  // Registers the staged folder as the package, identity and all, and starts it.
  winapp(["run", stage, "--manifest", manifestPath]);
  say("Running as the package. `winapp unregister` removes the registration.");
} else {
  const out = join(root, "release", `Candy-Store-${version}.msix`);
  rmSync(out, { force: true });
  winapp(["pack", stage, "--manifest", manifestPath, "--no-sign", "--output", out]);
  if (!existsSync(out)) fail(`winapp made no package at ${out}.`);
  const mb = (statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`\n  Package ready\n\n  ${out}  (${mb} MB)\n`);
}
