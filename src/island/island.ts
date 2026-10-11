// The island: DOM shell, open/close animation, mascot placement, the compact
// ticker and mouse handling. The geometry and click-through handling follow
// Coucou for Windows (MIT, © Louis Raillé); the content is Trader Companion's.

import { Tracked, Spring } from "../core/anim";
import { Bridge, IS_TAURI, copyImage } from "../core/bridge";
import { FULL_NAME } from "../core/brand";
import { t, tn } from "../core/i18n";
import { applyTheme } from "../core/themes";
import { currentLog, summarize, todayKey } from "../discipline/discipline";
import { AWAY_MS, SNAPSHOT_EVERY_MS, awaySummary, type Snapshot } from "../away/away";
import { activeSeason } from "../mascot/seasons";
import { lookFilter } from "../mascot/skins";
import { drawRecapCard, type CardFormat, type CardLook } from "../share/card";
import { openSettingsPanel } from "../web/settings-panel";
import { buildRecap, buildWeekRecap, recapDate, type WeekRange } from "../share/recap";
import { formatClock, formatPct, formatUsd, moveLevel, pctClass, valueCell } from "../core/format";
import {
  CLOSE_MS,
  COMPACT_CORNER,
  COMPACT_H,
  EXPANDED_CORNER,
  FLOAT_MARGIN,
  HIDDEN_W,
  OPEN_DAMPING,
  OPEN_RESPONSE,
  PANEL_H,
  PANEL_W,
  SIDE_W,
  floatsUp,
  isSide,
  islandCorners,
  islandOrigin,
  islandSize,
  mascotPlacement,
  windowSize,
} from "../core/layout";
import { SOUND_NAMES, Sound, type SoundName } from "../core/sound";
import { stepTab, type ShortcutId } from "../core/shortcuts";
import { State, type Companion as CompanionLook, type CompanionEvent, type IslandMode, type IslandViewName, type Placement, type WatchToken } from "../core/state";
import { Companion } from "../companion";
import { Mascot, accessory, dressed, type Badge, type Manifest, type MascotState, type Motion, type MouthCue } from "../mascot/mascot";
import { NEUTRAL_GAZE, NOTICE_PX, fidgetDelay, gazeAt, pickFidget } from "../mascot/gaze";
import {
  COSTUME_MS,
  HOLD_MS,
  MAX_SQUEEZE_MS,
  RELEASE,
  SECRET_STREAK,
  SQUEEZE,
  nextStreak,
  pokeReaction,
  topMoverFact,
  type Reaction,
} from "../mascot/reactions";
import { tokenKey } from "../market/chains";
import { parseInput, parsePasted } from "../market/dexscreener";
import { folderMood, folderTokens } from "../market/folders";
import { flameSize, flourishesFor, shouldFlourish, type Flourish } from "../mascot/flourish";
import { tokenUrl } from "../market/links";
import { formatSignedUsd } from "../positions/positions";
import { h, svg } from "../views/dom";
import { ICONS } from "../views/icons";
import { shownTabs } from "../views/header";
import { Tour } from "./tour";
import { playArrivalFx } from "./greet-fx";
import { buildHeader, buildViews, type ViewActions, type ViewHost } from "../views/views";
import { DRAG_THRESHOLD } from "../mascot/desktop-logic";
import { DesktopLink } from "./desktop";
import { islandDances } from "../core/music";
import { IslandStateMachine } from "./fsm";

/** Same margin as the Rust hit test (src-tauri/src/island.rs). */
const HIT_MARGIN = 14;
/** An island rect no cursor reaches, margin included: a minimized island's. */
const NOWHERE = { x: -10_000, y: -10_000, w: 0, h: 0 };
const GREETING_MS = 3900;
/** The fall into the island and the landing bounce, before the hello (see Mascot.arrive). */
const ARRIVAL_MS = 750;

const TICKER_STEP_MS = 3000;
/** A buy or sell just seen stays on the ticker this long (see State.feed). */
const FEED_SHOW_MS = 12_000;
/** The ticker's dots: one per token, this many at most (then "+N"). */
const MAX_DOTS = 10;
/** How long the ticker shows what a drop did. */
const DROP_NOTE_MS = 3500;
/** Poke motions the canvas plays as a roll of the whole drawing, in place of their CSS spin. */
const CANVAS_ROLLS: Partial<Record<Motion, { turns: number; seconds: number }>> = {
  spin: { turns: 1, seconds: 0.6 },
  dizzy: { turns: 2, seconds: 1.3 },
};

const modeOrder = (m: IslandMode) => (m === "hidden" ? 0 : m === "compact" ? 1 : 2);
const TAB_VIEWS: ReadonlySet<IslandViewName> = new Set(["watchlist", "trending", "alerts", "positions", "wallets", "discipline", "wardrobe", "music"]);

/** What the mascot does, and which sound plays, when an event pops up. */
function reactionFor(e: CompanionEvent): { mascot: MascotState; sound: SoundName } {
  switch (e.kind) {
    case "alert": {
      // A folder can have its own alert sound (Settings → Alerts).
      const folder = State.token(e.address)?.folder;
      const own = folder ? State.companion.folderSounds[folder] : undefined;
      const sound = own && (SOUND_NAMES as readonly string[]).includes(own) ? (own as SoundName) : null;
      if (e.tone === "up") return { mascot: "celebrate", sound: sound ?? "alertUp" };
      if (e.tone === "down") return { mascot: "shocked", sound: sound ?? "alertDown" };
      return { mascot: "alert", sound: sound ?? "warn" };
    }
    case "tilt":
      return { mascot: "worried", sound: "reminder" };
    case "sessionEnd":
      return { mascot: "tired", sound: "reminder" };
    case "checklist":
      return { mascot: "focused", sound: "hmm" };
    case "weekRecap":
      return { mascot: "proud", sound: "greet" };
    case "checkin":
      return { mascot: "focused", sound: "hmm" };
    case "break":
      return { mascot: "tired", sound: "reminder" };
    case "lossLimit":
      return { mascot: "stop", sound: "reminder" };
    case "maxTrades":
      return { mascot: "alert", sound: "reminder" };
    case "cooldown":
      return { mascot: "tired", sound: "reminder" };
    case "away":
      return { mascot: "wave", sound: "greet" };
    case "update":
      return { mascot: "excited", sound: "greet" };
    case "macro":
      return { mascot: "focused", sound: "reminder" };
  }
}

export class Island {
  readonly fsm = new IslandStateMachine();
  readonly mascot = new Mascot();

  private root: HTMLElement;
  private islandEl!: HTMLElement;
  private contentEl!: HTMLElement;
  private compactEl!: HTMLElement;
  private tickerEl!: HTMLElement;
  private captionEl!: HTMLElement;
  private wardrobeBtn!: HTMLElement;
  private countdownEl!: HTMLElement;
  /** The arrival's streaks and ring (see greet-fx.ts). */
  private fxCanvas!: HTMLCanvasElement;
  /** A dropped token being looked up: the bar along the bottom (see searchBar). */
  private searchEl!: HTMLElement;
  private wakeStrip!: HTMLElement;

  private header!: ViewHost;
  private views!: Map<IslandViewName, ViewHost>;

  private width = new Tracked(HIDDEN_W);
  private height = new Tracked(0);
  private radius = new Tracked(COMPACT_CORNER);
  private mCx = new Spring(24, OPEN_RESPONSE, OPEN_DAMPING);
  private mCy = new Spring(6, OPEN_RESPONSE, OPEN_DAMPING);
  private mSize = new Spring(10, OPEN_RESPONSE, OPEN_DAMPING);

  private running = false;
  private lastFrame = 0;
  private dirty = true;

  // Rust starts the window at full size so the launch greeting has room.
  private collapsed = false;
  private collapseTimer: number | null = null;
  private wasInIsland = false;
  private pushedRect = { x: -1, y: -1, w: -1, h: -1 };
  /** Root offset and scale inside the page — only used in a plain browser. */
  private origin = { x: 0, y: 0, scale: 1 };

  private tickerIndex = 0;
  private tickerAt = 0;
  private secondTimer: number | null = null;

  private mascotHoverTimer: number | null = null;
  private lastLove = 0;
  private overMascot = false;
  // Pokes (see reactions.ts).
  private streak = 0;
  private lastClickAt = -Infinity;
  private lastPoke = -1;
  private annoyedUntil = 0;
  private pressTimer: number | null = null;
  private squeezeTimer: number | null = null;
  private costumeTimer: number | null = null;
  private pressing = false;
  private squeezing = false;
  // Following the mouse and fidgeting (see gaze.ts).
  private fidgetTimer: number | null = null;
  private cursorDist = Infinity;
  private lastNotice = 0;
  private inputFocused = false;
  private manifest: Manifest | null = null;
  private lastRowsKey = "";
  private followMouse: boolean;
  // A link or an address dragged onto the island (see wireDrop).
  private dragDepth = 0;
  private dropBusy = false;
  /** Lookups with the mouth open (a drop, a pasted address): a drag leaving meanwhile must not shut it. */
  private lookups = 0;

  /** Candy out on the desktop, in his own window (src/island/desktop.ts). */
  private desktop = new DesktopLink({
    reveal: () => this.reveal(),
    wearing: () => {
      // A look being tried on in the wardrobe shows on the desktop Candy too.
      const tried = this.tried;
      const kept = this.look();
      return {
        costume: tried?.costume ?? State.companion.costume,
        hat: accessory(this.manifest, "outfits", tried?.outfit ?? kept.hat),
        face: accessory(this.manifest, "faces", tried?.face ?? kept.face),
        filter: lookFilter(tried ?? State.companion),
      };
    },
    react: (state, ms) => this.mascot.react(state, ms),
    poked: () => (State.lastActivity = performance.now()),
    dropped: (text) => void this.dropped(text),
    wardrobe: () => this.toggleWardrobe(),
  });
  /** The demo inside the app (tray → Try the demo): src/island/tour.ts. */
  private tour = new Tour({
    setView: (v) => {
      State.minimized = false;
      this.setView(v);
    },
    collapse: () => this.collapse(),
    say: (line, ms) => this.mascot.say(line, ms),
    react: (state, ms) => this.mascot.react(state, ms),
  });
  /** A press on the mascot that may become a drag out to the desktop: where it started. */
  private mascotPress: { x: number; y: number; folded?: boolean } | null = null;
  private dropNote: { text: string; tone: "up" | "warn"; until: number } | null = null;

