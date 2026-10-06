// Extras for the public web preview (`npm run build:web`): a short how-to
// under the island, scaling for narrow screens, and a starter watchlist on a
// first visit so there is something live to look at right away. Never part
// of the desktop app.

import { Companion } from "../companion";
import { h } from "../views/dom";

/** Real, well-known Solana memecoins, by mint address. */
const STARTER = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
];

export function setupPreview(root: HTMLElement) {
  document.body.classList.add("web");
  const intro = h(
    "div",
    { id: "web-intro" },
    h("p", { class: "rotate", text: "Turn your phone sideways to see it full size." }),
    h("h1", { text: "Candy — live preview" }),
    h(
      "p",
      {},
      "The real app, running in your browser with live DexScreener data. On Windows it lives at the very top of your screen, like that black bar.",
    ),
    h(
      "ul",
      {},
      h("li", { text: "Click the bar at the top to open it (tap it on a phone) and anywhere else to close it. Ctrl + Shift + Space works too." }),
      h("li", { text: "Search a token by name (try “pump”) or paste its address. Solana, BSC, Ethereum and Robinhood Chain." }),
      h("li", { text: "Hover a row to copy the CA, set a 2x alert or a custom one." }),
      h("li", { text: "The shield on each token is its RugCheck safety check. Trending shows boosted and new tokens." }),
      h("li", { text: "Wallets follows any public address and tells you when it buys or sells." }),
      h("li", { text: "Discipline → Journal: weekly stats, notes and a CSV export. The gear has themes, hats, face accessories and colours." }),
    ),
    h(
      "p",
      { class: "fine" },
      "Everything stays in this browser: no sign-up, no wallet, no keys. Not financial advice. ",
      h("a", { href: "/tour", text: "Watch the 1-minute tour" }),
    ),
  );
  document.body.append(intro);

  // The window is 720 px wide; on a phone, shrink it to fit. An island on a
  // side edge or floating places its own stage (the page is wide enough then)
  // and the how-to moves up.
  const fit = () => {
    const placement = document.body.dataset.placement ?? "top";
    if (placement !== "top") {
      root.style.transform = "";
      intro.style.top = "24px";
      return;
    }
    const s = Math.min(1, window.innerWidth / 720);
    root.style.transform = `translateX(-50%) scale(${s})`;
    intro.style.top = `${Math.round(320 * s) + 16}px`;
  };
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("placement", fit);
}

/** Fills an empty watchlist on a first visit. */
export async function seedWatchlist() {
  for (const address of STARTER) await Companion.addToken(address);
}

/** Tells the visitor what a shared link did. */
export function sharedNotice(added: number, total: number) {
  const intro = document.getElementById("web-intro");
  if (!intro) return;
  const text =
    added > 0
      ? `A friend shared a watchlist: ${added} token${added === 1 ? "" : "s"} added. Hover the bar at the top.`
      : `A friend shared a watchlist: all ${total} tokens were already on yours.`;
  intro.prepend(h("p", { class: "shared", text }));
}
