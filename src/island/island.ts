// The island: DOM shell, open/close animation, mascot placement, the compact
// ticker and mouse handling. The geometry and click-through handling follow
// Coucou for Windows (MIT, © Louis Raillé); the content is Trader Companion's.

import { Tracked, Spring } from "../core/anim";
import { Bridge, IS_TAURI, copyImage, type ShowOff } from "../core/bridge";
import { FULL_NAME } from "../core/brand";
import { t, tn } from "../core/i18n";
import { applyTheme, wideFace } from "../core/themes";
import { currentLog, summarize, todayKey } from "../discipline/discipline";
import { dayEndRows, dayEndStats } from "../share/dayend";
import { AWAY_MS, SNAPSHOT_EVERY_MS, awaySummary, type Snapshot } from "../away/away";
import { activeSeason } from "../mascot/seasons";
import { MELT_LEVELS, meltDrop, meltMood, meltStage, meltSubject, type MeltStage } from "../mascot/melt";
import { NIGHTCAP, lookKey, wearsPyjamas } from "../mascot/night";
import { napDue, napEnds, wakeFor, type NapScene, type Wake } from "../mascot/nap";
import { lookFilter } from "../mascot/skins";
import { drawRecapCard, type CardFormat, type CardLook } from "../share/card";
import { buildRecap, buildWeekRecap, type WeekRange } from "../share/recap";
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
  compactFor,
  tickerSeat,
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
import { EMOTES, EMOTE_INFO, menuSpot, stepItem, type Emote } from "../mascot/emotes";
import { SHADES_FACE, SHADES_MS, SHADES_PENDING_MS, keepsFaceUnderShades, shadesCrossings } from "../mascot/shades";
import { pnlSign, type PnlSign } from "../mascot/sign";
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
import { NO_PANEL, panelStep, type IslandNow, type OpenPanel, type PanelSession } from "./panel-pose";
import {
  PANEL_CORNER,
  PANEL_SIZE,
  anchoredAt,
  clampInto,
  growRect,
  panelFrame,
  panelInWindow,
  panelMascot,
  panelShowSpot,
  shownTransparency,
  type PanelHost,
  type PanelKind,
  type PanelPage,
  type Rect,
  type SettingsSection,
  type ShortcutLink,
} from "../core/panel";

