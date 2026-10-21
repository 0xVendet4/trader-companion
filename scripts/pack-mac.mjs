// Generates a distributable ZIP for macOS: the project source + the two
// .command scripts. The user extracts it and double-clicks "Install Candy.command"
// to compile and install from the included source — nothing prebuilt is shipped.
//
//   npm run pack:mac
//
// → release/Candy-Mac-<version>.zip  (extracts to "Candy-<version>/")

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "darwin") {
  console.error("pack:mac is for macOS only.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const folderName = `Candy-${version}`;
const outDir = join(root, "release");
const outFile = join(outDir, `Candy-Mac-${version}.zip`);
const tmpFolder = join(outDir, folderName);

mkdirSync(outDir, { recursive: true });

// Remove leftovers from previous runs.
rmSync(tmpFolder, { recursive: true, force: true });
rmSync(outFile, { force: true });

// rsync copies the source into a temp folder with the right display name,
// excluding everything that shouldn't ship.
const RSYNC_EXCLUDE = [
  ".git",
  "node_modules",
  "dist",
  "target",
  "release",
  "*.tsbuildinfo",
  "src-tauri/gen/schemas",
  ".env",
  ".env.*",
  "demo-frames",
  ".claude",
  "CLAUDE.md",
  // editions/ holds private costume art; the max-headroom costume already lives
  // in public/mascot/costumes/ so it ships with the regular source.
  "editions",
  ".DS_Store",
];

const excludeArgs = RSYNC_EXCLUDE.map((p) => `--exclude='${p}'`).join(" ");

console.log(`\n  Packing Candy ${version} for macOS…`);

try {
  execSync(`rsync -a ${excludeArgs} '${root}/' '${tmpFolder}/'`, { stdio: "inherit" });
} catch (err) {
  console.error("rsync failed:", err.message);
  rmSync(tmpFolder, { recursive: true, force: true });
  process.exit(1);
}

// Zip the temp folder from inside release/ so the archive path is just
// "Candy-<version>/..." with no extra nesting.
try {
  execSync(`cd '${outDir}' && zip -r '${outFile}' '${folderName}' --exclude '*/.DS_Store'`, {
    stdio: "inherit",
  });
} catch (err) {
  console.error("zip failed:", err.message);
  rmSync(tmpFolder, { recursive: true, force: true });
  process.exit(1);
}

// Clean up the temp copy.
rmSync(tmpFolder, { recursive: true, force: true });

const { size } = statSync(outFile);
const mb = (size / 1024 / 1024).toFixed(1);
console.log(`\n  Ready: ${outFile}  (${mb} MB)`);
console.log(`  Extracts to: ${folderName}/`);
console.log(`  → share this file; the user extracts it and double-clicks "Install Candy.command"\n`);
