// The closet: every look Candy can wear, large, in a panel of the island
// (Island.openPanel, core/panel.ts; the island's wardrobe keeps the quick
// picks). A big live Candy on a stage on one side, the shelves of
// core/looks.ts on the other: pointing at a card tries it on him, a click
// keeps it. Saved as Settings saves: the island hears it back
// (settings-changed), and a pick made in the island comes back here the same
// way. Mounted in a shadow root of its own (mountCloset), as Settings is.

import css from "./closet.css?inline";
import { onSettingsChanged } from "../core/bridge";
import type { PanelHost, PanelPage } from "../core/panel";
import { t } from "../core/i18n";
import { SHELVES, copyLook, nightNote, pickLook, seasonNote, shownLook, tryOn, wearing, type Look, type Shelf } from "../core/looks";
import { State, normalizeSettings, type Settings, type Theme } from "../core/state";
import { Sound } from "../core/sound";
import { ISLAND_THEMES } from "../core/themes";
import { NEUTRAL_GAZE, gazeAt } from "../mascot/gaze";
import { Mascot, accessory, dressed, type Manifest } from "../mascot/mascot";
import { BASE_HUE, DEFAULT_CUSTOM_SKIN, customSwatch, lookFilter } from "../mascot/skins";
import { clear, h, svg } from "../views/dom";
import { ICONS } from "../views/icons";
import { islandSwatch, lookCandy } from "../views/look-art";

let settings: Settings = normalizeSettings(null);
/** The island around the panel (set by mountCloset). */
let host: PanelHost;

function save() {
  host.save(settings);
}

/**
 * One tab of the closet: a shelf of looks (core/looks.ts), and how it differs
 * from the others, if it does. A new kind of look added to SHELVES gets a tab
 * of its own with nothing written here; one that wants pictures of its own,
 * or something under its cards, says so in Closet's constructor.
 */
interface Rack {
  shelf: Shelf;
  /** The picture on a card (by default: Candy in the look, with that one on). */
  art?: (id: string, look: Look) => HTMLElement;
  /** Landscape cards (the island's backgrounds). */
  wide?: boolean;
  /** Drawn under the cards. */
  extra?: () => HTMLElement;
}

/** How long a tried look stays once the pointer leaves its card: long enough to reach the next one. */
const LEAVE_MS = 140;

class Closet {
  readonly el: HTMLElement;
  private readonly racks: Rack[];
  private rack: Rack;
  private readonly mascot = new Mascot("mascot closet-candy");
  /** The costume on the big Candy (Mascot.use swaps the whole body). */
  private worn: string | null = null;
  private readonly stage = h("div", { class: "closet-stage" });
  private readonly tryingEl = h("div", { class: "stage-trying" });
  private readonly tabs: HTMLButtonElement[];
  private readonly nav = h("nav", { class: "closet-tabs", role: "tablist" });
  private readonly bar = h("div", { class: "closet-bar" }, this.nav);
  private readonly rows: { rack: Rack; row: HTMLButtonElement; value: HTMLElement }[];
  private readonly shelfEl = h("section", { class: "closet-shelf" });
  private readonly grid = h("div", { class: "closet-grid" });
  private readonly extra = h("div", { class: "closet-extra" });
  /** The card pointed at (or focused), tried on the stage. */
  private trying: { shelf: Shelf; id: string } | null = null;
  private leaveTimer: number | null = null;
  /** The cards of the open tab, by look id. */
  private cards = new Map<string, HTMLButtonElement>();
  /** What was drawn last (see sync). */
  private key = "";
  private gridKey = "";
  /** The free colour's controls, made once (a slider being dragged must stay in the page). */
  private custom: { panel: HTMLElement; paint: () => void } | null = null;
  /** The tabs and the stage, measured as the panel changes size; let go on close. */
  private observers: ResizeObserver[] = [];