  /**
   * `followMouse: false` ignores the real mouse in a browser — the demo drives
   * the island with its own scripted cursor.
   */
  constructor(root: HTMLElement, opts: { followMouse?: boolean } = {}) {
    this.root = root;
    this.followMouse = opts.followMouse ?? true;
    this.build();
    this.wireFsm();
    this.wireInput();
    State.subscribe(() => {
      this.dirty = true;
      this.ensureRunning();
    });
  }

  useArt(manifest: Manifest) {
    this.manifest = manifest;
    State.art = manifest;
    this.worn = State.companion.costume;
    this.mascot.use(dressed(manifest, this.worn));
    this.wearChosen();
  }

  /** The costume the mascot has on (see wearCostume). */
  private worn = "none";

  /** Swaps the body's art when the costume changes; the mood carries over. */
  private wearCostume() {
    const costume = State.companion.costume;
    if (!this.manifest || costume === this.worn) return;
    this.worn = costume;
    this.mascot.use(dressed(this.manifest, costume));
  }

  /** The hat and face to wear: the trader's, or the season's for a few days. */
  private look(): { hat: string; face: string } {
    const c = State.companion;
    const season = activeSeason(new Date(), c.seasonal, c.seasonOff);
    return { hat: season?.hat ?? c.outfit, face: season?.face ?? c.face };
  }

  /** Puts on the current look (see look()). */
  private wearChosen() {
    const { hat, face } = this.look();
    this.lookDay = todayKey();
    this.mascot.setOutfit(accessory(this.manifest, "outfits", hat));
    this.mascot.setFace(accessory(this.manifest, "faces", face));
  }

  /**
   * Tries a look on (the wardrobe's hover): hat, face, colour or costume at
   * once, nothing saved. Null puts the kept look back.
   */
  private previewLook(apply: ((c: CompanionLook) => void) | null) {
    if (!this.manifest) return;
    this.previewing = apply != null;
    this.tried = null;
    State.notify();
    if (!apply) {
      this.mascot.setFilter(lookFilter(State.companion));
      this.wearCostume();
      const { hat, face } = this.look();
      this.mascot.setOutfit(accessory(this.manifest, "outfits", hat), false);
      this.mascot.setFace(accessory(this.manifest, "faces", face));
      return;
    }
    const look = { ...State.companion, customSkin: { ...State.companion.customSkin } };
    apply(look);
    this.tried = look;
    if (look.costume !== this.worn) {
      this.worn = look.costume;
      this.mascot.use(dressed(this.manifest, look.costume));
    }
    this.mascot.setFilter(lookFilter(look));
    this.mascot.setOutfit(accessory(this.manifest, "outfits", look.outfit), false);
    this.mascot.setFace(accessory(this.manifest, "faces", look.face));
  }

  /** A look is being tried on (see previewLook): put the kept one back when the wardrobe goes. */
  private previewing = false;
  /** That look, for the desktop Candy too. */
  private tried: CompanionLook | null = null;

  /** The day the look was put on: a new day may start or end a season. */
  private lookDay = "";

  // ── DOM ─────────────────────────────────────────────────────────────────────

  private build() {
    const actions: ViewActions = {
      setView: (v) => this.setView(v),
      blip: () => Sound.play("blip"),
      toggleSound: () => {
        State.settings.soundEnabled = !State.settings.soundEnabled;
        Sound.setEnabled(State.settings.soundEnabled);
        Companion.save();
      },
      // The app has a settings window; a browser gets a panel over the page.
      openSettings: () => (IS_TAURI ? void Bridge.openSettingsWindow() : openSettingsPanel()),
      openToken: (address, fallback) => {
        // The demo's coins are made up: no site has them.
        if (State.demo) return this.mascot.say(t("A made-up coin: nowhere to open it"), 2200);
        const token = State.token(address) ?? fallback;
        if (token) void Bridge.openUrl(tokenUrl(State.companion.terminal, token));
      },
      openUrl: (url) => void Bridge.openUrl(url),
      focusInput: (on) => {
        if (this.inputFocused === on) return;
        this.inputFocused = on;
        // While typing the island must not fold away under the cursor.
        this.fsm.pinned = on;
        void Bridge.focusWindow(on);
      },
      dismissEvent: () => this.dismissEvent(),
      foldEvent: () => this.foldEvent(),
      relayout: () => this.animateGeometry(),
      mouth: (state) => {
        if (state === "open") {
          this.lookups++;
          this.cue({ kind: "open" });
          return;
        }
        this.lookups = Math.max(0, this.lookups - 1);
        this.cue(state === "shut" ? { kind: "unready", keepOpen: false } : { kind: "gulp" });
      },
      shareDay: () => this.shareDay(),
      shareWeek: (range, format) => this.shareWeek(range, format),
      candy: (act) => {
        const ms = act.ms ?? 1000;
        if (act.react) this.mascot.react(act.react, ms);
        if (act.say !== undefined) this.mascot.say(act.say, ms);
        if (act.emit) this.mascot.emit(act.emit, 1);
        if (act.hop) this.mascot.hop(7);
        if (act.sound) Sound.play(act.sound);
        if (act.look === null) this.mascot.lookAt(NEUTRAL_GAZE);
        else if (act.look && State.companion.lively) {
          // The eyes on the start of the line he is reading.
          const m = this.mascot.el.getBoundingClientRect();
          const r = act.look.getBoundingClientRect();
          this.mascot.lookAt(gazeAt(m.left + m.width / 2, m.top + m.height / 2, r.left + Math.min(r.width, 160) / 2, r.top + r.height / 2));
        }
      },
      // A sticky card, or a field being typed in, stays open anyway.
      holdOpen: (on) => this.fsm.hold(on || State.companion.stickyAlerts || this.inputFocused, this.wasInIsland),
      applyLook: () => this.applySettings(),
      previewLook: (apply) => this.previewLook(apply),
      minimize: () => this.minimize(),
    };

    this.actions = actions;
    this.wakeStrip = h("div", { id: "wake-strip" });
    this.header = buildHeader(actions);
    this.views = buildViews(actions);
    const viewsEl = h("div", { id: "views" });
    for (const v of this.views.values()) viewsEl.append(v.el);
    this.contentEl = h("div", { id: "content" }, this.header.el, viewsEl);

    this.tickerEl = h("div", { class: "ticker" });
    this.compactEl = h("div", { id: "compact" }, this.tickerEl);
    this.captionEl = h("div", { id: "caption" });
    // The wardrobe, one click from Candy: hat, face and colour in the island.
    this.wardrobeBtn = h(
      "button",
      {
        class: "wardrobe-btn",
        type: "button",
        onclick: () => {
          Sound.play("blip");
          this.setView(State.view === "wardrobe" ? State.lastTab : "wardrobe");
        },
      },
      svg(ICONS.shirt, 14, { stroke: 1.8 }),
    );

    // The auto-close counting down: a thin bar that runs out along the bottom.
    this.countdownEl = h("div", { class: "countdown" });
    this.fsm.onCountdown = (seconds) => {
      const el = this.countdownEl;
      el.classList.remove("on");
      if (seconds == null) return;
      void el.offsetWidth;
      el.style.animationDuration = `${seconds}s`;
      el.classList.add("on");
    };
    this.fxCanvas = h("canvas", { class: "arrival-fx" }) as HTMLCanvasElement;
    this.searchEl = h("div", { class: "search-bar" }, h("i"));
    const clip = h("div", { id: "island-clip" }, this.fxCanvas, this.contentEl, this.compactEl, this.countdownEl, this.searchEl);
    this.islandEl = h("div", { id: "island" }, clip, this.captionEl, this.wardrobeBtn, this.mascot.el);
    this.root.append(this.wakeStrip, this.islandEl);
    this.labelChrome();
    this.applyGeometry();
  }

  private actions!: ViewActions;

  /** The few words on the island itself, outside the views. */
  private labelChrome() {
    this.compactEl.title = t("Click to open · hold Ctrl to click what is behind");
    this.wardrobeBtn.title = t("Wardrobe: hat, face, colour");
  }

  /**
   * The language changed (src/core/i18n.ts): the header and every view are
   * built again in its words, in place; the mascot, the ticker and what the
   * companion knows carry on.
   */
  relabel() {
    const header = buildHeader(this.actions);
    const views = buildViews(this.actions);
    const viewsEl = h("div", { id: "views" });
    for (const v of views.values()) viewsEl.append(v.el);
    this.contentEl.replaceChildren(header.el, viewsEl);
    this.header = header;
    this.views = views;
    this.labelChrome();
    this.lastRowsKey = "";
    this.dirty = true;
    // His caption is the mood's own line: worked out again, in the new words.
    Companion.recomputeMood();
    State.notify();
  }

  /** Today's recap as an image: copied to the clipboard (and saved, in a browser). */
  private async shareDay(): Promise<string> {
    return this.deliver(await this.recapImage(), `my-day-${todayKey()}.png`);
  }

  /** A week's recap (the Monday card, or Share my week) as an image, wide or as a 9:16 story. */
  private async shareWeek(range: WeekRange, format: CardFormat): Promise<string> {
    const c = State.companion;
    const recap = buildWeekRecap({ range, hideMoney: c.recapHideMoney, unit: c.discipline.unit, trades: c.journal }, FULL_NAME);
    const png = await drawRecapCard(recap, this.cardLook(), FULL_NAME, format);
    return this.deliver(png, `my-${range.period === "month" ? "month" : "week"}-${todayKey(new Date(range.from))}${format === "story" ? "-story" : ""}.png`, format);
  }

