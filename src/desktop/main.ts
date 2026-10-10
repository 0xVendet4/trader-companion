// The desktop Candy's own window (desktop.html): draws him with the island's
// mascot engine, and turns clicks and drags on him into pokes, flights home
// and a new spot. Adapted from Coucou's desktop/main.ts (MIT, © Louis Raillé).
//
// What he shows comes from the island (DESKTOP_EVENTS.state); where he is,
// from Rust. The engine draws only while something moves, and nothing at all
// while the window is off screen or he sleeps.

import "../style.css";
import { Bridge, emitToWindow, onEvent, type DesktopMode } from "../core/bridge";
import { Sound } from "../core/sound";
import {
  DESKTOP_EVENTS,
  DOUBLE_CLICK_MS,
  DRAG_THRESHOLD,
  MASCOT_SIZE,
  PANEL_SIZE,
  isOverBody,
  pointerDistance,
  shouldSleep,
  windowDragTopLeft,
  type DesktopSnapshot,
  type Point,
} from "../mascot/desktop-logic";
import { gazeAt } from "../mascot/gaze";
import { Mascot, dressed, loadManifest, type Manifest, type MouthCue } from "../mascot/mascot";

const ISLAND = "island";
/** How often, while he is awake on the desktop, the page asks whether he should doze off. */
const SLEEP_CHECK_MS = 5000;

class DesktopCandy {
  private mascot = new Mascot();
  private manifest: Manifest | null = null;
  private mode: DesktopMode = "off";
  private stage: HTMLElement;

  private snap: DesktopSnapshot = {
    state: "idle",
    costume: "none",
    hat: null,
    face: null,
    filter: "none",
    soundEnabled: true,
    soundVolume: 0.12,
    paused: false,
    dancing: false,
  };

  private visible = false;
  private asleep = false;
  /** Whether the island has told us anything yet. */
  private informed = false;
  private lastActive = performance.now();
  /** Pointer in window coordinates, and when the page last heard of it. */
  private cursor: Point | null = null;
  private lastPointer = -Infinity;
  private sleepTimer: number | null = null;

