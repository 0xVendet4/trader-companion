// Draws a rig (see rig.ts) on a canvas, shape by shape: the face turned toward
// the cursor, the body in the colours of the moment, the mouth opened wide when
// Candy swallows something. The turning follows Coucou's Mochi engine (MIT,
// © Louis Raillé): features slide across the body as if it were round.

import { lerp } from "../core/anim";
import { alpha, sway, type Particle } from "./particles";
import { centre, cheeksOf, mouthHalo, turnFeature, type Box, type Clip, type Matrix, type Op, type Rig, type Shape } from "./rig";

/** Colours as [r, g, b], 0–255. */
export type RGB = [number, number, number];

export interface Look {
  /** The face's turn, radians; positive: toward the right. */
  yaw: number;
  /** How far the face drops (or rises, negative), in art units. */
  pitch: number;
  /** The body's colours of the moment, over the art's own (a change of mood fades). */
  palette?: { top: RGB; bottom: RGB; wick: RGB | null } | null;
  /**
   * The mouth wide open (0–1) or chewing (0–1): drawn in place of the art's
   * mouth. `grin`: a laugh's wide open grin, flat on top, as wide as `open` says.
   */
  mouth?: { open: number; chew: number; grin?: boolean } | null;
  /** The cheeks flushed (0–1): a warmer, wider blush over the art's own. */
  blush?: number;
  /** After midnight: striped pyjamas over the body, under the face (see night.ts). */
  pyjamas?: boolean;
  /** A strong drop: how far his wax has run down (0–1, see melt.ts). */
  melt?: number;
}

const INK = "#0b1f12";
const paths = new Map<string, Path2D>();

function path2d(d: string): Path2D {
  let p = paths.get(d);
  if (!p) {
    p = new Path2D(d);
    paths.set(d, p);
  }
  return p;
}