  /** Copies a card to the clipboard (and saves it, in a browser), and says how that went. */
  private async deliver(png: Blob, file: string, format: CardFormat = "wide"): Promise<string> {
    const copied = await copyImage(png);
    this.feel("cool", t("looking good 😎"));
    if (!IS_TAURI) {
      const url = URL.createObjectURL(png);
      const a = h("a", { href: url, download: file });
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return copied ? t("Image copied and downloaded.") : t("Image downloaded.");
    }
    if (!copied) return t("Couldn't copy the image.");
    return format === "story" ? t("Image copied. Paste it on your story (Instagram, TikTok, Telegram).") : t("Image copied. Paste it on X or Telegram.");
  }

  /** How Candy looks on a card: the costume, colour, hat and face of now. */
  private cardLook(): CardLook {
    const c = State.companion;
    return {
      manifest: this.manifest ? dressed(this.manifest, c.costume) : { name: "", states: {} },
      filter: lookFilter(c),
      hat: accessory(this.manifest, "outfits", this.look().hat),
      face: accessory(this.manifest, "faces", this.look().face),
    };
  }

  /** Today's recap card, drawn as Share my day draws it (the demo shows it too). */
  async recapImage(): Promise<Blob> {
    const c = State.companion;
    const day = summarize(currentLog(c.log));
    const held = Companion.positions();
    let topMover: { symbol: string; pct: number } | null = null;
    for (const t of c.watchlist) {
      const pct = State.quotes[t.key]?.change.h24;
      if (pct != null && Number.isFinite(pct) && (!topMover || Math.abs(pct) > Math.abs(topMover.pct))) topMover = { symbol: t.symbol, pct };
    }
    const recap = buildRecap(
      {
        date: recapDate(new Date()),
        hideMoney: c.recapHideMoney,
        trades: { ...day, unit: c.discipline.unit },
        hasRules: c.discipline.dailyLossLimit > 0 || c.discipline.maxTradesPerDay > 0,
        stopped: Companion.stoppedToday,
        positions: held.length || c.book.realizedToday
          ? {
              count: held.length,
              openPnl: held.reduce((s, x) => s + x.s.pnlUsd, 0),
              cost: held.reduce((s, x) => s + x.s.costUsd, 0),
              realizedToday: c.book.day === todayKey() ? c.book.realizedToday : 0,
            }
          : null,
        topMover,
        fearGreed: c.headerMarket && State.fearGreed ? { value: State.fearGreed.value, label: State.fearGreed.label } : null,
      },
      FULL_NAME,
    );
    return drawRecapCard(recap, this.cardLook(), FULL_NAME);
  }

  // ── State machine ───────────────────────────────────────────────────────────

  private wireFsm() {
    this.fsm.onTransition = (from, to) => {
      switch (to) {
        case "hidden":
          this.setMode("hidden");
          break;
        case "petit":
          if (from === "hidden") Sound.play("hover");
          this.setMode("compact");
          if (!this.wasInIsland) this.fsm.mouseLeft();
          break;
        case "home":
          this.expand(State.events.length > 0 ? "event" : TAB_VIEWS.has(State.view) ? State.view : "watchlist");
          if (!this.wasInIsland) this.fsm.mouseLeft();
          break;
        case "greet":
          this.expand("greeting");
          // The arrival: streaks as he drops into the island, a ring as he
          // lands with a bounce; he slides aside, waves hello with a little
          // hand, slides back and blinks as the island folds him into the ticker.
          this.mascot.arrive();
          this.playArrivalFx();
          window.setTimeout(() => {
            // Happy, not "wave": the hello's own drawn hands do the waving.
            this.mascot.react("happy", GREETING_MS - ARRIVAL_MS);
            Sound.play("greet");
          }, ARRIVAL_MS);
          window.setTimeout(() => {
            this.mascot.blink();
            this.fsm.greetComplete();
            // Back to his spot on the desktop, if that is where he lives.
            this.desktop.launch();
          }, GREETING_MS);
          break;
      }
      State.notify();
    };
  }

  launch() {
    this.fsm.launch();
  }

  /** The arrival's streaks and ring, behind Candy, sized to the greeting island. */
  private playArrivalFx() {
    const place = this.shapePlacement();
    const { w, h } = islandSize("expanded", "greeting", 0, place);
    const at = mascotPlacement("expanded", "greeting", h, place);
    this.fxCanvas.style.width = `${w}px`;
    this.fxCanvas.style.height = `${h}px`;
    playArrivalFx(this.fxCanvas, at.cx, at.cy);
  }

  /** Opens the wardrobe (the island opens with it), or closes it back to the last tab. */
  toggleWardrobe() {
    Sound.play("pop");
    this.mascotHoverOut();
    if (State.mode === "expanded" && State.view === "wardrobe") this.setView(State.lastTab);
    else this.setView("wardrobe");
  }

  /** Wires Candy's desktop window (the app only; a browser has no second window). */
  initDesktop() {
    if (IS_TAURI) void this.desktop.init();
  }

  // ── Mode / view ─────────────────────────────────────────────────────────────

  private setMode(mode: IslandMode) {
    const prev = State.mode;
    if (mode === prev) return;
    State.mode = mode;
    if (mode === "expanded") Sound.play("open");
    if (prev === "expanded") {
      Sound.play("close");
      if (this.inputFocused) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }
    this.mascot.setActive(mode !== "hidden");
    if (mode === "hidden") this.mascot.lookAt(NEUTRAL_GAZE);
    // Start or stop fidgeting; a bare mode change between visible ones keeps the clock.
    if (mode === "hidden" || prev === "hidden") this.scheduleFidget();
    this.updateWindowCollapsed();
    this.animateGeometry(modeOrder(mode) < modeOrder(prev));
    this.updateSecondTimer();
    State.notify();
  }

  private expand(view: IslandViewName) {
    State.view = view;
    if (State.mode !== "expanded") this.setMode("expanded");
    else this.animateGeometry();
    State.lastActivity = performance.now();
    State.notify();
  }

  setView(view: IslandViewName) {
    State.minimized = false;
    if (TAB_VIEWS.has(view) && view !== "wardrobe") State.lastTab = view;
    if (State.mode !== "expanded") {
      State.view = view;
      this.fsm.forceHome();
      return;
    }
    State.view = view;
    State.lastActivity = performance.now();
    this.animateGeometry();
    State.notify();
  }

  collapse() {
    this.fsm.pinned = false;
    this.fsm.forcePetit();
  }

  /** A short feeling for something the trader did, with a line in its bubble. */
  feel(state: MascotState, line: string) {
    if (State.mode === "hidden") return;
    this.mascot.react(state, 2800);
    this.mascot.say(line, 2800);
  }

  // ── Flourishes: now and then, never every time (src/mascot/flourish.ts) ──────

  private flourished = new Map<Flourish, number>();

  /** Plays a flourish if its moment's dice say so and it hasn't played lately. Only on screen, and only with Lively on. */
  private tryFlourish(kind: Flourish, size?: number): boolean {
    if (State.mode === "hidden" || State.minimized || !State.companion.lively || State.mascotAway) return false;
    if (!shouldFlourish(kind, this.flourished, Date.now(), Math.random())) return false;
    const m = this.mascot;
    switch (kind) {
      case "confetti":
        m.emit("confetti", 18);
        break;
      case "fireworks":
        m.emit("firework", 36);
        m.emit("confetti", 10);
        break;
      case "cloud":
        m.emit("cloud", 1);
        m.emit("rain", 8);
        break;
      case "coins":
        m.emit("coin", 5);
        break;
      case "tear":
        m.emit("tear", 1);
        break;
      case "smoke":
        m.emit("smoke", 5);
        break;
      case "flame":
        m.emit("flame", 1, size ?? 1);
        break;
      case "joyJump":
        m.joyJump();
        break;
      case "shrink":
        m.shrinkTremble();
        break;
      case "yawn":
        m.yawn();
        break;
      case "boing":
        m.squash(0.7);
        break;
      case "glance":
        // The ticker's numbers sit to the right of the folded Candy.
        m.glance({ x: 1, y: 0.1 });
        break;
    }
    return true;
  }

  /** One flourish for an event, at most: one of those it could bring, picked at random, then its own dice. */
  private flourishFor(e: CompanionEvent) {
    const c = State.companion;
    const week = e.kind === "weekRecap" ? buildWeekRecap({ range: e, hideMoney: false, unit: c.discipline.unit, trades: c.journal }, "").total : undefined;
    const kinds = flourishesFor(e, week);
    if (!kinds.length) return;
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.tryFlourish(kind, kind === "flame" ? 1.2 : undefined);
  }

  /** A whole trade closed: coins for a profit, now and then; a tear for a loss, rarer. */
  tradeClosed(pnl: number) {
    this.tryFlourish(pnl > 0 ? "coins" : "tear");
  }

  /** The mood changed: a little boing now and then; a tear when sad; the wick lit when the hour rises. */
  private moodChanged(next: MascotState) {
    if (next === "sad") this.tryFlourish("tear");
    else if (next === "celebrate" || next === "excited") {
      const size = flameSize(folderMood(State.companion.watchlist, State.quotes).pct);
      if (size == null || !this.tryFlourish("flame", size)) this.tryFlourish("boing");
    } else if (next === "stop") this.tryFlourish("smoke");
    else this.tryFlourish("boing");
  }
  private lastMood: MascotState | null = null;
  /** The token the ticker showed last, and its price then (see the glance). */
  private tickerSeen: { key: string; price: number } | null = null;

  /** A fired alert or a reminder: open on the event card. */
  showEvent(e: CompanionEvent) {
    // Something fullscreen (a game, a video, a presentation): the card and its
    // sound wait in the queue until it is over (Settings → Quiet in fullscreen).
    if (this.quietCheck()) {
      void Bridge.fullscreenBusy().then((busy) => (busy ? this.holdForFullscreen() : this.presentEvent(e)));
      return;
    }
    this.presentEvent(e);
  }

