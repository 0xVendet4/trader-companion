// Builds the public web preview (for Vercel or any static host):
// `npm run build:web` → release/trader-companion-demo/
//
//   /           the real island, live DexScreener data, settings in localStorage
//   /settings   its settings page
//   /tour       the scripted one-minute tour (demo.html)

import { defineConfig } from "vite";
import { resolve } from "node:path";

// The public Solana RPC refuses calls carrying a web page's Origin. In
// development /api/rpc is forwarded without it; on the website the same path
// is web/api/rpc.js (a Vercel function), and in the app it is Rust.
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

export default defineConfig({
  define: {
    // Turns on src/web/preview.ts: the how-to, phone scaling, starter tokens.
    "import.meta.env.VITE_WEB": JSON.stringify("1"),
  },
  // `vite preview` of the web build talks to the RPC the same way.
  preview: { proxy: solanaProxy },
  build: {
    target: "es2020",
    outDir: "release/trader-companion-demo",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        island: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
        tour: resolve(__dirname, "demo.html"),
      },
    },
  },
});