/** How a panel is asked for (Island.openPanel). */
type PanelOpts = { section?: SettingsSection; toggle?: boolean };
/** A panel's window as placed: its size, and where the island's own window sits from it (logical px). */
type Placed = { w: number; h: number; dx: number; dy: number };
type PanelWin = Placed & { panel: Rect };
type Size = { w: number; h: number };
/** Settings ↔ the Closet: how long the island takes to change from one panel's size to the other's. */
const SWAP_MS = 340;
/** A field Esc leaves before it closes a panel: one that is typed in. */
const TEXT_FIELD = "input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=color]), textarea, select";
/** Settings' transparency let go: how long the panel keeps showing it before it is a panel again. */
const ALPHA_SETTLE_MS = 1400;

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
/** Settings → Show me: how long the pyjamas or a nap are shown. */
const SHOW_MS = 7000;
/** A shown melt: each stage this long, its wax running down this fast (seconds). */
const SHOW_MELT_STEP_MS = 2600;
const SHOW_MELT_S = 1.5;
/** The mouse rests on Candy this long before he holds his sign up (passing over him does nothing). */
const SIGN_DELAY_MS = 220;
/** Icons of the right-click menu's emotes, and their stroke (none: filled). */
const EMOTE_ICONS: Record<Emote, { path: string; stroke?: number }> = {
  dance: { path: ICONS.note },
  wave: { path: ICONS.hand, stroke: 1.7 },
  laugh: { path: ICONS.laugh, stroke: 1.7 },
  spin: { path: ICONS.refresh, stroke: 2.2 },
};
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
    case "dayEnd":
      // The card plays its own finale (src/views/event.ts): this is the hello.
      return { mascot: "happy", sound: "greet" };
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
  /** The mouse goes through the island to what is behind it (Ctrl, or the edge ticker not rested on yet). */
  private passing = false;
  /** What the page last told Rust about the edge ticker's click guard. */
  private guardOn = false;
  private pushedRect = { x: -1, y: -1, w: -1, h: -1 };
  /** The ticker seat last sent to Rust (desktop.rs island_spot). */
  private pushedSeat: { cx: number; cy: number } | null = null;
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
  /** Who keeps the island from folding (a checklist being read, a chart open): held while anyone does (ViewActions.holdOpen). */
  private holders = new Set<string>();
  private manifest: Manifest | null = null;
  private lastRowsKey = "";
  private followMouse: boolean;
  // A link or an address dragged onto the island (see wireDrop).
  private dragDepth = 0;
  private dropBusy = false;
  /** Lookups with the mouth open (a drop, a pasted address): a drag leaving meanwhile must not shut it. */
  private lookups = 0;
  // Shades on a 2x (see shades.ts).
  /** Held tokens at or over 2x, as last seen. */
  private shadesSeen = new Map<string, boolean>();
  /** The shades he has on now (art path), and whether his face accessory stays under them. */
  private shadesOn: { src: string; keepFace: boolean } | null = null;
  private shadesTimer: number | null = null;
  /** A 2x seen while the island was out of sight (Date.now()): the shades go on when it shows, if soon. */
  private shadesDue = 0;
  /** The mouse resting on Candy: his sign goes up after SIGN_DELAY_MS. */
  private signTimer: number | null = null;
  // The right-click menu (see openEmoteMenu).
  private emoteMenu!: HTMLElement;
  private menuOpen = false;
  private menuTimer: number | null = null;
  /** The island's pin before the menu held it open. */
  private menuPinned = false;

  /** Candy out on the desktop, in his own window (src/island/desktop.ts). */
  private desktop = new DesktopLink({
    reveal: () => this.reveal(),
    wearing: () => {
      // A look being tried on in the wardrobe shows on the desktop Candy too.
      const tried = this.tried;
      const kept = this.look();
      return {
        costume: tried?.costume ?? this.costumeNow(),
        hat: accessory(this.manifest, "outfits", tried?.outfit ?? kept.hat),
        face: accessory(this.manifest, "faces", tried?.face ?? kept.face),
        filter: lookFilter(tried ?? { ...State.companion, costume: this.costumeNow() }),
        pyjamas: !tried && kept.pyjamas,
        melt: this.meltLevel(),
      };
    },
    mood: () => meltMood(State.mood.state, this.meltShown()),
    react: (state, ms) => this.mascot.react(state, ms),
    dropped: (text) => void this.dropped(text),
    menu: () => this.toggleEmoteMenu(),
    // The sign only while he is out: it changes with every price poll, and the
    // window would hear of each one for nothing.
    extras: () => ({
      shades: this.shadesOn?.src ?? null,
      keepFace: this.shadesOn?.keepFace ?? false,
      sign: State.mascotAway ? this.daySign() : null,
    }),
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

  // ── Settings and the Closet, in the island (see openPanel) ────────────────
  /** The panel open, how the island was before it, and an alert waiting for it to close (panel-pose.ts). */
  private session: PanelSession = NO_PANEL;
  private get panel(): OpenPanel | null {
    return this.session.open;
  }
  /**
   * The panel's window (logical px), where the island's own window sits from
   * it (dx, dy), and the panel in it, from the moment it opens until the
   * island has shrunk back from it: the island is placed in it meanwhile.
   */
  private panelWin: PanelWin | null = null;
  /** Where the island grows from as a panel opens, and shrinks back to as it closes (in the panel's window; see growRect). */
  private growFrom: Rect | null = null;
  /** The panel stepped behind the app the trader went to (Rust's "panel-lowered"). */
  panelLowered = false;
  /** Settings or the Closet asked for before the art had loaded: opened once it has. */
  private pendingPanel: { kind: PanelKind; opts: PanelOpts } | null = null;
  /** Settings' transparency slider, held or just let go: the panel shows it (see shownTransparency). */
  private alphaPreview: number | null = null;
  private alphaTimer: number | null = null;
  /** In a browser, where the island's own stage was when the panel opened (its window, there). */
  private browserHome: { x: number; y: number } | null = null;
  /** The page mounted in the panel (src/settings, src/closet). */
  private page: PanelPage | null = null;
  private panelEl!: HTMLElement;
  private panelBody!: HTMLElement;
  private panelTitle!: HTMLElement;
  private panelSub!: HTMLElement;
  private panelIcon!: HTMLElement;
  private panelTabs!: Record<PanelKind, HTMLButtonElement>;
  private panelCloseBtn!: HTMLButtonElement;
  /** Stale async steps (a mount, a window request) give way to the newest. */
  private panelSeq = 0;
  private panelTimer: number | null = null;
  /** The page of a panel closing, taken down once it has faded (or at once, if a panel opens meanwhile). */
  private closingPage: PanelPage | null = null;
  /** The global shortcuts, for Settings (src/main.ts sets them; nothing in a demo). */
  private shortcutLink: ShortcutLink = { status: () => ({}), onStatus: () => () => {}, suspend: () => {}, resume: () => {} };

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
    // Settings or the Closet asked for before the art was there (the tray, just after start).
    const pending = this.pendingPanel;
    this.pendingPanel = null;
    if (pending) this.openPanel(pending.kind, pending.opts);
  }

  /** The costume the mascot has on (see wearCostume). */
  private worn = "none";

  /** Swaps the body's art when the costume changes; the mood carries over. */
  private wearCostume() {
    const costume = this.costumeNow();
    if (!this.manifest || costume === this.worn) return;
    this.worn = costume;
    this.mascot.use(dressed(this.manifest, costume));
  }

  /** The time the look follows (the demo's stills set a night of their own). */
  clock: () => Date = () => new Date();

  /**
   * The hat and face to wear: the trader's, or the season's for a few days;
   * after midnight, pyjamas and a nightcap (night.ts; a season's hat stays on).
   */
  private look(): { hat: string; face: string; pyjamas: boolean } {
    const c = State.companion;
    // Settings → Show me: the pyjamas whatever the clock says.
    if (this.showing?.what === "pyjamas") return { hat: NIGHTCAP, face: c.face, pyjamas: true };
    const now = this.clock();
    const season = activeSeason(now, c.seasonal, c.seasonOff);
    const pyjamas = wearsPyjamas(now, c.pyjamas, c.nightOff, c.costume);
    return { hat: season?.hat ?? (pyjamas ? NIGHTCAP : c.outfit), face: season?.face ?? c.face, pyjamas };
  }

  /** Puts on the current look (see look()). */
  private wearChosen() {
    const { hat, face, pyjamas } = this.look();
    this.lookDay = lookKey(this.clock());
    this.mascot.setOutfit(accessory(this.manifest, "outfits", hat));
    this.mascot.setFace(accessory(this.manifest, "faces", face));
    this.mascot.setPyjamas(pyjamas);
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
      this.mascot.setFilter(lookFilter({ ...State.companion, costume: this.costumeNow() }));
      this.wearCostume();
      const { hat, face, pyjamas } = this.look();
      this.mascot.setOutfit(accessory(this.manifest, "outfits", hat), false);
      this.mascot.setFace(accessory(this.manifest, "faces", face));
      this.mascot.setPyjamas(pyjamas);
      this.syncMelt();
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
    // A look picked now wins over the pyjamas tonight: shown as it will be.
    this.mascot.setPyjamas(false);
    this.syncMelt();
  }

  /** A look is being tried on (see previewLook): put the kept one back when the wardrobe goes. */
  private previewing = false;
  /** That look, for the desktop Candy too. */
  private tried: CompanionLook | null = null;

  /** The day (and night) the look was put on: a new day may start or end a season, midnight and 6 am the pyjamas. */
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
      // Settings and the Closet open in the island itself (openPanel).
      openSettings: (section) => this.openPanel("settings", section ? { section } : { toggle: true }),
      openCloset: () => this.openPanel("closet", { toggle: true }),
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
        if (act.emit) this.mascot.emit(act.emit, act.count ?? 1);
        if (act.hop) this.mascot.hop(7);
        if (act.sound) Sound.play(act.sound);
        if (act.forward !== undefined) this.stepForward(act.forward);
        if (act.look === null) this.mascot.lookAt(NEUTRAL_GAZE);
        else if (act.look && State.companion.lively) {
          // The eyes on the start of the line he is reading.
          const m = this.mascot.el.getBoundingClientRect();
          const r = act.look.getBoundingClientRect();
          this.mascot.lookAt(gazeAt(m.left + m.width / 2, m.top + m.height / 2, r.left + Math.min(r.width, 160) / 2, r.top + r.height / 2));
        }
      },
      // Held while anyone holds; a sticky card, or a field being typed in, stays open anyway.
      holdOpen: (on, holder = "card") => {
        if (on) this.holders.add(holder);
        else this.holders.delete(holder);
        // The hover chart and the PnL sign never pop at once: a chart opening drops the sign.
        if (on && holder === "chart") this.dropSign();
        this.fsm.hold(this.holders.size > 0 || State.companion.stickyAlerts || this.inputFocused, this.wasInIsland);
      },
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
    this.buildPanel();
    const clip = h("div", { id: "island-clip" }, this.fxCanvas, this.contentEl, this.compactEl, this.panelEl, this.countdownEl, this.searchEl);
    // Candy's right-click menu: over everything, inside the island (its window takes no clicks outside it).
    this.emoteMenu = h("div", { class: "emote-menu", role: "menu" });
    this.emoteMenu.hidden = true;
    this.emoteMenu.tabIndex = -1;
    this.islandEl = h("div", { id: "island" }, clip, this.captionEl, this.wardrobeBtn, this.mascot.el, this.emoteMenu);
    this.root.append(this.wakeStrip, this.islandEl);
    this.labelChrome();
    this.applyGeometry();
  }

  private actions!: ViewActions;

  /** Candy a step forward, closer and bigger, while he holds the day's board up (an event card's doing; see syncDom). */
  private forward = false;
  private stepForward(on: boolean) {
    if (this.forward === on) return;
    this.forward = on;
    this.mascot.el.classList.toggle("forward", on);
  }

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
    // An open panel is drawn again in the new words, where it was scrolled to.
    if (this.panel) {
      this.labelPanel(this.panel.kind);
      const scroll = this.panelBody.querySelector<HTMLElement>(".panel-page")?.scrollTop ?? 0;
      this.mountPage(this.panel.kind, undefined, scroll);
    }
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

  /** Today's recap card, drawn as Share my day draws it (the demo shows it too); the end-of-day board counts the same numbers. */
  async recapImage(): Promise<Blob> {
    const recap = buildRecap(Companion.recapInput(), FULL_NAME);
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
          // A panel opening: the island opens for it, its view left as it was (closePanel puts it back).
          if (this.panel) {
            this.setMode("expanded");
            break;
          }
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
    const { w, h } = islandSize("expanded", "greeting", 0, place, State.compact);
    const at = mascotPlacement("expanded", "greeting", h, place, State.compact);
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
    // Back on screen: the time hidden is not time idle (nothing reports the mouse then).
    if (prev === "hidden") {
      this.movedAt = Date.now();
      this.napRolled = false;
    }
    // Folded or gone: the menu closes and the sign goes down with it.
    if (mode !== "expanded") {
      this.closeEmoteMenu();
      this.mascotHoverOut();
      this.overMascot = false;
    }
    this.mascot.setActive(mode !== "hidden");
    if (mode === "hidden") this.mascot.lookAt(NEUTRAL_GAZE);
    // Start or stop fidgeting; a bare mode change between visible ones keeps the clock.
    if (mode === "hidden" || prev === "hidden") this.scheduleFidget();
    this.updateWindowCollapsed();
    this.updateClickGuard();
    this.animateGeometry(modeOrder(mode) < modeOrder(prev));
    this.updateSecondTimer();
    State.notify();
  }

  private expand(view: IslandViewName) {
    State.view = view;
    if (State.mode !== "expanded") this.setMode("expanded");
    else this.animateGeometry();
    State.notify();
  }

  setView(view: IslandViewName) {
    // A tab, the wardrobe, a shortcut to a view: the panel gives way to it.
    if (this.panel) this.closePanel(false);
    State.minimized = false;
    if (TAB_VIEWS.has(view) && view !== "wardrobe") State.lastTab = view;
    if (State.mode !== "expanded") {
      State.view = view;
      this.fsm.forceHome();
      return;
    }
    State.view = view;
    this.animateGeometry();
    State.notify();
  }

  collapse() {
    // Nothing folds the island under an open panel: closing the panel puts it back.
    if (this.panel) return;
    this.fsm.pinned = false;
    this.fsm.forcePetit();
  }

  /** A short feeling for something the trader did, with a line in its bubble. */
  feel(state: MascotState, line: string) {
    if (State.mode === "hidden") return;
    this.mascot.react(state, 2800);
    this.mascot.say(line, 2800);
  }

  // ── Settings and the Closet, in the island ──────────────────────────────────

  /** The panel's frame: a title row (Candy or the closet's icon, the name, the switch and ×) over the page. */
  private buildPanel() {
    const tab = (kind: PanelKind, icon: string) => {
      const b = h("button", { class: "panel-tab", type: "button" }, svg(icon, 15, { stroke: 1.7 })) as HTMLButtonElement;
      // The open one's button closes it again; the other one takes its place.
      b.addEventListener("click", () => {
        Sound.play("blip");
        this.openPanel(kind, { toggle: true });
      });
      return b;
    };
    this.panelTabs = { settings: tab("settings", ICONS.gear), closet: tab("closet", ICONS.closet) };
    this.panelCloseBtn = h("button", { class: "panel-close", type: "button" }, svg(ICONS.xmark, 14, { stroke: 2 })) as HTMLButtonElement;
    this.panelCloseBtn.addEventListener("click", () => this.closePanel());
    this.panelIcon = h("span", { class: "panel-icon" });
    this.panelTitle = h("h1", { class: "panel-title" });
    this.panelSub = h("span", { class: "panel-sub" });
    this.panelBody = h("div", { class: "panel-body" });
    this.panelEl = h(
      "div",
      { id: "panel", role: "dialog", tabindex: "-1" },
      h(
        "header",
        { class: "panel-head" },
        this.panelIcon,
        h("div", { class: "panel-name" }, this.panelTitle, this.panelSub),
        h("div", { class: "panel-actions" }, this.panelTabs.settings, this.panelTabs.closet, h("i", { class: "panel-sep" }), this.panelCloseBtn),
      ),
      this.panelBody,
    );
    this.panelEl.hidden = true;
  }

  /** The title row's words for a panel, in the trader's language. */
  private labelPanel(kind: PanelKind) {
    this.panelEl.dataset.kind = kind;
    this.panelTitle.textContent = kind === "settings" ? t("Settings") : t("Closet");
    // Which Candy this is, beside Settings: what a friend asks when helping.
    this.panelSub.textContent = kind === "settings" ? `Candy ${State.version}` : "";
    this.panelIcon.replaceChildren(svg(kind === "settings" ? ICONS.gear : ICONS.closet, 20, { stroke: 1.6 }));
    this.panelTabs.settings.title = t("Settings");
    this.panelTabs.closet.title = t("Closet");
    this.panelCloseBtn.title = t("Close (Esc)");
    this.panelCloseBtn.setAttribute("aria-label", t("Close (Esc)"));
    this.panelEl.setAttribute("aria-label", this.panelTitle.textContent);
    for (const k of ["settings", "closet"] as const) {
      this.panelTabs[k].classList.toggle("on", k === kind);
      this.panelTabs[k].setAttribute("aria-pressed", String(k === kind));
    }
    this.syncPanel();
  }

  /** What the title row shows that follows the state: the icon stands in for Candy while he is out on the desktop. */
  private syncPanel() {
    const kind = this.panel?.kind ?? this.panelEl.dataset.kind;
    this.panelIcon.classList.toggle("on", kind === "closet" || State.mascotAway);
  }

  /** How the island is now, its pins included (poseOf keeps only the ones that last). */
  private islandNow(): IslandNow {
    return {
      fsm: this.fsm.state,
      view: State.view,
      minimized: State.minimized,
      pinned: this.fsm.pinned,
      menuOpen: this.menuOpen,
      menuPinned: this.menuPinned,
      inputFocused: this.inputFocused,
    };
  }

  /** What a page in the panel can ask of the island (core/panel.ts PanelHost). */
  private panelHost(): PanelHost {
    return {
      save: (s) => (Companion.persist ? void Bridge.saveSettings(s) : Bridge.previewSettings(s)),
      showOff: (what) => this.showOff(what),
      previewTransparency: (v, settle) => this.previewTransparency(v, settle),
      open: (kind, section) => this.openPanel(kind, { section }),
      shortcuts: this.shortcutLink,
      manifest: this.manifest!,
    };
  }

  /** The global shortcuts as src/main.ts holds them, for Settings. */
  useShortcuts(link: ShortcutLink) {
    this.shortcutLink = link;
  }

  /**
   * Opens Settings or the Closet inside the island: the island grows out of
   * where it is into a panel that holds the page (core/panel.ts), keeps the
   * mouse and the keyboard while it is open, and goes back to exactly how it
   * was when it closes. `toggle` (the gear, the tray, the shortcut): the open
   * one closes instead; `section`: Settings opens (or scrolls) there.
   */
  openPanel(kind: PanelKind, opts: PanelOpts = {}) {
    if (!this.manifest) {
      this.pendingPanel = { kind, opts };
      return;
    }
    const first = !this.panel;
    if (first) {
      // Out of the way first, before the island's pose is taken: the demo,
      // Candy's menu and a field being typed in (their pins are theirs), a
      // look being tried on.
      if (this.tour.running) this.stopDemo();
      this.closeEmoteMenu();
      if (this.inputFocused) (this.root.ownerDocument.activeElement as HTMLElement | null)?.blur();
      this.mascotHoverOut();
    }
    const out = panelStep(this.session, { type: "request", kind, now: this.islandNow(), ...opts });
    const step = out.step;
    if (!step || step.kind === "close") return this.closePanel();
    if (step.kind === "reveal") {
      this.page?.reveal?.(step.section);
      this.panelEl.focus({ preventScroll: true });
      return;
    }
    Sound.resume();
    if (this.panelTimer != null) window.clearTimeout(this.panelTimer);
    this.panelTimer = null;
    this.closingPage?.dispose();
    this.closingPage = null;
    this.session = out.session;
    if (step.swap) return this.swapPanel(step.panel);
    // Where the island is now: it grows out of there.
    const from = this.ownRect();
    if (!IS_TAURI && !this.panelWin) this.browserHome = this.rootOrigin();
    this.fsm.frozen = out.frozen;
    this.fsm.cancelTimers();
    State.minimized = false;
    if (this.fsm.state !== "home") this.fsm.forceHome();
    else Sound.play("open");
    this.labelPanel(kind);
    this.panelEl.hidden = false;
    this.mountPage(kind, step.panel.section);
    this.applyLook();
    this.pushTickerSeat();
    void this.layoutPanel({ from }).then((ok) => {
      if (!ok) return;
      // The page fades in as the island reaches its size (see #panel.on).
      this.panelEl.classList.add("on");
      this.panelEl.focus({ preventScroll: true });
    });
    State.notify();
  }

  /**
   * The other panel in this one's place: the page fades, the window takes
   * room for both while the island changes from one panel's size to the
   * other's, the new page fades in, and the window is trimmed to it.
   */
  private swapPanel(next: OpenPanel) {
    const old = this.panelWin;
    const seq = ++this.panelSeq;
    this.panelEl.classList.remove("on");
    this.pageSwapped = false;
    Sound.play("blip");
    // The page goes once it has faded (where it was); the new one comes in at the new size.
    this.panelTimer = window.setTimeout(() => {
      this.panelTimer = null;
      if (seq !== this.panelSeq || this.panel !== next) return;
      this.labelPanel(next.kind);
      this.mountPage(next.kind, next.section);
      this.pageSwapped = true;
      this.fitPage();
    }, 110);
    if (!old) {
      void this.layoutPanel({ jump: true }).then((ok) => ok && this.panelShown(next));
      return;
    }
    void this.morphPanel(old, next, seq);
  }

  private async morphPanel(old: PanelWin, next: OpenPanel, seq: number) {
    const place = this.placement();
    const want = PANEL_SIZE[next.kind];
    const room = { w: Math.max(old.panel.w, want.w), h: Math.max(old.panel.h, want.h) };
    const final = await this.panelWindow(want, false);
    if (!final || seq !== this.panelSeq || this.panel !== next) return;
    const unmask = this.maskSwitch();
    const both = await this.panelWindow(room, true);
    if (!both || seq !== this.panelSeq || this.panel !== next) return unmask();
    // Each panel where it is (or will be) on screen, in the window that holds both.
    const into = (r: Rect, from: Placed): Rect => ({ ...r, x: r.x + both.dx - from.dx, y: r.y + both.dy - from.dy });
    const target = clampInto(into(panelInWindow(place, final.w, final.h), final), both);
    this.growFrom = clampInto(into(old.panel, old), both);
    this.panelWin = { ...both, panel: target };
    this.fitPage();
    this.placeRoot();
    this.applyGeometry();
    unmask();
    this.animateGeometry(false);
    // The new page fades in as the island nears its new size; once it has it,
    // the window is trimmed to it (the island doesn't move on screen).
    const pause = (ms: number) => new Promise((done) => window.setTimeout(done, ms));
    await pause(SWAP_MS / 2);
    if (seq !== this.panelSeq || this.panel !== next) return;
    if (this.pageSwapped) this.panelShown(next);
    await pause(SWAP_MS / 2);
    if (seq !== this.panelSeq || this.panel !== next) return;
    if (await this.layoutPanel({ jump: true })) this.panelShown(next);
  }

  /** A swap's new page is in (pageSwapped): sized and placed for the new panel; until then the old one fades where it was. */
  private pageSwapped = true;
  /** Where the page sits in the panel's window, when not on the panel (the old page fading during a swap). */
  private pageAt: Rect | null = null;

  private fitPage() {
    const pw = this.panelWin;
    if (!pw) return;
    this.pageAt = this.pageSwapped ? null : this.growFrom;
    const at = this.pageAt ?? pw.panel;
    Object.assign(this.panelEl.style, { width: `${at.w}px`, height: `${at.h}px` });
    this.applyGeometry();
  }

  /** The page in, once the island holds it. */
  private panelShown(open: OpenPanel) {
    if (this.panel !== open) return;
    this.panelEl.classList.add("on");
    this.panelEl.focus({ preventScroll: true });
  }

  /**
   * The panel's window, logical px: its size and where the island's own
   * window sits from it. `apply`: the window goes there (Rust grows the
   * island's window and gives it the keyboard; a browser moves the stage that
   * stands in for it); otherwise only asked.
   */
  private async panelWindow(want: Size, apply: boolean): Promise<Placed | null> {
    if (IS_TAURI) return apply ? Bridge.setPanel(true, want.w, want.h) : Bridge.panelPlace(want.w, want.h);
    const { win } = panelFrame(this.browserWork(), this.placement(), want, { x: State.settings.floatX, y: State.settings.floatY });
    const home = this.browserHome ?? this.rootOrigin();
    if (apply) this.browserWin = win;
    return { w: win.w, h: win.h, dx: home.x - win.x, dy: home.y - win.y };
  }

  /**
   * Places the panel's window for the panel open. `from`: the island's rect
   * in its own window, which it grows out of; `jump`: the island takes the
   * panel's size at once (another display or edge, a swap's last step).
   * False when a newer step took over.
   */
  private async layoutPanel(opts: { from?: Rect; jump?: boolean } = {}): Promise<boolean> {
    const open = this.panel;
    if (!open) return false;
    const seq = ++this.panelSeq;
    const unmask = this.maskSwitch();
    const placed = await this.panelWindow(PANEL_SIZE[open.kind], true);
    if (seq !== this.panelSeq || this.panel !== open || !placed) {
      unmask();
      return false;
    }
    const panel = panelInWindow(this.placement(), placed.w, placed.h);
    this.panelWin = { ...placed, panel };
    this.panelLowered = false;
    this.growFrom = opts.from ? clampInto({ ...opts.from, x: opts.from.x + placed.dx, y: opts.from.y + placed.dy }, placed) : null;
    this.pageSwapped = true;
    this.pageAt = null;
    Object.assign(this.panelEl.style, { width: `${panel.w}px`, height: `${panel.h}px` });
    this.placeRoot();
    if (opts.jump) {
      this.width.jump(panel.w);
      this.height.jump(panel.h);
      this.radius.jump(PANEL_CORNER);
    }
    this.applyGeometry();
    unmask();
    this.animateGeometry(false);
    return true;
  }

  /** The display changed (or its scale) under an open panel: placed again for it. */
  relayoutPanel() {
    if (this.panel) void this.layoutPanel({ jump: true });
  }

  /** The tray's item for the panel open while it is behind another app: in front again, as it was. */
  raisePanel() {
    if (this.panel) void this.layoutPanel();
  }

  /** Rust: the panel stepped behind the app the trader went to, or came back on top. */
  setPanelLowered(on: boolean) {
    this.panelLowered = on && !!this.panel;
  }

  /**
   * The window is about to change under the island where the island can't be
   * anchored to a point of it that stays put (a floating island, the notch's
   * band): it is hidden for that moment rather than seen out of place.
   * Returns how to show it again, once it has been drawn where it belongs.
   */
  private maskSwitch(): () => void {
    const place = this.placement();
    if (!IS_TAURI || isSide(place) || (place === "top" && !State.notch)) return () => {};
    this.islandEl.classList.add("switching");
    return () => requestAnimationFrame(() => requestAnimationFrame(() => this.islandEl.classList.remove("switching")));
  }

  /** The island's rect in its own window now (the notch's band left out). */
  private ownRect(): Rect {
    const r = this.islandRect();
    return { x: r.x, y: r.y, w: this.width.value, h: this.height.value };
  }

  /** Where the island goes back to as the panel closes, w × h, in the panel's window. */
  private homeRect(w: number, h: number): Rect {
    const pw = this.panelWin!;
    const o = islandOrigin(this.placement(), w, h, floatsUp(State.settings.floatY));
    return clampInto({ x: o.x + pw.dx, y: o.y + pw.dy, w, h }, pw);
  }

  /** In a browser, the stage's top-left corner on the "screen" (see browserWork), logical px. */
  private rootOrigin(): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    const scale = r.width / (this.root.offsetWidth || r.width) || 1;
    const parent = this.root.parentElement;
    const fixed = !parent || getComputedStyle(this.root).position === "fixed";
    const base = fixed ? { left: 0, top: 0 } : parent.getBoundingClientRect();
    return { x: (r.left - base.left) / scale, y: (r.top - base.top) / scale };
  }

  /** In a browser, the stage that stands in for the panel's window (see placeRoot). */
  private browserWin: Rect | null = null;

  /** In a browser, the "screen": the page (index.html), or the demo's desktop the stage sits on. */
  private browserWork(): Rect {
    const parent = this.root.parentElement;
    if (!parent || getComputedStyle(this.root).position === "fixed") return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    return { x: 0, y: 0, w: parent.clientWidth, h: parent.clientHeight };
  }

  /** Mounts the page for a panel (loaded on first use: the island starts without it), the one before taken down. */
  private mountPage(kind: PanelKind, section?: SettingsSection, scroll = 0) {
    this.page?.dispose();
    this.page = null;
    const seq = ++this.pageSeq;
    const load = kind === "settings" ? import("../settings/main").then((m) => m.mountSettings) : import("../closet/main").then((m) => m.mountCloset);
    void load.then((mount) => {
      if (seq !== this.pageSeq || this.panel?.kind !== kind) return;
      this.page = mount(this.panelBody, this.panelHost(), section);
      if (scroll) this.panelBody.querySelector<HTMLElement>(".panel-page")?.scrollTo({ top: scroll });
    });
  }
  private pageSeq = 0;

  /**
   * Closes the panel. `restore` (×, Esc, its button, the tray item): the
   * island shrinks back into the spot it came from and goes back to exactly
   * the view, size and placement it had, and hides again if it was hidden.
   * Without (a tab or the wardrobe asked for): the island stays open for
   * what comes next. The mouse and the keyboard are the trader's again at
   * once; the window follows once the island has shrunk.
   */
  closePanel(restore = true) {
    const out = panelStep(this.session, { type: "close", restore });
    if (!out.step) return;
    this.session = out.session;
    this.fsm.frozen = out.frozen;
    ++this.panelSeq;
    this.panelLowered = false;
    if (IS_TAURI) void Bridge.panelClosing();
    // The page goes as it fades; nothing of it keeps running.
    this.closingPage?.dispose();
    this.closingPage = this.page;
    this.page = null;
    ++this.pageSeq;
    this.panelEl.classList.remove("on");
    this.stopShowOff();
    this.previewTransparency(null);
    this.pushTickerSeat();
    // The keyboard leaves the panel (Rust gives it back to the app that had it).
    let focused = this.root.ownerDocument.activeElement as HTMLElement | null;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement as HTMLElement;
    if (focused && this.panelEl.contains(focused.getRootNode() instanceof ShadowRoot ? (focused.getRootNode() as ShadowRoot).host : focused)) focused.blur();
    if (this.panelTimer != null) window.clearTimeout(this.panelTimer);
    // The island shrinks back inside the panel's window, then the window follows.
    this.panelTimer = window.setTimeout(() => {
      this.panelTimer = null;
      this.closingPage?.dispose();
      this.closingPage = null;
      if (this.panel) return;
      this.panelEl.hidden = true;
      const unmask = this.maskSwitch();
      void (IS_TAURI ? Bridge.setPanel(false) : Promise.resolve(null)).then(() => {
        if (this.panel) return unmask();
        this.panelWin = null;
        this.growFrom = null;
        this.browserWin = null;
        this.browserHome = null;
        this.placeRoot();
        this.applyGeometry();
        unmask();
      });
    }, CLOSE_MS + 40);
    const pose = out.restore;
    if (pose) {
      State.view = pose.view;
      State.minimized = pose.minimized;
      this.fsm.pinned = pose.pinned;
      if (pose.fsm === "hidden") this.fsm.forceHidden();
      else if (pose.fsm === "petit") this.fsm.forcePetit();
      else {
        this.animateGeometry(true);
        if (!this.wasInIsland && !pose.pinned) this.fsm.mouseLeft();
      }
    } else this.animateGeometry(true);
    // An alert that came meanwhile: its card now.
    if (out.showAlert) {
      const next = State.events[0];
      if (next && !State.minimized) this.presentEvent(next);
    }
    State.notify();
  }

  /** Settings or the Closet is open in the island. */
  get panelOpen(): PanelKind | null {
    return this.panel?.kind ?? null;
  }

  // ── Flourishes: now and then, never every time (src/mascot/flourish.ts) ──────

  private flourished = new Map<Flourish, number>();

  /** Plays a flourish if its moment's dice say so and it hasn't played lately. Only on screen, and only with Lively on. */
  private tryFlourish(kind: Flourish, size?: number): boolean {
    // Asleep in his bed, he sleeps on (a nap ends first, see wake).
    if (State.mode === "hidden" || State.minimized || !State.companion.lively || State.mascotAway || this.mascot.napping) return false;
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
      case "nightYawn":
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
    // Settings or the Closet open: Candy in its title row reacts, and the card
    // waits for the panel to close.
    const held = panelStep(this.session, { type: "alert" });
    if (held.held) {
      this.session = held.session;
      Sound.play(r.sound);
      this.mascot.react(r.mascot, 3500);
      State.notify();
      return;
    }
    // Napping in his bed: up with a start, then the card (the trader's own
    // return, the "while you were away" card, wakes him gently).
    this.wake(wakeFor(e.kind));
    this.stopShowOff();
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
    if (this.panel) this.closePanel(false);
    State.minimized = true;
    this.fsm.pinned = false;
    this.fsm.forceHidden();
  }

  /**
   * The cursor rested on the hidden island's edge (src-tauri/src/island.rs,
   * spawn_edge_watch), or entered the wake strip: it comes back, unless it
   * was minimized.
   */
  edgeWake() {
    Sound.resume();
    if (State.mode === "hidden" && !State.minimized) this.fsm.mouseEntered();
  }

  /** A press outside the island: fold it back into the ticker. */
  clickOutside() {
    // An open menu only closes: the island stays as it was.
    if (this.menuOpen) return this.closeEmoteMenu();
    // A panel stays open like a window would: ×, Esc or its button close it.
    if (this.panel) return;
    if (State.mode !== "expanded") return;
    // An open dropdown draws its list outside the island; picking from it is
    // not a click elsewhere.
    if (document.activeElement instanceof HTMLSelectElement) return;
    this.collapse();
  }

  /** The show/hide shortcut: opens the island, or folds it back. */
  toggle() {
    Sound.resume();
    // The show/hide shortcut over an open panel: it closes, the island as it was.
    if (this.panel) return this.closePanel();
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
      if (this.panel) this.closePanel(false);
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

  /**
   * A transparency Settings is still choosing (its thumb is held): the
   * background fades to it now, the setting follows. `settle`: let go and
   * saved, it stays a moment before the panel is as solid as a panel is.
   * Null: as the setting says, at once.
   */
  previewTransparency(transparency: number | null, settle = false) {
    if (this.alphaTimer != null) window.clearTimeout(this.alphaTimer);
    this.alphaTimer = null;
    this.alphaPreview = transparency;
    if (transparency != null && settle && this.panel)
      this.alphaTimer = window.setTimeout(() => {
        this.alphaTimer = null;
        this.alphaPreview = null;
        this.applyLook();
      }, ALPHA_SETTLE_MS);
    this.applyLook();
  }

  /** The theme on the page, and how see-through it is (a panel's background only a little: see shownTransparency). */
  private applyLook() {
    const c = State.companion;
    applyTheme(document.body, c.theme, shownTransparency(c.islandTransparency, !!this.panel, this.alphaPreview));
  }

  /** Applies settings at boot and whenever Settings or the Closet saves. */
  applySettings() {
    Sound.setEnabled(State.settings.soundEnabled);
    Sound.setVolume(State.settings.soundVolume);
    document.body.dataset.theme = State.companion.theme;
    this.applyLook();
    this.mascot.setFilter(lookFilter({ ...State.companion, costume: this.costumeNow() }));
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
    // The compact island: the trader's choice, or the display's height (see layout.ts).
    State.compact = compactFor(State.companion.compactIsland, State.screenHeight);
    document.body.classList.toggle("compact", State.compact);
    this.applyPlacement();
    this.updateClickGuard();
    State.notify();
  }

  /** The island's display, or its scale, changed: its height (logical px) may turn the compact island on or off. */
  setScreenHeight(height: number) {
    if (!(height > 0) || height === State.screenHeight) return;
    State.screenHeight = height;
    if (compactFor(State.companion.compactIsland, height) !== State.compact) this.applySettings();
  }

  // ── Placement ───────────────────────────────────────────────────────────────

  /** Where the island lives now. A browser window too narrow for the panel keeps it on top. */
  private placement(): Placement {
    if (!IS_TAURI && window.innerWidth < PANEL_W + 40) return "top";
    // Where the window can't be placed (plain Wayland) only the top edge works (see State.canPlace).
    if (IS_TAURI && !State.canPlace) return "top";
    return State.settings.placement;
  }

  private placed: Placement | null = null;
  /** The island was last laid out compact (see State.compact). */
  private dense: boolean | null = null;

  /** Lays the island out for its placement (sizes, the side tab, the wake strip). */
  private applyPlacement() {
    const place = this.placement();
    // Moved to another edge while a panel is open: the panel goes with it.
    if (this.panel && place !== this.placed) void this.layoutPanel({ jump: true });
    document.body.dataset.placement = place;
    // On a side edge: the upright tab, and the sidebar when open (see style.css).
    document.body.classList.toggle("sidebar", isSide(place));
    this.compactEl.classList.toggle("vertical", isSide(place));
    this.placeRoot();
    if (place !== this.placed || State.compact !== this.dense) {
      this.placed = place;
      this.dense = State.compact;
      // The lists size themselves to the density (watchlist.ts, trending.ts).
      this.lastRowsKey = "";
      this.animateGeometry();
    }
    this.pushTickerSeat();
  }

  /**
   * Tells Rust where the ticker's mascot sits (the compact one is smaller and
   * sits higher, the side tab's is turned upright): Candy's flights to and
   * from the desktop start and end on it (desktop.rs island_spot).
   */
  private pushTickerSeat() {
    // Under a panel he sits in its title row: a flight to the desktop starts (or lands) there.
    const seat = this.panel ? panelMascot(this.placement()) : tickerSeat(this.placement(), State.compact);
    const p = this.pushedSeat;
    if (p && Math.abs(p.cx - seat.cx) < 0.5 && Math.abs(p.cy - seat.cy) < 0.5) return;
    this.pushedSeat = seat;
    void Bridge.setTickerSeat(seat.cx, seat.cy);
  }

  /**
   * In a browser the 720×340 stage stands in for the window: CSS puts it on
   * the top or a side edge; a floating one goes where it was dragged, by the
   * same rule as the app's window (src-tauri/src/island.rs).
   */
  private placeRoot() {
    if (IS_TAURI) return;
    const st = this.root.style;
    // A panel: the stage takes the panel's window, as the app's window does.
    document.body.classList.toggle("panel-open", !!this.panelWin);
    if (this.panelWin && this.browserWin) {
      const r = this.browserWin;
      Object.assign(st, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, transform: "none" });
      return;
    }
    st.width = st.height = st.transform = "";
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
   * moves its window from Rust (it answers with "float-drag-end"): with the
   * cursor poll Rust follows the mouse, without (Linux) the page tells it how
   * far. A browser moves the stage.
   */
  private pressFloat(e: MouseEvent) {
    if (IS_TAURI && State.cursorPoll) {
      void Bridge.startFloatDrag();
      return;
    }
    if (IS_TAURI) return this.dragWindow(e);
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

  /**
   * Linux: the page drags the floating island's window. The press point stays
   * under the mouse: every move asks Rust to shift the window by how far the
   * mouse got from it (the compositor keeps sending the moves while the button
   * is held, even outside the window), one request at a time.
   */
  private dragWindow(e: MouseEvent) {
    const grab = { x: e.clientX, y: e.clientY };
    let moved = false;
    let busy = false;
    let want: { dx: number; dy: number } | null = null;
    const send = () => {
      if (busy || !want) return;
      const { dx, dy } = want;
      want = null;
      busy = true;
      void Bridge.floatDragBy(dx, dy).finally(() => {
        busy = false;
        send();
      });
    };
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - grab.x;
      const dy = ev.clientY - grab.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      // Moves that come while one is on its way are skipped: they were
      // measured before the window got there.
      if (busy) return;
      want = { dx, dy };
      send();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      void Bridge.floatDragDone(moved);
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
      // The end-of-day board: as many rows as its tiles take, then its buttons.
      if (e?.kind === "dayEnd") return dayEndRows(this.boardTiles(e.id), isSide(this.shapePlacement()));
      return e?.kind === "away" ? e.lines.length + (e.moves?.length ? 1 : 0) : 0;
    }
    return 0;
  }

  /** How many tiles the day's board holds (see dayEndStats), once per card: the count doesn't change while it is up. */
  private boardTilesFor: { id: string; tiles: number } | null = null;
  private boardTiles(id: string): number {
    if (this.boardTilesFor?.id !== id) {
      const input = Companion.recapInput();
      const entries = currentLog(State.companion.log).entries;
      this.boardTilesFor = { id, tiles: dayEndStats({ trades: input.trades, positions: input.positions, entries, sessionMs: 0 }).length };
    }
    return this.boardTilesFor.tiles;
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
    // An open panel: the island is the panel (once its window has been placed).
    const panel = this.panel && this.panelWin?.panel;
    const { w, h } = panel || islandSize(State.mode, State.view, this.rowsFor(State.view), this.shapePlacement(), State.compact, wideFace(State.companion.theme));
    const r = panel ? PANEL_CORNER : State.mode === "expanded" ? EXPANDED_CORNER : COMPACT_CORNER;
    // Closing: the island shrinks back into the spot it will have in its own window.
    if (this.panelWin && !this.panel) this.growFrom = this.homeRect(w, h);
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
    // The background layer (#island::before) reaches up over the band.
    this.islandEl.style.setProperty("--band", `${band}px`);
    // From the point of the window that stays put on screen as it changes
    // between the island's own and a panel's (anchoredAt); the wake strip's
    // window is the island's own corner.
    const at = this.collapsed && !this.panelWin ? { left: `${rect.x}px`, top: `${rect.y}px` } : anchoredAt(this.placement(), rect, this.windowNow());
    this.islandEl.style.left = at.left;
    this.islandEl.style.top = at.top;
    // The panel's page keeps its own size while the island grows round it (no
    // reflow of the page on every frame): it sits where the panel will be.
    const pw = this.panelWin;
    const page = this.pageAt ?? pw?.panel;
    if (page) this.panelEl.style.transform = `translate(${page.x - rect.x}px, ${page.y - rect.y}px)`;
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
    const up = floatsUp(State.settings.floatY);
    // In the panel's window: out of the spot it was in, into the panel (and back).
    if (this.panelWin) return { ...growRect(this.growFrom ?? this.panelWin.panel, this.panelWin.panel, w, h), w, h };
    return { ...islandOrigin(this.placement(), w, h, up), w, h: h + this.band() };
  }

  /** The window the page is laid out in now: a panel's, else the island's own (with the notch's band). */
  private windowNow(): Size {
    if (this.panelWin) return this.panelWin;
    const own = windowSize(this.placement());
    return { w: own.w, h: own.h + this.band() };
  }

  /**
   * At the top of a MacBook with a notch the island starts at the screen's top
   * edge: a black band as tall as the notch, over the menu bar around it, then
   * the island as anywhere else. 0 elsewhere.
   */
  private band(): number {
    // A panel opens under the menu bar and the notch (its window starts at the work area's top).
    if (this.panelWin) return 0;
    return this.placement() === "top" ? State.notch : 0;
  }

  /** The island's display changed, or Rust placed it again: its notch (logical px), or 0. */
  setNotch(notch: number) {
    if (Math.abs(notch - State.notch) < 0.5) return;
    State.notch = notch;
    this.applyGeometry();
  }

  /**
   * The ticker on a screen edge covers what is there (a browser's tabs at the
   * top): it lets clicks through until the cursor rests on it (island.rs,
   * TICKER_DWELL). Not a floating ticker, which is dragged by a press.
   */
  private updateClickGuard() {
    const on = State.mode === "compact" && this.placement() !== "float";
    if (on === this.guardOn) return;
    this.guardOn = on;
    void Bridge.setClickGuard(on);
  }

  /**
   * Rust says whether the mouse goes through the island: it fades so what is
   * behind shows, and the cursor over it doesn't count as on the island (the
   * ticker doesn't open on hover while the trader is reaching for a tab).
   */
  setPassing(on: boolean) {
    // Never under a panel (Rust doesn't ask then; a last word from before it opened is ignored).
    if (this.panel) on = false;
    if (on === this.passing) return;
    this.passing = on;
    document.body.classList.toggle("passing", on);
    // The cursor may be resting still: no move event will come to say so.
    this.onCursor(State.mouse.x, State.mouse.y);
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
        void Bridge.setCollapsed(true, State.minimized);
      }, CLOSE_MS + 80);
    } else if (this.collapsed) {
      this.collapsed = false;
      void Bridge.setCollapsed(false);
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private wireInput() {
    // Linux (and the browser): the strip takes the mouse. Windows and macOS let
    // clicks through it and wake the island from Rust instead (edgeWake).
    this.wakeStrip.addEventListener("mouseenter", () => this.edgeWake());

    this.islandEl.addEventListener("mousedown", (e) => {
      Sound.resume();
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
        // In a panel's title row he can be poked, not carried off to the desktop.
        if (!this.panel) this.mascotPress = { x: e.clientX, y: e.clientY };
        return;
      }
      // A panel is not dragged around: its window stays where it opened.
      if (this.panel) return;
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

    // Right-click on Candy: his menu (dance, wave, laugh, spin, the wardrobe), and closes it again.
    this.islandEl.addEventListener("contextmenu", (e) => {
      if (this.emoteMenu.contains(e.target as Node)) return e.preventDefault();
      const p = this.pagePoint(e);
      if (!this.isMascotHit(p.x, p.y)) return;
      e.preventDefault();
      this.toggleEmoteMenu();
    });
    // The menu's own presses stay in it: no poke, no drag, no fold.
    this.emoteMenu.addEventListener("mousedown", (e) => e.stopPropagation());
    // A press anywhere else closes it (a right-click on Candy toggles it, above).
    // One outside the island only closes the menu: the island stays as it was.
    document.addEventListener(
      "mousedown",
      (e) => {
        if (!this.menuOpen || this.emoteMenu.contains(e.target as Node)) return;
        const p = this.pagePoint(e);
        if (e.button === 2 && this.isMascotHit(p.x, p.y)) return;
        this.closeEmoteMenu();
        if (!this.islandEl.contains(e.target as Node)) e.stopPropagation();
      },
      true,
    );
    // Its keys, before the island's own (Esc would fold the island).
    window.addEventListener("keydown", (e) => this.menuKey(e), true);

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
      // A panel open: Esc closes it (a key a field or a recording took is left alone); Ctrl+, too, over Settings.
      if (this.panel) {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          // In a field of the page: the first Esc only leaves the field (what was typed stays), the next closes.
          const field = e.composedPath()[0];
          if (field instanceof HTMLElement && field.matches(TEXT_FIELD) && this.panelEl.contains(field.getRootNode() instanceof ShadowRoot ? (field.getRootNode() as ShadowRoot).host : field)) {
            field.blur();
            this.panelEl.focus({ preventScroll: true });
            return;
          }
          this.closePanel();
        } else if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === "Comma") {
          e.preventDefault();
          this.openPanel("settings", { toggle: true });
        }
        return;
      }
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
        this.openPanel("settings", { toggle: true });
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
    this.origin = { x: r.left, y: r.top, scale: r.width / (this.panelWin?.w ?? windowSize(this.placement()).w) || 1 };
    return { x: (e.clientX - r.left) / this.origin.scale, y: (e.clientY - r.top) / this.origin.scale };
  }

  /** Cursor in window-logical coordinates. */
  onCursor(x: number, y: number) {
    State.mouse = { x, y };
    // A nap ends with a stretch first: the "while you were away" card that
    // noticePresence may raise must not wake him with a start.
    this.noticeMove();
    this.noticePresence();
    const rect = this.islandRect();
    const inIsland =
      !this.passing &&
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

  // ── A nap in a little bed (src/mascot/nap.ts) ──────────────────────────────

  /** When the mouse last moved (as the away watch sees it): the idle period's start. */
  private movedAt = Date.now();
  /** This idle period had its roll of the dice: one nap at most per stretch away. */
  private napRolled = false;

  /** The mouse moved: a new idle period starts, and a nap ends with a stretch. */
  private noticeMove() {
    this.movedAt = Date.now();
    this.napRolled = false;
    // A nap shown from Settings lasts its few seconds, mouse or not.
    if (this.showing?.what !== "nap") this.wake("back");
  }

  /** What the nap rules see (nap.ts). */
  private napScene(): NapScene {
    const dancing = State.companion.danceToMusic && islandDances({ playing: State.music, mode: State.mode, view: State.view });
    return {
      enabled: State.companion.napBed,
      mood: State.moodFace ?? State.mood.state,
      melting: this.meltAt > 0,
      waiting: State.events.length > 0 || State.unseen != null,
      busy:
        State.mode === "hidden" || State.minimized || State.mascotAway || dancing || this.previewing ||
        this.tour.running || (State.mode === "expanded" && State.view === "wardrobe"),
    };
  }

  /**
   * While the island is on screen (the one-second clock) and on every change:
   * a nap may start once the PC has been idle a while with the market calm,
   * by the dice; one going on ends when something happens.
   */
  private napCheck() {
    // Settings → Show me: the nap shown runs its course.
    if (this.showing?.what === "nap") return;
    // No real nap under the trader's eyes in a panel.
    if (this.panel && !this.mascot.napping) return;
    const scene = this.napScene();
    if (this.mascot.napping) {
      const why = napEnds(scene);
      if (why) this.wake(why);
      return;
    }
    if (this.napRolled || !napDue(Date.now() - this.movedAt, scene)) return;
    this.napRolled = true;
    if (shouldFlourish("nap", this.flourished, Date.now(), Math.random())) this.nap(true);
  }

  /** Into his little bed now, or out of it with a stretch (the demo's stills call it too). */
  nap(on: boolean) {
    if (on === this.mascot.napping) return;
    if (!on) return this.wake("back");
    this.mascot.say(null);
    this.mascot.setBed(true);
    State.notify();
  }

  /** Ends a nap: the trader is back (a stretch and a yawn), something happened (a startled hop), or quietly. */
  private wake(how: Wake) {
    if (!this.mascot.napping) return;
    this.mascot.setBed(false, how === "startled");
    if (how === "startled") this.mascot.react("alert", 900);
    State.notify();
  }

  // ── Melting on a strong drop (src/mascot/melt.ts) ──────────────────────────

  /** The stage his wax has run down to, for the price that counts. */
  private meltAt: MeltStage = 0;

  /** The stage drawn: a Show me's, else the price's; none in a costume (somebody else's body). */
  private meltShown(): MeltStage {
    if (this.showing?.what === "melt") return this.showing.stage;
    return this.worn === "none" ? this.meltAt : 0;
  }

  /** How far the wax has run, as drawn. */
  private meltLevel(): number {
    return MELT_LEVELS[this.meltShown()];
  }

  /** The drop on the trader's biggest position, else the watchlist's first token, sets the stage. */
  private syncMelt() {
    const c = State.companion;
    const subject = meltSubject(
      Companion.positions().map(({ p }) => State.positionQuotes[p.mint] ?? State.quotes[tokenKey("solana", p.mint)]),
      c.watchlist,
      (tok) => State.quotes[tok.key],
    );
    const was = this.meltAt;
    this.meltAt = c.meltOnDrop ? meltStage(this.meltAt, meltDrop(subject)) : 0;
    // Deeper: his face shows it for a moment, whatever the watchlist's mood.
    if (this.meltAt > was && this.worn === "none" && !this.showing) this.meltPeek(this.meltAt);
    this.mascot.setMelt(this.meltLevel());
  }

  /** The wax ran down a stage: a worried look (a shocked one at the deepest), then back to the mood. */
  private meltPeek(stage: MeltStage) {
    if (State.mode === "hidden" || State.minimized || State.mascotAway || this.mascot.napping) return;
    this.mascot.react(stage >= 3 ? "shocked" : "worried", 2400);
  }

  // ── Settings → Show me (pyjamas, a nap, the melt) ──────────────────────────

  /** What a Settings "Show me" plays right now, and the stage a shown melt is at. */
  private showing: { what: ShowOff; stage: MeltStage } | null = null;
  private showTimers: number[] = [];

  /** A costume is put aside while the pyjamas or the melt are shown (they are drawn on Candy's own body). */
  private costumeNow(): string {
    return this.showing && this.showing.what !== "nap" ? "none" : State.companion.costume;
  }

  /**
   * Settings → Show me: plays a look that otherwise needs the night, a while
   * idle or a strong drop, on Candy in the island for a few seconds, whatever
   * the clock, the dice or the market say; then his own look comes back.
   * Nothing is saved, and nothing keeps running after it.
   */
  showOff(what: ShowOff): number {
    if (!this.manifest) return 0;
    this.stopShowOff();
    // On screen for it, even minimized: the trader asked to see it.
    State.minimized = false;
    if (State.mode === "hidden") this.fsm.reveal();
    this.showing = { what, stage: 0 };
    this.mascot.say(null);
    const later = (ms: number, fn: () => void) => this.showTimers.push(window.setTimeout(fn, ms));
    this.dressNow();
    switch (what) {
      case "pyjamas":
        later(1200, () => this.mascot.yawn());
        later(SHOW_MS, () => this.stopShowOff());
        break;
      case "nap":
        this.nap(true);
        later(SHOW_MS, () => this.stopShowOff());
        break;
      case "melt":
        ([1, 2, 3] as const).forEach((stage, i) =>
          later(400 + i * SHOW_MELT_STEP_MS, () => {
            if (!this.showing) return;
            this.showing.stage = stage;
            this.mascot.setMelt(MELT_LEVELS[stage], SHOW_MELT_S);
            this.meltPeek(stage);
            State.notify();
          }),
        );
        later(400 + 3 * SHOW_MELT_STEP_MS + 1200, () => this.stopShowOff());
        break;
    }
    // Under a panel he steps out of its title row for it (panelMascotSpot).
    this.ensureRunning();
    State.notify();
    return what === "melt" ? 400 + 3 * SHOW_MELT_STEP_MS + 1200 : SHOW_MS;
  }

  /** Ends a "Show me": out of bed with a stretch, and his own look back on. */
  private stopShowOff() {
    for (const id of this.showTimers) window.clearTimeout(id);
    this.showTimers = [];
    if (!this.showing) return;
    const was = this.showing.what;
    this.showing = null;
    if (was === "nap") this.wake("back");
    // Idle again from now: no real nap right after the shown one.
    this.movedAt = Date.now();
    this.dressNow();
    this.syncMelt();
    this.ensureRunning();
    State.notify();
  }

  /** Costume, colour, hat, face and pyjamas as they should be now (a "Show me" included). */
  private dressNow() {
    if (!this.manifest || this.previewing) return;
    this.mascot.setFilter(lookFilter({ ...State.companion, costume: this.costumeNow() }));
    this.wearCostume();
    this.wearChosen();
    this.mascot.setMelt(this.meltLevel());
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
      // Asleep in his bed: no fidgeting.
      if (this.mascot.napping) {
        this.scheduleFidget();
        return;
      }
      // In his pyjamas, after midnight, he yawns more (not while he dozes:
      // Doze off late at night already has his eyes shut).
      if (!this.mascot.reacting && !this.pressing && this.look().pyjamas && State.mood.state !== "sleepy" && this.tryFlourish("nightYawn")) {
        this.scheduleFidget();
        return;
      }
      // Bored (or worn out): now and then a real yawn instead of a fidget.
      if (!this.mascot.reacting && !this.pressing && (State.mood.state === "bored" || State.mood.state === "tired") && this.tryFlourish("yawn")) {
        this.scheduleFidget();
        return;
      }
      if (!this.mascot.reacting && !this.pressing && State.moodFace && Math.random() < 0.4) {
        // A settled mood peeks back for a moment.
        this.mascot.react(meltMood(State.moodFace, this.meltShown()), 2500);
      } else if (!this.mascot.reacting && !this.pressing) {
        const f = pickFidget(State.mood.state, Math.random());
        if (f) {
          this.mascot.react(State.mood.state, f.ms, f.motion);
          // Not over a panel's page: his bubble would sit on it.
          if (f.say && !this.panel) this.mascot.say(t(f.say), f.ms);
          if (f.wink) this.mascot.wink();
        }
      }
      this.scheduleFidget();
    }, fidgetDelay(Math.random()));
  }

  private isMascotHit(x: number, y: number): boolean {
    // Out on the desktop, the island's Candy is invisible: nothing to hit (nor in the Closet, which has its own big one).
    if (State.mascotAway || this.panel?.kind === "closet") return false;
    const rect = this.islandRect();
    const cx = rect.x + this.mCx.value;
    const cy = rect.y + this.band() + this.mCy.value;
    const r = this.mSize.value * 0.42;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }

  private mascotHoverIn() {
    // The mouse settles on him: he holds up today's PnL.
    this.raiseSignSoon();
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
    this.dropSign();
  }

  private dropSign() {
    if (this.signTimer != null) window.clearTimeout(this.signTimer);
    this.signTimer = null;
    this.mascot.holdSign(null);
  }

  // ── The PnL sign (src/mascot/sign.ts) ───────────────────────────────────────

  private raiseSignSoon() {
    if (this.signTimer != null) window.clearTimeout(this.signTimer);
    this.signTimer = window.setTimeout(() => {
      this.signTimer = null;
      // Not over a hover chart either (one open over him in the sidebar): one popup at a time.
      if (!this.overMascot || State.mode !== "expanded" || State.mascotAway || this.pressing || this.menuOpen || this.holders.has("chart") || this.panel) return;
      this.mascot.holdSign(this.daySign());
      this.fitSign();
    }, SIGN_DELAY_MS);
  }

  /** Today's PnL as the sign says it: the day's log (the header's day pill) and the trader's own wallet. */
  private daySign(): PnlSign {
    const c = State.companion;
    const day = summarize(currentLog(c.log));
    const mine = c.wallets.some((w) => w.mine);
    const held = mine ? Companion.positions() : [];
    return pnlSign({
      log: { count: day.count, total: day.total, unit: c.discipline.unit },
      wallet: mine
        ? {
            realizedUsd: c.book.day === todayKey() ? c.book.realizedToday : 0,
            openUsd: held.reduce((s, x) => s + x.s.pnlUsd, 0),
            held: held.length,
          }
        : null,
    });
  }

  /** Keeps the sign inside the island: near an edge (the sidebar's band) it slides in. */
  private fitSign() {
    this.mascot.nudgeSign(0);
    const r = this.mascot.signRect();
    if (!r) return;
    const box = this.islandEl.getBoundingClientRect();
    const scale = box.width / (this.islandEl.offsetWidth || box.width) || 1;
    const pad = 6 * scale;
    const dx = Math.max(0, box.left + pad - r.left) - Math.max(0, r.right - (box.right - pad));
    if (dx) this.mascot.nudgeSign(dx / scale);
  }

  // ── Shades on a 2x (src/mascot/shades.ts) ───────────────────────────────────

  /** A held token just reached 2x: he puts his shades on (now, or as soon as the island shows). */
  private checkShades() {
    const held = State.companion.wallets.some((w) => w.mine) ? Companion.positions() : [];
    const { crossed, seen } = shadesCrossings(
      this.shadesSeen,
      held.map((x) => ({ key: x.p.mint, multiple: x.s.multiple })),
    );
    this.shadesSeen = seen;
    if (crossed.length) this.shadesDue = Date.now();
    // Out on the desktop, he is on screen whatever the island does (it folds
    // away after a minute): his shades reach him through the snapshot. Only
    // with no Candy in sight do they wait for the island to show.
    const onScreen = (State.mascotAway && this.desktop.supported) || (State.mode !== "hidden" && !State.minimized);
    if (!this.shadesDue || !onScreen) return;
    const due = this.shadesDue;
    this.shadesDue = 0;
    if (Date.now() - due <= SHADES_PENDING_MS) this.putOnShades();
  }

  /**
   * Dark shades on for a few seconds, then off. The trader's own face
   * accessory is never changed: the shades go over it (one worn below the
   * eyes stays on under them). Played on whichever Candy is on screen.
   */
  putOnShades() {
    const src = accessory(this.manifest, "faces", SHADES_FACE);
    if (!src) return;
    const keepFace = keepsFaceUnderShades(this.look().face);
    this.shadesOn = { src, keepFace };
    this.mascot.wearShades(src, keepFace);
    // The cool look on the Candy people see: the desktop's when he is out.
    if (State.mascotAway && this.desktop.supported) this.desktop.react("cool", 2600);
    else if (!this.mascot.reacting) this.mascot.react("cool", 2600);
    if (this.shadesTimer != null) window.clearTimeout(this.shadesTimer);
    this.shadesTimer = window.setTimeout(() => {
      this.shadesTimer = null;
      this.shadesOn = null;
      this.mascot.wearShades(null);
      State.notify();
    }, SHADES_MS);
    State.notify();
  }

  // ── Candy's right-click menu (src/mascot/emotes.ts) ─────────────────────────

  /** Opens the menu, or closes it when it is open. */
  toggleEmoteMenu() {
    if (this.menuOpen) this.closeEmoteMenu();
    else this.openEmoteMenu();
  }

  /**
   * Candy's menu, beside him in the island: dance, wave, laugh, spin, then the
   * wardrobe. Folded or out on the desktop, the island opens for it. Esc, a
   * press anywhere else, or a pick closes it.
   */
  openEmoteMenu() {
    if (this.menuTimer != null) window.clearTimeout(this.menuTimer);
    this.menuTimer = null;
    State.minimized = false;
    this.mascotHoverOut();
    if (State.mode !== "expanded") this.setView(TAB_VIEWS.has(State.view) && State.view !== "wardrobe" ? State.view : State.lastTab);
    // A field being typed in lets go first: the menu taking the focus would
    // blur it later, and its blur unpins the island and gives the keyboard
    // back to the other apps (focusInput), under the open menu.
    if (this.inputFocused) (document.activeElement as HTMLElement | null)?.blur();
    // Held open while it shows; the keyboard comes to the island for the arrows and Esc.
    if (!this.menuOpen) this.menuPinned = this.fsm.pinned;
    this.menuOpen = true;
    this.fsm.pinned = true;
    Sound.play("pop");

    const menu = this.emoteMenu;
    const item = (path: string, label: string, run: () => void, stroke?: number) => {
      const b = h("button", { class: "emote-item", type: "button", role: "menuitem" }, svg(path, 14, stroke ? { stroke } : {}), h("span", { text: label }));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeEmoteMenu();
        run();
      });
      return b;
    };
    menu.replaceChildren(
      ...EMOTES.map((e) => item(EMOTE_ICONS[e].path, t(EMOTE_INFO[e].label), () => this.playEmote(e), EMOTE_ICONS[e].stroke)),
      h("i", { class: "emote-sep" }),
      item(ICONS.shirt, t("Wardrobe"), () => this.toggleWardrobe(), 1.8),
    );
    // Laid out where the island is going (it may still be opening), beside where Candy sits.
    const show = () => {
      this.menuTimer = null;
      if (!this.menuOpen) return;
      const place = this.shapePlacement();
      const panel = this.panel && this.panelWin?.panel;
      const size = panel || islandSize(State.mode, State.view, this.rowsFor(State.view), place, State.compact, wideFace(State.companion.theme));
      const at = panel ? this.panelMascotSpot() : mascotPlacement(State.mode, State.view, size.h, place, State.compact);
      menu.style.visibility = "hidden";
      menu.hidden = false;
      const spot = menuSpot({ x: at.cx, y: at.cy, r: at.size * 0.42 }, { w: menu.offsetWidth, h: menu.offsetHeight }, size);
      menu.style.left = `${spot.left}px`;
      menu.style.top = `${spot.top}px`;
      menu.style.setProperty("--tail", `${spot.tail}px`);
      menu.dataset.side = spot.side;
      menu.style.visibility = "";
      // Replays the pop-in.
      menu.classList.remove("on");
      void menu.offsetWidth;
      menu.classList.add("on");
      // The menu takes the keys without lighting an item: the first arrow picks one.
      menu.focus({ preventScroll: true });
      // The island's window takes the keyboard (it doesn't, between clicks).
      if (IS_TAURI) void Bridge.focusWindow(true);
    };
    const opening = this.width.animating || this.height.animating;
    if (opening) this.menuTimer = window.setTimeout(show, 200);
    else show();
  }

  closeEmoteMenu() {
    if (this.menuTimer != null) window.clearTimeout(this.menuTimer);
    this.menuTimer = null;
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.emoteMenu.hidden = true;
    this.emoteMenu.classList.remove("on");
    this.fsm.pinned = this.menuPinned || this.inputFocused;
    if (IS_TAURI && !this.inputFocused) void Bridge.focusWindow(false);
    // Opened from afar (the desktop Candy, the ticker): the island folds back as usual.
    if (!this.wasInIsland && State.mode === "expanded") this.fsm.mouseLeft();
  }

  /** The menu's keys: arrows walk it, Esc closes it (and only it). */
  private menuKey(e: KeyboardEvent) {
    if (!this.menuOpen) return;
    const items = [...this.emoteMenu.querySelectorAll<HTMLElement>(".emote-item")];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[i]?.focus({ preventScroll: true });
    switch (e.key) {
      case "Escape":
        this.closeEmoteMenu();
        break;
      case "ArrowDown":
      case "ArrowUp":
        go(stepItem(at, items.length, e.key === "ArrowDown" ? 1 : -1));
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(items.length - 1);
        break;
      case "Tab":
        go(stepItem(at, items.length, e.shiftKey ? -1 : 1));
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /** Plays an emote on whichever Candy is on screen: the island's, or the desktop's when he is out. */
  playEmote(e: Emote) {
    Sound.play(EMOTE_INFO[e].sound);
    if (State.mascotAway && this.desktop.supported) this.desktop.emote(e);
    else this.mascot.emote(e);
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

    const p = this.panel
      ? this.panelMascotSpot()
      : mascotPlacement(State.mode, State.view, this.height.value, this.shapePlacement(), State.compact);
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

  /** Candy under a panel: in Settings' title row, or out of it, big, while a Show me plays; not in the Closet's (it has its own). */
  private panelMascotSpot() {
    const place = this.placement();
    if (this.showing && this.panel?.kind === "settings" && this.panelWin) return { ...panelShowSpot(place, this.panelWin.panel.w), opacity: 1 };
    return { ...panelMascot(place), opacity: this.panel?.kind === "settings" ? 1 : 0 };
  }

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
    // Out of a panel's title row for a Show me: on a soft stage of the island's own colour.
    el.classList.toggle("on-stage", !!(this.panel && this.showing));

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
    // His sign goes where the caption is: beside him in the band, where the
    // folder chips under him stay clear.
    el.classList.toggle("sign-beside", this.captionEl.classList.contains("beside"));
  }

  // ── DOM sync ────────────────────────────────────────────────────────────────

  private syncDom() {
    // Following turned off while its tab was open: back to the watchlist.
    if (State.view === "wallets" && !State.companion.following) State.view = "watchlist";
    // Discipline turned off while its tab was open: the same.
    if (State.view === "discipline" && !State.companion.disciplineOn) State.view = "watchlist";
    // Under a panel the island's own views are put away.
    const expanded = State.mode === "expanded" && !this.panel;
    // The wardrobe closed or folded with a look still being tried on.
    if (this.previewing && (!expanded || State.view !== "wardrobe")) this.previewLook(null);
    // The card he stepped forward for folded away or gave way to a tab: back in his spot.
    if (this.forward && (!expanded || State.view !== "event")) this.stepForward(false);
    // Music playing on the PC: the dance, folded or open (see islandDances);
    // the mood may sit it out.
    if (State.view === "music" && (!State.nowPlaying || !State.companion.musicCard)) State.view = "watchlist";
    this.mascot.setDancing(State.companion.danceToMusic && islandDances({ playing: State.music, mode: State.mode, view: State.view }));
    // Lists that load or grow on their own (trending, a wallet added from the
    // Settings panel) change the island's height: follow them.
    const rowsKey = `${State.view}:${this.rowsFor(State.view)}`;
    if (expanded && rowsKey !== this.lastRowsKey) {
      this.lastRowsKey = rowsKey;
      this.animateGeometry();
    }
    this.contentEl.style.opacity = expanded ? "1" : "0";
    this.contentEl.style.pointerEvents = expanded ? "auto" : "none";
    this.compactEl.style.opacity = State.mode === "compact" ? "1" : "0";
    if (this.panel) this.syncPanel();

    this.header.sync();
    for (const [name, view] of this.views) {
      const on = name === State.view;
      view.el.classList.toggle("on", on);
      if (on && expanded) view.sync();
    }

    const showCaption = expanded && TAB_VIEWS.has(State.view);
    this.wardrobeBtn.style.display = showCaption ? "" : "none";
    this.wardrobeBtn.classList.toggle("on", State.view === "wardrobe");
    // His wax runs down on a strong drop; a nap starts or ends with what changed.
    this.syncMelt();
    this.napCheck();
    this.captionEl.style.opacity = showCaption ? "1" : "0";
    // A real nap says why he sleeps; one shown from Settings keeps the mood's line.
    const caption = this.mascot.napping && !this.showing ? t("Taking a nap: the market is calm.") : State.mood.text;
    this.captionEl.textContent = caption;
    // Two lines at most (see #caption); the whole sentence on hover.
    this.captionEl.title = caption;

    if (this.lastMood !== State.mood.state) {
      // The first mood is no change; later ones may bring a flourish.
      if (this.lastMood != null) this.moodChanged(State.mood.state);
      this.lastMood = State.mood.state;
    }
    // Melting, a grin turns nervous: his own price is falling hard.
    this.mascot.setMood(meltMood(State.mood.state, this.meltShown()));
    this.mascot.setBadge(this.badge());
    this.checkShades();
    // A sign up: its numbers follow the prices while he holds it.
    if (this.mascot.holdingSign && !State.mascotAway) {
      this.mascot.holdSign(this.daySign());
      this.fitSign();
    }
    // A new day may start a season, midnight and 6 am put the pyjamas on and off.
    if (lookKey(this.clock()) !== this.lookDay && this.costumeTimer == null) this.wearChosen();
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
        // Idle long enough, with the market calm: maybe a nap.
        this.napCheck();
        if (State.mode === "expanded" && !this.panel) {
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
