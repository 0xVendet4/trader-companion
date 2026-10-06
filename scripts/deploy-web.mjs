// Builds the web preview and publishes it to Vercel production, from any
// terminal (cmd, PowerShell, bash):
//
//   npm run deploy:web
//
// Needs the Vercel CLI logged in (`vercel login`). SITE_URL and VERCEL_PROJECT
// override the defaults below.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = process.env.SITE_URL ?? "https://trader-companion-demo.vercel.app";
const PROJECT = process.env.VERCEL_PROJECT ?? "trader-companion-demo";
const WIN = process.platform === "win32";

// The project name goes on a command line: keep it to what Vercel allows anyway.
if (!/^[a-z0-9][a-z0-9._-]*$/.test(PROJECT)) {
  console.error(`VERCEL_PROJECT must be a plain Vercel project name, got "${PROJECT}".`);
  process.exit(1);
}

/**
 * Runs a command. On Windows the Vercel CLI and npx are .cmd shims, which only
 * start through a shell; Node wants the whole line as one string then (it warns
 * when an argument list is handed to a shell). Every part here is a fixed word
 * or a checked name, so the shell has nothing to interpret.
 */
function exec(parts, opts = {}) {
  return WIN ? spawnSync(parts.join(" "), { ...opts, shell: true }) : spawnSync(parts[0], parts.slice(1), opts);
}

function run(parts, env = process.env) {
  const res = exec(parts, { cwd: ROOT, env, stdio: "inherit" });
  if (res.status !== 0) {
    if (parts.some((p) => p.includes("vercel"))) console.error("\nVercel CLI not logged in? Run: vercel login  (or: npx vercel login)");
    process.exit(res.status ?? 1);
  }
}

/**
 * The Vercel CLI, wherever it is. A global npm install lands in %APPDATA%\npm,
 * which not every terminal has on its PATH (cmd often doesn't). Falls back to
 * npx, which fetches the CLI if it is not installed at all.
 */
function vercelCommand() {
  if (exec(["vercel", "--version"], { stdio: "ignore" }).status === 0) return ["vercel"];
  if (WIN && process.env.APPDATA) {
    const shim = join(process.env.APPDATA, "npm", "vercel.cmd");
    if (existsSync(shim)) return [`"${shim}"`];
  }
  return ["npx", "--yes", "vercel"];
}

run(["node", "scripts/build-web.mjs"], { ...process.env, SITE_URL });
run([...vercelCommand(), "deploy", "release/trader-companion-demo", "--prod", "--yes", "--project", PROJECT]);
console.log(`\nLive at ${SITE_URL}`);
console.log("(Vercel's \"Deployment Protection\" note is about the per-deploy URLs above; the address above is public.)");
