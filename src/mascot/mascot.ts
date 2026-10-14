// The mascot, driven by public/mascot/mascot.json.
//
// Each state lists its image frames, an optional eyes layer (drawn apart so the
// eyes can follow the mouse and blink), a frame rate, a body motion (CSS) and
// an optional effect (z's, !, ?, hearts, sparkles). An artist replaces the
// images and edits the JSON; no code changes. States the manifest leaves out
// fall back to a close relative (see FALLBACK), so a first art drop can cover
// just a few expressions.
//
// The art is drawn on canvases, live: SVG made of plain shapes is taken apart
// (rig.ts) so the face can turn toward the cursor, the lids close to blink and
// the mouth open wide; any other art is drawn as a picture. Squash and stretch,
// hops, the hat dropping in and swinging, colours fading between moods: the
// craft of Coucou's Mochi engine (MIT, © Louis Raillé), on Candy's own art.

import { Ease } from "../core/anim";
import { t } from "../core/i18n";
import type { CustomSkin, Skin } from "../core/state";
import { drawBed, drawHands, drawParticles, drawRig, mixRGB, rgbOf, rigBox, turnTo, type Look, type RGB } from "./paint";
import { danceStep, dancesIn, stepDanceLevel } from "./dance";
import type { Emote } from "./emotes";
import { moodGaze } from "./gaze";
import { spawn, step as stepParticles, type Origin, type Particle, type ParticleKind } from "./particles";
import { dangle, piecesOf, pose, pulls, still, type Pieces } from "./pieces";
import { hasArms, paletteOf, parseRig, wickOf, type Box, type Op, type Rig } from "./rig";
import type { PnlSign } from "./sign";
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
  /**
   * false: the frames keep their own colours under the trader's colour pick.
   * Candy's loss moods are red, like a candle, whatever colour it wears.
   */
  tint?: boolean;
}

export interface Manifest {
  name: string;
  states: Partial<Record<MascotState, StateDef>>;
  /** Hats drawn over every frame (same canvas size), by outfit name. */
  outfits?: Record<string, string>;
  /** Face accessories (glasses, a mustache…), worn under the hat. */
  faces?: Record<string, string>;
  /** Hats and face accessories with loose bits, by the accessory's path (see pieces.ts). */
  pieces?: Record<string, Pieces>;
  /** Costumes: the whole body redrawn, with its own frames for every state. */
  costumes?: Record<string, { name: string; states: Partial<Record<MascotState, StateDef>>; mouthDrop?: number }>;
  /** The face accessories held in or hung under the mouth (a pacifier, a bow tie…), by id. */
  mouthFaces?: string[];
  /** Dressed: how far below Candy's the costume's mouth sits, in art units (a bull's on its snout). */
  mouthDrop?: number;
}

/** The manifest with a costume's frames in place of Candy's ("none": as is). */
export function dressed(manifest: Manifest, costume: string): Manifest {
  const c = costume === "none" ? null : manifest.costumes?.[costume];
  return c ? { ...manifest, states: c.states, mouthDrop: c.mouthDrop ?? 0 } : manifest;
}

/**
 * How far down a face accessory goes on the art worn now: one held in the
 * mouth (or hung under it) follows a mouth drawn lower than Candy's, the rest
 * stay where they are drawn.
 */
export function mouthShift(manifest: Manifest | null, face: string | null): number {
  const drop = manifest?.mouthDrop ?? 0;
  if (!drop || !face) return 0;
  return manifest!.mouthFaces?.some((id) => manifest!.faces?.[id] === face) ? drop : 0;
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

/** A manifest path as the page loads it. */
export function artUrl(src: string): string {
  return BASE + src;
}

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

/** How far the face turns toward the cursor at most, in radians (see rig.ts → turnFeature). */
export const MAX_YAW = 0.42;
/** How far it looks down or up, in art units. */
const MAX_PITCH = 6;
/** How far the pupils move on top of that: art units, for art taken apart; for a picture, % of its size as before. */
const PUPIL_X = 2.2;
const PUPIL_Y = 1.6;
const EYE_TRAVEL_X = 4.5;
const EYE_TRAVEL_Y = 3;
/** The canvases reach this far past the art on every side (art units): room for a hop, a roll, a squash. */
const OVERHANG = 32;
/** The point the body squashes and stretches around: the foot of the wick. */
const FOOT = { x: 64, y: 122 };

/** The dot in the mascot's corner (see Mascot.setBadge). */
export type Badge = "up" | "down" | "warn" | "calm" | "busy";

/**
 * A step of swallowing a token link (see Mascot.cue): a link held over him,
 * taken away, dropped and being looked up, swallowed, refused. The island
 * plays these on its own mascot, or sends them to the desktop one when he is out.
 */
export type MouthCue =
  | { kind: "ready" }
  | { kind: "unready"; keepOpen: boolean }
  | { kind: "open" }
  | { kind: "gulp" }
  | { kind: "puzzled"; say: string };

/** A blink closes the eyes layer, or shows the blink frame of a one-frame state. */
function canBlink(def: StateDef | null): boolean {
  if (!def) return false;
  return def.eyesBlink != null && def.eyes != null ? true : def.blink != null && def.frames.length === 1;
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
  // Held in a mouth drawn lower (the bull's): down with it, in the picture's own units.
  const shift = mouthShift(manifest, look.face);
  if (shift && box.lastElementChild instanceof HTMLElement) box.lastElementChild.style.transform = `translateY(${(shift / 128) * 100}%)`;
  layer(look.hat);
  return box;
}

// ── Art ───────────────────────────────────────────────────────────────────────

/** One frame or eyes layer, loaded: taken apart into shapes when it can be (rig.ts), else a picture. */
interface Art {
  rig: Rig | null;
  img: HTMLImageElement | null;
}

const arts = new Map<string, Art>();
const loading = new Map<string, Promise<Art>>();
const artKey = (src: string, eyes: boolean) => (eyes ? "eyes:" : "frame:") + src;

/** Loads a piece of art once; `readyArt` has it from then on. */
function loadArt(src: string, eyes: boolean): Promise<Art> {
  const key = artKey(src, eyes);
  const done = arts.get(key);
  if (done) return Promise.resolve(done);
  let p = loading.get(key);
  if (!p) {
    p = (async (): Promise<Art> => {
      let rig: Rig | null = null;
      if (/\.svg$/i.test(src)) {
        try {
          const res = await fetch(BASE + src);
          if (res.ok) rig = parseRig(await res.text(), eyes);
        } catch {
          /* drawn as a picture instead */
        }
      }
      let img: HTMLImageElement | null = null;
      if (!rig) {
        img = new Image();
        img.src = BASE + src;
        try {
          await img.decode();
        } catch {
          img = null;
        }
      }
      const art = { rig, img };
      arts.set(key, art);
      loading.delete(key);
      return art;
    })();
    loading.set(key, p);
  }
  return p;
}

const readyArt = (src: string | null | undefined, eyes: boolean): Art | null => (src ? (arts.get(artKey(src, eyes)) ?? null) : null);

/** A hat or a face accessory, always drawn as a picture. */
const pictures = new Map<string, HTMLImageElement>();
function picture(src: string, onLoad: () => void): HTMLImageElement {
  let img = pictures.get(src);
  if (!img) {
    img = new Image();
    img.src = BASE + src;
    pictures.set(src, img);
  }
  if (!img.complete) img.addEventListener("load", onLoad, { once: true });
  return img;
}

type Pal = { top: RGB; bottom: RGB; wick: RGB | null };

function rigPalette(rig: Rig | null | undefined): Pal | null {
  const p = rig ? paletteOf(rig) : null;
  const top = p && rgbOf(p.top);
  const bottom = p && rgbOf(p.bottom);
  if (!p || !top || !bottom) return null;
  return { top, bottom, wick: p.wick ? rgbOf(p.wick) : null };
}

// ── Tweens ────────────────────────────────────────────────────────────────────

/** What the mascot animates by keyframes (Coucou's BotEngine does the same, per property). */
type Prop = "open" | "sx" | "sy" | "oy" | "ox" | "hands" | "hatY" | "hatA" | "roll" | "es" | "blush" | "sink" | "melt" | "bed" | "shadeY" | "shadeA" | "turn";

/** What still shows of the body with his back turned (a pirouette): no face, no mouth. */
const BACK_PARTS: ReadonlySet<Op["part"]> = new Set(["back", "body", "front"]);

/** Reactions whose eyes pop wide for a moment. */
const POP_STATES = new Set<MascotState>(["alert", "shocked", "excited", "curious"]);
/** Reactions that start with a drop of sweat. */
const SWEAT_STATES = new Set<MascotState>(["worried", "nervous", "sick"]);
/** The glyph effects a short reaction plays as a burst of particles instead. */
const BURSTS: Partial<Record<Fx, ParticleKind>> = { hearts: "heart", sparkles: "star" };
/** The glyph effects a lasting mood plays as a particle drifting off now and then: asleep, bored. */
const DRIFTS: Partial<Record<Fx, ParticleKind>> = { zzz: "z", dots: "dots" };
const DRIFT_EVERY_MS = 2600;
/** A music note off him while he dances. */
const NOTE_EVERY_MS = 1700;
/** Asleep: how far he sinks into the island, art units. */
const SLEEP_SINK = 4;
/** Napping in his bed: how far he sinks into the mattress, the blanket up to his chin. */
const BED_SINK = 7;
/** How long the wax takes to run down to a new stage, and to firm up again, seconds. */
const MELT_DOWN_S = 3.2;
const MELT_UP_S = 1.8;
/** A head tilt (a question, a wink, pride), radians: about 8°. */
const HEAD_TILT = 0.14;
type Key = readonly [target: number, seconds: number, ease: (t: number) => number];

interface Tween {
  keys: readonly Key[];
  i: number;
  from: number;
  t0: number;
  done?: () => void;
}

const now = () => performance.now() / 1000;

/**
 * A soft part trailing its target (stiffness 60, damping 9: Coucou's hat), sub-
 * stepped so a slow frame cannot fling it, and held within ±1.5 of the target
 * range. Returns the new position and velocity.
 */
function lag(y: number, v: number, target: number, dt: number): [number, number] {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    v += (60 * (target - y) - 9 * v) * h;
    y += v * h;
  }
  return [Math.max(-1.5, Math.min(1.5, y)), v];
}

