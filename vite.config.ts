import { defineConfig, type Plugin } from "vite";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// The public Solana RPC refuses calls carrying a web page's Origin. In the
// browser (npm run dev) /api/rpc is forwarded without it; in the app the call
// goes through Rust. The economic calendar (src/market/calendar.ts) sends no
// CORS headers: the same, at /api/calendar. EVM wallets (src/wallets/evm.ts)
// read each chain's public RPC at /api/evm/<chain>; in the app, Rust's
// evm_rpc does, with the same endpoints and their spares. The hover chart's
// candles (src/market/chart.ts) come from GeckoTerminal at /api/ohlcv, the URL
// built here from checked parts, as src-tauri/src/chart.rs builds it in the app.
const EVM_RPCS: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
};

const stripOrigin = (proxy: { on: (ev: string, fn: (req: { removeHeader: (h: string) => void }) => void) => void }) =>
  proxy.on("proxyReq", (req) => {
    req.removeHeader("origin");
    req.removeHeader("referer");
  });

const OHLCV_NETWORKS = new Set(["solana", "bsc", "eth", "base"]);
const OHLCV_FRAMES = new Map<string, number[]>([
  ["day", [1]],
  ["hour", [1, 4, 12]],
  ["minute", [1, 5, 15]],
]);
/** The API's path for an /api/ohlcv request, or null when any part is not what the API takes (nothing is forwarded then). */
function ohlcvPath(url: string): string | null {
  const q = new URL(url, "http://x").searchParams;
  const network = q.get("network") ?? "";
  const pool = q.get("pool") ?? "";
  const timeframe = q.get("timeframe") ?? "";
  const aggregate = Number(q.get("aggregate"));
  const limit = Math.min(1000, Math.max(1, Number(q.get("limit")) || 100));
  const poolOk = network === "solana" ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pool) : /^0x[0-9a-fA-F]{40}$/.test(pool);
  if (!OHLCV_NETWORKS.has(network) || !poolOk || !OHLCV_FRAMES.get(timeframe)?.includes(aggregate)) return null;
  return `/api/v2/networks/${network}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`;
}

/**
 * Refuses a bad /api/ohlcv request here, before the proxy: GeckoTerminal allows
 * some 30 requests a minute from one address, none to spend on a bogus path.
 * (A plugin's configureServer middleware runs ahead of Vite's own proxy.)
 */
function ohlcvGuard(): Plugin {
  return {
    name: "trader-companion-ohlcv-guard",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/ohlcv") || ohlcvPath(url) !== null) return next();
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/plain");
        res.end("ohlcv: network, pool, timeframe or aggregate is not something GeckoTerminal serves");
      });
    },
  };
}

const proxies = {
  "/api/ohlcv": {
    target: "https://api.geckoterminal.com",
    changeOrigin: true,
    // The guard above answered every request ohlcvPath refuses: "/" is never reached.
    rewrite: (path) => ohlcvPath(path) ?? "/",
  },
  "/api/calendar": {
    target: "https://nfs.faireconomy.media",
    changeOrigin: true,
    rewrite: () => "/ff_calendar_thisweek.json",
  },
  "/api/rpc": {
    target: "https://api.mainnet-beta.solana.com",
    changeOrigin: true,
    rewrite: () => "/",
    configure: stripOrigin,
  },
  ...Object.fromEntries(
    Object.entries(EVM_RPCS).map(([chain, target]) => [`/api/evm/${chain}`, { target, changeOrigin: true, rewrite: () => "/", configure: stripOrigin }]),
  ),
};

/**
 * A friend's build (VITE_EXCLUSIVE_COSTUME=<id>, see scripts/pack-edition.mjs).
 * Their costume is kept out of the repository, in editions/<id>/: costume.json
 * ({ name, states }) and mascot/costumes/<id>/ (its art, laid out as in
 * public/mascot). It joins mascot.json as the "edition" costume, in dev and in
 * the build; regular builds never see it.
 */
function edition(): Plugin | null {
  const id = process.env.VITE_EXCLUSIVE_COSTUME;
  if (!id) return null;
  const dir = resolve(__dirname, "editions", id);
  const costumeFile = join(dir, "costume.json");
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(costumeFile)) {
    throw new Error(`VITE_EXCLUSIVE_COSTUME=${id}: no editions/${id}/costume.json (run npm run mascot).`);
  }
  const costume = JSON.parse(readFileSync(costumeFile, "utf8"));
  const art = join(dir, "mascot");
  const manifest = () => {
    const m = JSON.parse(readFileSync(resolve(__dirname, "public", "mascot", "mascot.json"), "utf8"));
    m.costumes = { ...m.costumes, edition: { ...costume, exclusive: true } };
    return JSON.stringify(m, null, 2) + "\n";
  };
  return {
    name: "trader-companion-edition",
    config: () => ({ define: { "import.meta.env.VITE_EDITION_NAME": JSON.stringify(costume.name) } }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0]);
        if (path === "/mascot/mascot.json") {
          res.setHeader("Content-Type", "application/json");
          return res.end(manifest());
        }
        const file = path.startsWith("/mascot/") ? join(art, path.slice("/mascot/".length)) : "";
        if (file.startsWith(art + sep) && file.endsWith(".svg") && existsSync(file)) {
          res.setHeader("Content-Type", "image/svg+xml");
          return res.end(readFileSync(file));
        }
        next();
      });
    },
    writeBundle({ dir: out }) {
      if (!out) return;
      cpSync(art, join(out, "mascot"), { recursive: true });
      writeFileSync(join(out, "mascot", "mascot.json"), manifest());
    },
  };
}

export default defineConfig({
  plugins: [ohlcvGuard(), edition()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    proxy: proxies,
    // Rust's build output (a cargo test in another terminal locks its files,
    // and watching them crashed the server) and the recorded videos.
    watch: { ignored: ["**/target/**", "**/src-tauri/**", "**/release/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome110",
    minify: "esbuild",
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        island: resolve(__dirname, "index.html"),
        desktop: resolve(__dirname, "desktop.html"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
