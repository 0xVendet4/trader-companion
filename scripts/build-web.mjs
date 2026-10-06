// Builds the public web preview: release/trader-companion-demo/.
//
//   npm run build:web                                   (plain build)
//   SITE_URL=https://example.vercel.app npm run build:web
//
// index.html is the live island; demo.html becomes tour.html. web/og.png is
// copied next to them as the link-preview image. Link previews (WhatsApp,
// Discord, X) need an absolute image URL, so og:image is only added when
// SITE_URL is given.

import { build } from "vite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "release", "trader-companion-demo");

await build({ configFile: join(ROOT, "vite.web.config.ts"), logLevel: "warn" });
renameSync(join(OUT, "demo.html"), join(OUT, "tour.html"));

// Exclusive costumes belong to a friend's build: not on the public site, not
// even as files.
const manifestFile = join(OUT, "mascot", "mascot.json");
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
for (const [id, costume] of Object.entries(manifest.costumes ?? {})) {
  if (!costume.exclusive) continue;
  delete manifest.costumes[id];
  rmSync(join(OUT, "mascot", "costumes", id), { recursive: true, force: true });
}
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");

// /tour and /settings instead of /tour.html and /settings.html, plus security
// headers. The CSP mirrors the desktop app's (src-tauri/tauri.conf.json): code
// only from this site, data only from DexScreener, RugCheck and alternative.me
// (Fear & Greed), token images only from DexScreener's CDN — so a token cannot
// point its logo at a server that logs visitors' IP addresses — and framing by
// this site only (the settings open in a panel over the island).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cdn.dexscreener.com https://dd.dexscreener.com",
  "connect-src 'self' https://api.dexscreener.com https://api.rugcheck.xyz https://api.alternative.me",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");
const vercel = {
  cleanUrls: true,
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
  ],
};
writeFileSync(join(OUT, "vercel.json"), JSON.stringify(vercel, null, 2) + "\n");

const og = join(ROOT, "web", "og.png");
if (existsSync(og)) copyFileSync(og, join(OUT, "og.png"));

// The wallet tab's read-only RPC proxy (see web/api/rpc.js) ships as a function.
mkdirSync(join(OUT, "api"), { recursive: true });
copyFileSync(join(ROOT, "web", "api", "rpc.js"), join(OUT, "api", "rpc.js"));

const site = process.env.SITE_URL?.replace(/\/$/, "");
const description = "A tiny mascot at the top of your screen that watches your Solana memecoins: live ticker, alerts, discipline reminders.";

function addHead(file, title, path) {
  const tags = [
    `<meta name="description" content="${description}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<link rel="icon" type="image/svg+xml" href="/mascot/still/idle.svg" />`,
  ];
  if (site && existsSync(og)) {
    tags.push(
      `<meta property="og:url" content="${site}${path}" />`,
      `<meta property="og:image" content="${site}/og.png" />`,
      `<meta name="twitter:image" content="${site}/og.png" />`,
    );
  }
  let html = readFileSync(file, "utf8");
  // demo.html carries its own description and og tags; do not repeat them.
  html = html.replace(/\s*<meta (name="description"|property="og:[a-z]+"|name="twitter:card")[^>]*>/g, "");
  html = html.replace(/\s*<link rel="icon"[^>]*>/g, "");
  html = html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
  writeFileSync(file, html);
}

addHead(join(OUT, "index.html"), "Trader Companion — live preview", "/");
addHead(join(OUT, "tour.html"), "Trader Companion — 1-minute tour", "/tour");

console.log(`Web preview ready: ${OUT}${site ? ` (for ${site})` : ""}`);
