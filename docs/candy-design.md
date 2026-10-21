# Candy — design

How Candy (Trader Companion) looks and moves: the island, its colours and type, the mascot, the motion and the sounds. Every value here comes from the code (`src/style.css`, `src/core/layout.ts`, `src/core/themes.ts`, `src/mascot/`); the file and line to change are named where it matters.

Animations of all of it: <https://github.com/0xVendet4/trader-companion#meet-candy>

---

## 1. The idea

A small black shape glued to an edge of the screen, like a phone's dynamic island, that a candle with a face lives in. Folded, it is a one-line ticker; opened, a dark panel with tabs. Everything is dark, quiet and dense, so it can sit over a trading screen all day: colour is kept for meaning (green up, red down, amber warning, blue calm), and the mascot carries the personality.

- **Dark only.** The island is always dark; its text is always light. There is no light theme.
- **Numbers first.** Tabular figures, compact units ($4.2M, 910/702), green and red only on moves.
- **The mascot says how things are.** Mood, alerts and reactions show on Candy before any text does.
- **Calm by default, lively when it matters.** Small springs everywhere; the big effects (confetti, flame, rain cloud) only now and then.

---

## 2. Colour

### Interface tokens (`src/style.css`, `:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#f5f6f8` | Main text |
| `--dim` | `#9398a1` | Secondary text, labels |
| `--dim-2` | `#6b7079` | Tertiary text, column heads |
| `--dim-3` | `#4b5058` | Disabled, placeholders |
| `--card` | `#141518` | Cards, fields |
| `--card-2` | `#1b1d21` | Raised cards, hover |
| `--tab-on` | `#1f2227` | The active tab's pill |
| `--hairline` | `rgba(255,255,255,0.06)` | Dividers |
| `--up` | `#34d399` | Gains, buys, "on" |
| `--down` | `#f4505e` | Losses, sells, danger |
| `--amber` | `#f5a524` | Warnings, close to a limit |
| `--calm` | `#7dd3fc` | Neutral information, cooldowns |
| `--accent` | `#4ade80` | Highlights, links, Candy's green (a theme may recolour it) |

Rules: green and red only for direction (never decoration); amber only for "almost"; a whole card can take a tint of its alert's tone (green, red, amber, blue).

### Island backgrounds (`src/core/themes.ts`)

The island's own colour is a theme the user picks in the wardrobe. Each is a background, an optional ring (box-shadow outline or glow) and an optional accent.

| Theme | Background | Ring / accent |
| --- | --- | --- |
| Classic (default) | `#000` | — |
| Midnight | `#0b1226 → #050814` | — |
| Neon | `#000` | green glow |
| Gold | `#0d0a04 → #000` | gold glow, accent `#facc15` |
| Glass | `rgba(12,12,16,0.8)` | 1 px white 14% |
| Carbon | 45° stripes `#141417 / #0a0a0c` | 1 px white 8% |
| Solana | `#1d0c38 → #0a0912 → #052a24` | purple glow, accent `#c084fc` |
| Ocean | `#05203a → #020b16` | blue glow, accent `#38bdf8` |
| Sunset | `#1f0b26 → #2b0c16 → #3d1806` | orange glow, accent `#fb923c` |
| Bubblegum | `#26102c → #0f0713` | pink glow, accent `#f472b6` |
| Matrix | green grid on `#020503` | green outline |
| Bull | radial `#0c2c19 → #020805` | green glow |
| Bear | radial `#2e0c11 → #080203` | red glow |
| Moon | stars over radial `#1b2350 → #020308` | lavender glow, accent `#a5b4fc` |

Every background stays dark enough for `--ink` text on top.

---

## 3. Type

- **Font:** the system UI font (`system-ui`, Segoe UI Variable on Windows, SF on a Mac). Numbers and addresses: `Cascadia Mono`, `Consolas`, `ui-monospace`.
- **Scale:** small and dense. Body 11–11.5 px; labels and column heads 10–10.5 px, often uppercase with a little letter-spacing; titles in cards 14–15 px semibold; the big figure in a card 26 px.
- **Figures:** `font-variant-numeric: tabular-nums` wherever numbers line up.
- **Tone of the words:** short, plain, describes the data, never tells anyone to buy or sell. Ten languages; English is the source.

---

## 4. The island

### Sizes (`src/core/layout.ts`, logical px)

| What | Size |
| --- | --- |
| The window it lives in (top or floating) | 720 × 340 |
| Folded ticker | 350 × 32 |
| Open island | 660 wide, height from its content (at most 320) |
| Hidden (top edge) | 184 × 0: only a wake strip of 240 × 6 at the edge |
| Side window (left or right edge) | 400 × 640 |
| Side tab (folded) | 32 × 350, upright |
| Sidebar (open) | 380 wide |
| Header with the tabs | 40 high |
| Left column (Candy and his line) | 138 wide |
| A row | 30 high (wallet rows 40, wallet list 48) |