  /** Whether to ask Windows about fullscreen before an alert shows. */
  private quietCheck(): boolean {
    return IS_TAURI && State.os === "windows" && State.companion.fullscreenQuiet;
  }

  /** Checks every 15 s until nothing is fullscreen, then shows what waited. Nothing runs once it is out. */
  private holdForFullscreen() {
    if (this.quietTimer != null) return;
    this.quietTimer = window.setInterval(() => {
      void Bridge.fullscreenBusy().then((busy) => {
        if (busy || this.quietTimer == null) return;
        window.clearInterval(this.quietTimer);
        this.quietTimer = null;
        const next = State.events[0];
        if (next) this.presentEvent(next);
      });
    }, 15_000);
  }
  private quietTimer: number | null = null;

  private presentEvent(e: CompanionEvent) {
    const r = reactionFor(e);
    // Minimized: it waits in the queue, and shows when Candy comes back (and
    // as a Windows notification, when those are on).
    if (State.minimized) return;
    this.flourishFor(e);
    // A card already up just counts one more in its queue.
    if (State.mode === "expanded" && State.view === "event") {
      Sound.play("blip");
      State.notify();
      return;
    }
    Sound.play(r.sound);
    this.mascot.react(r.mascot, 3500);
    this.fsm.forceHome();
    this.expand("event");
    // Settings → Keep alert cards: it stays until it is looked at.
    if (State.companion.stickyAlerts) this.fsm.pinned = true;
    // forceHome cancels the auto-close; with nobody at the island, restart it
    // so the card folds back into the ticker instead of staying up for good.
    if (!this.wasInIsland) this.fsm.mouseLeft();
  }

  /** The card's ⌃: folds it into the ticker, unanswered; opening the island shows it again. */
  private foldEvent() {
    this.fsm.pinned = false;
    this.collapse();
  }

  private dismissEvent() {
    State.events.shift();
    State.unseen = null;
    const next = State.events[0];
    if (next) {
      const r = reactionFor(next);
      Sound.play(r.sound);
      this.mascot.react(r.mascot, 3000);
      State.notify();
      return;
    }
    State.view = "watchlist";
    this.collapse();
  }

  reveal() {
    if (State.minimized) return;
    this.fsm.reveal();
  }

  /**
   * The header's minimize button: out of the way, even with the ticker kept on
   * screen, and the mouse at the screen's edge doesn't bring it back. The
   * show/hide shortcut, or Open in the tray, does (see toggle, setView).
   */
  minimize() {
    State.minimized = true;
    this.fsm.pinned = false;
    this.fsm.forceHidden();
  }

  /** A press outside the island: fold it back into the ticker. */
  clickOutside() {
    if (State.mode !== "expanded") return;
    // An open dropdown draws its list outside the island; picking from it is
    // not a click elsewhere.
    if (document.activeElement instanceof HTMLSelectElement) return;
    this.collapse();
  }

  /** The show/hide shortcut: opens the island, or folds it back. */
  toggle() {
    Sound.resume();
    State.minimized = false;
    if (State.mode === "expanded") this.collapse();
    else {
      this.fsm.forceHome();
      if (!this.wasInIsland) this.fsm.mouseLeft();
    }
  }

  /** Tray → Try the demo: starts it, or ends it early. */
  toggleDemo() {
    if (this.tour.running) this.stopDemo();
    else {
      Sound.resume();
      if (State.paused) Companion.setPaused(false);
      this.tour.start();
    }
  }

  stopDemo() {
    this.tour.stop();
  }

  /** A global shortcut was pressed (src/core/shortcuts.ts lists them). */
  shortcut(id: ShortcutId) {
    Sound.resume();
    switch (id) {
      case "toggle":
        return this.toggle();
      case "paste":
        return void this.pasteToken();
      case "alert":
        return this.openAlert();
      case "nextTab":
      case "prevTab":
        return this.stepTab(id === "nextTab" ? 1 : -1);
      case "mute":
        return this.toggleMute();
      case "wardrobe":
        return this.toggleWardrobe();
      case "desktop":
        return this.toggleDesktop();
    }
  }

  /** Opens the island the way a shortcut does: the auto-close runs unless the pointer is in it. */
  private openFromKeys(view: IslandViewName) {
    State.minimized = false;
    this.setView(view);
    if (!this.wasInIsland) this.fsm.mouseLeft();
  }

  /**
   * An alert's Windows notification was answered (src/core/notify.ts): Open
   * opens the token on the terminal, Mute 1 h silences it, a click on the
   * notification itself shows the waiting card. The first two take its card away.
   */
  toastAction(action: string, key: string) {
    const card = State.events.find((e) => e.kind === "alert" && e.address === key);
    if (action === "open" || action === "mute") {
      if (action === "mute") Companion.muteToken(key, 60);
      else {
        const token = State.token(key) ?? (card?.kind === "alert" ? card.token : undefined);
        if (token && !State.demo) void Bridge.openUrl(tokenUrl(State.companion.terminal, token));
      }
      if (!card) return;
      if (State.events[0] === card && State.mode === "expanded" && State.view === "event") return this.dismissEvent();
      State.events.splice(State.events.indexOf(card), 1);
      if (State.unseen === card) State.unseen = null;
      State.notify();
      return;
    }
    State.minimized = false;
    this.openAlert();
  }

  /** The waiting alert's card, or the Alerts tab when none waits. */
  private openAlert() {
    if (State.events.length) {
      this.openFromKeys("event");
      if (State.companion.stickyAlerts) this.fsm.pinned = true;
      return;
    }
    this.openFromKeys("alerts");
    this.mascot.say(t("No alert waiting"), 1800);
  }

  /** The next or previous tab; a folded island opens on the last one. */
  private stepTab(step: 1 | -1) {
    const tabs = shownTabs();
    if (State.mode !== "expanded") {
      this.openFromKeys(tabs.includes(State.lastTab) ? State.lastTab : tabs[0]);
      return;
    }
    const next = stepTab(tabs, State.view, step);
    if (!next) return;
    Sound.play("blip");
    this.openFromKeys(next);
  }

  private toggleMute() {
    State.settings.soundEnabled = !State.settings.soundEnabled;
    Sound.setEnabled(State.settings.soundEnabled);
    Companion.save();
    if (State.mode === "hidden") this.reveal();
    if (State.settings.soundEnabled) Sound.play("blip");
    this.mascot.say(State.settings.soundEnabled ? t("Sound on") : t("Muted"), 1600);
  }

  /** Candy out to his spot on the desktop, or home again. */
  private toggleDesktop() {
    if (!this.desktop.supported) {
      if (State.mode === "hidden") this.reveal();
      this.mascot.say(t("I can't leave the island here"), 2200);
      return;
    }
    void this.desktop.controller.flyOutOrHome();
  }

  /** Applies settings at boot and whenever the settings window saves. */
  applySettings() {
    Sound.setEnabled(State.settings.soundEnabled);
    Sound.setVolume(State.settings.soundVolume);
    document.body.dataset.theme = State.companion.theme;
    applyTheme(document.body, State.companion.theme);
    this.mascot.setFilter(lookFilter(State.companion));
    this.wearCostume();
    this.wearChosen();
    if (!State.companion.lively) this.mascot.lookAt(NEUTRAL_GAZE);
    this.scheduleFidget();
    this.fsm.homeToPetitDelay = State.settings.autoCloseInterval;
    this.fsm.openOnHover = State.companion.openOnHover;
    // A floating island has no edge to hide behind: its ticker always stays.
    const stays = State.companion.keepTickerVisible || this.placement() === "float";
    this.fsm.petitToHiddenDelay = stays ? Infinity : 60;
    if (stays && this.fsm.state === "hidden") this.reveal();
    this.applyPlacement();
    State.notify();
  }

  // ── Placement ───────────────────────────────────────────────────────────────

  /** Where the island lives now. A browser window too narrow for the panel keeps it on top. */
  private placement(): Placement {
    if (!IS_TAURI && window.innerWidth < PANEL_W + 40) return "top";
    // Without a cursor poll (Linux) only the top edge works (see State.cursorPoll).
    if (IS_TAURI && !State.cursorPoll) return "top";
    return State.settings.placement;
  }

  private placed: Placement | null = null;

  /** Lays the island out for its placement (sizes, the side tab, the wake strip). */
  private applyPlacement() {
    const place = this.placement();
    document.body.dataset.placement = place;
    // On a side edge: the upright tab, and the sidebar when open (see style.css).
    document.body.classList.toggle("sidebar", isSide(place));
    this.compactEl.classList.toggle("vertical", isSide(place));
    this.placeRoot();
    if (place !== this.placed) {
      this.placed = place;
      this.animateGeometry();
    }
  }

