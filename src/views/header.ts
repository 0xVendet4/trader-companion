// The island header: seven tabs (only the open one shows its label, so they
// fit; Following, Discipline and Music only when on), live prices of the chosen chains' coins, BTC, the Fear & Greed index
// and the next US release on the economic calendar, the data status, refresh,
// where the island sits, settings and sound.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { IS_TAURI } from "../core/bridge";
import { t } from "../core/i18n";
import { compact, formatCoin, formatDuration, formatPct, formatUsd, pctClass } from "../core/format";
import { State, type IslandViewName, type Placement, type Quote } from "../core/state";
import { nativeCoins } from "../market/chains";
import { fngTone } from "../market/sentiment";
import { chipWord, nextRelease, releases, untilShort, weekLines } from "../market/calendar";
import { currentLog, dayPill, summarize } from "../discipline/discipline";

const TAB_VIEWS: IslandViewName[] = ["watchlist", "trending", "alerts", "positions", "wallets", "discipline", "music", "chat"];

/** The tabs the header shows right now, in order: Following is an option, Music needs a player on the PC, Chat an OpenAI key. */
export function shownTabs(): IslandViewName[] {
  const c = State.companion;
  return TAB_VIEWS.filter(
    (v) => (v !== "wallets" || c.following) && (v !== "music" || (c.musicCard && !!State.nowPlaying)) && (v !== "discipline" || c.disciplineOn) && (v !== "chat" || !!c.openaiKey),
  );
}

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
    watchlist: tab("watchlist", ICONS.chart, t("Watchlist"), 2.2),
    trending: tab("trending", ICONS.flame, t("Trending")),
    alerts: tab("alerts", ICONS.bell, t("Alerts")),
    positions: tab("positions", ICONS.wallet, t("My wallet")),
    wallets: tab("wallets", ICONS.eye, t("Following"), 2),
    discipline: tab("discipline", ICONS.shield, t("Discipline")),
    music: tab("music", ICONS.note, t("Music")),
    chat: tab("chat", ICONS.bubble, t("Chat")),
  };

  // The day against the trader's own limits; a click opens Discipline.
  const dayPillEl = h("button", {
    class: "day-pill",
    type: "button",
    onclick: () => {
      actions.blip();
      actions.setView(State.companion.disciplineOn ? "discipline" : "positions");
    },
  });
  // One price per native coin of the chosen chains (SOL, BNB, ETH).
  const natives = h("span", { class: "natives" });
  const status = h("span", { class: "status-dot" });
  const refresh = iconBtn(ICONS.refresh, t("Refresh now"), () => {
    actions.blip();
    void Companion.pollNow();
    if (State.view === "trending") void Companion.refreshTrending(true);
    if (State.view === "wallets" || State.view === "positions") void Companion.refreshWallets();
  }, 2.2);
  const gear = iconBtn(ICONS.gear, t("Settings"), () => actions.openSettings());
  const sound = iconBtn(ICONS.speakerOn, t("Sound"), () => actions.toggleSound());
  const minimize = iconBtn(ICONS.minimize, t("Minimize: your show/hide shortcut, or Open in the tray icon, brings Candy back"), () => actions.minimize(), 2.4);
  // A browser (npm run dev) has no tray to come back from.
  if (!IS_TAURI) minimize.style.display = "none";

  // Where the island sits, picked right here (like a browser's dock side).
  const PLACES: [Placement, string, string][] = [
    ["top", ICONS.dockTop, t("Top of the screen")],
    ["left", ICONS.dockLeft, t("Left edge")],
    ["right", ICONS.dockRight, t("Right edge")],
    ["float", ICONS.dockFloat, t("Floating: drag it anywhere")],
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
  const dock = iconBtn(ICONS.dockTop, t("Where the island sits"), () => {
    dockOpen = !dockOpen;
    actions.blip();
    paintDock();
  }, 1.8);
  const dockWrap = h("span", { class: "dock" }, dock, dockMenu);
  let dockShown = "";
  function paintDock() {
    const place = State.settings.placement;
    // Only the top edge where the window can't be placed (plain Wayland): nothing to pick.
    dockWrap.style.display = IS_TAURI && !State.canPlace ? "none" : "";
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
    h("div", { class: "header-actions" }, dayPillEl, natives, status, refresh, dockWrap, gear, sound, minimize),
  );

  return {
    el,
    sync() {
      const shown = shownTabs();
      for (const [name, tabEl] of Object.entries(tabs)) {
        tabEl.classList.toggle("on", State.view === name);
        tabEl.style.display = shown.includes(name as IslandViewName) ? "" : "none";
      }
      const show = TAB_VIEWS.includes(State.view) || State.view === "wardrobe";
      el.style.opacity = show ? "1" : "0";
      el.style.pointerEvents = show ? "auto" : "none";

      // With Discipline off the day's PnL stays, without the limits, and a
      // click opens My wallet (where Share my day is).
      const on = State.companion.disciplineOn;
      const rules = on ? State.companion.discipline : { ...State.companion.discipline, dailyLossLimit: 0, maxTradesPerDay: 0 };
      const pill = dayPill(rules, summarize(currentLog(State.companion.log)));
      dayPillEl.style.display = pill ? "" : "none";
      if (pill) {
        dayPillEl.textContent = pill.text;
        dayPillEl.className = `day-pill ${pill.tone}`;
        dayPillEl.title = `${pill.title}
${on ? t("Click for Discipline") : t("Click for My wallet")}`;
      }

      clear(natives);
      // One chip per coin, then BTC and the Fear & Greed index. When they would
      // crowd the tabs, each coin shows its price coloured by the hour's move
      // and keeps the % for its tooltip.
      const coins: { symbol: string; q: Quote; title: string }[] = [];
      for (const coin of nativeCoins(State.companion.chains)) {
        const q = State.natives[coin.symbol] ?? (coin.symbol === "SOL" ? State.sol : null);
        if (q) coins.push({ symbol: coin.symbol, q, title: t("{symbol} price", { symbol: coin.symbol }) });
      }
      const market = State.companion.headerMarket;
      if (market && State.btc) coins.push({ symbol: "BTC", q: State.btc, title: t("BTC price (wrapped BTC on Ethereum)") });
      const fg = market ? State.fearGreed : null;
      // The next US release the whole market watches, within a day (src/market/calendar.ts).
      const lead = State.companion.calendarLeadMin;
      const all = lead && State.calendar ? releases(State.calendar.events) : [];
      const next = nextRelease(all, Date.now());
      // The day pill takes room too.
      const crowded = coins.length + (fg ? 1 : 0) + (next ? 1 : 0) + (pill ? 1 : 0) > 3;
      natives.classList.toggle("crowded", crowded);
      for (const { symbol, q, title } of coins) {
        // Crowded: short numbers, no "$" (SOL 150, BTC 67.2K).
        const price = crowded ? compact(q.priceUsd) : symbol === "BTC" ? formatUsd(q.priceUsd) : formatCoin(q.priceUsd);
        const change = t("{pct} in the last hour", { pct: formatPct(q.change.h1) });
        natives.append(
          crowded
            ? h("span", { class: "sol-chip", title: `${title} · ${change}` }, h("b", { text: symbol }), " ", h("span", { class: `pct ${pctClass(q.change.h1)}`, text: price }))
            : h(
                "span",
                { class: "sol-chip", title: `${title} · ${t("change over the last hour")}` },
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
            { class: `sol-chip fng tone-${fngTone(fg.value)}`, title: t("Crypto Fear & Greed index (alternative.me): {label}", { label: t(fg.label) }) },
            h("b", { text: "F&G" }),
            h("span", { class: "fng-value", text: ` ${fg.value}` }),
          ),
        );
      }
      if (next) {
        const ms = next.at - Date.now();
        natives.append(
          h(
            "span",
            {
              class: `sol-chip cal${ms <= lead * 60_000 ? " soon" : ""}`,
              title: `${t("Economic calendar (Forex Factory), US releases:")}\n${weekLines(all, Date.now()).join("\n")}`,
            },
            h("b", { text: chipWord(next) }),
            h("span", { class: "cal-when", text: ` ${untilShort(ms)}` }),
          ),
        );
      }
      // No room for every chip (many chains, the day pill): the extra chains'
      // coins go first, then BTC, then the index, then the calendar; SOL stays.
      const chips = [...natives.children] as HTMLElement[];
      const dropOrder = [
        ...chips.slice(1, coins.length).filter((c) => !c.textContent?.startsWith("BTC")),
        ...chips.filter((c) => c.textContent?.startsWith("BTC")),
        ...chips.filter((c) => c.classList.contains("fng")),
        ...chips.filter((c) => c.classList.contains("cal")),
      ];
      for (const chip of dropOrder) {
        if (natives.scrollWidth <= natives.clientWidth + 1) break;
        chip.remove();
      }

      status.className = `status-dot ${State.paused ? "paused" : State.marketStatus}`;
      status.title = State.paused
        ? t("Paused")
        : State.marketStatus === "error"
          ? t("Offline: {error}", { error: State.marketError ?? "" })
          : State.lastUpdate
            ? t("Updated {time} ago", { time: formatDuration(Date.now() - State.lastUpdate) })
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
