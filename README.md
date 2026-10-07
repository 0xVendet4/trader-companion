# Candy — Trader Companion

A tiny mascot that lives at the top of your Windows screen and keeps an eye on
your memecoins on Solana, BSC, Ethereum and Robinhood Chain.

### [Install Candy on Windows](#install)

Free and open source, and built on your own PC from this code: there is no
prebuilt download to trust.

- **Watchlist ticker** — market cap, volume and buys / sells (5m, 1h, 6h or
  24h, as GMGN shows them) and 5m / 1h / 24h change, always in view; click to
  open the full list, click a token to open it on GMGN, Axiom or DexScreener.
  Folders (Runners, Holds, Watching, your own) sort the list.
- **My wallet** — add your own Solana wallet (public address only): its SOL and
  value show at once, its recent trades are read from its last 50
  transactions (round trips that closed go into your journal), and from then
  on its buys and sells are recorded, with value, average entry (from its own
  transactions), profit and multiple per token. Each check reads its new
  transactions too, so a token bought and sold within the same minute still
  shows, at the price it really traded at. Alerts at the levels you pick
  (2x, −30%…). Junk is left out: airdropped scams (a name that advertises a
  site) and coins worth more, at their quoted price, than all the real money
  in their pool — a wallet full of them looks rich and can sell none of it.
- **Solana, BSC, Ethereum and Robinhood Chain** — pick one, several or all for
  search, trending and the header prices (SOL, BNB, ETH), plus BTC and the
  crypto Fear & Greed index.
- **Search by name** — type "pump", pick from the results. Results rank by
  liquidity *backed by real money* (SOL / USDC / ETH / BNB in the pool), so
  fakes that report billions in liquidity of themselves sink, flagged ⚠.
- **Alerts** — price or market cap above/below a level, % up/down within 5–60
  minutes, and liquidity drops (a classic sign of liquidity being pulled). The
  mascot reacts, a sound plays, the island opens.
- **Discipline** — your own rules: a daily loss limit, a max number of trades,
  a cooldown after a loss, and break reminders.
- **A mascot with moods** — Candy is a candle: it wears your colour (green
  by default) and turns red on a loss, whatever colour you picked. It is
  happy when the watchlist is green, worried when it's red, bored when
  nothing moves, asleep late at night,
  sick in a rough hour, focused on a volume spike, dizzy in a whipsaw,
  nervous in extreme fear and excited in extreme greed, proud of a win or a
  break, sad after a loss, angry past your trade cap, relieved when a cooldown
  ends, curious about a new token, and reacts to SOL and
  to your own positions; a lasting mood settles after a while. Its eyes
  follow your mouse, it fidgets, reacts to pokes, and sums up what changed
  when you come back to the screen. 14 backgrounds for the island; a wardrobe
  in the island with 23 hats, 23 face accessories and 23 colours (or any colour),
  costumes (Gengar, Spiderman, Shadow, V) that redraw the whole mascot in
  every mood, and seasonal looks.
- **Where it lives** — centred on the top edge, on the left or right edge (a
  slim tab that opens into a sidebar), or floating: drag it anywhere.
- **Token safety** — a RugCheck badge on every token: mint/freeze authority,
  holder concentration, unlocked liquidity.
- **Trending** — DexScreener's most boosted and newest tokens on your chains,
  sorted by volume, market cap, liquidity or age, over 5m / 1h / 6h / 24h.
- **Following** — follow other wallets by their public address: an alert when
  they buy or sell. Nothing else is worked out about them.
- **Journal** — weekly stats, trade notes, CSV export.
- **Share my day** — a recap image (trades, PnL, positions, discipline) with
  Candy, ready for X or Telegram; amounts can be hidden.
- **Quick actions** — mini 24 h chart per token, copy the CA, one-click 2x
  alert, share your watchlist as a list of addresses, a show/hide shortcut and a
  minimize button (the shortcut or the tray icon brings Candy back), system
  notifications.

*The mascot art is a placeholder.*

Hold **Ctrl** over the island to click whatever is behind it (a browser tab, a
title bar); it fades while the clicks go through.

## Install

Candy ships as source. You build it on your own PC, so what you run is
exactly the code in this repository: there is nothing prebuilt to download,
and nothing to trust that you can't read here.

1. Get the code: **Code → Download ZIP** at the top of this page, then unzip
   it (or `git clone` it).
2. Double-click **`install.cmd`** in that folder. Windows may ask whether to
   run it, since it came from the internet: it is a few lines that start
   `scripts\install.ps1` (open either in Notepad to check).