  /**
   * In a browser the 720×340 stage stands in for the window: CSS puts it on
   * the top or a side edge; a floating one goes where it was dragged, by the
   * same rule as the app's window (src-tauri/src/island.rs).
   */
  private placeRoot() {
    if (IS_TAURI) return;
    const st = this.root.style;
    if (this.placement() !== "float") {
      st.left = st.top = "";
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pill = FLOAT_MARGIN + COMPACT_H / 2;
    const cx = State.settings.floatX * vw;
    const cy = State.settings.floatY * vh;
    const top = floatsUp(State.settings.floatY) ? cy + pill - PANEL_H : cy - pill;
    st.left = `${Math.max(0, Math.min(vw - PANEL_W, cx - PANEL_W / 2))}px`;
    st.top = `${Math.max(0, Math.min(vh - PANEL_H, top))}px`;
  }

  /**
   * A press on the floating ticker: a drag moves it, a click opens it. The app
   * moves its window from Rust (it answers with "float-drag-end"); a browser
   * moves the stage.
   */
  private pressFloat(e: MouseEvent) {
    if (IS_TAURI) {
      void Bridge.startFloatDrag();
      return;
    }
    const r0 = this.root.getBoundingClientRect();
    const from = { x: e.clientX, y: e.clientY, left: r0.left, top: r0.top };
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - from.x;
      const dy = ev.clientY - from.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      this.root.style.left = `${from.left + dx}px`;
      this.root.style.top = `${from.top + dy}px`;
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (!moved) return this.floatDragEnded(false);
      // Where the ticker's centre ended up, as fractions of the page.
      const r = this.root.getBoundingClientRect();
      const pill = FLOAT_MARGIN + COMPACT_H / 2;
      const cy = floatsUp(State.settings.floatY) ? r.top + PANEL_H - pill : r.top + pill;
      this.floatDragEnded(true, (r.left + PANEL_W / 2) / window.innerWidth, cy / window.innerHeight);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  /** The floating ticker was let go: moved to (x, y) — fractions of the display — or just clicked. */
  floatDragEnded(moved: boolean, x?: number | null, y?: number | null) {
    if (!moved) {
      this.fsm.click();
      return;
    }
    if (x != null && y != null) {
      State.settings.floatX = Math.min(1, Math.max(0, x));
      State.settings.floatY = Math.min(1, Math.max(0, y));
      // The app saved it already (and moved its window by the same rule).
      if (!IS_TAURI) Companion.save();
    }
    this.placeRoot();
    // Past the middle of the display it hangs the other way.
    this.animateGeometry();
  }

  // ── Geometry ────────────────────────────────────────────────────────────────

  private rowsFor(view: IslandViewName): number {
    // Search results take the list's place (and the island's height) while open.
    if (view === "watchlist") {
      if (State.search) return Math.max(1, State.search.results.length);
      return folderTokens(State.companion.watchlist, State.companion.activeFolder).length;
    }
    if (view === "trending") return State.trending[State.trendingList].length;
    if (view === "alerts") return State.companion.alerts.length;
    if (view === "wallets") return State.companion.wallets.filter((w) => !w.mine).length;
    if (view === "positions") {
      if (!State.companion.wallets.some((w) => w.mine)) return 0;
      return State.walletActivity ? Math.max(1, State.companion.book.activity.length) : Math.max(1, Companion.positions().length);
    }
    if (view === "discipline") return State.journalOpen ? 1 : 0;
    if (view === "event") {
      const e = State.events[0];
      // The checklist's six lines and what Candy makes of them; the away card's lines and its row of moves.
      if (e?.kind === "checklist") return 7;
      if (e?.kind === "weekRecap") return 3;
      return e?.kind === "away" ? e.lines.length + (e.moves?.length ? 1 : 0) : 0;
    }
    return 0;
  }

  /**
   * The placement the island's size and mascot follow. A floating island never
   * hides (it has no edge to come back from), so minimized it shrinks away as
   * the top one does, where it floats.
   */
  private shapePlacement(): Placement {
    const place = this.placement();
    return State.minimized && place === "float" ? "top" : place;
  }

  private animateGeometry(shrinking?: boolean) {
    const { w, h } = islandSize(State.mode, State.view, this.rowsFor(State.view), this.shapePlacement());
    const r = State.mode === "expanded" ? EXPANDED_CORNER : COMPACT_CORNER;
    const shrink = shrinking ?? h < this.height.value - 0.5;
    if (shrink) {
      this.width.curveTowards(w, CLOSE_MS);
      this.height.curveTowards(h, CLOSE_MS);
      this.radius.curveTowards(r, CLOSE_MS);
    } else {
      this.width.springTo(w, OPEN_RESPONSE, OPEN_DAMPING);
      this.height.springTo(h, OPEN_RESPONSE, OPEN_DAMPING);
      this.radius.springTo(r, OPEN_RESPONSE, OPEN_DAMPING);
    }
    this.ensureRunning();
  }

  private applyGeometry() {
    const w = this.width.value;
    const hh = this.height.value;
    const r = this.radius.value;
    const rect = this.islandRect();
    const band = this.band();
    this.islandEl.style.width = `${w}px`;
    // The band over a notch is the island's top border: what it holds sits under it.
    this.islandEl.style.height = `${hh + band}px`;
    this.islandEl.style.borderTopWidth = `${band}px`;
    this.islandEl.style.left = `${rect.x}px`;
    this.islandEl.style.top = `${rect.y}px`;
    this.islandEl.style.borderRadius = islandCorners(this.placement(), r);
    // Shrunk away while minimized: its glow ring would still draw a line
    // where a floating island was.
    this.islandEl.style.visibility = State.minimized && Math.min(w, hh) < 1 ? "hidden" : "";

    // Minimized, nothing of the island takes the mouse, not even the margin
    // around it (see HIT_MARGIN in island.rs): clicks go to what is behind.
    const hit = State.minimized ? NOWHERE : rect;
    const p = this.pushedRect;
    if (
      Math.abs(p.x - hit.x) > 0.5 || Math.abs(p.y - hit.y) > 0.5 ||
      Math.abs(p.w - hit.w) > 0.5 || Math.abs(p.h - hit.h) > 0.5
    ) {
      this.pushedRect = hit;
      void Bridge.setIslandRect(hit.x, hit.y, hit.w, hit.h);
    }
  }

  /** The island's box in the window, the band over a notch included (it is black, and it takes the mouse). */
  private islandRect() {
    const w = this.width.value;
    const h = this.height.value;
    return { ...islandOrigin(this.placement(), w, h, floatsUp(State.settings.floatY)), w, h: h + this.band() };
  }

  /**
   * At the top of a MacBook with a notch the island starts at the screen's top
   * edge: a black band as tall as the notch, over the menu bar around it, then
   * the island as anywhere else. 0 elsewhere.
   */
  private band(): number {
    return this.placement() === "top" ? State.notch : 0;
  }

  /** The island's display changed, or Rust placed it again: its notch (logical px), or 0. */
  setNotch(notch: number) {
    if (Math.abs(notch - State.notch) < 0.5) return;
    State.notch = notch;
    this.applyGeometry();
  }

  /** Hidden → let the island retract, then drop the window to the wake strip. */
  private updateWindowCollapsed() {
    if (this.collapseTimer != null) {
      window.clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
    if (State.mode === "hidden" && this.placement() !== "float") {
      this.collapseTimer = window.setTimeout(() => {
        this.collapseTimer = null;
        if (State.mode !== "hidden") return;
        this.collapsed = true;
        void Bridge.setCollapsed(true);
      }, CLOSE_MS + 80);
    } else if (this.collapsed) {
      this.collapsed = false;
      void Bridge.setCollapsed(false);
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private wireInput() {
    this.wakeStrip.addEventListener("mouseenter", () => {
      Sound.resume();
      if (State.mode === "hidden" && !State.minimized) this.fsm.mouseEntered();
    });

    this.islandEl.addEventListener("mousedown", (e) => {
      Sound.resume();
      State.lastActivity = performance.now();
      if (State.mode !== "expanded") {
        // Candy himself in the ticker: a drag pulls him out to the desktop, a
        // click opens the island (on release). Anywhere else on a floating
        // ticker, a drag moves it.
        const p = this.pagePoint(e);
        if (e.button === 0 && State.mode === "compact" && this.isMascotHit(p.x, p.y) && this.desktop.canPickUp()) {
          this.mascotPress = { x: e.clientX, y: e.clientY, folded: true };
          return;
        }
        if (this.placement() === "float" && e.button === 0) this.pressFloat(e);
        else this.fsm.click();
        return;
      }
      // A click inside: an island opened by a hover now stays open like a clicked one.
      this.fsm.userInteracted();
      const p = this.pagePoint(e);
      if (e.button === 0 && this.isMascotHit(p.x, p.y)) {
        this.pressMascot();
        this.mascotPress = { x: e.clientX, y: e.clientY };
        return;
      }
      // Open, a floating island moves by any bare spot of it too (the
      // header's empty space, the edges, behind a card's words); buttons,
      // rows and fields keep their clicks.
      if (e.button === 0 && this.placement() === "float" && this.isBareSpot(e.target)) this.pressFloat(e);
    });

    // Dragging Candy out of the island puts him on the desktop; from then on
    // Rust carries his window (or the page does, on Linux).
    window.addEventListener("mousemove", (e) => {
      if (this.desktop.carrying) {
        this.desktop.carry(e.clientX, e.clientY);
        return;
      }
      const press = this.mascotPress;
      if (!press) return;
      if (!(e.buttons & 1)) {
        this.mascotPress = null;
        return;
      }
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= DRAG_THRESHOLD) return;
      this.mascotPress = null;
      // Not while the hello plays. Folded after it, the view still reads "greeting"
      // until a tab opens: that must not keep him in the ticker.
      const greeting = State.mode === "expanded" && State.view === "greeting";
      if (State.mode === "hidden" || greeting || !this.desktop.canPickUp()) return;
      // Not a poke after all.
      this.pressing = false;
      if (this.pressTimer != null) window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
      if (this.squeezing) this.unsqueeze();
      this.desktop.pickUp(e.clientX, e.clientY);
    });

    // Right-click on Candy: the wardrobe (Coucou's Mochi does the same), and closes it again.
    this.islandEl.addEventListener("contextmenu", (e) => {
      const p = this.pagePoint(e);
      if (!this.isMascotHit(p.x, p.y)) return;
      e.preventDefault();
      this.toggleWardrobe();
    });

    // The release can land anywhere, so listen on the whole window.
    window.addEventListener("mouseup", (e) => {
      // A press on Candy in the ticker that never became a drag: a click, it opens.
      const press = this.mascotPress;
      this.mascotPress = null;
      if (press?.folded && State.mode === "compact") this.fsm.click();
      if (this.desktop.carrying) this.desktop.carryEnd(e.clientX, e.clientY);
      this.releaseMascot();
    });

    // Keys while the island has the keyboard (typing in one of its fields):
    // Ctrl+1–9 picks a tab, Ctrl+, opens Settings; Esc folds it once no field
    // holds it (a field takes its own Esc).
    window.addEventListener("keydown", (e) => {
      State.lastActivity = performance.now();
      if (State.mode !== "expanded") return;
      if (e.key === "Escape") return this.collapse();
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const tab = shownTabs()[Number(digit[1]) - 1];
        e.preventDefault();
        if (tab && tab !== State.view) {
          Sound.play("blip");
          this.setView(tab);
        }
      } else if (e.code === "Comma") {
        e.preventDefault();
        void (IS_TAURI ? Bridge.openSettingsWindow() : openSettingsPanel());
      }
    });

    // A click anywhere but the island folds it away. In a browser that is any
    // click on the page; in the app the page only sees the thin margin around
    // the island, and Rust reports the rest (see clickOutside). The scripted
    // demo drives the island itself and keeps it open.
    if (this.followMouse) {
      document.addEventListener("mousedown", (e) => {
        if (!this.islandEl.contains(e.target as Node)) this.clickOutside();
      });
    }

    this.wireDrop();

    if (!IS_TAURI && this.followMouse) this.followPageCursor();
    // A floating stage follows the page's size; a narrow page puts the island on top.
    if (!IS_TAURI) window.addEventListener("resize", () => this.applyPlacement());
  }

  /**
   * A token link or address dragged from the browser onto the island: Candy
   * opens its mouth and the token joins the watchlist, as if pasted in the
   * field. Only what the field would take as an address counts; a drop never
   * starts a search. Listens on the whole window, before the fields do.
   */
  private wireDrop() {
    const carriesText = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      return types.includes("text/uri-list") || types.includes("text/plain");
    };
    const over = (on: boolean) => {
      this.islandEl.classList.toggle("drop-ready", on);
      this.cue(on ? { kind: "ready" } : { kind: "unready", keepOpen: this.lookups > 0 });
      State.notify();
    };
    window.addEventListener(
      "dragenter",
      (e) => {
        if (!carriesText(e)) return;
        e.preventDefault();
        if (this.dragDepth++ === 0) over(true);
      },
      true,
    );
    // Anything else (a file from Explorer…) is refused here: left to the
    // webview, a dropped file would open in place of the island.
    window.addEventListener(
      "dragover",
      (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = carriesText(e) ? "copy" : "none";
        // His eyes follow the link being dragged over him.
        if (carriesText(e)) {
          const p = this.pagePoint(e);
          this.followCursor(p.x, p.y);
        }
      },
      true,
    );
    window.addEventListener(
      "dragleave",
      () => {
        if (this.dragDepth > 0 && --this.dragDepth === 0) over(false);
      },
      true,
    );
    window.addEventListener(
      "drop",
      (e) => {
        e.preventDefault();
        if (!carriesText(e)) return;
        e.stopPropagation();
        this.dragDepth = 0;
        over(false);
        const data = e.dataTransfer;
        // A link's first line (uri-list keeps comments on lines starting with #).
        const link = data?.getData("text/uri-list").split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#"));
        void this.dropped((link || data?.getData("text/plain") || "").trim());
      },
      true,
    );
  }

  /**
   * The paste shortcut: whatever was copied, if the whole of it is a token
   * address or link, goes in like a drop. Anything else is left alone (never
   * searched, never sent anywhere) and Candy just looks puzzled.
   */
  async pasteToken() {
    Sound.resume();
    const text = await Bridge.readClipboard();
    const parsed = text ? parsePasted(text) : null;
    State.minimized = false;
    if (this.fsm.state === "hidden") this.reveal();
    if (!parsed) {
      this.cue({ kind: "puzzled", say: t("copy a token's link or address first") });
      this.noteDrop(t("Nothing copied that looks like a token link or address"), "warn");
      return;
    }
    await this.dropped(text!);
  }

  /** A swallowing step, on whichever Candy is on screen: the island's, or the desktop's when he is out. */
  private cue(c: MouthCue) {
    if (State.mascotAway && this.desktop.supported) this.desktop.relay(c);
    else this.mascot.cue(c);
  }

  /** A link or address given to Candy (dropped on him, here or on the desktop, or pasted with the shortcut). */
  async dropped(text: string) {
    Sound.resume();
    if (parseInput(text).kind !== "address") {
      this.cue({ kind: "puzzled", say: t("hm? drop a token's link or address") });
      this.noteDrop(t("Not a token link or address"), "warn");
      return;
    }
    if (this.dropBusy) {
      this.noteDrop(t("One at a time: still adding the last one."), "warn");
      return;
    }
    // The mouth stays open while the token is looked up; then he swallows it.
    this.cue({ kind: "open" });
    this.lookups++;
    this.dropBusy = true;
    this.searchBar("on");
    State.notify();
    const res = await Companion.addToken(text);
    this.dropBusy = false;
    this.lookups--;
    if (res.ok) {
      Sound.play("blip");
      this.cue({ kind: "gulp" });
      this.searchBar("done");
      window.setTimeout(() => Sound.play("pop"), 260);
      this.noteDrop(res.message, "up");
    } else {
      this.cue({ kind: "puzzled", say: res.message });
      this.searchBar("fail");
      this.noteDrop(res.message, "warn");
    }
    // Settings → Paste opens it: on the terminal too, added now or already there.
    const parsed = parseInput(text);
    if (State.companion.pasteOpens && parsed.kind === "address") {
      // EVM addresses ignore case; Solana's don't.
      const evm = parsed.address.startsWith("0x");
      const same = (a: string) => (evm ? a.toLowerCase() === parsed.address.toLowerCase() : a === parsed.address);
      const token = State.companion.watchlist.find((tok) => same(tok.address) || same(tok.pairAddress));
      if (token) void Bridge.openUrl(tokenUrl(State.companion.terminal, token));
    }
  }

  /**
   * The lookup's bar along the island's bottom: it fills while DexScreener is
   * asked, then fills up green (added) or turns red (not found), and fades.
   */
  private searchBar(step: "on" | "done" | "fail") {
    const el = this.searchEl;
    if (step === "on") {
      el.classList.remove("on", "done", "fail");
      void el.offsetWidth;
    }
    el.classList.add(step);
    if (step !== "on") window.setTimeout(() => el.classList.remove("on", "done", "fail"), 1400);
  }

  private noteDrop(text: string, tone: "up" | "warn") {
    this.dropNote = { text, tone, until: Date.now() + DROP_NOTE_MS };
    State.notify();
  }

  /** The app has no cursor poll here (Linux): follow the page's mouse events instead. */
  followPage() {
    if (this.followMouse) this.followPageCursor();
  }

  /**
   * In a plain browser there is no Rust cursor poll: the page's own mouse events
   * stand in, measured from the 720×340 stage the page draws (see style.css),
   * which the web build may scale down to fit a phone.
   */
  private followPageCursor() {
    window.addEventListener("mousemove", (e) => {
      const p = this.pagePoint(e);
      this.onCursor(p.x, p.y);
    });
    document.addEventListener("mouseleave", () => this.onCursor(-10_000, -10_000));
  }

  /** A page point in window-logical coordinates (identity inside Tauri). */
  /** Part of the island itself rather than something to click: where a drag can take hold of it. */
  private isBareSpot(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    if (target.closest("button, a, input, select, textarea, label, canvas, svg, [contenteditable], .row, .move-chip, .folder, .check-line, .seg-btn")) return false;
    return (
      target === this.islandEl ||
      target === this.contentEl ||
      target === this.header.el ||
      target.matches("#views, .view, .tabs, .header-actions, .folders, .eyebrow, .title, .detail, .event-foot, .buttons, .fine")
    );
  }

  private pagePoint(e: MouseEvent): { x: number; y: number } {
    if (IS_TAURI) return { x: e.clientX, y: e.clientY };
    const r = this.root.getBoundingClientRect();
    this.origin = { x: r.left, y: r.top, scale: r.width / windowSize(this.placement()).w || 1 };
    return { x: (e.clientX - r.left) / this.origin.scale, y: (e.clientY - r.top) / this.origin.scale };
  }

  /** Cursor in window-logical coordinates. */
  onCursor(x: number, y: number) {
    State.mouse = { x, y };
    this.noticePresence();
    const rect = this.islandRect();
    const inIsland =
      x >= rect.x - HIT_MARGIN && x <= rect.x + rect.w + HIT_MARGIN &&
      y >= rect.y - HIT_MARGIN && y <= rect.y + rect.h + HIT_MARGIN;

    if (inIsland && !this.wasInIsland) {
      // The trader came to look: the ticker can let go of the last alert. A
      // card that folded away while nobody was there does not count as seen.
      State.unseen = null;
      if (!State.minimized) this.fsm.mouseEntered();
    }
    if (!inIsland && this.wasInIsland) this.fsm.mouseLeft();
    this.wasInIsland = inIsland;

    this.followCursor(x, y);

    const over = State.mode === "expanded" && this.isMascotHit(x, y);
    if (over && !this.overMascot) this.mascotHoverIn();
    if (!over && this.overMascot) this.mascotHoverOut();
    this.overMascot = over;
  }

  // ── While you were away ─────────────────────────────────────────────────────

  private lastSeenAt = 0;
  private snapshot: Snapshot | null = null;

  /**
   * The cursor moved: the trader is here. After AWAY_MS without a move (while
   * the island was on screen), sum up what changed since. A snapshot of the
   * market is kept, refreshed once a minute while they are around.
   */
  private noticePresence() {
    if (State.mode === "hidden") {
      // Hidden, nothing reports the cursor: don't count that time as away.
      this.lastSeenAt = 0;
      return;
    }
    const now = Date.now();
    if (this.lastSeenAt && now - this.lastSeenAt >= AWAY_MS && this.snapshot) {
      const fresh = this.takeSnapshot(now);
      const summary = awaySummary(this.snapshot, fresh, Companion.seenEvents);
      this.snapshot = fresh;
      if (summary) Companion.raise({ kind: "away", id: `away-${now}`, away: summary.away, lines: summary.lines, moves: summary.moves });
      else this.mascot.say(t("welcome back!"), 1800);
    }
    this.lastSeenAt = now;
    if (!this.snapshot || now - this.snapshot.t >= SNAPSHOT_EVERY_MS) this.snapshot = this.takeSnapshot(now);
  }

  private takeSnapshot(t: number): Snapshot {
    const prices: Snapshot["prices"] = {};
    for (const tok of State.companion.watchlist) {
      const q = State.quotes[tok.key];
      if (q) prices[tok.key] = { symbol: tok.symbol, price: q.priceUsd };
    }
    const held = Companion.positions();
    return {
      t,
      prices,
      positions: held.length
        ? { value: held.reduce((s, x) => s + x.s.valueUsd, 0), pnl: held.reduce((s, x) => s + x.s.pnlUsd, 0) }
        : null,
    };
  }

  /** The eyes follow the cursor; a cursor coming close gets a little hop. */
  private followCursor(x: number, y: number) {
    if (!State.companion.lively || State.mode === "hidden" || x < -5000) {
      this.mascot.lookAt(NEUTRAL_GAZE);
      this.cursorDist = Infinity;
      return;
    }
    const rect = this.islandRect();
    const mx = rect.x + this.mCx.value;
    const my = rect.y + this.band() + this.mCy.value;
    this.mascot.lookAt(gazeAt(mx, my, x, y));

    const dist = Math.hypot(x - mx, y - my);
    const now = performance.now();
    if (
      dist < NOTICE_PX && this.cursorDist >= NOTICE_PX * 1.5 &&
      State.mode === "expanded" && !this.mascot.reacting && !this.pressing && now - this.lastNotice > 10_000
    ) {
      this.lastNotice = now;
      this.mascot.react(State.mood.state, 700, "hop");
    }
    this.cursorDist = dist;
  }

  /** The next idle move, while the mascot can be seen. Nothing runs when hidden. */
  private scheduleFidget() {
    if (this.fidgetTimer != null) window.clearTimeout(this.fidgetTimer);
    this.fidgetTimer = null;
    if (!State.companion.lively || State.mode === "hidden") return;
    this.fidgetTimer = window.setTimeout(() => {
      this.fidgetTimer = null;
      if (State.mode === "hidden") return;
      // Bored (or worn out): now and then a real yawn instead of a fidget.
      if (!this.mascot.reacting && !this.pressing && (State.mood.state === "bored" || State.mood.state === "tired") && this.tryFlourish("yawn")) {
        this.scheduleFidget();
        return;
      }
      if (!this.mascot.reacting && !this.pressing && State.moodFace && Math.random() < 0.4) {
        // A settled mood peeks back for a moment.
        this.mascot.react(State.moodFace, 2500);
      } else if (!this.mascot.reacting && !this.pressing) {
        const f = pickFidget(State.mood.state, Math.random());
        if (f) {
          this.mascot.react(State.mood.state, f.ms, f.motion);
          if (f.say) this.mascot.say(t(f.say), f.ms);
          if (f.wink) this.mascot.wink();
        }
      }
      this.scheduleFidget();
    }, fidgetDelay(Math.random()));
  }

  private isMascotHit(x: number, y: number): boolean {
    // Out on the desktop, the island's Candy is invisible: nothing to hit.
    if (State.mascotAway) return false;
    const rect = this.islandRect();
    const cx = rect.x + this.mCx.value;
    const cy = rect.y + this.band() + this.mCy.value;
    const r = this.mSize.value * 0.42;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }

  private mascotHoverIn() {
    if (performance.now() - this.lastLove < 8000) return;
    Sound.play("hover");
    // Noticed: the eyes pop a little.
    if (!this.mascot.reacting) this.mascot.pop();
    this.mascotHoverTimer = window.setTimeout(() => {
      this.mascotHoverTimer = null;
      this.lastLove = performance.now();
      this.mascot.react("love", 2200);
    }, 1500);
  }

  private mascotHoverOut() {
    if (this.mascotHoverTimer != null) window.clearTimeout(this.mascotHoverTimer);
    this.mascotHoverTimer = null;
  }

  /** A press on the mascot: a poke if let go quickly, a squeeze if held. */
  private pressMascot() {
    this.mascotHoverOut();
    this.pressing = true;
    if (this.pressTimer != null) window.clearTimeout(this.pressTimer);
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = null;
      if (this.pressing) this.squeeze();
    }, HOLD_MS);
  }

