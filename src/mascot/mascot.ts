// The mascot: a sprite player driven by public/mascot/mascot.json.
//
// Each state lists its image frames, an optional eyes layer (drawn apart so the
// eyes can follow the mouse, and swapped to blink), a frame rate, a body
// motion (CSS) and an optional effect (z's, !, ?, hearts, sparkles). An
// artist replaces the images and edits the JSON; no code changes. States the
// manifest leaves out fall back to a close relative (see FALLBACK), so a first
// art drop can cover just a few expressions.

import type { CustomSkin, Skin } from "../core/state";
import { skinFilter } from "./skins";

export const MASCOT_STATES = [
  "idle",
  "happy",
  "celebrate",
  "worried",
  "shocked",
  "sleepy",
  "alert",
  "tired",
  "stop",
  "confused",
  "love",
  "wave",
  "proud",
  "sad",
  "bored",
  "focused",
  "nervous",
  "curious",
  "angry",
  "excited",
  "relieved",
  "dizzy",
  "cool",
  "sick",
] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

export type Motion =
  | "breathe"
  | "bounce"
  | "jump"
  | "shake"
  | "sway"
  | "droop"
  | "none"
  // One-shot motions for pokes (see reactions.ts).
  | "hop"
  | "squish"
  | "wiggle"
  | "flip"
  | "spin"
  | "dizzy"
  | "squeeze"
  | "spring"
  | "dance"
  | "sneeze"
  | "shrink"
  | "backflip"
  | "peek"
  // Lasting motions for moods.
  | "jitter"
  | "tilt"
  | "woozy";
export type Fx = "zzz" | "bang" | "question" | "hearts" | "sparkles" | "dots";

export interface StateDef {
  frames: string[];
  /**
   * The eyes (or pupils), apart from the frames, on the same canvas: they
   * follow the cursor a few pixels. Frames then leave them out.
   */
  eyes?: string;
  /** Eyes layer shown for a moment every few seconds. */
  eyesBlink?: string;
  /** Whole frame shown for a moment every few seconds (art with no eyes layer). */
  blink?: string;
  /** Frames per second when there is more than one frame. */
  fps?: number;
  motion?: Motion;
  fx?: Fx | null;
}

export interface Manifest {
  name: string;
  states: Partial<Record<MascotState, StateDef>>;
  /** Hats drawn over every frame (same canvas size), by outfit name. */
  outfits?: Record<string, string>;
  /** Face accessories (glasses, a mustache…), worn under the hat. */
  faces?: Record<string, string>;
  /** Costumes: the whole body redrawn, with its own frames for every state. */
  costumes?: Record<string, { name: string; states: Partial<Record<MascotState, StateDef>> }>;
}

/** The manifest with a costume's frames in place of Candy's ("none": as is). */
export function dressed(manifest: Manifest, costume: string): Manifest {
  const c = costume === "none" ? null : manifest.costumes?.[costume];
  return c ? { ...manifest, states: c.states } : manifest;
}

/** Where a missing state borrows its look from. */
const FALLBACK: Record<MascotState, MascotState> = {
  idle: "idle",
  happy: "idle",
  celebrate: "happy",
  love: "happy",
  wave: "happy",
  worried: "idle",
  shocked: "worried",
  alert: "shocked",
  stop: "worried",
  sleepy: "idle",
  tired: "sleepy",
  confused: "idle",
  proud: "happy",
  sad: "worried",
  bored: "sleepy",
  focused: "alert",
  nervous: "worried",
  curious: "confused",
  angry: "stop",
  excited: "celebrate",
  relieved: "happy",
  dizzy: "confused",
  cool: "happy",
  sick: "worried",
};

const BASE = "mascot/";

/** The manifest path of a hat or face accessory, or null for none. */
export function accessory(manifest: Manifest | null, slot: "outfits" | "faces", id: string): string | null {
  return id === "none" ? null : (manifest?.[slot]?.[id] ?? null);
}

export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch(`${BASE}mascot.json`);
    if (res.ok) return (await res.json()) as Manifest;
  } catch {
    /* fall through to the empty manifest */
  }
  return { name: "", states: {} };
}

export function resolveState(manifest: Manifest, state: MascotState): StateDef | null {
  let s: MascotState = state;
  for (let i = 0; i < 4; i++) {
    const def = manifest.states[s];
    if (def && def.frames.length > 0) return def;
    if (FALLBACK[s] === s) break;
    s = FALLBACK[s];
  }
  return manifest.states.idle ?? null;
}

const FX_GLYPHS: Record<Fx, string[]> = {
  zzz: ["z", "z", "Z"],
  bang: ["!"],
  question: ["?"],
  hearts: ["♥", "♥"],
  sparkles: ["✦", "✧", "✦"],
  dots: ["·", "·", "·"],
};

/** How far the eyes travel at most, in % of the mascot's size. */
const EYE_TRAVEL_X = 4.5;
const EYE_TRAVEL_Y = 3;

