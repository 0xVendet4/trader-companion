// The island: DOM shell, open/close animation, mascot placement, the compact
// ticker and mouse handling. The geometry and click-through handling follow
// Coucou for Windows (MIT, © Louis Raillé); the content is Trader Companion's.

import { Tracked, Spring } from "../core/anim";
import { Bridge, IS_TAURI, copyImage } from "../core/bridge";
import { FULL_NAME } from "../core/brand";
import { applyTheme } from "../core/themes";
import { currentLog, summarize, todayKey } from "../discipline/discipline";
import { AWAY_MS, SNAPSHOT_EVERY_MS, awaySummary, type Snapshot } from "../away/away";
import { activeSeason } from "../mascot/seasons";
import { lookFilter } from "../mascot/skins";
import { drawRecapCard } from "../share/card";
import { openSettingsPanel } from "../web/settings-panel";
import { buildRecap, recapDate } from "../share/recap";
import { formatClock, formatPct, formatUsd, pctClass } from "../core/format";
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
import { Sound } from "../core/sound";
import { State, type CompanionEvent, type IslandMode, type IslandViewName, type Placement } from "../core/state";
import { Companion } from "../companion";
import { Mascot, accessory, dressed, type Manifest, type MascotState } from "../mascot/mascot";
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
import { folderTokens } from "../market/folders";
import { tokenUrl } from "../market/links";
import { formatSignedUsd } from "../positions/positions";
import { h, svg } from "../views/dom";
import { ICONS } from "../views/icons";
import { buildHeader, buildViews, type ViewActions, type ViewHost } from "../views/views";
import { IslandStateMachine } from "./fsm";

/** Same margin as the Rust hit test (src-tauri/src/island.rs). */
const HIT_MARGIN = 14;
const GREETING_MS = 2600;

const TICKER_STEP_MS = 3000;

const modeOrder = (m: IslandMode) => (m === "hidden" ? 0 : m === "compact" ? 1 : 2);
const TAB_VIEWS: ReadonlySet<IslandViewName> = new Set(["watchlist", "trending", "alerts", "positions", "wallets", "discipline", "wardrobe"]);

