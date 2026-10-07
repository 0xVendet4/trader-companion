// The island header: six tabs (only the open one shows its label, so they
// fit), live prices of the chosen chains' coins, BTC and the Fear & Greed
// index, the data status, refresh, where the island sits, settings and sound.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { IS_TAURI } from "../core/bridge";
import { compact, formatCoin, formatDuration, formatPct, formatUsd, pctClass } from "../core/format";
import { State, type IslandViewName, type Placement, type Quote } from "../core/state";
import { nativeCoins } from "../market/chains";
import { fngTone } from "../market/sentiment";

const TAB_VIEWS: IslandViewName[] = ["watchlist", "trending", "alerts", "positions", "wallets", "discipline"];

export function buildHeader(actions: ViewActions): ViewHost {
  const tab = (view: IslandViewName, icon: string, label: string, stroke?: number) => {
    const el = h(
      "button",
      {
        class: "tab",
        title: label,
        onclick: () => {
          actions.blip();
          actions.setView(view);
        },
      },
      svg(icon, 13, stroke ? { stroke } : {}),
      h("span", { text: label }),
    );
    return el;
  };
  const tabs: Record<string, HTMLElement> = {
    watchlist: tab("watchlist", ICONS.chart, "Watchlist", 2.2),
    trending: tab("trending", ICONS.flame, "Trending"),
    alerts: tab("alerts", ICONS.bell, "Alerts"),
    positions: tab("positions", ICONS.wallet, "My wallet"),
    wallets: tab("wallets", ICONS.eye, "Following", 2),
    discipline: tab("discipline", ICONS.shield, "Discipline"),
  };

  // One price per native coin of the chosen chains (SOL, BNB, ETH).
  const natives = h("span", { class: "natives" });
  const status = h("span", { class: "status-dot" });
  const refresh = iconBtn(ICONS.refresh, "Refresh now", () => {
    actions.blip();
    void Companion.pollNow();
    if (State.view === "trending") void Companion.refreshTrending(true);
    if (State.view === "wallets" || State.view === "positions") void Companion.refreshWallets();
  }, 2.2);
  const gear = iconBtn(ICONS.gear, "Settings", () => actions.openSettings());
  const sound = iconBtn(ICONS.speakerOn, "Sound", () => actions.toggleSound());
  const minimize = iconBtn(ICONS.minimize, "Minimize: your show/hide shortcut, or Open in the tray icon, brings Candy back", () => actions.minimize(), 2.4);
  // A browser (npm run dev) has no tray to come back from.
  if (!IS_TAURI) minimize.style.display = "none";

  // Where the island sits, picked right here (like a browser's dock side).
  const PLACES: [Placement, string, string][] = [
    ["top", ICONS.dockTop, "Top of the screen"],
    ["left", ICONS.dockLeft, "Left edge"],
    ["right", ICONS.dockRight, "Right edge"],
    ["float", ICONS.dockFloat, "Floating: drag it anywhere"],
  ];
  const placeIcon = (p: Placement) => PLACES.find(([id]) => id === p)?.[1] ?? ICONS.dockTop;
  let dockOpen = false;
  const dockMenu = h("div", { class: "dock-menu" });
  const dockChoices = PLACES.map(([id, icon, title]) => {
    const b = iconBtn(icon, title, () => {
      dockOpen = false;
      if (State.settings.placement !== id) {
        State.settings.placement = id;
        Companion.save();
        actions.applyLook();
      }
      actions.blip();
      paintDock();
    }, 1.8);
    dockMenu.append(b);
    return { id, b };
  });
  const dock = iconBtn(ICONS.dockTop, "Where the island sits", () => {
    dockOpen = !dockOpen;
    actions.blip();
    paintDock();
  }, 1.8);
  const dockWrap = h("span", { class: "dock" }, dock, dockMenu);
  let dockShown = "";
  function paintDock() {
    const place = State.settings.placement;
    dockMenu.classList.toggle("on", dockOpen);
    dock.classList.toggle("on", dockOpen);
    for (const { id, b } of dockChoices) b.classList.toggle("on", id === place);
    if (dockShown !== place) {
      dockShown = place;
      clear(dock);
      dock.append(svg(placeIcon(place), 13, { stroke: 1.8 }));
    }
  }
  // A press anywhere else closes the choices.
  document.addEventListener(
    "mousedown",
    (e) => {
      if (dockOpen && !dockWrap.contains(e.target as Node)) {
        dockOpen = false;
        paintDock();
      }
    },
    true,
  );

  const el = h(
    "div",
    { id: "header" },
    h("div", { class: "tabs" }, ...TAB_VIEWS.map((v) => tabs[v])),
    h("div", { class: "header-actions" }, natives, status, refresh, dockWrap, gear, sound, minimize),
  );

  return {
    el,
    sync() {
      for (const [name, t] of Object.entries(tabs)) t.classList.toggle("on", State.view === name);
      // Following is an option, off by default.
      tabs.wallets.style.display = State.companion.following ? "" : "none";
      const show = TAB_VIEWS.includes(State.view) || State.view === "wardrobe";
      el.style.opacity = show ? "1" : "0";
      el.style.pointerEvents = show ? "auto" : "none";

      clear(natives);
      // One chip per coin, then BTC and the Fear & Greed index. When they would
      // crowd the tabs, each coin shows its price coloured by the hour's move
      // and keeps the % for its tooltip.
      const coins: { symbol: string; q: Quote; title: string }[] = [];
      for (const coin of nativeCoins(State.companion.chains)) {
        const q = State.natives[coin.symbol] ?? (coin.symbol === "SOL" ? State.sol : null);
        if (q) coins.push({ symbol: coin.symbol, q, title: `${coin.symbol} price` });
      }
      const market = State.companion.headerMarket;
      if (market && State.btc) coins.push({ symbol: "BTC", q: State.btc, title: "BTC price (wrapped BTC on Ethereum)" });
      const fg = market ? State.fearGreed : null;
      const crowded = coins.length + (fg ? 1 : 0) > 3;
      natives.classList.toggle("crowded", crowded);
      for (const { symbol, q, title } of coins) {
        // Crowded: short numbers, no "$" (SOL 150, BTC 67.2K).
        const price = crowded ? compact(q.priceUsd) : symbol === "BTC" ? formatUsd(q.priceUsd) : formatCoin(q.priceUsd);
        const change = `${formatPct(q.change.h1)} in the last hour`;
        natives.append(
          crowded
            ? h("span", { class: "sol-chip", title: `${title} · ${change}` }, h("b", { text: symbol }), " ", h("span", { class: `pct ${pctClass(q.change.h1)}`, text: price }))
            : h(
                "span",
                { class: "sol-chip", title: `${title} · change over the last hour` },
                h("b", { text: symbol }),
                ` ${price} `,
                h("span", { class: `pct ${pctClass(q.change.h1)}`, text: formatPct(q.change.h1) }),
              ),
        );
      }
      if (fg) {
        natives.append(
          h(
            "span",
            { class: `sol-chip fng tone-${fngTone(fg.value)}`, title: `Crypto Fear & Greed index (alternative.me): ${fg.label}` },
            h("b", { text: "F&G" }),
            h("span", { class: "fng-value", text: ` ${fg.value}` }),
          ),
        );
      }

      status.className = `status-dot ${State.paused ? "paused" : State.marketStatus}`;
      status.title = State.paused
        ? "Paused"
        : State.marketStatus === "error"
          ? `Offline: ${State.marketError ?? ""}`
          : State.lastUpdate
            ? `Updated ${formatDuration(Date.now() - State.lastUpdate)} ago`
            : "";
      clear(sound);
      sound.append(svg(State.settings.soundEnabled ? ICONS.speakerOn : ICONS.speakerOff, 13));
      // The island folded: the choices go with it.
      if (dockOpen && State.mode !== "expanded") dockOpen = false;
      paintDock();
    },
    tick() {
      this.sync();
    },
  };
}