/** A blink swaps the eyes layer, or the whole frame of a one-frame state. */
function canBlink(def: StateDef | null): boolean {
  if (!def) return false;
  return def.eyesBlink != null && def.eyes != null ? true : def.blink != null && def.frames.length === 1;
}

function showLayer(img: HTMLImageElement, src: string | null) {
  if (!src) {
    img.hidden = true;
    img.removeAttribute("src");
    return;
  }
  img.src = BASE + src;
  img.hidden = false;
}

/**
 * A still, cheap Candy for pickers: the idle frame (tinted), its eyes, a face
 * accessory and a hat stacked in one box. No timers, no motion.
 */
export function miniCandy(manifest: Manifest, look: { hat: string | null; face: string | null; filter: string }): HTMLElement {
  const box = document.createElement("div");
  box.className = "mini-candy";
  const def = resolveState(manifest, "idle");
  const layer = (src: string | null | undefined, filter?: string) => {
    if (!src) return;
    const img = document.createElement("img");
    img.src = BASE + src;
    img.alt = "";
    img.draggable = false;
    if (filter) img.style.filter = filter;
    box.append(img);
  };
  layer(def?.frames[0], look.filter);
  layer(def?.eyes);
  layer(look.face);
  layer(look.hat);
  return box;
}

export class Mascot {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private img: HTMLImageElement;
  private outfitImg: HTMLImageElement;
  private faceImg: HTMLImageElement;
  private eyesImg: HTMLImageElement;
  private fxEl: HTMLElement;
  private bubble: HTMLElement;

  private manifest: Manifest = { name: "", states: {} };
  private mood: MascotState = "idle";
  private reaction: MascotState | null = null;
  /** Overrides the state's own motion while a reaction lasts. */
  private reactionMotion: Motion | null = null;
  private shown: MascotState | null = null;
  private def: StateDef | null = null;
  private frame = 0;

  private frameTimer: number | null = null;
  private blinkTimer: number | null = null;
  private reactionTimer: number | null = null;
  private bubbleTimer: number | null = null;
  private active = true;

  constructor(className = "mascot") {
    this.img = document.createElement("img");
    this.img.className = "mascot-frame";
    this.img.alt = "";
    this.img.draggable = false;
    this.outfitImg = document.createElement("img");
    this.outfitImg.className = "mascot-outfit";
    this.outfitImg.alt = "";
    this.outfitImg.draggable = false;
    this.outfitImg.hidden = true;
    this.faceImg = document.createElement("img");
    this.faceImg.className = "mascot-outfit";
    this.faceImg.alt = "";
    this.faceImg.draggable = false;
    this.faceImg.hidden = true;
    this.eyesImg = document.createElement("img");
    this.eyesImg.className = "mascot-eyes";
    this.eyesImg.alt = "";
    this.eyesImg.draggable = false;
    this.eyesImg.hidden = true;
    this.body = document.createElement("div");
    this.body.className = "mascot-body";
    // Eyes, face accessory and hat sit inside the body, so they move with
    // every motion; glasses stay put while the eyes look around behind them.
    this.body.append(this.img, this.eyesImg, this.faceImg, this.outfitImg);
    this.fxEl = document.createElement("div");
    this.fxEl.className = "mascot-fx";
    this.el = document.createElement("div");
    this.el.className = className;
    // A speech bubble under the mascot. Its text can name a token, so it is
    // only ever set with textContent.
    this.bubble = document.createElement("div");
    this.bubble.className = "mascot-bubble";
    this.el.append(this.body, this.fxEl, this.bubble);
  }

  /** Loads (and, unless told not to, preloads) the art. Safe to call before the element is on screen. */
  use(manifest: Manifest, preload = true) {
    this.manifest = manifest;
    // Every mood's frames, so a change of mood shows at once. A still preview
    // shows one pose: it skips this (a settings page draws a hundred of them).
    for (const def of preload ? Object.values(manifest.states) : []) {
      for (const f of [...(def?.frames ?? []), def?.blink, def?.eyes, def?.eyesBlink].filter(Boolean)) {
        const pre = new Image();
        pre.src = BASE + f;
      }
    }
    this.shown = null;
    this.apply();
  }

  /** A colour treatment (see skins.ts); `custom` is the free colour. */
  setSkin(skin: Skin, custom?: CustomSkin | null) {
    this.setFilter(skinFilter(skin, custom));
  }

  /** A CSS filter over the frames: a colour, or "none" (see skins.ts → lookFilter). */
  setFilter(filter: string) {
    this.img.style.filter = filter;
  }

  /** A hat over every frame (a path from the manifest), or none. */
  setOutfit(src: string | null) {
    showLayer(this.outfitImg, src);
  }

  /** A face accessory over every frame (a path from the manifest), or none. */
  setFace(src: string | null) {
    showLayer(this.faceImg, src);
  }

  get state(): MascotState {
    return this.reaction ?? this.mood;
  }

  /** The lasting state, from the market. */
  setMood(state: MascotState) {
    if (this.mood === state) return;
    this.mood = state;
    if (!this.reaction) this.apply();
  }

