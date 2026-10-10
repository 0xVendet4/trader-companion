// Draws a rig (see rig.ts) on a canvas, shape by shape: the face turned toward
// the cursor, the body in the colours of the moment, the mouth opened wide when
// Candy swallows something. The turning follows Coucou's Mochi engine (MIT,
// © Louis Raillé): features slide across the body as if it were round.

import { alpha, sway, type Particle } from "./particles";
import { centre, cheeksOf, turnFeature, type Box, type Clip, type Matrix, type Op, type Rig, type Shape } from "./rig";

/** Colours as [r, g, b], 0–255. */
export type RGB = [number, number, number];

export interface Look {
  /** The face's turn, radians; positive: toward the right. */
  yaw: number;
  /** How far the face drops (or rises, negative), in art units. */
  pitch: number;
  /** The body's colours of the moment, over the art's own (a change of mood fades). */
  palette?: { top: RGB; bottom: RGB; wick: RGB | null } | null;
  /** The mouth wide open (0–1) or chewing (0–1): drawn in place of the art's mouth. */
  mouth?: { open: number; chew: number } | null;
  /** The cheeks flushed (0–1): a warmer, wider blush over the art's own. */
  blush?: number;
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
  for (const op of rig.ops) {
    if (!keep(op)) continue;
    if (op.part === "mouth" && look.mouth) continue;
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
    if (op.part === "body" && body && body === rig.body) shadeBody(c, op, body, look);
  }
  if (look.mouth && body && rig.ops.some((o) => o.part === "mouth")) drawMouth(c, rig, body, look);
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
    } else if (p.kind === "sweat") {
      c.beginPath();
      c.moveTo(0, -6);
      c.quadraticCurveTo(6, 2.5, 0, 6);
      c.quadraticCurveTo(-6, 2.5, 0, -6);
      c.fillStyle = "#7dd3fc";
      c.fill();
      c.stroke();
    } else {
      c.fillStyle = "#cbd5e1";
      c.font = `800 ${13 * p.size}px system-ui, sans-serif`;
      c.fillText("z", 0, 0);
    }
    c.restore();
  }
}

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

/** A mouth open wide (swallowing), or chewing, where the art's mouth was. */
function drawMouth(c: CanvasRenderingContext2D, rig: Rig, body: Box, look: Look) {
  const m = look.mouth!;
  const own = rig.ops.filter((o) => o.part === "mouth");
  const x = body.x + body.w / 2;
  const y = own.reduce((s, o) => s + centre(o.box).y, 0) / own.length || body.y + body.h * 0.71;
  const ink = own.find((o) => o.stroke)?.stroke ?? INK;
  // Wide open: down to the chin, never past it (the spring overshoots); chewing: a small mouth working.
  const chin = body.y + body.h - 3;
  const cy = Math.min(y + m.open * 4, chin - 1);
  const rx = m.chew > 0 ? 9 : 7 + m.open * 8;
  const ry = Math.max(0, Math.min(m.chew > 0 ? 3 + m.chew * 5 : 2 + m.open * 18, chin - cy));
  c.save();
  turnTo(c, x, body, look);
  c.fillStyle = ink;
  c.beginPath();
  c.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2);
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
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
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