  private press: { client: Point; screen: Point } | null = null;
  private dragging = false;
  /** Window's top-left corner when the drag began (physical px). */
  private dragOrigin: Point | null = null;
  private dragTopLeft: Point | null = null;
  private moveFrame = false;
  private pokeTimer: number | null = null;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    const el = this.mascot.el;
    const inset = (PANEL_SIZE - MASCOT_SIZE) / 2;
    el.style.cssText = `position:absolute;left:${inset}px;top:${inset}px;width:${MASCOT_SIZE}px;height:${MASCOT_SIZE}px`;
    stage.append(el);
    // Off screen until Rust says otherwise: no timers, no frames, and nothing
    // to see even if the window shows up somewhere before it is parked.
    this.mascot.setActive(false);
    stage.style.visibility = "hidden";
    this.wireInput();
  }

  async start() {
    this.manifest = await loadManifest();
    this.mascot.use(dressed(this.manifest, "none"));
    const info = await Bridge.desktopInfo();
    if (info) this.mode = info.mode;

    await onEvent<DesktopSnapshot>(DESKTOP_EVENTS.state, (s) => this.onSnapshot(s));
    await onEvent<Point>(DESKTOP_EVENTS.cursor, (p) => this.notePointer(p));
    await onEvent<boolean>(DESKTOP_EVENTS.visible, (on) => this.setVisible(on));
    // Swallowing a token link: the island looks it up, he does the eating.
    await onEvent<MouthCue>(DESKTOP_EVENTS.cue, (c) => {
      if (!this.visible) return;
      this.wakeUp();
      this.mascot.cue(c);
    });
    await onEvent<string>(DESKTOP_EVENTS.flight, (kind) => {
      // He fades in on the way out of the island.
      if (kind !== "out") return;
      this.stage.style.transition = "none";
      this.stage.style.opacity = "0";
      void this.stage.offsetWidth;
      this.stage.style.transition = "";
      this.stage.style.opacity = "1";
    });
    await emitToWindow(ISLAND, DESKTOP_EVENTS.ready);
  }

  // ── State ───────────────────────────────────────────────────────────────────

  private onSnapshot(s: DesktopSnapshot) {
    const costumeChanged = s.costume !== this.snap.costume;
    this.snap = s;
    this.informed = true;
    Sound.setEnabled(s.soundEnabled);
    Sound.setVolume(s.soundVolume);
    if (this.manifest && costumeChanged) this.mascot.use(dressed(this.manifest, s.costume), false);
    this.mascot.setFilter(s.costume === "none" ? s.filter : "none");
    this.mascot.setOutfit(s.hat);
    this.mascot.setFace(s.face);
    if (s.state !== "idle") this.lastActive = performance.now();
    if (!this.asleep) this.mascot.setMood(s.state);
    this.mascot.setDancing(s.dancing && !this.asleep);
    this.checkSleep();
  }

  private setVisible(on: boolean) {
    this.visible = on;
    this.stage.style.visibility = on ? "" : "hidden";
    if (on) {
      // The two pages may have started in either order: ask again if needed.
      if (!this.informed) void emitToWindow(ISLAND, DESKTOP_EVENTS.ready);
      // Landing counts as something going on: he looks around for a while.
      this.lastActive = performance.now();
      this.asleep = false;
      this.mascot.setActive(true);
      this.mascot.setMood(this.snap.state);
      if (this.sleepTimer == null) this.sleepTimer = window.setInterval(() => this.checkSleep(), SLEEP_CHECK_MS);
      return;
    }
    this.cancelPoke();
    this.press = null;
    this.dragging = false;
    if (this.sleepTimer != null) window.clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    this.mascot.setActive(false);
    Sound.idle();
  }

  private checkSleep() {
    if (!this.visible) return;
    const now = performance.now();
    // Dancing keeps him up.
    if (this.snap.dancing && !this.snap.paused) this.lastActive = now;
    const distance = pointerDistance(this.mode === "poll", this.cursor, now - this.lastPointer);
    const sleep = !this.dragging && (this.snap.paused || shouldSleep((now - this.lastActive) / 1000, distance));
    if (sleep === this.asleep) return;
    this.asleep = sleep;
    this.mascot.setMood(sleep ? "sleepy" : this.snap.state);
    this.mascot.setDancing(this.snap.dancing && !sleep);
    // Asleep, Rust stops the cursor poll; his whole little window then listens
    // for the pointer, and the first move over it wakes him.
    void Bridge.desktopSetAsleep(sleep);
    if (sleep) Sound.idle();
  }

  /** Something happened to him: awake now. */
  private wakeUp() {
    this.lastActive = performance.now();
    if (this.asleep) this.checkSleep();
  }

  /** Pointer in window coordinates: his eyes, and waking up. */
  private notePointer(p: Point) {
    this.cursor = p;
    this.lastPointer = performance.now();
    if (this.asleep) {
      this.lastActive = this.lastPointer;
      this.checkSleep();
    }
    this.mascot.lookAt(gazeAt(PANEL_SIZE / 2, PANEL_SIZE / 2, p.x, p.y));
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  private local(e: MouseEvent): Point {
    return { x: e.clientX, y: e.clientY };
  }

  private wireInput() {
    this.wireDrop();
    document.addEventListener("pointerdown", (e) => {
      Sound.resume();
      if (e.button !== 0 || !isOverBody(this.local(e))) return;
      this.press = { client: this.local(e), screen: { x: e.screenX, y: e.screenY } };
      this.dragging = false;
      try {
        document.documentElement.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
    });

    document.addEventListener("pointermove", (e) => {
      if (!this.dragging) this.notePointer(this.local(e));
      const press = this.press;
      if (!press) return;
      if (!this.dragging) {
        const l = this.local(e);
        if (Math.hypot(l.x - press.client.x, l.y - press.client.y) <= DRAG_THRESHOLD) return;
        this.beginDrag();
      }
      this.dragTo(e);
    });

    document.addEventListener("pointerup", (e) => {
      const press = this.press;
      this.press = null;
      if (!press) return;
      if (this.dragging) {
        this.endDrag(e);
        return;
      }
      // Single click → poke, once it is clear it isn't a double click.
      this.cancelPoke();
      this.pokeTimer = window.setTimeout(() => {
        this.pokeTimer = null;
        this.lastActive = performance.now();
        if (this.asleep) this.checkSleep();
        this.mascot.squash(0.8);
        this.mascot.nudgeHat(0.8);
        this.mascot.react("happy", 1200);
        Sound.play("boing");
        void emitToWindow(ISLAND, DESKTOP_EVENTS.poked);
      }, DOUBLE_CLICK_MS);
    });

    document.addEventListener("dblclick", (e) => {
      if (!isOverBody(this.local(e))) return;
      this.cancelPoke();
      void emitToWindow(ISLAND, DESKTOP_EVENTS.home);
    });

    // No browser menu: a right-click on Candy opens the wardrobe in the island.
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (isOverBody(this.local(e))) void emitToWindow(ISLAND, DESKTOP_EVENTS.wardrobe);
    });

    document.addEventListener("pointerleave", () => {
      if (this.mode !== "poll" && !this.dragging) this.cursor = null;
    });
  }

  /**
   * A token link or address dragged onto him: the mouth opens while it is
   * held over him, and on the drop the island adds it (and sends back the
   * gulp, or a puzzled look). Anything else — a file — is refused.
   */
  private wireDrop() {
    let depth = 0;
    const carriesText = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      return types.includes("text/uri-list") || types.includes("text/plain");
    };
    window.addEventListener("dragenter", (e) => {
      if (!carriesText(e)) return;
      e.preventDefault();
      if (depth++ === 0) {
        this.wakeUp();
        this.mascot.cue({ kind: "ready" });
      }
    });
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = carriesText(e) ? "copy" : "none";
    });
    window.addEventListener("dragleave", () => {
      if (depth > 0 && --depth === 0) this.mascot.cue({ kind: "unready", keepOpen: false });
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!carriesText(e)) return;
      depth = 0;
      // The island's lookup keeps the mouth open, then sends the gulp.
      this.mascot.cue({ kind: "unready", keepOpen: true });
      const data = e.dataTransfer;
      // A link's first line (uri-list keeps comments on lines starting with #).
      const link = data?.getData("text/uri-list").split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#"));
      const text = (link || data?.getData("text/plain") || "").trim();
      void emitToWindow(ISLAND, DESKTOP_EVENTS.drop, text);
    });
  }

  private cancelPoke() {
    if (this.pokeTimer != null) window.clearTimeout(this.pokeTimer);
    this.pokeTimer = null;
  }

  private beginDrag() {
    this.dragging = true;
    this.cancelPoke();
    this.dragOrigin = null;
    this.dragTopLeft = null;
    void Bridge.desktopDragBegin().then((pos) => {
      if (!pos) {
        this.dragging = false;
        this.press = null;
        return;
      }
      this.dragOrigin = { x: pos[0], y: pos[1] };
    });
  }

  /** Linux: the page drives the drag. Windows: the cursor poll carries him. */
  private dragTo(e: PointerEvent) {
    const origin = this.dragOrigin;
    const press = this.press;
    if (!origin || !press || this.mode !== "window") return;
    const dpr = window.devicePixelRatio || 1;
    const topLeft = windowDragTopLeft(origin, { x: e.screenX, y: e.screenY }, press.screen, dpr);
    this.dragTopLeft = topLeft;
    if (this.moveFrame) return;
    this.moveFrame = true;
    requestAnimationFrame(() => {
      this.moveFrame = false;
      const p = this.dragTopLeft;
      if (p && this.dragging) void Bridge.desktopDragMove(p.x, p.y);
    });
  }

  private endDrag(e: PointerEvent) {
    this.dragTo(e);
    this.dragging = false;
    const topLeft = this.dragTopLeft;
    this.dragOrigin = null;
    this.dragTopLeft = null;
    if (this.mode === "poll" || !topLeft) return;
    void Bridge.desktopDragEnd(Math.round(topLeft.x), Math.round(topLeft.y));
  }
}

const stage = document.getElementById("stage");
if (stage) void new DesktopCandy(stage).start();