  constructor(private readonly art: Manifest) {
    this.racks = SHELVES.map((shelf): Rack => {
      if (shelf.id === "island") return { shelf, wide: true, art: (id, look) => this.islandArt(id as Theme, look) };
      if (shelf.id === "colour") return { shelf, extra: () => this.customColour() };
      return { shelf };
    });
    this.rack = this.racks[0];
    this.mascot.setActive(false);
    this.stage.append(this.mascot.el, this.tryingEl);

    this.tabs = this.racks.map((rack) => {
      const b = h(
        "button",
        { class: "closet-tab", type: "button", role: "tab" },
        h("span", { class: "name", text: t(rack.shelf.title) }),
        h("span", { class: "count", text: String(rack.shelf.ids.length) }),
      );
      b.addEventListener("click", () => this.open(rack));
      return b;
    });
    this.nav.append(...this.tabs);
    // The tabs stay on one row in every language and panel size; Candy grows and shrinks with his stage.
    if (typeof ResizeObserver !== "undefined") {
      const tabs = new ResizeObserver(() => this.fitTabs());
      const stage = new ResizeObserver(() => this.fitCandy());
      tabs.observe(this.bar);
      stage.observe(this.stage);
      this.observers = [tabs, stage];
    }

    // What Candy has on, a row a shelf; a row opens its shelf.
    this.rows = this.racks.map((rack) => {
      const value = h("span", { class: "v" });
      const row = h("button", { class: "outfit-row", type: "button" }, h("span", { class: "k", text: t(rack.shelf.label) }), value);
      row.addEventListener("click", () => this.open(rack));
      return { rack, row, value };
    });

    const more = h(
      "button",
      { class: "closet-more", type: "button" },
      svg(ICONS.gear, 13),
      h("span", { text: t("Seasonal looks and more in Settings") }),
    );
    // Settings takes the closet's place in the panel, at the Seasonal looks row (lit up).
    more.addEventListener("click", () => host.open("settings", "seasonal"));

    this.shelfEl.append(this.grid, this.extra);
    this.el = h(
      "main",
      { class: "closet" },
      // The panel's title row says Closet: here, how it works.
      h("header", { class: "closet-title" }, h("p", { class: "hint", text: t("Hover to try on. Click to wear.") })),
      this.bar,
      h("aside", { class: "closet-side" }, this.stage, h("div", { class: "closet-outfit" }, ...this.rows.map((r) => r.row)), more),
      this.shelfEl,
    );

    // The gaps between cards keep the tried look a moment; leaving the shelf puts the kept one back.
    this.grid.addEventListener("pointerleave", () => this.tryOff(0));
    this.grid.addEventListener("keydown", (e) => this.arrows(e));
  }

  /** Lively: his eyes follow the pointer around the panel (mountCloset listens on the page). */
  readonly gaze = (e: PointerEvent) => {
    if (!settings.companion.lively) return;
    const r = this.mascot.el.getBoundingClientRect();
    this.mascot.lookAt(gazeAt(r.left + r.width / 2, r.top + r.height * 0.45, e.clientX, e.clientY));
  };
  readonly gazeOff = () => this.mascot.lookAt(NEUTRAL_GAZE);

  /** On screen or not: nothing moves once the panel closes. */
  setActive(on: boolean) {
    this.mascot.setActive(on);
  }

  /** The panel closed: no timer, observer or animation of the closet's is left running. */
  dispose() {
    this.setActive(false);
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    if (this.leaveTimer != null) window.clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }

  /**
   * Candy as big as his stage lets him (two thirds of its width, a little more
   * of its height, 240 px at most), standing a little below its middle.
   */
  private fitCandy() {
    const { clientWidth: w, clientHeight: h } = this.stage;
    if (!w || !h) return;
    const size = Math.round(Math.min(w * 0.66, h * 0.68, 240));
    this.mascot.el.style.width = this.mascot.el.style.height = `${size}px`;
    this.stage.style.setProperty("--floor", `${Math.round(Math.max(h * 0.15, (h - size) * 0.42))}px`);
  }

  /** Keeps the tabs on one row: without their counts first, then closer together, then a long name gives way (…). */
  private fitTabs() {
    const room = this.bar.clientWidth;
    if (!room) return;
    this.nav.classList.remove("tight", "tighter", "squeeze");
    for (const step of ["tight", "tighter", "squeeze"]) {
      if (this.nav.offsetWidth <= room) return;
      this.nav.classList.add(step);
    }
  }

  /** The look the island shows now (a season's hat included): the stage, when nothing is tried on. */
  private look(): Look {
    return shownLook(settings.companion, new Date());
  }

  /**
   * The look a shelf's cards are put on, and the one they mark as picked: the
   * trader's own, as in the island's wardrobe and in Settings (picking Candy a
   * look ends a season's, so a card shows what a click gives); a background
   * goes with the look on show (the season's hat stays on).
   */
  private base(shelf: Shelf): Look {
    return shelf.on === "candy" ? copyLook(settings.companion) : this.look();
  }