  private releaseMascot() {
    if (!this.pressing) return;
    this.pressing = false;
    if (this.pressTimer != null) {
      // Let go before it counted as a hold: a plain poke.
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
      this.pokeMascot();
      return;
    }
    if (this.squeezing) this.unsqueeze();
  }

  /** Held down: squished flat. */
  private squeeze() {
    this.squeezing = true;
    this.streak = 0;
    this.playReaction(SQUEEZE);
    // In case the release happens where the page cannot see it.
    this.squeezeTimer = window.setTimeout(() => {
      this.squeezeTimer = null;
      this.pressing = false;
      this.unsqueeze();
    }, MAX_SQUEEZE_MS);
  }

  /** Let go: it springs back up. */
  private unsqueeze() {
    if (!this.squeezing) return;
    this.squeezing = false;
    if (this.squeezeTimer != null) window.clearTimeout(this.squeezeTimer);
    this.squeezeTimer = null;
    this.playReaction(RELEASE);
  }

  /** A click: a reaction picked from the streak, the mood and the watchlist. */
  private pokeMascot() {
    const now = performance.now();
    this.streak = nextStreak(this.streak, this.lastClickAt, now);
    this.lastClickAt = now;
    // Fed up: pokes are ignored for a moment — unless someone keeps going
    // all the way to the secret.
    if (now < this.annoyedUntil && this.streak !== SECRET_STREAK) return;

    const { reaction, poke } = pokeReaction({
      streak: this.streak,
      mood: State.mood.state,
      lastPoke: this.lastPoke,
      random: Math.random(),
      fact: topMoverFact(State.companion.watchlist, State.quotes),
    });
    if (poke >= 0) this.lastPoke = poke;
    if (this.streak >= SECRET_STREAK) this.streak = 0;

    if (reaction.special === "annoyed") this.annoyedUntil = now + reaction.ms;
    if (reaction.special === "costume") {
      this.annoyedUntil = 0;
      this.tryOnCostume();
    }
    this.playReaction(reaction);
  }