/** What the mascot does, and which sound plays, when an event pops up. */
function reactionFor(e: CompanionEvent): { mascot: MascotState; sound: Parameters<typeof Sound.play>[0] } {
  switch (e.kind) {
    case "alert":
      if (e.tone === "up") return { mascot: "celebrate", sound: "alertUp" };
      if (e.tone === "down") return { mascot: "shocked", sound: "alertDown" };
      return { mascot: "alert", sound: "warn" };
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
      relayout: () => this.animateGeometry(),
      shareDay: () => this.shareDay(),
      applyLook: () => this.applySettings(),
      minimize: () => this.minimize(),
    };

    this.wakeStrip = h("div", { id: "wake-strip" });
    this.header = buildHeader(actions);
    this.views = buildViews(actions);
    const viewsEl = h("div", { id: "views" });
    for (const v of this.views.values()) viewsEl.append(v.el);
    this.contentEl = h("div", { id: "content" }, this.header.el, viewsEl);

    this.tickerEl = h("div", { class: "ticker" });
    this.compactEl = h("div", { id: "compact", title: "Click to open · hold Ctrl to click what is behind" }, this.tickerEl);
    this.captionEl = h("div", { id: "caption" });
    // The wardrobe, one click from Candy: hat, face and colour in the island.
    this.wardrobeBtn = h(
      "button",
      {
        class: "wardrobe-btn",
        type: "button",
        title: "Wardrobe: hat, face, colour",
        onclick: () => {
          Sound.play("blip");
          this.setView(State.view === "wardrobe" ? State.lastTab : "wardrobe");
        },
      },
      svg(ICONS.shirt, 14, { stroke: 1.8 }),
    );

    const clip = h("div", { id: "island-clip" }, this.contentEl, this.compactEl);
    this.islandEl = h("div", { id: "island" }, clip, this.captionEl, this.wardrobeBtn, this.mascot.el);
    this.root.append(this.wakeStrip, this.islandEl);
    this.applyGeometry();
  }

  /** Today's recap as an image: copied to the clipboard (and saved, in a browser). */
  private async shareDay(): Promise<string> {
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
    const png = await drawRecapCard(
      recap,
      {
        manifest: this.manifest ? dressed(this.manifest, c.costume) : { name: "", states: {} },
        filter: lookFilter(c),
        hat: accessory(this.manifest, "outfits", this.look().hat),
        face: accessory(this.manifest, "faces", this.look().face),
      },
      FULL_NAME,
    );
    const copied = await copyImage(png);
    this.feel("cool", "looking good 😎");
    if (!IS_TAURI) {
      const url = URL.createObjectURL(png);
      const a = h("a", { href: url, download: `my-day-${todayKey()}.png` });
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return copied ? "Image copied and downloaded." : "Image downloaded.";
    }
    return copied ? "Image copied. Paste it on X or Telegram." : "Couldn't copy the image.";
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
          this.mascot.react("wave", GREETING_MS);
          Sound.play("greet");
          window.setTimeout(() => this.fsm.greetComplete(), GREETING_MS);
          break;
      }
      State.notify();
    };
  }

  launch() {
    this.fsm.launch();
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

  /** A fired alert or a reminder: open on the event card. */
  showEvent(e: CompanionEvent) {
    const r = reactionFor(e);
    // Minimized: it waits in the queue, and shows when Candy comes back (and
    // as a Windows notification, when those are on).
    if (State.minimized) return;
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
    // forceHome cancels the auto-close; with nobody at the island, restart it
    // so the card folds back into the ticker instead of staying up for good.
    if (!this.wasInIsland) this.fsm.mouseLeft();
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
      return e?.kind === "away" ? e.lines.length : 0;
    }
    return 0;
  }

  private animateGeometry(shrinking?: boolean) {
    const { w, h } = islandSize(State.mode, State.view, this.rowsFor(State.view), this.placement());
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
    this.islandEl.style.width = `${w}px`;
    this.islandEl.style.height = `${hh}px`;
    this.islandEl.style.left = `${rect.x}px`;
    this.islandEl.style.top = `${rect.y}px`;
    this.islandEl.style.borderRadius = islandCorners(this.placement(), r);

    const p = this.pushedRect;
    if (
      Math.abs(p.x - rect.x) > 0.5 || Math.abs(p.y - rect.y) > 0.5 ||
      Math.abs(p.w - rect.w) > 0.5 || Math.abs(p.h - rect.h) > 0.5
    ) {
      this.pushedRect = rect;
      void Bridge.setIslandRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  private islandRect() {
    const w = this.width.value;
    const h = this.height.value;
    return { ...islandOrigin(this.placement(), w, h, floatsUp(State.settings.floatY)), w, h };
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
        if (this.placement() === "float" && e.button === 0) this.pressFloat(e);
        else this.fsm.click();
        return;
      }
      const p = this.pagePoint(e);
      if (e.button === 0 && this.isMascotHit(p.x, p.y)) this.pressMascot();
    });

    // The release can land anywhere, so listen on the whole window.
    window.addEventListener("mouseup", () => this.releaseMascot());

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && State.mode === "expanded") this.collapse();
      State.lastActivity = performance.now();
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

    if (!IS_TAURI && this.followMouse) this.followPageCursor();
    // A floating stage follows the page's size; a narrow page puts the island on top.
    if (!IS_TAURI) window.addEventListener("resize", () => this.applyPlacement());
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
      if (summary) Companion.raise({ kind: "away", id: `away-${now}`, away: summary.away, lines: summary.lines });
      else this.mascot.say("welcome back!", 1800);
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
    const my = rect.y + this.mCy.value;
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
      if (!this.mascot.reacting && !this.pressing && State.moodFace && Math.random() < 0.4) {
        // A settled mood peeks back for a moment.
        this.mascot.react(State.moodFace, 2500);
      } else if (!this.mascot.reacting && !this.pressing) {
        const f = pickFidget(State.mood.state, Math.random());
        if (f) {
          this.mascot.react(State.mood.state, f.ms, f.motion);
          if (f.say) this.mascot.say(f.say, f.ms);
          if (f.wink) this.mascot.wink();
        }
      }
      this.scheduleFidget();
    }, fidgetDelay(Math.random()));
  }

  private isMascotHit(x: number, y: number): boolean {
    const rect = this.islandRect();
    const cx = rect.x + this.mCx.value;
    const cy = rect.y + this.mCy.value;
    const r = this.mSize.value * 0.42;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }

  private mascotHoverIn() {
    if (performance.now() - this.lastLove < 8000) return;
    Sound.play("hover");
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
    this.mascot.react(r.state, r.ms, r.motion);
    this.mascot.say(r.say, r.ms);
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

    const p = mascotPlacement(State.mode, State.view, this.height.value, this.placement());
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
    el.style.opacity = String(opacity);
    el.classList.toggle("tiny", State.mode === "compact");

    // The mood line: under the mascot, or beside it in the sidebar's band.
    const cap = this.captionEl.style;
    if (isSide(this.placement()) && State.mode === "expanded") {
      const left = this.mCx.value + s / 2 + 8;
      cap.left = `${left}px`;
      cap.top = `${this.mCy.value - 15}px`;
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
    const expanded = State.mode === "expanded";
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

    this.mascot.setMood(State.mood.state);
    if (todayKey() !== this.lookDay && this.costumeTimer == null) this.wearChosen();
    this.renderTicker(performance.now());
  }

  /** The compact pill: the last unseen alert, a discipline state, or the next token. */
  private renderTicker(now: number) {
    if (State.mode !== "compact") return;
    const el = this.tickerEl;
    el.replaceChildren();
    el.className = "ticker";

    const unseen = State.unseen;
    if (unseen && unseen.kind === "alert") {
      el.classList.add(`tone-${unseen.tone}`);
      el.append(svg(ICONS.bell, 11), h("span", { class: "t-text", text: unseen.title }));
      return;
    }
    if (Companion.stoppedToday) {
      el.classList.add("tone-down");
      el.append(h("span", { class: "t-text", text: "Daily loss limit hit" }));
      return;
    }
    if (State.cooldownUntil > Date.now()) {
      el.classList.add("tone-calm");
      el.append(h("span", { class: "t-text", text: `Cooldown ${formatClock(State.cooldownUntil - Date.now())}` }));
      return;
    }
    if (State.paused) {
      el.append(h("span", { class: "t-text dim", text: "Paused" }));
      return;
    }
    // Your positions first (with their profit), then the watchlist's other tokens.
    const held = Companion.positions();
    const heldKeys = new Set(held.map((x) => tokenKey("solana", x.p.mint)));
    const tokens = State.companion.watchlist.filter((t) => State.quotes[t.key] && !heldKeys.has(t.key));
    const count = held.length + tokens.length;
    if (count === 0) {
      const text = State.companion.watchlist.length ? "Fetching prices…" : "Hover here to add tokens";
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
        h("span", { class: "t-own", text: "★", title: "Your position" }),
        h("span", { class: "t-sym", text: p.symbol }),
        h("span", { class: "t-mc", text: formatUsd(s.valueUsd) }),
        h("span", { class: `t-pct ${pctClass(s.pnlUsd)}`, text: formatSignedUsd(s.pnlUsd) }),
        h("span", { class: `t-pct ${pctClass(s.pnlPct)}`, text: formatPct(s.pnlPct) }),
      );
    } else {
      const t = tokens[i - held.length];
      const q = State.quotes[t.key];
      el.append(
        h("span", { class: "t-sym", text: t.symbol }),
        h("span", { class: "t-mc", text: formatUsd(q.marketCap) }),
        h("span", { class: `t-pct ${pctClass(q.change.m5)}`, text: `5m ${formatPct(q.change.m5)}` }),
        h("span", { class: `t-pct ${pctClass(q.change.h1)}`, text: `1h ${formatPct(q.change.h1)}` }),
      );
    }
    if (count > 1) el.append(h("span", { class: "t-count", text: `${i + 1}/${count}` }));
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