It checks for what a build needs (Node.js 20+, Rust with its MSVC toolchain,
and Microsoft's C++ build tools) and offers to install anything missing with
winget; it asks first, and the C++ tools take a few GB. Then it builds Candy,
10–20 minutes the first time, and runs the installer it made. Candy lands in
your Start menu. To update, get the new code and run `install.cmd` again:
your settings stay.

To only see what is missing:
`powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -CheckOnly`.
By hand, it is [Develop](#develop): the
[prerequisites](https://tauri.app/start/prerequisites/), `npm ci`,
`npm run pack`, then run `release\Candy-Windows-<version>-setup.exe`.

Candy never asks for a wallet, a seed phrase or a private key.

## Safety

- Reads **public data only**: DexScreener, RugCheck and alternative.me's Fear
  & Greed index (public APIs, no key)
  and Solana's public RPC for your wallet (with two keyless spares for when
  it is busy) — four read-only calls (balances, token accounts, and the
  transactions a position's entry comes from), whitelisted in Rust
  (`solana_rpc`) and in the website's `web/api/rpc.js`.
- **Never** asks for, stores or touches a wallet, a seed phrase, a private key
  or an exchange account. It cannot trade.
- Tokens are added by **address or link only**, never by ticker: every popular
  memecoin has copycats with the same symbol.
- Links open only on a fixed list of sites (`ALLOWED_HOSTS` in
  `src-tauri/src/lib.rs`), never from token metadata.
- Not financial advice. The app shows numbers and the alerts you set up.

## Develop

Requirements: Node 20+, Rust (MSVC toolchain), and the Visual Studio Build
Tools with the "Desktop development with C++" workload — see
[Tauri's prerequisites](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev     # the real app
npm run dev           # the UI only, in a browser at http://localhost:1420
npm test              # unit tests (alerts, mood, discipline, formatting)
npm run pack          # installer → release/ (install.cmd does this, prerequisites included)
npm run pack:edition -- <id>   # a friend's installer, with their exclusive costume
```

An exclusive costume is made for one friend and is not in this repository: it
lives in `editions/<id>/` on the machine that builds their installer. Only that
installer offers it, and wears it from the first launch. Regular builds and the
website never have it.

In a browser the island runs on the same code, with settings kept in
localStorage; open `/settings.html` for the settings window and `/demo.html`
for the scripted demo.

## Web preview

The live island runs in a browser too. `npm run deploy:web` builds it
(`release/trader-companion-demo/`) and publishes it to Vercel: `/` is the live
island with real data, `/settings` its settings, `/tour` the scripted tour. It
needs the Vercel CLI logged in; it works from cmd, PowerShell or bash.

## Demo video

`/demo.html` plays a ~55 s scripted tour with fictional tokens. To turn it into
an MP4 (1920×1080, no audio), with `npm run dev` running:

```bash
npm run record-demo   # → release/trader-companion-demo.mp4
```

It drives a headless Microsoft Edge; no ffmpeg needed.

## Layout

| Path | What |
|---|---|
| `src/companion.ts` | Polling, price history, alerts, discipline clock, mood, saving |
| `src/market/` | DexScreener client, trading-terminal links |
| `src/alerts/`, `src/mood/`, `src/discipline/` | Pure logic, unit-tested |
| `src/mascot/` | Sprite player driven by `public/mascot/mascot.json` |
| `src/island/`, `src/views/` | The island window and its views |
| `src/settings/` | Settings window |
| `src/demo/` | Scripted demo for the presentation video |
| `src-tauri/` | Window placement, click-through, tray, settings file, links |
| `ASSETS.md` | Brief for the final mascot art and icon |

## Privacy

Candy has no account, no analytics and no telemetry. It keeps
everything on your PC: settings, watchlist, journal and wallet book in
`%APPDATA%\TraderCompanion`, a log in `%LOCALAPPDATA%\TraderCompanion`.

It talks only to public services, for public data:

- **DexScreener** (`api.dexscreener.com`, token images from `cdn.dexscreener.com`
  and `dd.dexscreener.com`): prices, market caps, volumes, search and trending.
  It is sent the token addresses on your watchlist and in your wallet.
- **RugCheck** (`api.rugcheck.xyz`): a token's safety report, for tokens you open.
- **alternative.me** (`api.alternative.me`): the crypto Fear & Greed index.
- **Solana's public RPC** (`api.mainnet-beta.solana.com`): the balances and
  transactions of the wallet addresses you add (public addresses only; read-only
  calls, spaced to stay under its limits). On the website, these go through
  its own small proxy on Vercel. If you paste your own RPC URL in the settings
  (Helius, Alchemy, QuickNode…: a free key takes a minute), these calls go to
  it instead; the URL stays on your PC.
- **Spare public RPCs**, only when Solana's is busy and no RPC of your own is
  set: PublicNode (`solana-rpc.publicnode.com`) and Solana Vibe Station
  (`public.rpc.solanavibestation.com`), for the calls each one serves. They see
  the same thing: the wallet addresses asked about.

Each of these services sees your IP address, as with any website. Links you
click open in your browser (GMGN, Axiom, DexScreener, RugCheck, Solscan,
GitHub, and Helius or Alchemy for a free RPC key).

## Credits

Built on the Windows shell of [Coucou](https://github.com/Louis-CFM/coucou) by
Louis Raillé (MIT): the island window, click-through and open/close animation.
Coucou's character (Mochi), name, icons and sounds are not part of this
project. See [LICENSE](LICENSE).