  private playReaction(r: Reaction) {
    // The body takes the hit on the canvas: a spin rolls the whole drawing,
    // anything else squashes it, and the hat is knocked askew either way.
    const roll = CANVAS_ROLLS[r.motion];
    this.mascot.react(r.state, r.ms, roll ? "none" : r.motion);
    this.mascot.say(t(r.say), r.ms);
    if (roll) this.mascot.rollOnce(roll.turns, roll.seconds);
    else this.mascot.squash(0.7);
    this.mascot.nudgeHat(Math.random() < 0.5 ? 0.8 : -0.8);
    if (r.special === "wink") this.mascot.wink();
    Sound.play(r.sound);
  }

  /** The secret: a random hat and face for a few seconds, then back to the chosen ones. */
  private tryOnCostume() {
    const pick = (slot: "outfits" | "faces", current: string) => {
      const all = this.manifest?.[slot] ?? {};
      const ids = Object.keys(all).filter((id) => id !== current);
      return ids.length ? all[ids[Math.floor(Math.random() * ids.length)]] : null;
    };
    const hat = pick("outfits", State.companion.outfit);
    const face = pick("faces", State.companion.face);
    if (!hat && !face) return;
    if (hat) this.mascot.setOutfit(hat);
    if (face) this.mascot.setFace(face);
    if (this.costumeTimer != null) window.clearTimeout(this.costumeTimer);
    this.costumeTimer = window.setTimeout(() => {
      this.costumeTimer = null;
      this.wearChosen();
    }, COSTUME_MS);
  }

  // ── Frame loop ──────────────────────────────────────────────────────────────

  ensureRunning() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (nowMs: number) => {
    const dt = Math.min(0.05, (nowMs - this.lastFrame) / 1000);
    this.lastFrame = nowMs;

    this.width.step(dt, nowMs);
    this.height.step(dt, nowMs);
    this.radius.step(dt, nowMs);
    this.applyGeometry();

    if (this.dirty) {
      this.dirty = false;
      this.syncDom();
    }

    const p = mascotPlacement(State.mode, State.view, this.height.value, this.shapePlacement());
    this.mCx.target = p.cx;
    this.mCy.target = p.cy;
    this.mSize.target = p.size;
    this.mCx.step(dt);
    this.mCy.step(dt);
    this.mSize.step(dt);
    this.placeMascot(p.opacity);

    // Nothing may keep the loop alive while the island just sits there: the
    // mascot's own motion is CSS, so the loop only runs while things move.
    const busy =
      this.width.animating || this.height.animating || this.radius.animating ||
      !this.mCx.settled || !this.mCy.settled || !this.mSize.settled;
    if (busy) {
      requestAnimationFrame(this.frame);
    } else {
      this.running = false;
      Sound.idle();
    }
  };

  private placeMascot(opacity: number) {
    const s = this.mSize.value;
    const el = this.mascot.el;
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
    el.style.left = `${this.mCx.value - s / 2}px`;
    el.style.top = `${this.mCy.value - s / 2}px`;
    // Out on the desktop, the island's own Candy is not there.
    el.style.opacity = String(State.mascotAway ? 0 : opacity);
    el.classList.toggle("tiny", State.mode === "compact");

    // The mood line: under the mascot, or beside it in the sidebar's band.
    const cap = this.captionEl.style;
    if (isSide(this.placement()) && State.mode === "expanded") {
      const left = this.mCx.value + s / 2 + 8;
      cap.left = `${left}px`;
      // Under the prices, which share the band (see .sidebar .natives).
      cap.top = `${this.mCy.value - 6}px`;
      cap.width = `${Math.max(80, this.width.value - left - 12)}px`;
      this.captionEl.classList.add("beside");
    } else {
      cap.left = "";
      cap.top = `${this.mCy.value + s / 2 + 4}px`;
      cap.width = `${SIDE_W}px`;
      this.captionEl.classList.remove("beside");
    }
  }