**Corners:** 14 px folded, 22 px open, rounded only where the island leaves its edge (at the top: the two bottom corners; on a side: the two away from the edge; floating: all four). Smaller parts use 6–10 px; pills are fully round.

### Placements

- **Floating** (the default): wherever it was dragged; in the lower half of the screen it hangs from its bottom and opens upwards.
- **Top:** centred on the top edge. On a MacBook with a notch it starts at the very top and grows out of the notch: a black band as tall as the notch, then the island.
- **Left / right:** a slim upright tab that opens into a sidebar.

### Anatomy of the open island

1. **Header:** icon tabs (Watchlist, Trending, Alerts, My wallet, Discipline, and Music while something plays); the active tab is a pill (`--tab-on`) with its name; on the right a status pill (today against the loss limit), the market dot, refresh, where the island sits, settings, mute.
2. **Left column:** Candy at 84 px, his mood line in two lines under him, and the wardrobe button (a T-shirt) above.
3. **Body:** the tab's view: tables (token, mini chart, MC, volume, buys/sells, 5m/1h/24h), cards, fields. Folder chips above lists; a field and an Add button under the watchlist.
4. **Event card:** alerts, check-ins and recaps replace the body with one card: an eyebrow in the tone's colour, a title, a line of detail, and its buttons (the first white, the others dark).

### Folded ticker

Candy at 28 px on the left, then one line that cycles through the watchlist (symbol, price or market cap, 5m and 1h moves), a dot per token on the right for the last hour, and a dot on Candy for an alert not seen yet.

---

## 5. Candy, the mascot

- **What he is:** a candlestick candle: a rounded green body (72 × 82 on a 128 × 128 art board, radius 22) on a wick that runs through it, a thick dark outline (`#06140b`), pink cheeks, big eyes. The art is SVG (`public/mascot/`), drawn on a canvas every frame.
- **Colour:** green by default (`#86efac → #16a34a`), 23 colours or any custom one; he turns red on a losing day, whatever colour was picked.
- **24 moods:** idle, happy, celebrate, worried, shocked, sleepy, alert, tired, stop, confused, love, wave, proud, sad, bored, focused, nervous, curious, angry, excited, relieved, dizzy, cool, sick. Each has its own face and motion; a lasting mood settles after a while.
- **Alive:** he breathes, blinks, his eyes and face follow the mouse, he fidgets, yawns when bored, sleeps late at night.
- **Wardrobe:** 23 hats, 24 face accessories, 23 colours, 14 island backgrounds, costumes that redraw him whole, seasonal looks. Loose bits (pompoms, bunny ears, a tassel, a scarf's ends) swing on springs as he moves.
- **Reactions:** pokes (a wave at two, a spin at three, dizzy at five, fed up at eight), a squash when held, his mouth opening when a token link is dragged over him and a gulp when it is dropped.
- **Now and then:** a flame on his wick that grows on a rise, smoke when it goes out, confetti, a rain cloud on a hard drop, coins on a winning sale, a tear, a jump for joy, fireworks on a green week, music notes while he dances.
- **Arrival:** he falls into the island through a rush of streaks, lands in a ring of light, slides aside and waves hello with two little hands.
- **On the desktop:** he can be dragged out to sit on the desktop at 80 px, and double-clicked home.

---

## 6. Motion

- **Opening:** a spring, response 0.3 s, damping 0.86: quick, with almost no overshoot (`OPEN_RESPONSE`, `OPEN_DAMPING`).
- **Closing:** 190 ms, ease-in (`CLOSE_MS`).
- **Small things:** 150 / 250 / 400 ms, ease-out to come in, ease-in to leave (leaving takes about 70% of coming in). Only transform and opacity are animated.
- **Candy:** springs for hops, leans and the swinging accessories; colours fade between moods.
- **Quiet when idle:** nothing animates while the island is hidden; it costs no CPU then.
- **Reduced motion:** respected.

---

## 7. Sound

Short, soft, synthesised: open, close, blip, hover, pop, alert up, alert down, warn, reminder, greet, boing, squeak, whee, eep, dizzy, grumble, achoo, tada, hmm. Quiet by default (volume 0.12), each replaceable by the user's own file of the same name.

---

## 8. Where to look in the code

| What | File |
| --- | --- |
| Colours, type, every component's style | `src/style.css`, `src/settings/settings.css` |
| Sizes, corners, motion constants | `src/core/layout.ts` |
| Island backgrounds | `src/core/themes.ts` |
| Candy's art | `public/mascot/` (`mascot.json` and the SVGs) |
| Candy's engine (drawing, moods, springs, particles) | `src/mascot/mascot.ts`, `paint.ts`, `pieces.ts`, `particles.ts` |
| The island's behaviour | `src/island/island.ts`, `src/views/` |
| Sounds | `src/core/sound.ts` |
