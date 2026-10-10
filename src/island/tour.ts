// The demo inside the app (tray → Try the demo): the real island plays half a
// minute of a made-up market, with an alert and a pulled liquidity, then
// everything goes back as it was. Nothing is fetched or saved while it runs
// (Companion.hold), and no system notification goes out for a fictional coin.

import { Companion } from "../companion";
import { t } from "../core/i18n";
import { State, uid, type AlertRule, type IslandViewName, type Settings } from "../core/state";
import { DEMO_TOKENS, demoQuotes, driftLive, freshLive, type Live } from "../demo/market";
import type { MascotState } from "../mascot/mascot";

/** What the demo needs from the island. */
export interface TourHost {
  setView(view: IslandViewName): void;
  collapse(): void;
  say(line: string, ms: number): void;
  react(state: MascotState, ms: number): void;
}

/** How long the demo lasts, and the beats in it (ms from the start). */
export const TOUR_MS = 30_000;
const TICK_MS = 2_000;
const BEATS = { alertNote: 4_500, fold: 8_500, pump: 11_000, rug: 19_000, bye: 26_500 };

interface Saved {
  settings: Settings;
  quotes: typeof State.quotes;
  history: typeof State.history;
  events: typeof State.events;
  unseen: typeof State.unseen;
  view: IslandViewName;
  lastTab: IslandViewName;
  search: typeof State.search;
  startedAt: number;
}

export class Tour {
  private saved: Saved | null = null;
  private timers: number[] = [];
  private ticker: number | null = null;
  private live: Record<string, Live> = freshLive();
  private host: TourHost;

  constructor(host: TourHost) {
    this.host = host;
  }

  get running(): boolean {
    return this.saved != null;
  }

  start() {
    if (this.saved) return;
    this.saved = {
      settings: State.settings,
      quotes: State.quotes,
      history: State.history,
      events: State.events,
      unseen: State.unseen,
      view: State.view,
      lastTab: State.lastTab,
      search: State.search,
      startedAt: Date.now(),
    };
    Companion.hold(true);
    State.demo = true;

    // A copy of the settings with the demo's own list and rules: the real ones
    // are never touched.
    const s = structuredClone(State.settings);
    const [candle, froge] = DEMO_TOKENS;
    const rules: AlertRule[] = [
      { id: `demo-${uid()}`, address: candle.key, kind: "pctUp", value: 30, windowMin: 5, enabled: true },
      { id: `demo-${uid()}`, address: froge.key, kind: "liqDrop", value: 30, windowMin: 10, enabled: true },
    ];
    s.companion.watchlist = DEMO_TOKENS.map((tok) => ({ ...tok }));
    s.companion.alerts = rules;
    s.companion.activeFolder = "";
    s.companion.notifications = false;
    State.settings = s;
    State.quotes = {};
    State.history = {};
    State.events = [];
    State.unseen = null;
    State.search = null;

    this.live = freshLive();
    Companion.feed(demoQuotes(this.live));
    this.ticker = window.setInterval(() => {
      driftLive(this.live);
      Companion.feed(demoQuotes(this.live));
    }, TICK_MS);

    this.host.setView("watchlist");
    this.host.react("wave", 1800);
    this.host.say(t("A demo with made-up coins. Nothing here is saved."), 4200);
    this.at(BEATS.alertNote, () => this.host.say(t("I'm watching CANDLE for +30% in 5 min, and FROGE's liquidity."), 4000));
    this.at(BEATS.fold, () => this.host.collapse());
    this.at(BEATS.pump, () => {
      const l = this.live.CANDLE;
      l.price *= 1.42;
      l.m5 = 34.2;
      l.h1 = 48.9;
      Companion.feed(demoQuotes(this.live));
    });
    this.at(BEATS.rug, () => {
      const l = this.live.FROGE;
      l.liq = 220_000;
      l.price *= 0.62;
      l.m5 = -38.4;
      Companion.feed(demoQuotes(this.live));
    });
    this.at(BEATS.bye, () => this.host.say(t("That was the demo. Your own list is back."), 3500));
    this.at(TOUR_MS, () => this.stop());
  }

  /** Ends the demo early or on time: the trader's own island comes back as it was. */
  stop() {
    const saved = this.saved;
    if (!saved) return;
    this.saved = null;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    if (this.ticker != null) window.clearInterval(this.ticker);
    this.ticker = null;

    State.settings = saved.settings;
    State.quotes = saved.quotes;
    State.history = saved.history;
    State.events = saved.events;
    State.unseen = saved.unseen;
    State.search = saved.search;
    State.lastTab = saved.lastTab;
    State.view = saved.view === "event" && !saved.events.length ? "watchlist" : saved.view;
    // The demo's alerts don't belong in "while you were away".
    const seen = Companion.seenEvents;
    for (let i = seen.length - 1; i >= 0; i--) if (seen[i].t >= saved.startedAt) seen.splice(i, 1);
    State.demo = false;
    Companion.hold(false);
    this.host.collapse();
    State.notify();
  }

  private at(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }
}
