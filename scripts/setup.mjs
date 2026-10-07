// npm run setup: builds Candy from this folder's source and installs it.
// Nothing prebuilt is downloaded from this project, and this installs nothing
// else: the tools a build needs are yours to install first (README → Install).
//
//   npm ci
//   npm run setup                  build, then install
//   npm run setup -- --build-only  build only (what CI runs)
//
// Windows: builds the installer (npm run pack) and opens it.
// Linux:   builds the app and installs it for your user only: ~/.local/bin/candy,
//          its app-menu entry and icon in ~/.local/share.
//
// What Rust compiles is kept outside this folder, so an update from a new ZIP
// only rebuilds what changed: %LOCALAPPDATA%\Candy-build, ~/.cache/candy/build.
// Delete it to free a few GB.

import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildOnly = process.argv.includes("--build-only");
const { version } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));

const say = (text) => console.log(`  ${text}`);
const step = (text) => console.log(`\n== ${text}`);
function fail(text) {
  console.error(`\n  ${text}\n`);
  process.exit(1);
}
/** Runs a fixed command line (no user input in it), showing its output. */
function run(line, env) {
  const res = spawnSync(line, { cwd: root, stdio: "inherit", shell: true, env });
  return res.status === 0;
}
const quiet = (line) => spawnSync(line, { shell: true, encoding: "utf8" });

if (process.platform !== "win32" && process.platform !== "linux") {
  fail("Candy builds on Windows and Linux for now.");
}

const env = { ...process.env };
// Where Rust's output goes: a cache that outlives this folder (CI sets its own).
if (!env.CARGO_TARGET_DIR) {
  env.CARGO_TARGET_DIR =
    process.platform === "win32"
      ? join(env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Candy-build")
      : join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "candy", "build");
}

step("Checking the tools (README → Install)");
const cargo = quiet("cargo --version");
if (cargo.status !== 0) fail("Rust isn't installed, or not on this terminal's PATH: see README → Install, then open a new terminal.");
say(cargo.stdout.trim());
if (process.platform === "win32") {
  // A Windows app needs Rust's MSVC toolchain, whatever the default one is.
  const list = quiet("rustup toolchain list");
  if (list.status === 0) {
    if (!/stable-x86_64-pc-windows-msvc/.test(list.stdout)) {
      fail("Rust's MSVC toolchain is missing: rustup toolchain install stable-x86_64-pc-windows-msvc");
    }
    env.RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-msvc";
  }
} else {
  const libs = "webkit2gtk-4.1 gtk-layer-shell-0 librsvg-2.0 openssl";
  if (quiet(`pkg-config --exists ${libs}`).status !== 0) {
    fail("Some build libraries are missing (WebKitGTK 4.1, gtk-layer-shell…): see README → Install.");
  }
  say("WebKitGTK 4.1, gtk-layer-shell, librsvg, OpenSSL");
}
say(`Build cache: ${env.CARGO_TARGET_DIR}`);

step("Building Candy from this source (10-20 minutes the first time, a few after)");
if (process.platform === "win32") {
  if (!run("npm run pack", env)) fail("The build failed: the messages above say why.");
} else {
  if (!run("npx tauri build --no-bundle", env)) fail("The build failed: the messages above say why.");
}
if (buildOnly) {
  say("Built (--build-only: nothing installed).");
  process.exit(0);
}

step("Installing");
if (process.platform === "win32") {
  const setup = join(root, "release", `Candy-Windows-${version}-setup.exe`);
  if (!existsSync(setup)) fail(`No installer at ${setup}.`);
  say(`Opening ${setup}`);
  spawnSync(setup, { stdio: "inherit" });
  say("Done: Candy is in your Start menu.");
} else {
  const home = homedir();
  const bin = join(env.CARGO_TARGET_DIR, "release", "trader-companion");
  if (!existsSync(bin)) fail(`No app at ${bin}.`);
  const exe = join(home, ".local", "bin", "candy");
  const icon = join(home, ".local", "share", "icons", "hicolor", "128x128", "apps", "candy.png");
  const desktop = join(home, ".local", "share", "applications", "candy.desktop");
  for (const f of [exe, icon, desktop]) mkdirSync(dirname(f), { recursive: true });
  // Beside it, then renamed over it: a running Candy keeps its old file.
  copyFileSync(bin, `${exe}.new`);
  chmodSync(`${exe}.new`, 0o755);
  renameSync(`${exe}.new`, exe);
  copyFileSync(join(root, "src-tauri", "icons", "128x128.png"), icon);
  writeFileSync(
    desktop,
    [
      "[Desktop Entry]",
      "Type=Application",
      "Name=Candy",
      "GenericName=Trader Companion",
      "Comment=A mascot at the top of your screen that watches your memecoins",
      `Exec=${exe}`,
      "Icon=candy",
      "Terminal=false",
      "Categories=Finance;Utility;",
      "",
    ].join("\n"),
  );
  quiet(`update-desktop-database "${dirname(desktop)}"`);
  say(`Done: open Candy from your app menu, or run ${exe}`);
}
