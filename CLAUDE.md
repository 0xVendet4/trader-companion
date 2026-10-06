# Trader Companion — guide for AI coding agents

Windows-only Tauri 2 app: a mascot in a black "island" at the top of the screen
that watches memecoins on Solana, BSC, Ethereum and Robinhood Chain (DexScreener; wallets on Solana only), fires alerts and enforces the
trader's own discipline rules. Rust in `src-tauri/`, TypeScript in `src/` (no
framework). UI text is English.

## Build
- `npm run tauri dev` — the app. Needs Rust with the MSVC toolchain and the VS Build Tools.
- `npm run dev` — the UI alone in a browser (http://localhost:1420, `/settings.html`, `/demo.html`).
- `npm test` (vitest) and `cargo test --manifest-path src-tauri/Cargo.toml`.
- `npm run record-demo` — re-records the demo video (needs `npm run dev` running).
- `npm run pack:edition -- <id>` — a friend's installer with their exclusive costume from `editions/<id>/` (git-ignored; joins the build as the `"edition"` costume in `vite.config.ts`); regular builds and the website never have it. Never commit `editions/`, nor a friend's costume name or art anywhere in the repository.

## Rules
- The app never handles wallets, seed phrases, private keys or exchange keys, and never trades. Public market data only.
- Tokens are added by address or link, never by ticker (copycat tokens).
- Every host a link can open must be in `ALLOWED_HOSTS` (`src-tauri/src/lib.rs`) and in `src/market/links.ts`. Never open URLs taken from token metadata.
- Wallets are followed by public address only. Solana RPC goes through `solana_rpc` (Rust) or `web/api/rpc.js` (website), both limited to four read-only calls (getBalance, getTokenAccountsByOwner, getSignaturesForAddress, getTransaction) with params rebuilt from scratch. Never add a method that signs, sends or writes. They call the public RPC (then the keyless spares of `SPARE_RPCS`, for the calls each serves, when it is busy), or the trader's own https endpoint (`Settings.rpc_url`, checked by `rpc_endpoint`; the website's from the `SOLANA_RPC_URL` environment variable, never from code). Calls to the public RPC are spaced (`PUBLIC_SPACING`) to stay under its per-IP limit of 40 calls of one kind per 10 s; never ship a key of our own.
- Token names and symbols are attacker-controlled: always insert them as text (`h(..., { text })`), never as HTML. `dom.ts` has no innerHTML on purpose.
- New network hosts go in both CSPs: `src-tauri/tauri.conf.json` and `scripts/build-web.mjs`.
- Alert and mascot texts describe what happened in the data; they never tell the user to buy or sell.
- Rust stores the trading config as an opaque JSON blob (`Settings.companion`); its shape lives in `src/core/state.ts` and `normalizeSettings` must accept older files.
- Logic in `src/alerts`, `src/mood`, `src/discipline`, `src/positions`, `src/share/recap.ts`, `src/mascot/{reactions,gaze,skins}.ts`, `src/market/sentiment.ts` and `src/core/format.ts` stays pure and tested.
- Positions come from balance changes; a position held before tracking reads the wallet's history once for its real entry, one call at a time (the public RPC is shared). Each check also reads an own wallet's new transactions (`fetchNewSwaps`, one at a time): a token bought and sold between two checks still counts, and what the balances see is costed at the price it traded at (`gapTrades`).
- Mascot art is data: `public/mascot/mascot.json` + images (see ASSETS.md). Never use anything from Coucou's character (Mochi), icons or sounds.
- Keep the MIT notice of Louis Raillé in LICENSE and in files adapted from Coucou.
- 0% CPU while the island is hidden: no animation loop or interval may keep running then.