  /** What the stage shows: the look, with the card pointed at tried on. */
  private showing(): Look {
    const tried = this.trying;
    return tried ? tryOn(this.base(tried.shelf), tried.shelf, tried.id) : this.look();
  }

  /**
   * Brings everything in step with the settings. The cards are drawn again
   * only when their pictures change: a pick on the open shelf just moves the
   * tick, so the keyboard keeps its place.
   */
  sync(force = false) {
    const c = settings.companion;
    // The date counts too: a season, or the pyjamas' night, can start or end while the closet is open (see main's wake).
    const now = new Date();
    const key = JSON.stringify([this.rack.shelf.id, copyLook(c), seasonNote(c, now), nightNote(c, now)]);
    if (!force && key === this.key) return;
    this.key = key;
    const { shelf } = this.rack;
    const look = this.base(shelf);
    // Every card is the look with one of the shelf's on: the look with the first on stands for them all.
    const gridKey = JSON.stringify([shelf.id, tryOn(look, shelf, shelf.ids[0] ?? "")]);
    if (force || gridKey !== this.gridKey) {
      this.gridKey = gridKey;
      this.renderGrid(look);
    } else for (const [id, card] of this.cards) card.classList.toggle("on", shelf.worn(look, id));
    this.tabs.forEach((b, i) => {
      const on = this.racks[i] === this.rack;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    this.custom?.paint();
    this.dress();
  }

  // ── The stage ─────────────────────────────────────────────────────────────

  /** Puts the look on the big Candy, the stage in its background, and lists what is picked. */
  private dress() {
    const look = this.showing();
    if (look.costume !== this.worn) {
      this.worn = look.costume;
      this.mascot.use(dressed(this.art, look.costume));
    }
    this.mascot.setFilter(lookFilter(look));
    this.mascot.setOutfit(accessory(this.art, "outfits", look.outfit), false);
    this.mascot.setFace(accessory(this.art, "faces", look.face));
    // After midnight, the pyjamas as on the island; a look tried on Candy is shown as it will be, without them.
    const tried = this.trying;
    this.mascot.setPyjamas(tried?.shelf.on !== "candy" && wearing(settings.companion, new Date()).pyjamas);
    const theme = ISLAND_THEMES[look.theme];
    this.stage.style.background = theme.background;
    this.stage.style.boxShadow = theme.ring ?? "0 0 0 1px rgba(255, 255, 255, 0.07)";
    this.stage.style.setProperty("--accent", theme.accent ?? "#4ade80");

    // Over the stage: the card tried on, or else what the season (or the night) put on Candy over the picks listed below.
    const season = tried ? null : seasonNote(settings.companion, new Date());
    const night = tried || season ? null : nightNote(settings.companion, new Date());
    const note = season ?? night;
    this.tryingEl.classList.toggle("on", !!(tried || note));
    this.tryingEl.classList.toggle("season", !!note);
    if (tried) {
      this.tryingEl.replaceChildren(t("Trying on"), h("b", { text: tried.shelf.name(tried.id) }));
      this.tryingEl.removeAttribute("title");
    } else if (note) {
      this.tryingEl.replaceChildren(note);
      this.tryingEl.title = season
        ? t("A Santa hat in December, a pumpkin at Halloween, a party hat at New Year, heart glasses on Valentine's Day. Your own look comes back after.")
        : t("From midnight to 6 am Candy wears striped pyjamas and a nightcap, and yawns more. A costume, or a look you pick that night, wins.");
    }
    // The trader's picks (a season's hat is the note's), with the card pointed at in its row.
    const picked = tried ? tryOn(copyLook(settings.companion), tried.shelf, tried.id) : copyLook(settings.companion);
    for (const { rack, row, value } of this.rows) {
      const { shelf } = rack;
      const id = shelf.ids.find((one) => shelf.worn(picked, one));
      // A costume keeps its own colours: no colour is worn under it.
      value.textContent = id ? shelf.name(id) : "—";
      value.classList.toggle("off", !id);
      row.classList.toggle("here", rack === this.rack);
      row.classList.toggle("trying", tried?.shelf === shelf);
    }
  }

  // ── The cards ─────────────────────────────────────────────────────────────

  private open(rack: Rack) {
    if (rack === this.rack) return;
    this.rack = rack;
    this.trying = null;
    Sound.play("blip");
    this.sync(true);
    this.shelfEl.scrollTop = 0;
  }

  private renderGrid(look: Look) {
    const { shelf, art, wide, extra } = this.rack;
    clear(this.grid);
    this.cards.clear();
    this.grid.classList.toggle("wide", !!wide);
    for (const id of shelf.ids) {
      const name = shelf.name(id);
      const picture = art ? art(id, look) : lookCandy(this.art, tryOn(look, shelf, id));
      const card = h(
        "button",
        { class: `closet-card ${shelf.worn(look, id) ? "on" : ""}`, type: "button", title: name },
        h("span", { class: "card-art" }, picture),
        h("span", { class: "card-name", text: name }),
        h("i", { class: "card-check" }, svg(ICONS.check, 12, { stroke: 2.6 })),
      );
      card.addEventListener("pointerenter", () => this.tryOn(shelf, id));
      card.addEventListener("pointerleave", () => this.tryOff(LEAVE_MS));
      // Tried on when reached with the keyboard. A clicked card keeps the focus
      // and gets it back whenever the window does: that must not try it on again.
      card.addEventListener("focus", () => {
        if (keyboardFocus(card) && !shelf.worn(this.look(), id)) this.tryOn(shelf, id);
      });
      card.addEventListener("blur", () => this.tryOff(LEAVE_MS));
      card.addEventListener("click", () => this.pick(shelf, id));
      this.cards.set(id, card);
      this.grid.append(card);
    }
    const more = extra?.() ?? null;
    if (!more) clear(this.extra);
    else if (this.extra.firstChild !== more) this.extra.replaceChildren(more);
  }

  /** Tries a card on the stage, nothing saved. */
  private tryOn(shelf: Shelf, id: string) {
    if (this.leaveTimer != null) window.clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
    if (this.trying?.shelf === shelf && this.trying.id === id) return;
    this.trying = { shelf, id };
    this.dress();
  }

  /** Back to the look kept, after `ms` (a card next door can take over meanwhile). */
  private tryOff(ms: number) {
    if (this.leaveTimer != null) window.clearTimeout(this.leaveTimer);
    this.leaveTimer = window.setTimeout(() => {
      this.leaveTimer = null;
      if (!this.trying) return;
      this.trying = null;
      this.dress();
    }, ms);
  }

  /** Keeps a look: saved for the island too, and Candy shows it off. */
  private pick(shelf: Shelf, id: string) {
    const was = this.look();
    pickLook(settings.companion, shelf, id, new Date());
    save();
    Sound.play("blip");
    this.trying = null;
    this.sync();
    if (shelf.on !== "candy") return;
    // A new hat drops in (pointing at it had put it on already); anything else, a happy little squash.
    const hat = this.look().outfit;
    if (hat !== was.outfit && hat !== "none") {
      this.mascot.setOutfit(null, false);
      this.mascot.setOutfit(accessory(this.art, "outfits", hat));
    } else this.mascot.squash(0.7);
    this.mascot.react("happy", 1400);
  }

  /** Arrow keys walk the cards; Enter or Space keeps one. */
  private arrows(e: KeyboardEvent) {
    const across = Math.max(1, getComputedStyle(this.grid).gridTemplateColumns.split(" ").length);
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -across, ArrowDown: across } as Record<string, number>)[e.key];
    if (!step) return;
    const cards = [...this.cards.values()];
    // In the panel's shadow root the focused card is the root's, not the document's.
    const root = this.el.getRootNode() as Document | ShadowRoot;
    const at = cards.indexOf(root.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    cards[Math.max(0, Math.min(cards.length - 1, at + step))].focus();
  }

  // ── Pictures and extras of their own ──────────────────────────────────────

  /** A background: a scrap of island in it, with Candy in the look sitting in it. */
  private islandArt(id: Theme, look: Look): HTMLElement {
    const swatch = islandSwatch(id);
    swatch.prepend(lookCandy(this.art, look));
    return swatch;
  }

  /** The free colour: hue, saturation and brightness over the art, as in Settings. */
  private customColour(): HTMLElement {
    if (this.custom) return this.custom.panel;
    const slider = (key: "hue" | "sat" | "light", min: number, max: number) => {
      const el = h("input", { type: "range", min, max, step: 1, class: "range" }) as HTMLInputElement;
      el.addEventListener("input", () => {
        const c = settings.companion;
        c.customSkin = { ...c.customSkin, [key]: Number(el.value) };
        // A colour is Candy's: sliding puts the free colour on, and takes a costume off.
        if (c.skin !== "custom" || c.costume !== "none") {
          c.skin = "custom";
          c.costume = "none";
          this.sync();
          return;
        }
        this.retint();
      });
      el.addEventListener("change", save);
      return el;
    };
    const hue = slider("hue", -180, 180);
    const sat = slider("sat", 0, 250);
    const light = slider("light", 60, 140);
    // The hue track shows the colours it leads to.
    const stops: string[] = [];
    for (let d = -180; d <= 180; d += 30) stops.push(`hsl(${(((BASE_HUE + d) % 360) + 360) % 360} 70% 50%)`);
    hue.classList.add("hue");
    hue.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
    const swatch = h("i", { class: "skin-swatch" });
    const reset = h("button", { class: "btn", type: "button", text: t("Reset") });
    reset.addEventListener("click", () => {
      settings.companion.customSkin = { ...DEFAULT_CUSTOM_SKIN };
      save();
      this.sync();
    });
    const row = (label: string, input: HTMLElement) => h("label", { class: "slider-row" }, h("span", { text: label }), input);
    const panel = h(
      "div",
      { class: "custom-colour" },
      h("h2", {}, swatch, t("Custom colour")),
      row(t("Hue"), hue),
      row(t("Saturation"), sat),
      row(t("Brightness"), light),
      h("div", { class: "custom-foot" }, h("span", { class: "hint", text: t("Pick Custom, then slide. The face still shows the mood.") }), reset),
    );
    const paint = () => {
      const c = settings.companion;
      hue.value = String(c.customSkin.hue);
      sat.value = String(c.customSkin.sat);
      light.value = String(c.customSkin.light);
      swatch.style.background = customSwatch(c.customSkin);
      panel.classList.toggle("off", c.skin !== "custom" || c.costume !== "none");
    };
    paint();
    this.custom = { panel, paint };
    return panel;
  }

  /** The free colour moved: the stage, the Custom card and the swatch follow; nothing else is drawn again. */
  private retint() {
    this.key = "";
    this.mascot.setFilter(lookFilter(this.showing()));
    this.custom?.paint();
    if (this.rack.shelf.id !== "colour") return;
    const art = this.cards.get("custom")?.querySelector(".card-art");
    art?.replaceChildren(lookCandy(this.art, tryOn(this.base(this.rack.shelf), this.rack.shelf, "custom")));
  }
}

/** Focus that came from the keyboard (Tab, the arrows), not from a click. */
function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────────

/**
 * Builds the closet into `container` (the island's panel), in a shadow root
 * of its own. Its dispose takes everything down: the page, its listeners,
 * the observers and the big Candy's motion.
 */
export function mountCloset(container: HTMLElement, panelHost: PanelHost): PanelPage {
  host = panelHost;
  // A copy of its own: the island's changes reach it as saves.
  settings = normalizeSettings(JSON.parse(JSON.stringify(State.settings)));
  const closet = new Closet(host.manifest);
  const el = h("div", { class: "panel-page closet-page" });
  const shadow = el.attachShadow({ mode: "open" });
  shadow.append(h("style", { text: css }), closet.el);
  container.append(el);
  closet.sync(true);
  closet.setActive(true);

  const off: (() => void)[] = [];
  const on = <K extends keyof DocumentEventMap>(target: Document | HTMLElement, type: K, fn: (e: DocumentEventMap[K]) => void) => {
    target.addEventListener(type, fn as EventListener);
    off.push(() => target.removeEventListener(type, fn as EventListener));
  };
  on(document, "pointermove", closet.gaze);
  on(el, "pointerleave", closet.gazeOff);
  // Back to the island after a while: a season may have started or ended meanwhile.
  const refocus = () => closet.sync();
  window.addEventListener("focus", refocus);
  off.push(() => window.removeEventListener("focus", refocus));

  let disposed = false;
  void onSettingsChanged((s) => {
    // Every save comes back, the closet's own too: that one changes nothing.
    if (JSON.stringify(s) === JSON.stringify(settings)) return;
    settings = s;
    closet.sync();
  }).then((stop) => (disposed ? stop() : off.push(stop)));

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const fn of off) fn();
      closet.dispose();
      el.remove();
    },
  };
}
