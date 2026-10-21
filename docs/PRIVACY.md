# Privacy

Candy runs on your computer and keeps what you give it there. It has no account, no sign-in and no analytics, and nothing it stores leaves your computer except the requests listed below.

## What stays on your computer

- Your settings, watchlist, alerts, wallet addresses and positions, in your user profile: `%APPDATA%\TraderCompanion` on Windows, `~/Library/Application Support/TraderCompanion` on a Mac, `~/.config/TraderCompanion` on Linux. Installed from the Microsoft Store, Windows keeps them in the package's own folder under `%LOCALAPPDATA%\Packages`.
- A small log of what Candy did (`companion.log`), for troubleshooting. It is never sent anywhere.
- The paste shortcut reads your clipboard only when you press it, to pick up a token address or a site's link for Candy to look into. The text is neither stored nor sent; a site's link is only fetched, as below.
- An OpenAI API key, if you paste one in Settings → AI, in the same settings file as the rest.

## What Candy sends, and to whom

To show prices and balances, Candy asks public services, with the token or wallet address you added and nothing else about you:

- DexScreener, GeckoTerminal and CoinGecko: prices, market caps, liquidity, candles and token images.
- RugCheck: a token's risk report.
- Solana's public RPC (or the one you set in Settings) and the public RPCs of Ethereum, BSC, Base and the other chains Candy supports: your wallets' balances and tokens.
- Alternative.me: the Fear & Greed index.
- Faireconomy (ForexFactory's feed): the week's economic calendar.
- GitHub: whether a newer version is out, and the update itself when you say so. Installed from the Microsoft Store, the Store does that instead.
- A site you drop on Candy to look into, and only then: its page is fetched once from your computer, and IANA's RDAP service and Cloudflare's DNS are asked about its domain.
- OpenAI, only with an API key of yours in Settings → AI: what you type in the Chat tab, what you say in a voice chat (the recording, which OpenAI writes down) and the text of a site you dropped on Candy. Without a key nothing goes to OpenAI.

These services see your IP address, as any website does. Candy sends no name, no email, no wallet key, no seed phrase and nothing typed in another app. The full list of addresses it talks to is in the code: `src-tauri/tauri.conf.json` (the page) and `src-tauri/src` (the app).

## What Candy never does

It never asks for a private key or a seed phrase, never signs or sends a transaction and never connects to a wallet. It reads public blockchain data for the addresses you paste, and that is all.

## Questions

Write on GitHub: https://github.com/0xVendet4/trader-companion.