  /**
   * A short reaction on top of the mood (a click, a fired alert). `motion`
   * replaces the state's own body motion for that time.
   */
  react(state: MascotState, ms = 2200, motion: Motion | null = null) {
    this.reaction = state;
    this.reactionMotion = motion;
    if (this.reactionTimer != null) window.clearTimeout(this.reactionTimer);
    this.reactionTimer = window.setTimeout(() => {
      this.reactionTimer = null;
      this.reaction = null;
      this.reactionMotion = null;
      this.shown = null;
      this.apply();
    }, ms);
    this.shown = null; // replay the motion even if it is the same state
    this.apply();
  }

  /**
   * Points the eyes: x and y from −1 to 1 (see gaze.ts). Only the eyes layer
   * moves, a few % of the mascot's size; a CSS transition smooths it.
   */
  lookAt(g: { x: number; y: number }) {
    this.eyesImg.style.transform = g.x || g.y ? `translate(${(g.x * EYE_TRAVEL_X).toFixed(2)}%, ${(g.y * EYE_TRAVEL_Y).toFixed(2)}%)` : "";
  }

  /** A reaction (click, alert, fidget) is playing. */
  get reacting(): boolean {
    return this.reaction != null;
  }

  /** Shows a line in the speech bubble for `ms`; null hides it at once. */
  say(text: string | null, ms = 1500) {
    if (this.bubbleTimer != null) window.clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    if (!text) {
      this.bubble.classList.remove("on");
      return;
    }
    this.bubble.textContent = text;
    // Replay the pop-in even when a line replaces another.
    this.bubble.classList.remove("on");
    void this.bubble.offsetWidth;
    this.bubble.classList.add("on");
    this.bubbleTimer = window.setTimeout(() => {
      this.bubbleTimer = null;
      this.bubble.classList.remove("on");
    }, ms);
  }

  get saying(): boolean {
    return this.bubble.classList.contains("on");
  }

  /** Closes the eyes once, a little longer than a blink. */
  wink() {
    if (!this.active || !canBlink(this.def)) return;
    if (this.blinkTimer != null) window.clearTimeout(this.blinkTimer);
    this.blinkOnce(260);
  }

  /** Shows the blink for `ms`, then goes back to blinking now and then. */
  private blinkOnce(ms: number) {
    const def = this.def;
    if (!def) return;
    if (def.eyesBlink) this.eyesImg.src = BASE + def.eyesBlink;
    else if (def.blink) this.img.src = BASE + def.blink;
    this.blinkTimer = window.setTimeout(() => {
      if (def.eyesBlink && def.eyes) this.eyesImg.src = BASE + def.eyes;
      else this.img.src = BASE + def.frames[this.frame];
      this.scheduleBlink();
    }, ms);
  }

  /** Stops every timer while the mascot cannot be seen. */
  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    this.el.classList.toggle("paused", !on);
    if (on) {
      this.shown = null;
      this.apply();
    } else {
      this.stopTimers();
      this.say(null);
    }
  }

  private stopTimers() {
    if (this.frameTimer != null) window.clearInterval(this.frameTimer);
    if (this.blinkTimer != null) window.clearTimeout(this.blinkTimer);
    this.frameTimer = null;
    this.blinkTimer = null;
  }

  private apply() {
    const state = this.state;
    if (state === this.shown) return;
    this.shown = state;
    this.stopTimers();

    const def = resolveState(this.manifest, state);
    this.def = def;
    this.frame = 0;
    this.el.dataset.state = state;
    if (!def) {
      this.img.removeAttribute("src");
      showLayer(this.eyesImg, null);
      return;
    }
    this.img.src = BASE + def.frames[0];
    showLayer(this.eyesImg, def.eyes ?? null);

    // Restart the CSS motion: removing and re-adding the class replays it.
    this.body.className = "mascot-body";
    void this.body.offsetWidth;
    this.body.classList.add(`motion-${(this.reaction && this.reactionMotion) || def.motion || "breathe"}`);

    this.fxEl.replaceChildren();
    if (def.fx) {
      this.fxEl.className = `mascot-fx fx-${def.fx}`;
      FX_GLYPHS[def.fx].forEach((g, i) => {
        const span = document.createElement("span");
        span.textContent = g;
        span.style.animationDelay = `${i * 0.45}s`;
        this.fxEl.append(span);
      });
    }

    if (!this.active) return;
    if (def.frames.length > 1) {
      const fps = Math.max(1, Math.min(24, def.fps ?? 4));
      this.frameTimer = window.setInterval(() => {
        this.frame = (this.frame + 1) % def.frames.length;
        this.img.src = BASE + def.frames[this.frame];
      }, 1000 / fps);
    }
    if (canBlink(def)) this.scheduleBlink();
  }

  private scheduleBlink() {
    if (!canBlink(this.def)) return;
    this.blinkTimer = window.setTimeout(() => this.blinkOnce(140), 2400 + Math.random() * 3600);
  }
}