/**
 * The live mascot. Two canvases inside the body: the frame under the trader's
 * colour filter, and above it the eyes, the face accessory and the hat. They
 * are drawn only while something moves — the face turning toward the cursor,
 * a blink, a squash, a hat dropping in, a fade between moods — and not at all
 * while the island is hidden; the steady motions (breathing, bouncing…) are
 * CSS on the body, as before.
 */
export class Mascot {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private frameCv: HTMLCanvasElement;
  private topCv: HTMLCanvasElement;
  private fxEl: HTMLElement;
  private bubble: HTMLElement;
  private badgeEl: HTMLElement;
  private badge: Badge | null = null;
  private badgeTimer: number | null = null;
  /** Holds the body (a hook for CSS: .mascot-lean). */
  private leanEl: HTMLElement;

  private manifest: Manifest = { name: "", states: {} };
  private mood: MascotState = "idle";
  private reaction: MascotState | null = null;
  /** Overrides the state's own motion while a reaction lasts. */
  private reactionMotion: Motion | null = null;
  private shown: MascotState | null = null;
  private def: StateDef | null = null;
  private filter = "none";
  private frame = 0;

  private frameTimer: number | null = null;
  private blinkTimer: number | null = null;
  /** A lasting mood's drifting z's or "…" (see DRIFTS). */
  private fxTimer: number | null = null;
  private reactionTimer: number | null = null;
  private bubbleTimer: number | null = null;
  private active = true;

  // The live drawing.
  private raf = 0;
  private lastT = 0;
  private drawn = false;
  private yaw = 0;
  private pitch = 0;
  private gazeX = 0;
  private gazeY = 0;
  private target = { yaw: 0, pitch: 0, x: 0, y: 0 };
  private open = 1;
  private sx = 1;
  private sy = 1;
  private oy = 0;
  /** Sideways, in art units: the arrival's slide. */
  private ox = 0;
  /** Asleep, he sinks a little into the island (art units, down). */
  private sink = 0;
  /** The hello's little hands, out from behind the body (0–1). */
  private hands = 0;
  /** When the left hand started waving, and until when (seconds, now()); 0: not waving. */
  private waveFrom = 0;
  private waveUntil = 0;
  private hat: string | null = null;
  /** The hat on its way in while the old one flies off. */
  private hatNext: string | null = null;
  private face: string | null = null;
  private hatY = 0;
  private hatA = 1;
  /** The hat's lag behind turns (−1…1), a spring. */
  private swing = 0;
  private swingV = 0;
  private prevYaw = 0;
  /** The mouth: a spring, so it opens and shuts with a little give. */
  private slot = 0;
  private slotT = 0;
  private slotV = 0;
  private chewUntil = 0;
  /** The whole drawing turned over (a spin), radians. */
  private roll = 0;
  /** The eyes' size: popped wide for a moment. */
  private es = 1;
  /** The cheeks flushed (0–1). */
  private blush = 0;
  /** The hat's lag behind hops (−1…1), a spring, and what drives it. */
  private swingY = 0;
  private swingYV = 0;
  private prevOy = 0;
  /** The loose bits of the hat and the face accessory (pieces.ts): two looser springs. */
  private side = 0;
  private sideV = 0;
  private up = 0;
  private upV = 0;
  private prevTop = 0;
  private parts: Particle[] = [];
  /** Music is playing (see dance.ts): the dance comes in, unless the mood sits it out. */
  private wantDance = false;
  private danceLevel = 0;
  /** How far his wax has run down on a drop (0–1, see melt.ts). */
  private melt = 0;
  /** After midnight he wears pyjamas (see night.ts). */
  private pyjamas = false;
  /** Napping in a little bed (see nap.ts): asleep whatever the mood, until woken. */
  private asleepInBed = false;
  /** The bed coming in (0–1, a spring past 1) or going. */
  private bed = 0;
  /** The bed: the headboard and pillow behind him, the blanket in front; still while he breathes. */
  private bedBackCv: HTMLCanvasElement;
  private bedFrontCv: HTMLCanvasElement;
  private bedDrawn = 0;
  private tweens = new Map<Prop, Tween>();
  private palFrom: Pal | null = null;
  private palTo: Pal | null = null;
  private palT = 1;
  /**
   * Dark shades over the face for a few seconds (a 2x, see shades.ts): their
   * art, how far above the eyes they still are (art units, sliding down) and
   * how solid. `keepFace`: the face accessory he wears stays under them.
   */
  private shades: string | null = null;
  private shadeY = 0;
  private shadeA = 0;
  private keepFace = false;
  /** A pirouette (the spin emote): how far round he has turned, radians. */
  private turn = 0;
  /** A laugh: when it started and until when (seconds, now()). */
  private laughFrom = 0;
  private laughUntil = 0;
  /** The dance emote: he dances until then, music or not (seconds, now()). */
  private danceUntil = 0;
  /** The little sign he holds up (see holdSign), built the first time. */
  private signEl: HTMLElement | null = null;
  private signTimer: number | null = null;

  constructor(className = "mascot") {
    const canvas = (cls: string) => {
      const cv = document.createElement("canvas");
      cv.className = cls;
      cv.width = cv.height = 0;
      return cv;
    };
    this.frameCv = canvas("mascot-frame");
    this.topCv = canvas("mascot-top");
    this.bedBackCv = canvas("mascot-bed");
    this.bedFrontCv = canvas("mascot-bed");
    this.body = document.createElement("div");
    this.body.className = "mascot-body";
    this.body.append(this.frameCv, this.topCv);
    this.leanEl = document.createElement("div");
    this.leanEl.className = "mascot-lean";
    this.leanEl.append(this.body);
    this.badgeEl = document.createElement("div");
    this.badgeEl.className = "mascot-badge";
    this.badgeEl.hidden = true;
    this.fxEl = document.createElement("div");
    this.fxEl.className = "mascot-fx";
    this.el = document.createElement("div");
    this.el.className = className;
    // A speech bubble under the mascot. Its text can name a token, so it is
    // only ever set with textContent.
    this.bubble = document.createElement("div");
    this.bubble.className = "mascot-bubble";
    this.el.append(this.bedBackCv, this.leanEl, this.bedFrontCv, this.fxEl, this.bubble, this.badgeEl);
    // The island resizes the mascot as it opens and closes: draw at the new size.
    if (typeof ResizeObserver !== "undefined") {
      this.resized = new ResizeObserver(() => this.invalidate(true));
      this.resized.observe(this.el);
    }
  }