export function rgbOf(color: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const css = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A shape's outline in its own coordinates (null: text). */
function shapePath(s: Shape): Path2D | null {
  if (s.kind === "path") return path2d(s.d);
  const p = new Path2D();
  if (s.kind === "rect") {
    if (s.rx || s.ry) p.roundRect(s.x, s.y, s.w, s.h, s.rx === s.ry ? s.rx : { x: s.rx, y: s.ry });
    else p.rect(s.x, s.y, s.w, s.h);
    return p;
  }
  if (s.kind === "ellipse") {
    p.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
    return p;
  }
  return null;
}

/** A shape's outline where it lands on the art, its transform applied. */
function artPath(s: Shape, m: Matrix | null): Path2D | null {
  const local = shapePath(s);
  if (!local || !m) return local;
  const p = new Path2D();
  p.addPath(local, new DOMMatrix(m));
  return p;
}

/** Draws only inside a clip-path from here on (the art's own clips: a costume's mouth, a pattern on the body). */
function clipTo(c: CanvasRenderingContext2D, clip: Clip) {
  const p = new Path2D();
  for (const s of clip.shapes) {
    const local = shapePath(s.shape);
    if (local) p.addPath(local, s.m ? new DOMMatrix(s.m) : undefined);
  }
  c.clip(p);
}

function fillStyle(c: CanvasRenderingContext2D, op: Op, look: Look, wick: Op | null): string | CanvasGradient | null {
  const f = op.fill;
  if (!f) return null;
  if (op === wick && look.palette?.wick) return css(look.palette.wick);
  if ("color" in f) return f.color;
  const g = f.gradient;
  // Drawn under its own transform: the gradient spans its own box.
  const b = op.lbox;
  const grad = c.createLinearGradient(b.x + g.x1 * b.w, b.y + g.y1 * b.h, b.x + g.x2 * b.w, b.y + g.y2 * b.h);
  const last = g.stops.length - 1;
  g.stops.forEach((s, i) => {
    const own = i === 0 && op.part === "body" && look.palette ? css(look.palette.top) : i === last && op.part === "body" && look.palette ? css(look.palette.bottom) : s.color;
    grad.addColorStop(Math.min(1, Math.max(0, s.offset)), own);
  });
  return grad;
}

function paintOp(c: CanvasRenderingContext2D, op: Op, look: Look, wick: Op | null) {
  const s = op.shape;
  if (s.kind === "text") {
    if (!op.fill || !("color" in op.fill)) return;
    c.globalAlpha = op.fillAlpha;
    c.fillStyle = op.fill.color;
    c.font = `${s.weight} ${s.size}px ${s.family}`;
    c.textAlign = s.anchor === "middle" ? "center" : s.anchor === "end" ? "right" : "left";
    c.fillText(s.text, s.x, s.y);
    c.globalAlpha = 1;
    return;
  }
  const p = shapePath(s);
  if (!p) return;
  const fill = fillStyle(c, op, look, wick);
  const stroke = () => {
    if (!op.stroke || op.strokeWidth <= 0) return;
    c.globalAlpha = op.strokeAlpha;
    c.strokeStyle = op.stroke;
    c.lineWidth = op.strokeWidth;
    c.lineCap = op.cap;
    c.lineJoin = op.join;
    c.stroke(p);
  };
  const doFill = () => {
    if (!fill) return;
    c.globalAlpha = op.fillAlpha;
    c.fillStyle = fill;
    c.fill(p);
  };
  if (op.strokeUnder) {
    stroke();
    doFill();
  } else {
    doFill();
    stroke();
  }
  c.globalAlpha = 1;
}

/** Moves the canvas so a feature centred at `x` is drawn turned with the face. */
export function turnTo(c: CanvasRenderingContext2D, x: number, body: Box, look: Look) {
  const t = turnFeature(x, body, look.yaw);
  c.translate(t.x, look.pitch);
  c.scale(t.scale, 1);
  c.translate(-x, 0);
}

/**
 * Draws the rig's shapes whose part passes `keep`, in order. Face, mouth and
 * eyes turn around `body` (the frame's, for an eyes layer).
 */
export function drawRig(c: CanvasRenderingContext2D, rig: Rig, keep: (op: Op) => boolean, look: Look, body: Box | null, wick: Op | null = null) {
  const cheeks = look.blush ? cheeksOf(rig) : [];
  // Melting: the wax goes over the body (and over the skin the art marks for it, see meltSeat), under the face.
  const seat = look.melt && look.melt > 0.001 && body && body === rig.body ? meltSeat(rig) : null;
  const seatAt = seat ? rig.ops.indexOf(seat.after) : -1;
  let melted = !seat;
  rig.ops.forEach((op, k) => {
    if (!keep(op)) return;
    if (!melted && k > seatAt) {
      drawMelt(c, seat!, look, look.melt!);
      melted = true;
    }
    if (op.part === "mouth" && look.mouth) return;
    const turned = body && (op.part === "face" || op.part === "mouth" || op.part === "eyes");
    c.save();
    // Turned with the face, then inside its clips, then under its own transform.
    if (turned) turnTo(c, centre(op.pivot).x, body, look);
    for (const clip of op.clips) clipTo(c, clip);
    if (op.m) c.transform(...op.m);
    paintOp(c, op, look, wick);
    if (look.blush && cheeks.includes(op)) blushOp(c, op, look.blush);
    c.restore();
    // Light and shade on the body, under the face: it reads as round when it turns.
    if (op.part === "body" && body && body === rig.body) {
      shadeBody(c, op, body, look);
      if (look.pyjamas) drawPyjamas(c, op, body);
    }
  });
  if (!melted) drawMelt(c, seat!, look, look.melt!);
  if (look.mouth && body && rig.ops.some((o) => o.part === "mouth")) drawMouth(c, rig, body, look);
}

/** Where the wax goes when he melts (drawMelt). */
export interface MeltSeat {
  body: Box;
  /** Drawn right after this op: the body, or the last skin the art marks for the wax to run over. */
  after: Op;
  /** The body's corners (its rect's rx and ry): the pool follows the round of his top. */
  rx: number;
  ry: number;
  /** Where he stands: the body's bottom, or a sheet's hem when it hangs lower. The puddle forms here. */
  foot: number;
}

/**
 * The melt's place on a rig: over the body, its pool as round at the corners
 * as the body is. Skin the art marks (Op.meltOver: the ghost's sheet, Floki's
 * white muzzle) has the wax run over it instead of hiding it: the melt is
 * drawn after the last of it, and pools under a sheet's hem.
 */
export function meltSeat(rig: Rig): MeltSeat | null {
  const body = rig.body;
  const at = rig.ops.findIndex((o) => o.part === "body");
  if (!body || at < 0) return null;
  const op = rig.ops[at];
  const s = op.shape;
  // A transformed body: its corners scaled with it.
  const kx = op.m ? Math.hypot(op.m[0], op.m[1]) : 1;
  const ky = op.m ? Math.hypot(op.m[2], op.m[3]) : 1;
  const [rx, ry] = s.kind === "rect" ? [s.rx * kx, s.ry * ky] : [22, 22];
  let after = op;
  let foot = body.y + body.h;
  for (let k = at + 1; k < rig.ops.length && rig.ops[k].part === "skin"; k++) {
    const o = rig.ops[k];
    if (!o.meltOver) continue;
    after = o;
    // A sheet hanging past the body: he stands at its hem, so the puddle forms under it.
    const shown = o.clips.reduce((y, c) => Math.min(y, c.box.y + c.box.h), o.box.y + o.box.h);
    foot = Math.max(foot, shown);
  }
  return {
    body,
    after,
    rx: Math.max(0, Math.min(rx, body.w / 2)),
    ry: Math.max(0, Math.min(ry, body.h / 2)),
    foot,
  };
}

/** A flush over a cheek: the same ellipse, a little wider and warmer. */
function blushOp(c: CanvasRenderingContext2D, op: Op, blush: number) {
  if (op.shape.kind !== "ellipse") return;
  const s = op.shape;
  const k = 1 + 0.25 * blush;
  c.globalAlpha = 0.55 * blush;
  c.fillStyle = "#fb7185";
  c.beginPath();
  c.ellipse(s.cx, s.cy, s.rx * k, s.ry * k, 0, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
}

/**
 * A highlight near the top and a rim of shade, clipped to the body, that slide
 * the other way when the face turns (Coucou's prototype does the same on Mochi).
 */
function shadeBody(c: CanvasRenderingContext2D, op: Op, body: Box, look: Look) {
  const p = artPath(op.shape, op.m);
  if (!p) return;
  c.save();
  c.clip(p);
  const hx = body.x + body.w * 0.28 - look.yaw * body.w * 0.22;
  const hy = body.y + body.h * 0.17 - look.pitch * 0.9;
  const hl = c.createRadialGradient(hx, hy, 0, hx, hy, body.w * 0.28);
  hl.addColorStop(0, "rgba(255,255,255,0.34)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = hl;
  c.fillRect(body.x - 8, body.y - 8, body.w + 16, body.h + 16);
  const sx = body.x + body.w / 2 + look.yaw * body.w * 0.17;
  const sy = body.y + body.h * 0.46;
  const sh = c.createRadialGradient(sx, sy, body.w * 0.36, sx, sy, body.w * 0.78);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(0,0,0,0.2)");
  c.fillStyle = sh;
  c.fillRect(body.x - 8, body.y - 8, body.w + 16, body.h + 16);
  c.restore();
}

/**
 * Pyjamas: soft stripes down the body, clipped to it and under the face, with
 * two buttons below the mouth. White at a low alpha: they read on any colour
 * the trader picked, and in every mood's own.
 */
function drawPyjamas(c: CanvasRenderingContext2D, op: Op, body: Box) {
  const p = artPath(op.shape, op.m);
  if (!p) return;
  c.save();
  c.clip(p);
  const step = body.w / 6;
  for (let i = 0; i < 6; i++) {
    const x = body.x + step * (i + 0.5);
    c.fillStyle = "rgba(255,255,255,0.3)";
    c.fillRect(x - step * 0.22, body.y - 4, step * 0.44, body.h + 8);
    // A fine line beside each stripe, as on cotton pyjamas.
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(x + step * 0.36, body.y - 4, step * 0.07, body.h + 8);
  }
  c.restore();
  // Two buttons down the front, under the mouth.
  const x = body.x + body.w / 2;
  for (const y of [body.y + body.h * 0.86, body.y + body.h * 0.97]) {
    if (y > body.y + body.h - 2) continue;
    c.beginPath();
    c.arc(x, y, body.w * 0.035, 0, Math.PI * 2);
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = "rgba(11,31,18,0.55)";
    c.stroke();
  }
}

/**
 * A melt value at `level` (0–1) from its value at each of the three stages
 * (level 1/3, 2/3 and 1, see melt.ts → MELT_LEVELS), straight lines between.
 */
function atLevel(level: number, stages: readonly [number, number, number]): number {
  const keys = [0, ...stages];
  const x = Math.max(0, Math.min(1, level)) * 3;
  const i = Math.min(2, Math.floor(x));
  return keys[i] + (keys[i + 1] - keys[i]) * (x - i);
}

/** A drip of wax: where it hangs from, how wide, and how far it has run at each stage. */
interface Drip {
  /** Across the body, 0 (left edge) to 1 (right edge). */
  at: number;
  w: number;
  /** Its length at stages 1, 2 and 3, in body heights (0: not there yet). */
  len: readonly [number, number, number];
  /** Down a side, from the rim of the pool (else down the front, from under the pool). */
  side?: boolean;
}

/**
 * Stage 1, a little: short runs over the rim. Stage 2, more: the runs down
 * his sides reach his cheeks, one runs down between the eyes. Stage 3, a lot:
 * a run beside his left eye goes all the way down into a puddle at his foot,
 * one beside his right eye nearly as far, the side runs to his lower corners.
 * The front runs keep to the lanes between and beside the eyes.
 */
const DRIPS: Drip[] = [
  { at: 0, w: 8.5, len: [0.14, 0.3, 0.46], side: true },
  { at: 1, w: 7.5, len: [0.08, 0.2, 0.36], side: true },
  { at: 0.5, w: 7, len: [0.08, 0.26, 0.34] },
  { at: 0.15, w: 7, len: [0, 0.2, 0.76] },
  { at: 0.87, w: 6.5, len: [0.06, 0.12, 0.55] },
];

/** The pool over his top: how far down the front it reaches at each stage, art units. */
const POOL_DEPTH = [7, 10, 13] as const;
/** The puddle at his foot starts this far into the last stage (level, 0–1). */
const MELT_PUDDLE_FROM = 0.72;

/** The outline of Candy's body (gen-placeholder-mascot.mjs → RIM): the wax and the bed are drawn in it. */
const RIM = "#06140b";

/**
 * Candy melting on a strong drop: a pool of wax over his top, a little paler
 * than the body, running down in drips that grow stage by stage with `level`
 * (0–1) and end in a drop; at the last stage the longest run reaches a puddle
 * at his foot. Drawn as one shape outlined like the body (every outline under
 * every fill), over the body (or a sheet over it, see meltSeat) and under the
 * face, its corners as round as the body's.
 */
function drawMelt(c: CanvasRenderingContext2D, seat: MeltSeat, look: Look, level: number) {
  const b = seat.body;
  const { rx, ry } = seat;
  // The drips run as far down as he stands (a sheet's hem hangs lower than his body).
  const tall = seat.foot - b.y;
  const e = 1.4;
  const [x0, x1, y0, RX, RY] = [b.x - e, b.x + b.w + e, b.y - e, rx + e, ry + e];
  const depth = atLevel(level, POOL_DEPTH);
  const rim = b.y + ry * 0.95;
  const pool = new Path2D();
  pool.moveTo(x0, rim);
  pool.lineTo(x0, y0 + RY);
  pool.ellipse(x0 + RX, y0 + RY, RX, RY, 0, Math.PI, Math.PI * 1.5);
  pool.lineTo(x1 - RX, y0);
  pool.ellipse(x1 - RX, y0 + RY, RX, RY, 0, Math.PI * 1.5, Math.PI * 2);
  pool.lineTo(x1, rim);
  // Its lower edge, right to left: down over the corner, a slow wave across the front.
  const inner = b.x + b.w - rx;
  pool.quadraticCurveTo(x1 - 1, b.y + depth + 2, inner, b.y + depth);
  const mid = b.x + b.w / 2;
  pool.quadraticCurveTo((inner + mid) / 2, b.y + depth - 3, mid, b.y + depth + 1);
  pool.quadraticCurveTo((mid + b.x + rx) / 2, b.y + depth + 4, b.x + rx, b.y + depth - 1);
  pool.quadraticCurveTo(x0 + 1, b.y + depth + 2, x0, rim);
  pool.closePath();
  /** The pool's top edge at `x`: down the round of a corner, flat between. */
  const edge = (x: number) => {
    const cx = Math.min(Math.max(x, x0 + RX), x1 - RX);
    const u = Math.min(1, Math.abs(x - cx) / Math.max(RX, 0.001));
    return y0 + RY - RY * Math.sqrt(1 - u * u);
  };

  const shapes = [pool];
  let longest: { x: number; top: number; end: number; w: number } | null = null;
  for (const d of DRIPS) {
    const len = atLevel(level, d.len) * tall;
    if (len < 1) continue;
    const x = b.x + b.w * d.at;
    // A run down the front starts inside the pool, never above its round top.
    const outer = d.at < 0.5 ? x - d.w / 2 : x + d.w / 2;
    const top = d.side ? rim - 8 : Math.max(b.y + 2, edge(outer) + 2.5);
    const end = (d.side ? rim : b.y + depth + 2) + len;
    const p = new Path2D();
    // A run down a side hangs half off the body: its outer top is round, wax rolling over the edge.
    const r = d.w / 2;
    p.roundRect(x - r, top, d.w, end - top, d.side ? (d.at < 0.5 ? [r, 0, r, r] : [0, r, r, r]) : [0, 0, r, r]);
    // A drop gathering at its tip.
    p.moveTo(x + d.w * 0.6, end - d.w * 0.45);
    p.arc(x, end - d.w * 0.45, d.w * 0.6, 0, Math.PI * 2);
    shapes.push(p);
    // Its glint starts under the pool.
    if (!longest || end > longest.end) longest = { x, top: d.side ? rim : b.y + depth + 4, end, w: d.w };
  }
  // The last stage: the wax that ran off pools at his foot, around the wick.
  const puddle = Math.max(0, (level - MELT_PUDDLE_FROM) / (1 - MELT_PUDDLE_FROM));
  if (puddle > 0.02) {
    // A soft blob, lumpy on top, in front of his bottom edge.
    const cx = b.x + b.w / 2;
    const cy = seat.foot + 1;
    const px = (b.w / 2 + 6) * puddle;
    const py = 7 * puddle;
    const p = new Path2D();
    p.moveTo(cx - px, cy + py * 0.2);
    p.quadraticCurveTo(cx - px, cy - py * 0.9, cx - px * 0.55, cy - py * 0.75);
    p.quadraticCurveTo(cx - px * 0.3, cy - py * 1.25, cx, cy - py);
    p.quadraticCurveTo(cx + px * 0.35, cy - py * 0.7, cx + px * 0.6, cy - py * 0.95);
    p.quadraticCurveTo(cx + px, cy - py * 0.8, cx + px, cy + py * 0.2);
    p.quadraticCurveTo(cx + px * 0.9, cy + py, cx, cy + py);
    p.quadraticCurveTo(cx - px * 0.9, cy + py, cx - px, cy + py * 0.2);
    p.closePath();
    shapes.push(p);
  }

  const pal = look.palette;
  const wax = pal ? css(mixRGB(pal.top, [255, 255, 255], 0.38)) : "#fef3c7";
  c.save();
  c.globalAlpha = Math.min(1, level / 0.12);
  c.strokeStyle = RIM;
  c.lineWidth = 4;
  c.lineJoin = "round";
  for (const p of shapes) c.stroke(p);
  c.fillStyle = wax;
  for (const p of shapes) c.fill(p);
  // A glint on the pool, along the round of its top left corner, and down the longest run.
  c.strokeStyle = "rgba(255,255,255,0.6)";
  c.lineWidth = 2;
  c.lineCap = "round";
  const [gx, gy] = [Math.max(rx, 12), Math.max(ry, 12)];
  const glint = (dx: number, dy: number): [number, number] => [b.x + gx + (dx * gx) / 22, b.y + gy + (dy * gy) / 22];
  c.beginPath();
  c.moveTo(...glint(-13, -16));
  c.quadraticCurveTo(...glint(-9, -20.5), ...glint(0, -21));
  c.stroke();
  if (longest && longest.end - longest.top > 12) {
    const x = longest.x - longest.w * 0.15;
    c.beginPath();
    c.moveTo(x, longest.top);
    c.lineTo(x, longest.end - longest.w);
    c.stroke();
  }
  c.restore();
}

/**
 * A little bed in the island (nap.ts), in the 128-unit art box, still while he
 * breathes: `back` is the headboard and the pillow behind him, `front` the
 * blanket tucked up to his chin. `k` (0–1, a spring past 1) brings it in from
 * below.
 */
export function drawBed(c: CanvasRenderingContext2D, part: "back" | "front", k: number) {
  if (k <= 0.001) return;
  c.save();
  c.globalAlpha = Math.min(1, k);
  c.translate(0, (1 - k) * 26);
  c.lineJoin = "round";
  c.strokeStyle = RIM;
  if (part === "back") {
    // The headboard: a panel between two posts with round knobs.
    const wood = c.createLinearGradient(0, 22, 0, 118);
    wood.addColorStop(0, "#c98a55");
    wood.addColorStop(1, "#8d5631");
    c.fillStyle = wood;
    c.lineWidth = 3.5;
    c.beginPath();
    c.roundRect(14, 24, 100, 94, [18, 18, 3, 3]);
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(255,236,214,0.35)";
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(21, 31, 86, 80, [13, 13, 2, 2]);
    c.stroke();
    c.strokeStyle = RIM;
    c.lineWidth = 3;
    c.fillStyle = "#a96d40";
    for (const x of [6, 110]) {
      c.beginPath();
      c.roundRect(x, 20, 12, 104, 5);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(x + 6, 17, 6.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // The pillow, behind his head.
    c.fillStyle = "#f8fafc";
    c.beginPath();
    c.roundRect(16, 32, 96, 30, 14);
    c.fill();
    c.stroke();
    c.strokeStyle = "#cbd5e1";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(26, 47);
    c.quadraticCurveTo(64, 52, 102, 47);
    c.stroke();
  } else {
    // The blanket, tucked up to his chin: a sheet folded over its top edge, dots on it.
    const top = 86;
    const blanket = new Path2D();
    blanket.moveTo(6, top + 3);
    blanket.quadraticCurveTo(64, top - 3, 122, top + 3);
    blanket.lineTo(123, 116);
    blanket.quadraticCurveTo(123, 122, 117, 122);
    blanket.lineTo(11, 122);
    blanket.quadraticCurveTo(5, 122, 5, 116);
    blanket.closePath();
    c.lineWidth = 3.5;
    c.fillStyle = "#60a5fa";
    c.fill(blanket);
    c.save();
    c.clip(blanket);
    c.fillStyle = "rgba(255,255,255,0.55)";
    for (let row = 0; row < 3; row++) {
      for (let x = 14 + (row % 2) * 9; x < 122; x += 18) {
        c.beginPath();
        c.arc(x, 103 + row * 7, 1.9, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.fillStyle = "#f8fafc";
    c.beginPath();
    c.moveTo(0, top + 3);
    c.quadraticCurveTo(64, top - 3, 128, top + 3);
    c.lineTo(128, top + 13);
    c.quadraticCurveTo(64, top + 7, 0, top + 13);
    c.fill();
    c.strokeStyle = "#cbd5e1";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, top + 13);
    c.quadraticCurveTo(64, top + 7, 128, top + 13);
    c.stroke();
    c.restore();
    c.strokeStyle = RIM;
    c.lineWidth = 3.5;
    c.stroke(blanket);
    // The foot of the bed, in front: a wooden rail (it hides the end of his wick).
    const rail = c.createLinearGradient(0, 114, 0, 132);
    rail.addColorStop(0, "#c98a55");
    rail.addColorStop(1, "#8d5631");
    c.fillStyle = rail;
    c.beginPath();
    c.roundRect(3, 114, 122, 18, 5);
    c.fill();
    c.stroke();
    c.strokeStyle = "rgba(255,236,214,0.4)";
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(10, 119.5);
    c.lineTo(118, 119.5);
    c.stroke();
  }
  c.restore();
}

/** Hearts, stars, sparks, a drop of sweat, a z: drawn where particles.ts put them. */
export function drawParticles(c: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    const a = alpha(p);
    if (a <= 0) continue;
    c.save();
    c.globalAlpha = a;
    c.translate(p.x, p.y);
    c.rotate(sway(p));
    c.strokeStyle = INK;
    c.lineWidth = 1.6;
    c.lineJoin = "round";
    if (p.kind === "heart") {
      heartPath(c, 0, 0, p.size);
      c.fillStyle = "#fb7185";
      c.fill();
      c.stroke();
    } else if (p.kind === "star") {
      starPath(c, 0, 0, 8 * p.size, p.rot);
      c.fillStyle = "#fde047";
      c.fill();
      c.stroke();
    } else if (p.kind === "spark") {
      starPath(c, 0, 0, 4.5 * p.size, p.rot, 4);
      c.fillStyle = "#fff7c2";
      c.fill();
    } else if (p.kind === "check") {
      // A green disc with a white tick: added.
      const r = 8 * p.size;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fillStyle = "#22c55e";
      c.fill();
      c.stroke();
      c.strokeStyle = "#fff";
      c.lineWidth = 2.4;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-r * 0.45, 0);
      c.lineTo(-r * 0.1, r * 0.35);
      c.lineTo(r * 0.5, -r * 0.35);
      c.stroke();
    } else if (p.kind === "sweat" || p.kind === "tear" || p.kind === "rain") {
      // A drop: sweat off the temple, a tear down the cheek, rain from the cloud.
      const s = p.kind === "rain" ? 0.55 : p.kind === "tear" ? 0.8 * p.size : 1;
      c.scale(s, s);
      c.beginPath();
      c.moveTo(0, -6);
      c.quadraticCurveTo(6, 2.5, 0, 6);
      c.quadraticCurveTo(-6, 2.5, 0, -6);
      c.fillStyle = p.kind === "rain" ? "#93c5fd" : "#7dd3fc";
      c.fill();
      if (p.kind !== "rain") c.stroke();
    } else if (p.kind === "confetti" || p.kind === "firework") {
      // A paper strip turning over as it falls, or a firework's spark.
      const color = CONFETTI[Math.floor(p.rot * 10) % CONFETTI.length];
      if (p.kind === "confetti") {
        c.rotate(p.rot + p.age * 6);
        c.scale(1, Math.abs(Math.cos(p.age * 9 + p.rot)) + 0.15);
        c.fillStyle = color;
        c.fillRect(-3 * p.size, -1.6 * p.size, 6 * p.size, 3.2 * p.size);
      } else {
        starPath(c, 0, 0, 3.6 * p.size, p.rot, 4);
        c.fillStyle = color;
        c.fill();
      }
    } else if (p.kind === "coin") {
      // A gold coin spinning on itself.
      c.scale(Math.abs(Math.cos(p.age * 8 + p.rot)) * 0.85 + 0.15, 1);
      c.beginPath();
      c.arc(0, 0, 6 * p.size, 0, Math.PI * 2);
      c.fillStyle = "#facc15";
      c.fill();
      c.lineWidth = 1.4;
      c.strokeStyle = "#a16207";
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 3.4 * p.size, 0, Math.PI * 2);
      c.strokeStyle = "#ca8a04";
      c.lineWidth = 1;
      c.stroke();
    } else if (p.kind === "cloud") {
      // A little grey cloud, bobbing.
      c.translate(0, Math.sin(p.age * 3) * 0.8);
      c.fillStyle = "#94a3b8";
      c.beginPath();
      c.arc(-8, 2, 6, 0, Math.PI * 2);
      c.arc(0, -2, 8, 0, Math.PI * 2);
      c.arc(8, 2, 6, 0, Math.PI * 2);
      c.rect(-8, 2, 16, 6);
      c.fill();
    } else if (p.kind === "smoke") {
      // A puff that spreads and greys as it rises.
      const k = Math.max(0, p.age) / p.life;
      c.fillStyle = `rgba(148,163,184,${0.55 * (1 - k)})`;
      c.beginPath();
      c.arc(0, 0, (2.5 + k * 6) * p.size, 0, Math.PI * 2);
      c.fill();
    } else if (p.kind === "flame") {
      // The wick lit: a flame that flickers, `size` big.
      c.rotate(-sway(p));
      const f = 1 + Math.sin(p.age * 23) * 0.08 + Math.sin(p.age * 37) * 0.05;
      const h = 11 * p.size * f;
      const w = 4.5 * p.size;
      const glow = c.createRadialGradient(0, -h * 0.35, 0, 0, -h * 0.35, h * 0.9);
      glow.addColorStop(0, "rgba(253,224,71,0.35)");
      glow.addColorStop(1, "rgba(253,224,71,0)");
      c.fillStyle = glow;
      c.fillRect(-h, -h * 1.3, h * 2, h * 1.6);
      const flame = (fw: number, fh: number, color: string) => {
        c.beginPath();
        c.moveTo(0, -fh);
        c.bezierCurveTo(fw * 1.1, -fh * 0.45, fw, 0, 0, 0);
        c.bezierCurveTo(-fw, 0, -fw * 1.1, -fh * 0.45, 0, -fh);
        c.fillStyle = color;
        c.fill();
      };
      flame(w, h, "#fb923c");
      flame(w * 0.55, h * 0.62, "#fde047");
    } else if (p.kind === "ha") {
      // A laugh's "ha": bold and bright, outlined in ink so it reads on any
      // island; about 14 px on the island's Candy (84 px for 128 units).
      const word = p.text ?? "ha";
      c.font = `900 ${22 * p.size}px system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineJoin = "round";
      c.lineWidth = 4.5;
      c.strokeText(word, 0, 0);
      c.fillStyle = "#fef08a";
      c.fillText(word, 0, 0);
    } else {
      // A z asleep, "…" bored, a note while dancing.
      c.fillStyle = p.kind === "note" ? "#c4b5fd" : "#cbd5e1";
      c.font = `800 ${13 * p.size}px system-ui, sans-serif`;
      c.fillText(p.kind === "note" ? (p.rot > 3 ? "♫" : "♪") : p.kind === "dots" ? "…" : "z", 0, 0);
    }
    c.restore();
  }
}

/** Confetti and firework colours: Candy's green, the up and down of the market, gold and two more. */
const CONFETTI = ["#4ade80", "#f87171", "#facc15", "#60a5fa", "#c084fc", "#fb923c"];

function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + 6 * s);
  c.bezierCurveTo(x - 10 * s, y - s, x - 6 * s, y - 9 * s, x, y - 4 * s);
  c.bezierCurveTo(x + 6 * s, y - 9 * s, x + 10 * s, y - s, x, y + 6 * s);
  c.closePath();
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, points = 5) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 === 0 ? r : r * 0.45;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/**
 * Where the mouth opens (drawMouth): an ellipse round (x, cy), under the
 * middle of the art's own mouth and down to the chin at most. A laugh's grin
 * is its lower half, flat along cy. Pure, so the costume tests can check what
 * it covers.
 */
export function mouthOpening(rig: Rig, body: Box, m: NonNullable<Look["mouth"]>) {
  const own = rig.ops.filter((o) => o.part === "mouth");
  const x = body.x + body.w / 2;
  const y = own.reduce((s, o) => s + centre(o.box).y, 0) / own.length || body.y + body.h * 0.71;
  const chin = body.y + body.h - 3;
  if (m.grin) {
    const top = y - 6;
    return { x, cy: top, rx: 15 + m.open * 3, ry: Math.max(4, Math.min(8 + m.open * 10, chin - top)) };
  }
  // Wide open: down to the chin, never past it (the spring overshoots); chewing: a small mouth working.
  const cy = Math.min(y + m.open * 4, chin - 1);
  const rx = m.chew > 0 ? 9 : 7 + m.open * 8;
  const ry = Math.max(0, Math.min(m.chew > 0 ? 3 + m.chew * 5 : 2 + m.open * 18, chin - cy));
  return { x, cy, rx, ry };
}

/** A mouth open wide (swallowing), or chewing, where the art's mouth was. */
function drawMouth(c: CanvasRenderingContext2D, rig: Rig, body: Box, look: Look) {
  const m = look.mouth!;
  const ink = rig.ops.find((o) => o.part === "mouth" && o.stroke)?.stroke ?? INK;
  const { x, cy, rx, ry } = mouthOpening(rig, body, m);
  if (m.grin) {
    // A laugh: a big "D" from cheek to cheek, flat along the top, a row of
    // teeth under it and the tongue showing: wider and deeper than any smile.
    const top = cy;
    c.save();
    turnTo(c, x, body, look);
    c.beginPath();
    c.ellipse(x, top, rx, ry, 0, 0, Math.PI);
    c.closePath();
    haloRing(c, rig);
    c.fillStyle = ink;
    c.fill();
    c.clip();
    c.fillStyle = "#fb7185";
    c.beginPath();
    c.ellipse(x, top + ry, rx * 0.58, ry * 0.55, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffffff";
    c.fillRect(x - rx, top - 1, rx * 2, 1 + Math.max(1.8, ry * 0.3));
    c.restore();
    return;
  }
  c.save();
  turnTo(c, x, body, look);
  c.fillStyle = ink;
  c.beginPath();
  c.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2);
  haloRing(c, rig);
  c.fill();
  if (m.open > 0.3) {
    c.fillStyle = "#fb7185";
    c.beginPath();
    c.ellipse(x, cy + ry * 0.45, rx * 0.55, ry * 0.35, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** The body's colour of the moment: the mood's, or the art's own. */
function bodyColor(rig: Rig, look: Look): string {
  if (look.palette) return css(look.palette.bottom);
  const op = rig.ops.find((o) => o.part === "body" && o.fill);
  const f = op?.fill;
  if (!f) return "#4ade80";
  return "color" in f ? f.color : (f.gradient.stops.at(-1)?.color ?? "#4ade80");
}

/**
 * Two little hands out from behind the body, as Coucou's Mochi has for its
 * hello (MIT, © Louis Raillé): a round one on the left that waves, a capsule
 * on the right that rests. `k` is how far out they are (0–1); `wave` the
 * seconds the left one has been waving, or negative.
 */
export function drawHands(c: CanvasRenderingContext2D, rig: Rig, look: Look, k: number, wave: number) {
  const body = rig.body;
  if (!body || k <= 0.01) return;
  const fill = bodyColor(rig, look);
  // Outlined like the body: the art's darkest stroke, or Candy's ink.
  const outline = rig.ops.find((o) => o.part === "body" && o.stroke && o.strokeWidth > 0);
  c.save();
  c.fillStyle = fill;
  c.strokeStyle = outline?.stroke ?? INK;
  c.lineWidth = outline?.strokeWidth ?? 2.5;
  // The waving hand: up and down five times a second, easing in.
  const r = body.w * 0.15 * k;
  const lx = lerp(body.x + body.w * 0.22, body.x - body.w * 0.1, k);
  let ly = lerp(body.y + body.h * 0.82, body.y + body.h * 0.5, k);
  if (wave >= 0) ly += Math.sin(wave * 2 * Math.PI * 5) * body.h * 0.08 * Math.min(1, wave / 0.08);
  c.beginPath();
  c.ellipse(lx, ly, r, r, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // The resting hand: a capsule, breathing a little while the other waves.
  const len = body.h * 0.34 * k;
  const thick = body.w * 0.22 * k;
  const ang = -0.61 + (wave >= 0 ? Math.sin(wave * 2 * Math.PI * 2.5) * 0.04 : 0);
  c.translate(lerp(body.x + body.w * 0.78, body.x + body.w + body.w * 0.08, k), lerp(body.y + body.h * 0.82, body.y + body.h * 0.55, k));
  c.rotate(ang);
  c.beginPath();
  c.roundRect(-len / 2, -thick / 2, len, thick, thick / 2);
  c.fill();
  c.stroke();
  c.restore();
}

/** The box around every shape of a rig. */
export function rigBox(rig: Rig): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { box: b } of rig.ops) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * A ring round the mouth opened wide (drawMouth), in the halo the art draws
 * under its mouth (rig.ts → mouthHalo): strokes the path being drawn, before
 * the fill that covers its inner half. Nothing when the art has no halo.
 */
function haloRing(c: CanvasRenderingContext2D, rig: Rig) {
  const halo = mouthHalo(rig);
  if (!halo) return;
  c.strokeStyle = halo;
  c.lineWidth = 3.6;
  c.lineJoin = "round";
  c.stroke();
}