  // ── DOM sync ────────────────────────────────────────────────────────────────

  private syncDom() {
    // Following turned off while its tab was open: back to the watchlist.
    if (State.view === "wallets" && !State.companion.following) State.view = "watchlist";
    // Discipline turned off while its tab was open: the same.
    if (State.view === "discipline" && !State.companion.disciplineOn) State.view = "watchlist";
    const expanded = State.mode === "expanded";
    // The wardrobe closed or folded with a look still being tried on.
    if (this.previewing && (!expanded || State.view !== "wardrobe")) this.previewLook(null);
    // Music playing on the PC: the dance, folded or open (see islandDances);
    // the mood may sit it out.
    if (State.view === "music" && (!State.nowPlaying || !State.companion.musicCard)) State.view = "watchlist";
    this.mascot.setDancing(State.companion.danceToMusic && islandDances({ playing: State.music, mode: State.mode, view: State.view }));
    // Lists that load or grow on their own (trending, a wallet added from the
    // settings window) change the island's height: follow them.
    const rowsKey = `${State.view}:${this.rowsFor(State.view)}`;
    if (expanded && rowsKey !== this.lastRowsKey) {
      this.lastRowsKey = rowsKey;
      this.animateGeometry();
    }
    this.contentEl.style.opacity = expanded ? "1" : "0";
    this.contentEl.style.pointerEvents = expanded ? "auto" : "none";
    this.compactEl.style.opacity = State.mode === "compact" ? "1" : "0";

    this.header.sync();
    for (const [name, view] of this.views) {
      const on = name === State.view;
      view.el.classList.toggle("on", on);
      if (on && expanded) view.sync();
    }

    const showCaption = expanded && TAB_VIEWS.has(State.view);
    this.wardrobeBtn.style.display = showCaption ? "" : "none";
    this.wardrobeBtn.classList.toggle("on", State.view === "wardrobe");
    this.captionEl.style.opacity = showCaption ? "1" : "0";
    this.captionEl.textContent = State.mood.text;
    // Two lines at most (see #caption); the whole sentence on hover.
    this.captionEl.title = State.mood.text;

    if (this.lastMood !== State.mood.state) {
      // The first mood is no change; later ones may bring a flourish.
      if (this.lastMood != null) this.moodChanged(State.mood.state);
      this.lastMood = State.mood.state;
    }
    this.mascot.setMood(State.mood.state);
    this.mascot.setBadge(this.badge());
    if (todayKey() !== this.lookDay && this.costumeTimer == null) this.wearChosen();
    this.renderTicker(performance.now());
  }

  /**
   * The dot on the folded mascot: an alert not looked at yet, in its tone, or
   * three dots while the first prices (or a dropped token) are on their way.
   */
  private badge(): Badge | null {
    const unseen = State.unseen;
    if (unseen?.kind === "alert") return unseen.tone;
    if (this.dropBusy || (State.marketStatus === "loading" && !State.paused)) return "busy";
    return null;
  }

  /** The compact pill: the last unseen alert, a discipline state, or the next token. */
  private renderTicker(now: number) {
    if (State.mode !== "compact") return;
    const el = this.tickerEl;
    el.replaceChildren();
    el.className = "ticker";

    if (this.dragDepth > 0) {
      el.classList.add("tone-up");
      el.append(h("span", { class: "t-text", text: t("Drop to add to your watchlist") }));
      return;
    }
    if (this.dropBusy) {
      el.append(svg(ICONS.search, 11, { stroke: 2.2 }), h("span", { class: "t-text dim", text: t("Looking it up on DexScreener…") }));
      return;
    }
    const note = this.dropNote;
    if (note && note.until > Date.now()) {
      el.classList.add(`tone-${note.tone}`);
      const fresh = Date.now() - (note.until - DROP_NOTE_MS) < 450;
      if (note.tone === "up") el.append(h("span", { class: `t-check ${fresh ? "fresh" : ""}` }, svg(ICONS.check, 10, { stroke: 3 })));
      el.append(h("span", { class: "t-text", text: note.text }));
      return;
    }
    this.dropNote = null;

    // The live feed: a buy or sell just seen, the trader's own or a followed wallet's.
    const fresh = State.feed.at(-1);
    if (fresh && Date.now() - fresh.t < FEED_SHOW_MS) {
      el.classList.add(`tone-${fresh.tone}`);
      el.append(h("span", { class: `t-live ${fresh.tone}` }), h("span", { class: "t-text", text: fresh.text }));
      return;
    }

    const unseen = State.unseen;
    if (unseen && unseen.kind === "alert") {
      el.classList.add(`tone-${unseen.tone}`);
      el.append(svg(ICONS.bell, 11), h("span", { class: "t-text", text: unseen.title }));
      return;
    }
    if (Companion.stoppedToday) {
      el.classList.add("tone-down");
      el.append(h("span", { class: "t-text", text: t("Daily loss limit hit") }));
      return;
    }
    if (State.companion.disciplineOn && State.cooldownUntil > Date.now()) {
      el.classList.add("tone-calm");
      el.append(h("span", { class: "t-text", text: t("Cooldown {time}", { time: formatClock(State.cooldownUntil - Date.now()) }) }));
      return;
    }
    if (State.paused) {
      el.append(h("span", { class: "t-text dim", text: t("Paused") }));
      return;
    }
    // Your positions first (with their profit), then the watchlist's other tokens.
    const held = Companion.positions();
    const heldKeys = new Set(held.map((x) => tokenKey("solana", x.p.mint)));
    const tokens = State.companion.watchlist.filter((tok) => State.quotes[tok.key] && !heldKeys.has(tok.key));
    const count = held.length + tokens.length;
    if (count === 0) {
      const text = State.companion.watchlist.length ? t("Fetching prices…") : t("Hover here to add tokens");
      el.append(h("span", { class: "t-text dim", text }));
      return;
    }
    if (now - this.tickerAt >= TICKER_STEP_MS) {
      this.tickerAt = now;
      this.tickerIndex = (this.tickerIndex + 1) % count;
    }
    const i = this.tickerIndex % count;
    if (i < held.length) {
      const { p, s } = held[i];
      el.append(
        h("span", { class: "t-own", text: "★", title: t("Your position") }),
        h("span", { class: "t-sym", text: p.symbol }),
        h("span", { class: "t-mc", text: formatUsd(s.valueUsd) }),
        h("span", { class: `t-pct ${pctClass(s.pnlUsd)}`, text: formatSignedUsd(s.pnlUsd) }),
        h("span", { class: `t-pct ${pctClass(s.pnlPct)}`, text: formatPct(s.pnlPct) }),
      );
    } else {
      const tok = tokens[i - held.length];
      const q = State.quotes[tok.key];
      // The price on show just moved: now and then his eyes go to it.
      const seen = this.tickerSeen;
      if (seen && seen.key === tok.key && seen.price !== q.priceUsd && !isSide(this.placement())) this.tryFlourish("glance");
      this.tickerSeen = { key: tok.key, price: q.priceUsd };
      el.append(
        h("span", { class: "t-sym", text: tok.symbol }),
        h("span", { class: "t-mc", text: valueCell(State.companion.valueColumn, q).text }),
        h("span", { class: `t-pct ${pctClass(q.change.m5)}`, text: `5m ${formatPct(q.change.m5)}` }),
        h("span", { class: `t-pct ${pctClass(q.change.h1)}`, text: `1h ${formatPct(q.change.h1)}` }),
      );
    }
    if (count > 1) el.append(this.tickerDots(held, tokens, i));
  }

  /**
   * One dot per token in the ticker's turn, green or red by the last hour's
   * move (brighter: a bigger move), the one on show ringed: the whole list at
   * a glance. Past MAX_DOTS, the page of ten with the one on show, and "+N".
   */
  private tickerDots(held: ReturnType<typeof Companion.positions>, tokens: WatchToken[], current: number): HTMLElement {
    const items = [
      ...held.map(({ p }) => ({ symbol: p.symbol, h1: (State.positionQuotes[p.mint] ?? State.quotes[tokenKey("solana", p.mint)])?.change.h1 })),
      ...tokens.map((t) => ({ symbol: t.symbol, h1: State.quotes[t.key]?.change.h1 })),
    ];
    const from = Math.floor(current / MAX_DOTS) * MAX_DOTS;
    const shown = items.slice(from, from + MAX_DOTS);
    const dots = h("span", { class: "t-dots" });
    shown.forEach((x, k) => {
      const level = moveLevel(x.h1);
      const cls = level == null ? "none" : level > 0 ? `up${level}` : level < 0 ? `down${-level}` : "flat";
      dots.append(h("b", { class: `t-dot ${cls}${from + k === current ? " on" : ""}`, title: `${x.symbol} ${formatPct(x.h1)} 1h` }));
    });
    const rest = items.length - shown.length;
    const box = h("span", { class: "t-dotbox" }, dots);
    if (rest > 0) box.append(h("span", { class: "t-more", text: `+${rest}`, title: tn(rest, "{n} more, in turn", "{n} more, in turn") }));
    return box;
  }

  /** A one-second clock while the island shows something that counts. */
  private updateSecondTimer() {
    const want = State.mode !== "hidden";
    if (want && this.secondTimer == null) {
      this.secondTimer = window.setInterval(() => {
        if (State.mode === "expanded") {
          this.header.tick?.();
          this.views.get(State.view)?.tick?.();
        } else if (State.mode === "compact") {
          this.renderTicker(performance.now());
        }
      }, 1000);
    } else if (!want && this.secondTimer != null) {
      window.clearInterval(this.secondTimer);
      this.secondTimer = null;
    }
  }
}