  private resized: ResizeObserver | null = null;
  private disposed = false;

  /**
   * Taken off the page for good (Settings' previews when its panel closes):
   * nothing of his is left running, no timer, frame or observer, and nothing
   * starts him again.
   */
  dispose() {
    if (this.disposed) return;
    this.setActive(false);
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const id of [this.reactionTimer, this.bubbleTimer, this.badgeTimer, this.signTimer]) if (id != null) window.clearTimeout(id);
    this.reactionTimer = this.bubbleTimer = this.badgeTimer = this.signTimer = null;
    this.resized?.disconnect();
    this.resized = null;
  }

  /** Loads (and, unless told not to, preloads) the art. Safe to call before the element is on screen. */
  use(manifest: Manifest, preload = true) {
    this.manifest = manifest;
    // Every mood's art, so a change of mood shows at once. A still preview
    // shows one pose: it skips this.
    for (const def of preload ? Object.values(manifest.states) : []) {
      if (!def) continue;
      for (const f of [...def.frames, def.blink]) if (f) void loadArt(f, false);
      for (const e of [def.eyes, def.eyesBlink]) if (e) void loadArt(e, true);
    }
    this.shown = null;
    this.apply();
  }

  /** A colour treatment (see skins.ts); `custom` is the free colour. */
  setSkin(skin: Skin, custom?: CustomSkin | null) {
    this.setFilter(skinFilter(skin, custom));
  }

  /** A CSS filter over the frame: a colour, or "none" (see skins.ts → lookFilter). */
  setFilter(filter: string) {
    this.filter = filter;
    this.paint();
  }

  /** The colour on the frame: none on a state that keeps its own (tint: false). It fades (CSS). */
  private paint() {
    this.frameCv.style.filter = this.def?.tint === false ? "none" : this.filter;
  }

  /**
   * A hat over every frame (a path from the manifest), or none. A new one drops
   * in with a bounce once the mascot is on screen; the old one flies off first.
   */
  setOutfit(src: string | null, animated = true) {
    if (src === (this.hatNext ?? this.hat)) return;
    // Trying hats on (the wardrobe's hover) swaps them at once.
    if (!animated || !this.drawn || !this.active) {
      this.hat = src;
      this.hatNext = null;
      this.hatY = 0;
      this.hatA = 1;
      this.invalidate(true);
      return;
    }
    this.hatNext = src;
    const enter = () => {
      // Another pick came while this one was flying off: its own `enter` follows.
      if (this.hatNext !== src) return;
      this.hatNext = null;
      this.hat = src;
      if (!src) return;
      this.hatY = -60;
      this.hatA = 1;
      this.anim("hatY", [[0, 0.36, Ease.back]], () => this.squash(0.6));
    };
    if (this.hat) {
      this.anim("hatY", [[-46, 0.18, Ease.easeIn]]);
      this.anim("hatA", [[0, 0.18, Ease.lin]], enter);
    } else enter();
  }

  /** A face accessory over every frame (a path from the manifest), or none. */
  setFace(src: string | null) {
    if (src === this.face) return;
    this.face = src;
    this.invalidate(true);
  }

  /** After midnight: striped pyjamas over the body (the island decides when, see night.ts). */
  setPyjamas(on: boolean) {
    if (on === this.pyjamas) return;
    this.pyjamas = on;
    this.invalidate(true);
  }

  /**
   * How far his wax has run down on a strong drop (0–1, see melt.ts): slowly
   * down to a new stage, and back up a little quicker as the price recovers
   * (`seconds` sets the pace instead: Settings → Show me).
   */
  setMelt(level: number, seconds?: number) {
    const target = this.tweens.get("melt")?.keys.at(-1)?.[0] ?? this.melt;
    if (Math.abs(target - level) < 0.001) return;
    if (!this.active || !this.drawn) {
      this.tweens.delete("melt");
      this.melt = level;
      this.invalidate(true);
      return;
    }
    this.anim("melt", [[level, seconds ?? (level > this.melt ? MELT_DOWN_S : MELT_UP_S), Ease.inOut]]);
  }

  /** Napping in his little bed (see nap.ts). */
  get napping(): boolean {
    return this.asleepInBed;
  }

  /**
   * Into his little bed: it comes up around him and he falls asleep, whatever
   * the mood. Out of it: `startled` (something happened) whisks it away with
   * a hop and wide eyes; otherwise he wakes slowly, with a yawn.
   */
  setBed(on: boolean, startled = false) {
    if (on === this.asleepInBed) return;
    this.asleepInBed = on;
    const live = this.active && this.drawn;
    if (on && this.reaction) {
      // Whatever he was doing, he lies down.
      if (this.reactionTimer != null) window.clearTimeout(this.reactionTimer);
      this.reactionTimer = null;
      this.reaction = null;
      this.reactionMotion = null;
    }
    if (!live) {
      this.tweens.delete("bed");
      this.bed = on ? 1 : 0;
    } else if (on) this.anim("bed", [[1, 0.55, Ease.back]], () => this.squash(0.35));
    else this.anim("bed", startled ? [[0, 0.2, Ease.easeIn]] : [[0, 0.5, Ease.inOut]]);
    this.shown = null;
    this.apply();
    if (!live || on) return;
    if (startled) {
      this.hop(20);
      this.pop();
    } else window.setTimeout(() => this.yawn(), 380);
  }

  get state(): MascotState {
    return this.reaction ?? (this.asleepInBed ? "sleepy" : this.mood);
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
    // What the face does on top of the swap: eyes popping, a flush, a drop of sweat.
    if (this.active && this.drawn) {
      if (POP_STATES.has(state)) this.pop();
      if (state === "love") this.blushUp();
      if (SWEAT_STATES.has(state)) this.emit("sweat", 1);
      // A question tilts the head one way, pride the other.
      const hold = Math.min(1.4, ms / 1000 - 0.6);
      if (state === "curious" || state === "confused") this.headTilt(1, hold);
      if (state === "proud") this.headTilt(-1, hold);
    }
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

  /** Ends a reaction early: back to the mood at once. */
  settle() {
    if (this.reactionTimer != null) window.clearTimeout(this.reactionTimer);
    this.reactionTimer = null;
    if (this.reaction == null) return;
    this.reaction = null;
    this.reactionMotion = null;
    this.shown = null;
    this.apply();
  }

  /**
   * Points the face: x and y from −1 to 1 (see gaze.ts). The whole face turns
   * that way, as if Candy were round, and the pupils a little more; each
   * trails behind on its own spring. The body itself stays upright.
   */
  lookAt(g: { x: number; y: number }) {
    // The same spot again (every cursor move sends one): nothing to draw.
    if (g.x === this.target.x && g.y === this.target.y) return;
    this.target = { yaw: g.x * MAX_YAW, pitch: g.y * MAX_PITCH, x: g.x, y: g.y };
    this.invalidate();
  }

  /** A squash and stretch: a poke, a landing. `k` scales it. */
  squash(k = 1) {
    this.anim("sy", [[1 - 0.22 * k, 0.07, Ease.out], [1 + 0.1 * k, 0.13, Ease.out], [1, 0.17, Ease.inOut]]);
    this.anim("sx", [[1 + 0.16 * k, 0.07, Ease.out], [1 - 0.05 * k, 0.13, Ease.out], [1, 0.17, Ease.inOut]]);
  }

  /** A little jump, `height` art units up. */
  hop(height = 16) {
    this.anim("oy", [[-height, 0.15, Ease.out], [0, 0.3, Ease.back]]);
  }

  /**
   * The arrival: drops in from `from` art units above, lands with a squash
   * and a small bounce, then blinks (Coucou's Mochi arrives the same way).
   */
  dropIn(from = -110) {
    this.oy = from;
    this.prevOy = from;
    this.anim("oy", [[0, 0.38, Ease.easeIn]], () => {
      this.squash(1.1);
      this.anim("oy", [[-10, 0.16, Ease.out], [0, 0.24, Ease.back]], () => this.blinkOnce(0.14));
    });
  }

  /**
   * The full arrival, after Coucou's greeting (MIT, © Louis Raillé): he drops
   * in and bounces, slides to the side, two little hands pop out and one waves
   * hello, then they tuck away, he slides back and blinks. About 3.8 s; the
   * island folds him into the ticker after.
   */
  arrive() {
    this.ox = 0;
    this.hands = 0;
    this.dropIn();
    const at = (s: number, fn: () => void) => window.setTimeout(fn, s * 1000);
    const side = -26;
    at(0.85, () => this.anim("ox", [[side * 0.35, 0.35, Ease.inOut], [side, 0.6, Ease.inOut]]));
    at(1.3, () => this.waveHello(1.0));
    at(2.85, () => this.anim("ox", [[0, 0.6, Ease.inOut]], () => this.blinkOnce(0.14)));
  }

  /**
   * Two little hands pop out from behind him and the left one waves for
   * `seconds`, then they tuck away again (the arrival's hello, the wave emote).
   */
  private waveHello(seconds: number) {
    const at = (s: number, fn: () => void) => window.setTimeout(fn, s * 1000);
    this.squash(0.5);
    // A costume waves its own arm (its wave art): drawn hands would be a
    // second pair behind the ones it has.
    if (this.ownArms()) {
      this.react("wave", seconds * 1000 + 150);
      at(seconds + 0.15, () => this.react("happy", 1400));
      return;
    }
    this.anim("hands", [[1, 0.18, Ease.back]]);
    at(0.15, () => {
      this.waveFrom = now();
      this.waveUntil = this.waveFrom + seconds;
      this.invalidate();
    });
    at(seconds + 0.15, () => this.anim("hands", [[0, 0.25, Ease.easeIn]]));
  }

  // ── Emotes (the right-click menu, see emotes.ts) ───────────────────────────

  /** Plays an emote once, on the spot: a dance, a wave, a laugh or a spin. */
  emote(e: Emote) {
    if (!this.active) return;
    switch (e) {
      case "dance":
        return this.danceOnce(3.6);
      case "wave":
        if (!this.ownArms()) this.react("happy", 1900);
        return this.waveHello(1.4);
      case "laugh":
        return this.laugh(1.7);
      case "spin":
        return this.pirouette(0.8);
    }
  }

  /** A few beats of the music dance (dance.ts) with no music on, a note or two off him. */
  private danceOnce(seconds: number) {
    this.danceUntil = now() + seconds;
    this.react("happy", seconds * 1000 + 250, "none");
    this.emit("note", 1);
    for (const ms of [1100, 2300]) window.setTimeout(() => this.active && now() < this.danceUntil && this.emit("note", 1), ms);
    this.invalidate();
  }

  /** Happy eyes, the mouth going "ha ha ha", little bounces and a "ha" off each side. */
  private laugh(seconds: number) {
    this.laughFrom = now();
    this.laughUntil = this.laughFrom + seconds;
    this.react("happy", seconds * 1000 + 300, "none");
    const bounce: Key[] = [];
    for (let i = 0; i < 6; i++) bounce.push([-3.5, 0.1, Ease.out], [0, 0.13, Ease.easeIn]);
    this.anim("oy", bounce);
    const word = t("ha");
    const born = spawn("ha", 4, Math.random, this.origin());
    for (const p of born) p.text = word;
    this.parts.push(...born);
    this.invalidate();
  }

  /**
   * A pirouette: a little hop, and he turns all the way round on the spot
   * (his back to us halfway), then lands with a squash. Turning about his own
   * upright axis, never a lean.
   */
  private pirouette(seconds: number) {
    this.turn = 0;
    this.react("happy", seconds * 1000 + 600, "none");
    this.anim("oy", [[-12, seconds * 0.45, Ease.out], [0, seconds * 0.55, Ease.easeIn]]);
    this.anim("turn", [[Math.PI * 2, seconds, Ease.inOut]], () => {
      this.turn = 0;
      this.squash(0.8);
    });
  }

  // ── Shades and the sign ───────────────────────────────────────────────────

  /**
   * Dark shades over his face (a path from the manifest), or off again (null).
   * They slide down onto his eyes and settle with a little bounce and a glint
   * on the lens; on the way off they lift and fade. `keepFace`: the face
   * accessory he has on stays under them (a mustache); otherwise it fades out
   * while they are on (glasses). The trader's own look is never changed.
   */
  wearShades(src: string | null, keepFace = false) {
    const instant = !this.active || !this.drawn;
    if (src) {
      const coming = this.shades == null || this.shadeA < 0.5 || this.tweens.has("shadeA");
      this.shades = src;
      this.keepFace = keepFace;
      if (instant) {
        this.tweens.delete("shadeY");
        this.tweens.delete("shadeA");
        this.shadeY = 0;
        this.shadeA = 1;
        this.invalidate(true);
        return;
      }
      if (!coming) return;
      this.shadeY = -26;
      this.shadeA = 0;
      this.anim("shadeA", [[1, 0.14, Ease.out]]);
      this.anim("shadeY", [[0, 0.42, Ease.back]], () => this.glint());
      return;
    }
    if (!this.shades) return;
    if (instant) {
      this.tweens.delete("shadeY");
      this.tweens.delete("shadeA");
      this.shades = null;
      this.shadeY = 0;
      this.shadeA = 0;
      this.invalidate(true);
      return;
    }
    this.anim("shadeY", [[-20, 0.3, Ease.easeIn]]);
    this.anim("shadeA", [[0, 0.3, Ease.easeIn]], () => {
      this.shades = null;
      this.shadeY = 0;
    });
  }

  /** The shades are on (or on their way). */
  get wearingShades(): boolean {
    return this.shades != null;
  }

  /** A glint off the right lens as the shades land. */
  private glint() {
    if (!this.active) return;
    this.parts.push({ kind: "spark", x: 86, y: 53, vx: 0, vy: 0, age: 0, life: 0.55, rot: 0.4, size: 1.5 });
    this.invalidate();
  }

  /**
   * Holds up a little sign in front of his tummy, his eyes peeking over it:
   * today's PnL (sign.ts), green or red. Null lowers it. Words only ever go in
   * as text.
   */
  holdSign(sign: PnlSign | null) {
    if (this.signTimer != null) window.clearTimeout(this.signTimer);
    this.signTimer = null;
    const el = this.signEl;
    if (!sign) {
      if (!el || el.hidden) return;
      el.classList.remove("up");
      el.classList.add("down");
      this.signTimer = window.setTimeout(() => {
        this.signTimer = null;
        el.hidden = true;
        el.classList.remove("down");
      }, 200);
      return;
    }
    const sEl = el ?? this.buildSign();
    const [label, big, small] = [".sign-label", ".sign-big", ".sign-small"].map((q) => sEl.querySelector<HTMLElement>(q)!);
    label.textContent = sign.label;
    big.textContent = sign.big;
    small.textContent = sign.small;
    big.hidden = !sign.big;
    small.hidden = !sign.small;
    sEl.dataset.tone = sign.tone;
    sEl.classList.toggle("empty", !sign.big);
    // His hands on its edges, in his colour of the moment and under his colour filter.
    const pal = this.palette();
    const mid = pal ? mixRGB(pal.top, pal.bottom, 0.55) : null;
    for (const paw of sEl.querySelectorAll<HTMLElement>(".sign-paw")) {
      paw.style.background = mid ? `rgb(${mid.map(Math.round).join(",")})` : "";
      paw.style.filter = this.frameCv.style.filter;
    }
    if (!sEl.hidden && sEl.classList.contains("up")) return;
    sEl.hidden = false;
    sEl.classList.remove("down", "up");
    void sEl.offsetWidth;
    sEl.classList.add("up");
  }

  /** The sign is up (or on its way up). */
  get holdingSign(): boolean {
    return !!this.signEl && !this.signEl.hidden && this.signEl.classList.contains("up");
  }

  /** Moves the sign sideways (px), so it stays inside whatever holds the mascot. */
  nudgeSign(dx: number) {
    this.signEl?.style.setProperty("--sign-dx", `${Math.round(dx)}px`);
  }

  /** The sign's box on the page, while it shows. */
  signRect(): DOMRect | null {
    return this.signEl && !this.signEl.hidden ? this.signEl.querySelector(".sign-card")!.getBoundingClientRect() : null;
  }

  private buildSign(): HTMLElement {
    const part = (tag: string, cls: string) => {
      const e = document.createElement(tag);
      e.className = cls;
      return e;
    };
    const card = part("div", "sign-card");
    card.append(part("i", "sign-paw l"), part("i", "sign-paw r"), part("span", "sign-label"), part("b", "sign-big"), part("span", "sign-small"));
    const el = part("div", "mascot-sign");
    el.hidden = true;
    el.append(card);
    // Over the body, under the speech bubble and the badge.
    this.el.insertBefore(el, this.fxEl);
    this.signEl = el;
    return el;
  }

  /** The art he has on now has arms of its own (a costume): see hasArms. */
  private ownArms(): boolean {
    const rig = readyArt(this.def?.frames[0], false)?.rig;
    return !!rig && hasArms(rig);
  }

  /** One quick blink, now. */
  blink() {
    if (!this.active || !canBlink(this.def)) return;
    this.blinkOnce(0.14);
  }

  /** The mouth opens wide (something is about to be swallowed), or closes again. */
  mouthOpen(on: boolean) {
    this.slotT = on ? 1 : 0;
    this.invalidate();
  }

  /** Swallows: the mouth snaps shut, a deep squash and stretch that settles with a bounce, a moment of chewing. */
  gulp() {
    this.slotT = 0;
    this.chewUntil = now() + 1.1;
    this.anim("sy", [[0.72, 0.09, Ease.out], [1.2, 0.14, Ease.out], [0.94, 0.12, Ease.inOut], [1, 0.2, Ease.back]]);
    this.anim("sx", [[1.32, 0.09, Ease.out], [0.9, 0.14, Ease.out], [1.04, 0.12, Ease.inOut], [1, 0.2, Ease.back]]);
  }

  /**
   * A burst of `n` hearts, stars, sparks, sweat, z's, confetti, coins… off the
   * head; a flame or smoke on the wick. `size` scales them (how big a flame burns).
   */
  emit(kind: ParticleKind, n = 4, size?: number) {
    if (!this.active) return;
    // One flame at a time: a new one takes the old one's place.
    if (kind === "flame") this.parts = this.parts.filter((p) => p.kind !== "flame");
    const born = spawn(kind, n, Math.random, this.origin());
    if (size != null) for (const p of born) p.size *= size;
    this.parts.push(...born);
    this.invalidate();
  }

  /** Where particles start: the top of the body the art has on now, and its wick; Candy's own spot until it loads. */
  private origin(): Origin | undefined {
    const rig = readyArt(this.def?.frames[0], false)?.rig;
    const body = rig?.body;
    const wick = rig ? wickOf(rig)?.op.box : undefined;
    return body ? { x: body.x + body.w / 2, y: body.y, w: body.w, wick: wick ? { x: wick.x + wick.w / 2, y: wick.y } : undefined } : undefined;
  }

  /** The whole drawing turns over `turns` times, then lands with a squash. */
  rollOnce(turns = 2, seconds = 1.3) {
    this.roll = 0;
    this.anim("roll", [[Math.PI * 2 * turns, seconds, Ease.inOut]], () => {
      this.roll = 0;
      this.squash(0.8);
    });
  }

  /** The eyes pop wide for a moment. */
  pop() {
    this.anim("es", [[1.22, 0.08, Ease.out], [1, 0.22, Ease.inOut]]);
  }

  /** The cheeks flush, and fade back. */
  blushUp() {
    this.anim("blush", [[1, 0.3, Ease.out], [1, 1.4, Ease.lin], [0, 0.4, Ease.inOut]]);
  }

  /** Knocks the hat sideways (−1…1): it swings back on its spring. */
  nudgeHat(k: number) {
    this.swingV += k * 12;
    this.invalidate();
  }

  /** Plays a step of swallowing a token link (see MouthCue). */
  cue(c: MouthCue) {
    switch (c.kind) {
      case "ready":
        this.react("alert", 60_000);
        this.say(t("drop it on me!"), 60_000);
        this.mouthOpen(true);
        break;
      case "unready":
        this.settle();
        this.say(null);
        if (!c.keepOpen) this.mouthOpen(false);
        break;
      case "open":
        this.mouthOpen(true);
        break;
      case "gulp":
        this.gulp();
        this.emit("spark", 3);
        // Added: a green check rises off his head.
        window.setTimeout(() => this.emit("check", 1), 260);
        this.react("love", 2600);
        break;
      case "puzzled":
        this.mouthOpen(false);
        this.react("confused", 2200);
        this.say(c.say, 2600);
        break;
    }
  }

  /** Music on or off: the dance fades in or out (moods that sit it out stay still, see dance.ts). */
  setDancing(on: boolean) {
    if (this.wantDance === on) return;
    this.wantDance = on;
    this.invalidate();
    this.syncNotes();
  }

  /** While he dances, a music note drifts off him now and then; never while hidden. */
  private syncNotes() {
    const want = this.wantDance && this.active;
    if (want && this.noteTimer == null) {
      this.noteTimer = window.setInterval(() => {
        if (this.danceLevel > 0.5) this.emit("note", 1);
      }, NOTE_EVERY_MS);
    } else if (!want && this.noteTimer != null) {
      window.clearInterval(this.noteTimer);
      this.noteTimer = null;
    }
  }
  private noteTimer: number | null = null;

  // ── Flourishes (src/mascot/flourish.ts decides when) ──────────────────────────

  /** A joy jump: high, with a trail of sparks under him, and a squash on landing. */
  joyJump() {
    if (!this.active) return;
    this.anim("oy", [[-24, 0.24, Ease.out], [0, 0.36, Ease.back]], () => this.squash(0.9));
    const body = readyArt(this.def?.frames[0], false)?.rig?.body;
    const x = body ? body.x + body.w / 2 : 64;
    const y = body ? body.y + body.h : 100;
    for (let i = 0; i < 6; i++) {
      this.parts.push({ kind: "spark", x: x + (Math.random() - 0.5) * 18, y: y - i * 3, vx: (Math.random() - 0.5) * 10, vy: 12, age: -i * 0.04, life: 0.7, rot: Math.random() * 6, size: 0.8 + Math.random() * 0.4 });
    }
    this.invalidate();
  }

  /** A strong drop: he shrinks and trembles for a moment, upright. */
  shrinkTremble() {
    if (!this.active) return;
    this.anim("sy", [[0.86, 0.18, Ease.out], [0.86, 1.0, Ease.lin], [1, 0.3, Ease.back]]);
    this.anim("sx", [[0.92, 0.18, Ease.out], [0.92, 1.0, Ease.lin], [1, 0.3, Ease.back]]);
    const shake: [number, number, (t: number) => number][] = [];
    for (let i = 0; i < 10; i++) shake.push([i % 2 ? 1.6 : -1.6, 0.05, Ease.inOut]);
    shake.push([0, 0.06, Ease.out]);
    this.anim("ox", shake);
  }

  /** A real yawn: the mouth opens wide and slow, the eyes nearly close, then it shuts. */
  yawn() {
    if (!this.active || !this.drawn) return;
    this.mouthOpen(true);
    this.anim("open", [[0.25, 0.4, Ease.inOut], [0.25, 0.9, Ease.lin], [1, 0.3, Ease.out]]);
    this.anim("sy", [[1.06, 0.5, Ease.inOut], [1.06, 0.6, Ease.lin], [1, 0.4, Ease.inOut]]);
    window.setTimeout(() => this.mouthOpen(false), 1400);
  }

  /** The eyes go somewhere for a moment (the ticker's price that just moved), then come back. */
  glance(g: { x: number; y: number }, ms = 1200) {
    if (!this.active) return;
    const back = this.target;
    this.lookAt(g);
    window.setTimeout(() => {
      if (this.target.x === g.x && this.target.y === g.y) this.lookAt({ x: back.x, y: back.y });
    }, ms);
  }

  /** A dot in the corner: an alert not looked at yet (its tone), or busy fetching. */
  setBadge(badge: Badge | null) {
    if (badge === this.badge) return;
    const was = this.badge;
    this.badge = badge;
    if (this.badgeTimer != null) window.clearTimeout(this.badgeTimer);
    this.badgeTimer = null;
    if (!badge) {
      // It shrinks away, then hides.
      this.badgeEl.className = `mascot-badge ${was} out`;
      this.badgeTimer = window.setTimeout(() => {
        this.badgeTimer = null;
        this.badgeEl.hidden = true;
        this.badgeEl.className = "mascot-badge";
        this.badgeEl.replaceChildren();
      }, 180);
      return;
    }
    this.badgeEl.hidden = false;
    this.badgeEl.replaceChildren();
    // Busy: three dots that take turns, like someone typing.
    if (badge === "busy") for (let i = 0; i < 3; i++) this.badgeEl.append(document.createElement("i"));
    // Pops in, then its own pulse takes over.
    this.badgeEl.className = `mascot-badge ${badge} pop`;
    this.badgeTimer = window.setTimeout(() => {
      this.badgeTimer = null;
      this.badgeEl.className = `mascot-badge ${badge}`;
    }, 280);
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

  /** Closes the eyes once, a little longer than a blink, with the head tipped. */
  wink() {
    if (!this.active || !canBlink(this.def)) return;
    if (this.blinkTimer != null) window.clearTimeout(this.blinkTimer);
    this.blinkOnce(0.26);
    this.headTilt(1, 0.3);
  }

  /**
   * Tips the head to one side for `hold` seconds (1: right, −1: left), then
   * back: a question, a wink, a proud pose. Never toward the cursor: the user
   * wants no leaning after the mouse, and the tilts that mean something kept.
   */
  headTilt(dir: 1 | -1, hold = 1) {
    if (!this.active || !this.drawn || this.tweens.has("roll") || hold <= 0) return;
    const a = HEAD_TILT * dir;
    this.anim("roll", [[a, 0.22, Ease.out], [a, hold, Ease.lin], [0, 0.35, Ease.inOut]]);
  }

  /** Shuts the eyes for `seconds` (the lid closes and opens), then goes back to blinking now and then. */
  private blinkOnce(seconds: number) {
    this.anim("open", [[0.06, 0.07, Ease.inOut], [0.06, Math.max(0, seconds - 0.14), Ease.lin], [1, 0.13, Ease.out]]);
    this.scheduleBlink();
  }

  /** Stops every timer while the mascot cannot be seen. */
  setActive(on: boolean) {
    if (this.active === on || (on && this.disposed)) return;
    this.active = on;
    this.el.classList.toggle("paused", !on);
    this.syncNotes();
    if (on) {
      this.shown = null;
      this.apply();
    } else {
      this.stopTimers();
      this.say(null);
      // Hidden: stand straight, with nothing left running and nothing left
      // half-done (a gulp queued while hidden would play on the reveal).
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.finishTweens();
      this.chewUntil = 0;
      this.laughUntil = 0;
      this.danceUntil = 0;
      // The sign goes down at once: nothing left showing for the reveal.
      if (this.signTimer != null) window.clearTimeout(this.signTimer);
      this.signTimer = null;
      if (this.signEl) {
        this.signEl.hidden = true;
        this.signEl.classList.remove("up", "down");
      }
      this.slot = this.slotT;
      this.slotV = 0;
      this.swing = this.swingV = 0;
      this.swingY = this.swingYV = 0;
      this.side = this.sideV = this.up = this.upV = 0;
      this.parts = [];
      this.danceLevel = 0;
    }
  }

  /** Ends every tween at its last key (the hat lands, the squash settles), doing what each had left to do. */
  private finishTweens() {
    for (let guard = 0; this.tweens.size && guard < 8; guard++) {
      const all = [...this.tweens];
      this.tweens.clear();
      for (const [prop, tw] of all) {
        this[prop] = tw.keys[tw.keys.length - 1][0];
        tw.done?.();
      }
    }
  }

  private stopTimers() {
    if (this.frameTimer != null) window.clearInterval(this.frameTimer);
    if (this.blinkTimer != null) window.clearTimeout(this.blinkTimer);
    if (this.fxTimer != null) window.clearInterval(this.fxTimer);
    this.frameTimer = null;
    this.blinkTimer = null;
    this.fxTimer = null;
  }

  private apply() {
    const state = this.state;
    if (state === this.shown) return;
    // Drawn already: this is a swap of faces, not the first one.
    const changed = this.drawn;
    this.shown = state;
    this.stopTimers();

    const def = resolveState(this.manifest, state);
    this.def = def;
    this.paint();
    this.frame = 0;
    this.el.dataset.state = state;
    // Asleep he sinks a little into the island, slowly (into his bed's
    // mattress, at once); awake he rises again.
    const inBed = state === "sleepy" && this.asleepInBed;
    const sink = inBed ? BED_SINK : state === "sleepy" ? SLEEP_SINK : 0;
    if (this.active && this.sink !== sink) this.anim("sink", [[sink, inBed ? 0.6 : sink ? 2.4 : 0.5, Ease.inOut]]);
    else if (!this.active) this.sink = sink;
    if (!def) {
      this.invalidate(true);
      return;
    }
    // Draw it the moment its art is in; the body's colours fade to the new ones.
    this.fadeTo(rigPalette(readyArt(def.frames[0], false)?.rig));
    for (const [src, eyes] of [
      [def.frames[0], false],
      [def.eyes, true],
      [def.eyesBlink, true],
      [def.blink, false],
    ] as const) {
      if (src && !readyArt(src, eyes))
        void loadArt(src, eyes).then((art) => {
          if (this.def !== def) return;
          if (src === def.frames[0]) this.fadeTo(rigPalette(art.rig));
          this.invalidate(true);
        });
    }

    // Restart the CSS motion: removing and re-adding the class replays it.
    this.body.className = "mascot-body";
    void this.body.offsetWidth;
    this.body.classList.add(`motion-${(this.reaction && this.reactionMotion) || def.motion || "breathe"}`);

    this.fxEl.replaceChildren();
    // A short reaction bursts its hearts or stars on the canvas; a lasting mood
    // keeps the glyphs floating (CSS: nothing to draw while it lasts).
    const burst = this.reaction && def.fx ? BURSTS[def.fx] : undefined;
    const drift = def.fx ? DRIFTS[def.fx] : undefined;
    if (burst && this.active && this.drawn) {
      this.emit(burst, 4);
      if (burst === "star") this.emit("spark", 3);
    } else if (drift) {
      // Asleep or bored: a z (or a "…") drifts off the head now and then, on
      // the canvas; nothing runs while he is hidden (stopTimers).
      if (this.active) {
        this.emit(drift, 1);
        this.fxTimer = window.setInterval(() => this.emit(drift, 1), DRIFT_EVERY_MS);
      }
    } else if (def.fx) {
      this.fxEl.className = `mascot-fx fx-${def.fx}`;
      FX_GLYPHS[def.fx].forEach((g, i) => {
        const span = document.createElement("span");
        span.textContent = g;
        span.style.animationDelay = `${i * 0.45}s`;
        this.fxEl.append(span);
      });
    }

    if (!this.active) {
      this.invalidate(true);
      return;
    }
    if (def.frames.length > 1) {
      for (const f of def.frames) void loadArt(f, false);
      const fps = Math.max(1, Math.min(24, def.fps ?? 4));
      this.frameTimer = window.setInterval(() => {
        this.frame = (this.frame + 1) % def.frames.length;
        this.invalidate();
      }, 1000 / fps);
    }
    // A new face comes with a blink, as Mochi does: the swap reads as one movement.
    if (changed && canBlink(def)) this.blinkOnce(0.14);
    else if (canBlink(def)) this.scheduleBlink();
    this.invalidate();
  }

  private scheduleBlink() {
    if (this.blinkTimer != null) window.clearTimeout(this.blinkTimer);
    this.blinkTimer = null;
    if (!canBlink(this.def) || !this.active) return;
    this.blinkTimer = window.setTimeout(() => {
      this.blinkTimer = null;
      this.blinkOnce(0.14);
      // Now and then, twice.
      if (Math.random() < 0.22) window.setTimeout(() => this.active && this.anim("open", [[0.06, 0.07, Ease.inOut], [1, 0.13, Ease.out]]), 230);
    }, 2400 + Math.random() * 3600);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private anim(prop: Prop, keys: readonly Key[], done?: () => void) {
    this.tweens.set(prop, { keys, i: 0, from: this[prop], t0: now(), done });
    this.invalidate();
  }

  /** The body's colours fade from what is on screen to `to`. */
  private fadeTo(to: Pal | null) {
    if (!to) return;
    const from = this.palette();
    if (!from || !this.drawn) {
      this.palFrom = this.palTo = to;
      this.palT = 1;
      return;
    }
    if (same(from, to)) return;
    this.palFrom = from;
    this.palTo = to;
    this.palT = 0;
    this.invalidate();
  }

  private palette(): Pal | null {
    const a = this.palFrom;
    const b = this.palTo;
    if (!a || !b) return b ?? a;
    const t = Ease.inOut(this.palT);
    return { top: mixRGB(a.top, b.top, t), bottom: mixRGB(a.bottom, b.bottom, t), wick: a.wick && b.wick ? mixRGB(a.wick, b.wick, t) : b.wick };
  }

  /**
   * Asks for a frame; frames keep coming only while something moves. `still`:
   * the art itself changed, so even an inactive mascot (a still preview in
   * Settings) draws it once, and asks for nothing more.
   */
  private invalidate(still = false) {
    if (this.raf || this.disposed) return;
    if (!this.active) {
      if (still)
        this.raf = requestAnimationFrame(() => {
          this.raf = 0;
          this.draw(now());
        });
      return;
    }
    this.lastT = now();
    this.raf = requestAnimationFrame(this.step);
  }

  private step = () => {
    this.raf = 0;
    const t = now();
    const dt = Math.min(0.05, Math.max(0, t - this.lastT));
    this.lastT = t;
    let moving = false;

    for (const [prop, tw] of [...this.tweens]) {
      // A `done` above may have replaced this tween: the stale one is skipped.
      if (this.tweens.get(prop) !== tw) continue;
      const k = tw.keys[tw.i];
      const q = k[1] > 0 ? Math.min(1, (t - tw.t0) / k[1]) : 1;
      this[prop] = tw.from + (k[0] - tw.from) * k[2](q);
      moving = true;
      if (q >= 1) {
        tw.from = k[0];
        tw.i += 1;
        tw.t0 = t;
        if (tw.i >= tw.keys.length) {
          this.tweens.delete(prop);
          tw.done?.();
        }
      }
    }

    // The face and the pupils trail the cursor (Coucou's look smoothing).
    const kLook = 1 - Math.pow(0.0025, dt);
    const kEyes = 1 - Math.pow(0.0002, dt);
    const ease = (v: number, to: number, k: number) => {
      const next = v + (to - v) * k;
      if (Math.abs(to - next) > 0.0015) moving = true;
      return Math.abs(to - next) > 0.0015 ? next : to;
    };
    // A mood with a look of its own wins over the cursor (asleep: down; dizzy: a wobble).
    const mood = moodGaze(this.state, t);
    const tg = mood ? { yaw: mood.x * MAX_YAW, pitch: mood.y * MAX_PITCH, x: mood.x, y: mood.y } : this.target;
    if (this.state === "dizzy") moving = true;
    this.yaw = ease(this.yaw, tg.yaw, kLook);
    this.pitch = ease(this.pitch, tg.pitch, kLook);
    this.gazeX = ease(this.gazeX, tg.x, kEyes);
    this.gazeY = ease(this.gazeY, tg.y, kEyes);

    // The hat lags behind a turn of the head, then swings back (stiffness 60, damping 9).
    const yawVel = dt > 0 ? (this.yaw - this.prevYaw) / dt : 0;
    this.prevYaw = this.yaw;
    [this.swing, this.swingV] = lag(this.swing, this.swingV, Math.max(-1, Math.min(1, -yawVel * 0.35)), dt);
    if (Math.abs(this.swing) > 0.002 || Math.abs(this.swingV) > 0.01) moving = true;
    else this.swing = this.swingV = 0;
    // And behind a hop: rising, the hat hangs back; landing, it bobs.
    const oyVel = dt > 0 ? (this.oy - this.prevOy) / dt : 0;
    this.prevOy = this.oy;
    [this.swingY, this.swingYV] = lag(this.swingY, this.swingYV, Math.max(-1, Math.min(1, -oyVel / 80)), dt);
    if (Math.abs(this.swingY) > 0.002 || Math.abs(this.swingYV) > 0.01) moving = true;
    else this.swingY = this.swingYV = 0;
    // The loose bits trail the hat's swing, and the top of the head as it hops,
    // squashes, dances or wears a hat landing on it.
    const hop = this.danceLevel > 0.001 ? danceStep(t, this.danceLevel) : null;
    const top = this.oy + this.sink + this.hatY + (hop?.dy ?? 0) + (FOOT.y - 24) * (1 - this.sy * (hop?.sy ?? 1));
    const topV = dt > 0 ? (top - this.prevTop) / dt : 0;
    this.prevTop = top;
    if (this.loose()) {
      const pull = pulls(this.swingV, topV);
      [this.side, this.sideV] = dangle(this.side, this.sideV, pull.side, dt);
      [this.up, this.upV] = dangle(this.up, this.upV, pull.up, dt);
      if (!still(this.side, this.sideV) || !still(this.up, this.upV)) moving = true;
      else this.side = this.sideV = this.up = this.upV = 0;
    } else this.side = this.sideV = this.up = this.upV = 0;

    if (this.parts.length) {
      this.parts = stepParticles(this.parts, dt);
      moving = true;
    }
    if (t < this.waveUntil || t < this.laughUntil) moving = true;

    // The dance keeps the frames coming for as long as the music does (or the dance emote).
    const dancing = (this.wantDance && dancesIn(this.state)) || t < this.danceUntil;
    this.danceLevel = stepDanceLevel(this.danceLevel, dancing, dt);
    if (dancing || this.danceLevel > 0) moving = true;

    // The mouth's spring: ω₀ = 2π / 0.25 s, ζ = 0.6. Sub-stepped at 240 Hz: one
    // explicit step over a slow 50 ms frame would make it diverge, not settle.
    const w = (2 * Math.PI) / 0.25;
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.slotV += (w * w * (this.slotT - this.slot) - 2 * 0.6 * w * this.slotV) * h;
      this.slot = Math.max(0, this.slot + this.slotV * h);
    }
    if (Math.abs(this.slotT - this.slot) > 0.002 || Math.abs(this.slotV) > 0.01) moving = true;
    else this.slot = this.slotT;
    if (t < this.chewUntil) moving = true;

    if (this.palT < 1) {
      this.palT = Math.min(1, this.palT + dt / 0.45);
      moving = true;
    }

    this.draw(t);
    if (moving) this.invalidate();
  };

  /** Canvas pixels per art unit, the canvases grown to the mascot's size on screen. */
  private unit(): number {
    const size = parseFloat(this.el.style.width) || this.el.offsetWidth;
    if (!size) return 0;
    const dpr = window.devicePixelRatio || 1;
    // A multiple of 24 px, grown only: the island resizes the mascot every
    // frame while it opens, and a new canvas size each frame would be waste.
    const want = Math.ceil((size * ((128 + 2 * OVERHANG) / 128) * dpr) / 24) * 24;
    if (want > this.frameCv.width) for (const cv of [this.frameCv, this.topCv, this.bedBackCv, this.bedFrontCv]) cv.width = cv.height = want;
    return this.frameCv.width / (128 + 2 * OVERHANG);
  }

  private draw(t: number) {
    const u = this.unit();
    if (!u) return;
    const def = this.def;
    // A one-frame state with a blink frame (no eyes layer) blinks the whole frame.
    const frameSrc = def ? (this.open < 0.35 && def.blink && !def.eyes ? def.blink : (def.frames[this.frame] ?? def.frames[0])) : null;
    const frame = readyArt(frameSrc, false);
    const body = frame?.rig?.body ?? null;
    // A pirouette past the quarter turn: his back to us, no face.
    const back = this.turn !== 0 && Math.cos(this.turn) < 0;
    // Laughing: the mouth opens and shuts, "ha, ha, ha", about five times a second.
    const laughing = t < this.laughUntil ? t - this.laughFrom : -1;
    const mouth = back
      ? null
      : laughing >= 0
        ? { open: 0.4 + 0.6 * Math.abs(Math.sin(laughing * Math.PI * 5.5)), chew: 0, grin: true }
        : this.slot > 0.03
          ? { open: Math.min(1.2, this.slot), chew: 0 }
          : t < this.chewUntil
            ? { open: 0, chew: Math.abs(Math.sin(t * 22)) }
            : null;
    const look: Look = { yaw: body ? this.yaw : 0, pitch: body ? this.pitch : 0, palette: this.palette(), mouth, blush: this.blush, pyjamas: this.pyjamas, melt: this.melt };

    for (const cv of [this.frameCv, this.topCv]) {
      const c = cv.getContext("2d");
      if (!c) continue;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, cv.width, cv.height);
      c.setTransform(u, 0, 0, u, OVERHANG * u, OVERHANG * u);
      // While waving, the body bobs with the hand.
      const waving = t < this.waveUntil ? t - this.waveFrom : -1;
      const bob = waving >= 0 ? Math.sin(waving * 2 * Math.PI * 5) * 1.2 * Math.min(1, waving / 0.08) : 0;
      c.translate(this.ox, this.oy + bob + this.sink);
      if (this.danceLevel > 0.001) {
        // The dance: a hop, a sway and a lean about the foot, a squash on landing.
        const d = danceStep(t, this.danceLevel);
        c.translate(FOOT.x + d.dx, FOOT.y + d.dy);
        c.rotate(d.rot);
        c.scale(d.sx, d.sy);
        c.translate(-FOOT.x, -FOOT.y);
      }
      if (this.roll) {
        // A spin turns the whole drawing about the body's middle.
        const cy = body ? body.y + body.h / 2 : 64;
        c.translate(64, cy);
        c.rotate(this.roll);
        c.translate(-64, -cy);
      }
      if (this.turn) {
        // A pirouette about his upright middle: he narrows to his edge, shows
        // his back, narrows again and faces us. Never a lean.
        const k = Math.cos(this.turn);
        const w = (k < 0 ? -1 : 1) * Math.max(0.1, Math.abs(k));
        c.translate(FOOT.x, 0);
        c.scale(w, 1);
        c.translate(-FOOT.x, 0);
      }
      c.translate(FOOT.x, FOOT.y);
      c.scale(this.sx, this.sy);
      c.translate(-FOOT.x, -FOOT.y);
      if (cv === this.frameCv) {
        // The hello's hands, behind the body (in its colour, under the frame's filter).
        // Never on art with arms of its own (a costume put on mid-hello).
        if (frame?.rig && this.hands > 0.01 && !hasArms(frame.rig)) drawHands(c, frame.rig, look, this.hands, waving);
        this.drawFrame(c, frame, look, back);
      }
      else {
        if (!back) this.drawTop(c, body, look);
        else this.drawHat(c, body, look);
        // Particles fly free of the squash and the spin, with the hop only.
        c.setTransform(u, 0, 0, u, OVERHANG * u, OVERHANG * u);
        c.translate(this.ox, this.oy);
        drawParticles(c, this.parts);
      }
    }
    // His bed stands still on the island while he breathes and sinks into it.
    if (this.bed > 0.001 || this.bedDrawn > 0.001) {
      for (const [cv, part] of [[this.bedBackCv, "back"], [this.bedFrontCv, "front"]] as const) {
        const c = cv.getContext("2d");
        if (!c) continue;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, cv.width, cv.height);
        c.setTransform(u, 0, 0, u, OVERHANG * u, OVERHANG * u);
        drawBed(c, part, this.bed);
      }
      this.bedDrawn = this.bed;
    }
    this.drawn = true;
  }

  private drawFrame(c: CanvasRenderingContext2D, frame: Art | null, look: Look, back = false) {
    const keep = back ? (op: Op) => BACK_PARTS.has(op.part) : (op: Op) => op.part !== "eyes";
    if (frame?.rig) drawRig(c, frame.rig, keep, look, frame.rig.body, wickOf(frame.rig)?.op ?? null);
    else if (frame?.img) c.drawImage(frame.img, 0, 0, 128, 128);
  }

  private drawTop(c: CanvasRenderingContext2D, body: Box | null, look: Look) {
    const def = this.def;
    if (def?.eyes) {
      const blinking = this.open < 0.35 && def.eyesBlink;
      const eyes = readyArt(blinking ? def.eyesBlink : def.eyes, true);
      if (eyes?.rig) {
        c.save();
        const b = rigBox(eyes.rig);
        const mid = b.y + b.h / 2;
        // Popped wide: the eyes grow about their middle.
        if (this.es !== 1) {
          c.translate(b.x + b.w / 2, mid);
          c.scale(this.es, this.es);
          c.translate(-(b.x + b.w / 2), -mid);
        }
        // The lids close: the eyes squeeze shut around their middle.
        if (!blinking && this.open < 0.999) {
          c.translate(0, mid);
          c.scale(1, Math.max(0.06, this.open));
          c.translate(0, -mid);
        }
        c.translate(this.gazeX * PUPIL_X, this.gazeY * PUPIL_Y);
        drawRig(c, eyes.rig, () => true, look, body);
        c.restore();
      } else if (eyes?.img) {
        c.save();
        if (this.es !== 1) {
          c.translate(64, 60);
          c.scale(this.es, this.es);
          c.translate(-64, -60);
        }
        c.drawImage(eyes.img, this.gazeX * EYE_TRAVEL_X * 1.28, this.gazeY * EYE_TRAVEL_Y * 1.28, 128, 128);
        c.restore();
      }
    }
    // The face accessory fades out under the shades (unless it sits below the eyes).
    const faceA = this.shades && !this.keepFace ? 1 - this.shadeA : 1;
    if (this.face && faceA > 0.01) {
      c.save();
      c.globalAlpha = faceA;
      if (body) turnTo(c, body.x + body.w / 2, body, look);
      c.translate(0, mouthShift(this.manifest, this.face));
      this.drawAccessory(c, this.face);
      c.restore();
    }
    if (this.shades && this.shadeA > 0.01) {
      c.save();
      c.globalAlpha = this.shadeA;
      if (body) turnTo(c, body.x + body.w / 2, body, look);
      c.translate(0, this.shadeY);
      this.drawAccessory(c, this.shades);
      c.restore();
    }
    this.drawHat(c, body, look);
  }

  /** The hat, swinging on its springs, dropping in or flying off. */
  private drawHat(c: CanvasRenderingContext2D, body: Box | null, look: Look) {
    if (this.hat && this.hatA > 0.01) {
      c.save();
      c.globalAlpha = this.hatA;
      const top = body ? body.y : 24;
      c.translate(body ? Math.sin(look.yaw) * (body.w / 2) * 0.35 : 0, this.hatY + look.pitch * 0.4 + this.swingY * 5);
      c.translate(64, top + 6);
      c.rotate(this.swing * 0.35);
      c.translate(-64, -(top + 6));
      this.drawAccessory(c, this.hat);
      c.restore();
    }
  }

  /** The hat or the face accessory has loose bits that swing. */
  private loose(): boolean {
    return !!(piecesOf(this.manifest.pieces, this.hat) || piecesOf(this.manifest.pieces, this.face));
  }

  /**
   * A hat or a face accessory: in pieces, its loose bits turned about where
   * they are attached, once every piece has loaded; whole until then.
   */
  private drawAccessory(c: CanvasRenderingContext2D, src: string) {
    const load = () => this.invalidate(true);
    const ready = (img: HTMLImageElement | null) => !img || (img.complete && img.naturalWidth > 0);
    const set = piecesOf(this.manifest.pieces, src);
    const base = set?.base ? picture(set.base, load) : null;
    const bits = set ? set.parts.map((p) => ({ p, img: picture(p.src, load) })) : [];
    if (set && ready(base) && bits.every((b) => ready(b.img))) {
      const draw = (under: boolean) => {
        for (const { p, img } of bits) {
          if (!!p.under !== under) continue;
          const { angle, dy } = pose(p, this.side, this.up);
          const [x, y] = p.pivot;
          c.save();
          c.translate(x, y + dy);
          c.rotate(angle);
          c.translate(-x, -y);
          c.drawImage(img, 0, 0, 128, 128);
          c.restore();
        }
      };
      draw(true);
      if (base) c.drawImage(base, 0, 0, 128, 128);
      draw(false);
      return;
    }
    const whole = picture(src, load);
    if (ready(whole)) c.drawImage(whole, 0, 0, 128, 128);
  }
}

function same(a: Pal, b: Pal): boolean {
  const eq = (x: RGB | null, y: RGB | null) => (!x && !y) || (!!x && !!y && x.every((v, i) => Math.abs(v - y[i]) < 0.5));
  return eq(a.top, b.top) && eq(a.bottom, b.bottom) && eq(a.wick, b.wick);
}
