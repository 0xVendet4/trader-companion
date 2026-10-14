// Island open/close state machine, from Coucou for Windows (MIT, © Louis
// Raillé). No DOM, no Tauri: it only reports transitions.
//
//   hidden → petit (compact ticker) → home (expanded); greet = launch greeting

export type FsmState = "hidden" | "petit" | "home" | "greet";

export class IslandStateMachine {
  state: FsmState = "hidden";

  onTransition: ((from: FsmState, to: FsmState) => void) | null = null;

  /** home → petit delay, seconds. */
  homeToPetitDelay = 15;
  /** petit → hidden delay, seconds. Infinity keeps the ticker on screen. */
  petitToHiddenDelay = 60;
  /** greet → petit once the greeting animation ends (no hover). */
  greetAutoCollapseDelay = 0.6;
  /** greet → petit while the mouse hovers the greeting. */
  greetHoverCollapseDelay = 10;
  /** An alert waiting for an answer stays open, even when the mouse leaves. */
  pinned = false;
  /**
   * A panel (Settings, the Closet) fills the island: nothing folds, hides or
   * opens it on a timer until it closes (Island.openPanel / closePanel).
   */
  frozen = false;
  /** Opens from the ticker as soon as the pointer rests on it (Settings → Open on hover). */
  openOnHover = false;
  /** How long the pointer rests on the ticker before it opens, seconds. */
  hoverOpenDelay = 0.25;
  /** How soon an island opened by a hover folds once the pointer leaves, seconds. */
  hoverCloseDelay = 0.6;
  /** Told when an auto-close starts counting down (its length, seconds) or stops (null). */
  onCountdown: ((seconds: number | null) => void) | null = null;

  /** Opened by a hover: folds soon after the pointer leaves, unless clicked inside. */
  private hoverOpened = false;
  private hoverOpen: number | null = null;

  private petitHide: number | null = null;
  private homeCollapse: number | null = null;
  private greetCollapse: number | null = null;

  // ── Inputs ──────────────────────────────────────────────────────────────────

  launch() {
    this.cancelTimers();
    this.transition("greet");
  }

  mouseEntered() {
    switch (this.state) {
      case "hidden":
        this.cancelTimers();
        this.transition("petit");
        this.scheduleHoverOpen();
        break;
      case "petit":
        this.clear("petitHide");
        this.scheduleHoverOpen();
        break;
      case "home":
        this.clear("homeCollapse");
        break;
      case "greet":
        this.scheduleGreetCollapse(this.greetHoverCollapseDelay);
        break;
    }
  }

  mouseLeft() {
    switch (this.state) {
      case "hidden":
        break;
      case "petit":
        this.clear("hoverOpen");
        this.schedulePetitHide();
        break;
      case "home":
        this.scheduleHomeCollapse();
        break;
      case "greet":
        this.clear("greetCollapse");
        this.transition("petit");
        break;
    }
  }

  click() {
    if (this.state !== "petit") return;
    this.cancelTimers();
    this.hoverOpened = false;
    this.transition("home");
  }

  /** A click inside the open island: one opened by a hover now stays like one opened by a click. */
  userInteracted() {
    this.hoverOpened = false;
  }

  /** Greeting animation finished (T.end). Doesn't override a running hover timer. */
  greetComplete() {
    if (this.state !== "greet") return;
    if (this.greetCollapse == null) this.scheduleGreetCollapse(this.greetAutoCollapseDelay);
  }

  /** Non-alert work event: show compact from hidden. */
  reveal() {
    if (this.state !== "hidden") return;
    this.cancelTimers();
    this.transition("petit");
    this.schedulePetitHide();
  }

  /** Alert or explicit request: open straight to expanded. */
  forceHome() {
    this.cancelTimers();
    this.hoverOpened = false;
    this.transition("home");
  }

  /// Explicit close (OK button, Escape, an alert being answered).
  forcePetit() {
    this.cancelTimers();
    this.transition("petit");
  }

  forceHidden() {
    this.cancelTimers();
    this.transition("hidden");
  }

  /**
   * Keeps the open island from folding while something plays out in it (Candy
   * going over a checklist); let go, its countdown starts over unless the
   * pointer is in it.
   */
  hold(on: boolean, pointerInside: boolean) {
    if (this.pinned === on) return;
    this.pinned = on;
    if (on) this.clear("homeCollapse");
    else if (this.state === "home" && !pointerInside) this.scheduleHomeCollapse();
  }

  // ── Timers ──────────────────────────────────────────────────────────────────

  private schedulePetitHide() {
    this.clear("petitHide");
    if (this.frozen) return;
    if (!Number.isFinite(this.petitToHiddenDelay)) return;
    this.petitHide = window.setTimeout(() => {
      this.petitHide = null;
      if (this.state === "petit") this.transition("hidden");
    }, this.petitToHiddenDelay * 1000);
  }

  private scheduleHoverOpen() {
    this.clear("hoverOpen");
    if (!this.openOnHover || this.frozen) return;
    this.hoverOpen = window.setTimeout(() => {
      this.hoverOpen = null;
      if (this.state !== "petit") return;
      this.cancelTimers();
      this.hoverOpened = true;
      this.transition("home");
    }, this.hoverOpenDelay * 1000);
  }

  private scheduleHomeCollapse() {
    this.clear("homeCollapse");
    if (this.pinned || this.frozen) return;
    const delay = this.hoverOpened ? this.hoverCloseDelay : this.homeToPetitDelay;
    this.homeCollapse = window.setTimeout(() => {
      this.homeCollapse = null;
      this.onCountdown?.(null);
      if (this.state === "home") this.transition("petit");
    }, delay * 1000);
    this.onCountdown?.(delay);
  }

  private scheduleGreetCollapse(delay: number) {
    this.clear("greetCollapse");
    if (this.frozen) return;
    this.greetCollapse = window.setTimeout(() => {
      this.greetCollapse = null;
      if (this.state === "greet") this.transition("petit");
    }, delay * 1000);
  }

  private clear(which: "petitHide" | "homeCollapse" | "greetCollapse" | "hoverOpen") {
    const id = this[which];
    if (id != null) window.clearTimeout(id);
    this[which] = null;
    if (which === "homeCollapse" && id != null) this.onCountdown?.(null);
  }

  cancelTimers() {
    this.clear("petitHide");
    this.clear("homeCollapse");
    this.clear("greetCollapse");
    this.clear("hoverOpen");
  }

  private transition(next: FsmState) {
    if (next === this.state) return;
    const from = this.state;
    this.state = next;
    this.onTransition?.(from, next);
  }
}
