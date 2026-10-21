// Builds the website into site-dist/: the page in site/ and, next to it, the
// demo (demo.html) for its "Try it" frame, opened there with ?play.
//
//   npm run site
//
// Vercel runs it (vercel.json). Link previews (X, Discord, WhatsApp) need an
// absolute image URL: it comes from SITE_URL, or on Vercel from the project's
// production address.

import { build } from "vite";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site-dist");

await build({
  root: ROOT,
  configFile: false,
  logLevel: "warn",
  envPrefix: ["VITE_"],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: "chrome110",
    rollupOptions: { input: { demo: join(ROOT, "demo.html") } },
  },
});

cpSync(join(ROOT, "site"), OUT, { recursive: true });

const host = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
const index = join(OUT, "index.html");
const page = readFileSync(index, "utf8").replaceAll("__SITE__", host.replace(/\/$/, ""));
writeFileSync(index, page);
console.log(`Site ready: ${OUT}${host ? ` (for ${host})` : ""}`);
