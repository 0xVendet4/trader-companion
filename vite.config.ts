import { defineConfig, type Plugin } from "vite";
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// The public Solana RPC refuses calls carrying a web page's Origin. In the
// browser (npm run dev) /api/rpc is forwarded without it; in the app the call
// goes through Rust.
const solanaProxy = {
  "/api/rpc": {
    target: "https://api.mainnet-beta.solana.com",
    changeOrigin: true,
    rewrite: () => "/",
    configure: (proxy: { on: (ev: string, fn: (req: { removeHeader: (h: string) => void }) => void) => void }) =>
      proxy.on("proxyReq", (req) => {
        req.removeHeader("origin");
        req.removeHeader("referer");
      }),
  },
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
  plugins: [edition()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    proxy: solanaProxy,
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
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
