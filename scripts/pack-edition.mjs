// Builds a friend's edition of the installer: the regular app plus one
// exclusive costume, offered in the wardrobe and worn from the first launch.
// The costume lives in editions/<id>/ (costume.json and its art), which is kept
// out of the repository; vite.config.ts adds it to the build as the "edition"
// costume. Regular builds and the website never have it.
//
//   npm run pack:edition -- <id>
//
// → release/Candy-Windows-<version>-<id>-setup.exe. Needs what
// `npm run pack` needs (Rust with the MSVC toolchain, the VS Build Tools).

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const editionsDir = join(root, "editions");
const editions = existsSync(editionsDir)
  ? readdirSync(editionsDir).filter((d) => /^[a-z0-9-]+$/.test(d) && existsSync(join(editionsDir, d, "costume.json")))
  : [];

const id = process.argv[2];
if (!id || !editions.includes(id)) {
  console.error(`Usage: npm run pack:edition -- <costume>. Editions here: ${editions.join(", ") || "none"}.`);
  process.exit(1);
}
const costume = JSON.parse(readFileSync(join(editionsDir, id, "costume.json"), "utf8"));
if (process.platform !== "win32") {
  console.error("The installer is built on Windows.");
  process.exit(1);
}

// Vite reads VITE_* variables from the environment, through `tauri build`'s
// `npm run build`. The id was checked against the folders above, so the shell
// line holds only fixed words.
const res = spawnSync("npx tauri build", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_EXCLUSIVE_COSTUME: id },
});
if (res.status !== 0) process.exit(res.status ?? 1);

// The newest installer Tauri wrote, under this edition's name (the regular
// names stay for regular builds).
const dir = join(root, "target", "release", "bundle", "nsis");
const built = readdirSync(dir)
  .filter((f) => f.endsWith("-setup.exe"))
  .map((f) => join(dir, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (!built) {
  console.error(`No installer in ${dir}.`);
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
mkdirSync(join(root, "release"), { recursive: true });
const dest = join(root, "release", `Candy-Windows-${version}-${id}-setup.exe`);
copyFileSync(built, dest);
console.log(`\n  ${costume.name} edition ready: ${dest}\n`);
