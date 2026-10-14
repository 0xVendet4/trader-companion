// Reads the mascot's SVG art into shapes the canvas can draw one by one, so
// the face can turn, blink and open its mouth (see mascot.ts and paint.ts).
// Pure: no DOM, tested in node. It reads plain shapes, groups, transforms and
// clip-paths — Candy's own frames and the costumes, which mirror, rotate and
// clip their parts. Art it can't take apart (images, masks, filters…) gets no
// rig, and is drawn as a picture instead: it still works, it just doesn't turn
// its face.

export type Part = "back" | "body" | "skin" | "face" | "mouth" | "front" | "eyes";

export interface Gradient {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: { offset: number; color: string; opacity: number }[];
}

export type Paint = { color: string } | { gradient: Gradient } | null;

export type Shape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; ry: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "path"; d: string }
  | { kind: "text"; x: number; y: number; text: string; size: number; family: string; weight: string; anchor: string };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An affine transform [a, b, c, d, e, f], as canvas and SVG write it: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

/** A clip-path, placed: its shapes, each with the transform it is drawn under, and the box they cover. */
export interface Clip {
  shapes: { shape: Shape; m: Matrix | null }[];
  box: Box;
}

export interface Op {
  shape: Shape;
  fill: Paint;
  stroke: string | null;
  strokeWidth: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  /** opacity × fill-opacity, for the fill; opacity × stroke-opacity, for the stroke. */
  fillAlpha: number;
  strokeAlpha: number;
  /** paint-order="stroke": the outline goes under the fill. */
  strokeUnder: boolean;
  /** Where it lands on the art, after its transform. */
  box: Box;
  /** Its own box before the transform: what a gradient's 0–1 coordinates span. */
  lbox: Box;
  /** The transform it is drawn under (its groups' and its own); null: none. */
  m: Matrix | null;
  /** The clip-paths it is drawn inside, outermost first. */
  clips: Clip[];
  /** What it moves with when the face turns: its clip's box when clipped (the clipped group moves as one), else its own. */
  pivot: Box;
  part: Part;
  /**
   * Skin his wax runs over when he melts (paint.ts → meltSeat): a sheet over
   * the body, a costume's white face. The art says so: data-melt="over" on
   * the shape or its group.
   */
  meltOver?: true;
}

export interface Rig {
  /** The viewBox size (Candy's art is 128 × 128). */
  w: number;
  h: number;
  ops: Op[];
  /** The body (the biggest shape), what the face turns around; null: no face to turn. */
  body: Box | null;
}

type Pt = [number, number];

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;
/** Elements a rig is made of; anything else in the art means "draw it as a picture". */
const SHAPES = new Set(["rect", "ellipse", "circle", "path", "polygon", "polyline", "line", "text"]);
const CONTAINERS = new Set(["svg", "defs", "linearGradient", "stop", "title", "desc"]);
/** Presentation attributes a group hands down to what it holds (opacity multiplies instead), and the melt's mark (Op.meltOver). */
const INHERITED = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "paint-order", "fill-opacity", "stroke-opacity", "data-melt"];
/** A face feature wider than this share of the body is skin (a mask, a pattern): it stays put when the face turns. */
const SKIN_W = 0.8;
const SKIN_H = 0.6;

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : d;
};

// ── Transforms ────────────────────────────────────────────────────────────────

/** `p · q`: q applies first, then p (SVG's parent · child). */
export function multiply(p: Matrix, q: Matrix): Matrix {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

export const applyMatrix = (m: Matrix | null, [x, y]: Pt): Pt => (m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y]);

const isIdentity = (m: Matrix) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

const TRANSFORM_FN = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

/** An SVG transform attribute as one matrix; null for one this does not read. */
export function parseTransform(s: string): Matrix | null {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of s.matchAll(TRANSFORM_FN)) {
    const n = (args.match(/-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let t: Matrix;
    if (fn === "matrix" && n.length === 6) t = n as Matrix;
    else if (fn === "translate" && n.length >= 1) t = [1, 0, 0, 1, n[0], n[1] ?? 0];
    else if (fn === "scale" && n.length >= 1) t = [n[0], 0, 0, n[1] ?? n[0], 0, 0];
    else if (fn === "rotate" && n.length >= 1) {
      const r = (n[0] * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === "skewX" && n.length === 1) t = [1, 0, Math.tan((n[0] * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY" && n.length === 1) t = [1, Math.tan((n[0] * Math.PI) / 180), 0, 1, 0, 0];
    else return null;
    m = multiply(m, t);
  }
  // Anything left over is not a transform this reads.
  if (s.replace(TRANSFORM_FN, "").replace(/[\s,]/g, "") !== "") return null;
  return m;
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Every coordinate a path visits (control points included): enough for its box. */
export function pathPoints(d: string): Pt[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const next = () => parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === "Z") {
      x = sx;
      y = sy;
      // Numbers straight after a Z: not a path this reads.
      if (isNum()) return pts;
      continue;
    }
    const at = (dx: number, dy: number): Pt => (rel ? [x + dx, y + dy] : [dx, dy]);
    if (C === "M" || C === "L" || C === "T") {
      const p = at(next(), next());
      [x, y] = p;
      pts.push(p);
      if (C === "M") {
        [sx, sy] = p;
        cmd = rel ? "l" : "L";
      }
    } else if (C === "H") {
      x = rel ? x + next() : next();
      pts.push([x, y]);
    } else if (C === "V") {
      y = rel ? y + next() : next();
      pts.push([x, y]);
    } else if (C === "Q" || C === "S") {
      const c1 = at(next(), next());
      const p = at(next(), next());
      pts.push(c1, p);
      [x, y] = p;
    } else if (C === "C") {
      const c1 = at(next(), next());
      const c2 = at(next(), next());
      const p = at(next(), next());
      pts.push(c1, c2, p);
      [x, y] = p;
    } else if (C === "A") {
      const rx = Math.abs(next());
      const ry = Math.abs(next());
      i += 3; // rotation, large-arc and sweep flags
      const p = at(next(), next());
      // The arc stays within its radii of both ends.
      pts.push([x - rx, y - ry], [x + rx, y + ry], [p[0] - rx, p[1] - ry], [p[0] + rx, p[1] + ry]);
      [x, y] = p;
    } else if (C !== "Z") {
      return pts; // unknown command: stop where it is
    }
    if (Number.isNaN(x) || Number.isNaN(y)) return pts.filter((p) => !Number.isNaN(p[0]) && !Number.isNaN(p[1]));
  }
  return pts;
}

function boxOf(pts: Pt[]): Box {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const corners = (b: Box): Pt[] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x, b.y + b.h],
  [b.x + b.w, b.y + b.h],
];

function pointsPath(points: string, close: boolean): { d: string; pts: Pt[] } {
  const n = (points.match(/-?(?:\d*\.\d+|\d+)/g) ?? []).map(Number);
  const pts: Pt[] = [];
  for (let k = 0; k + 1 < n.length; k += 2) pts.push([n[k], n[k + 1]]);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${p[0]} ${p[1]}`).join(" ") + (close ? " Z" : "");
  return { d, pts };
}

/** A shape element's outline and the points its box is made of, in its own coordinates. */
function geometry(name: string, a: Record<string, string>): { shape: Shape; pts: Pt[] } | null {
  if (name === "rect") {
    const [x, y, w, h] = [num(a.x), num(a.y), num(a.width), num(a.height)];
    const rx = num(a.rx, num(a.ry));
    const ry = num(a.ry, rx);
    return { shape: { kind: "rect", x, y, w, h, rx: Math.min(rx, w / 2), ry: Math.min(ry, h / 2) }, pts: corners({ x, y, w, h }) };
  }
  if (name === "ellipse" || name === "circle") {
    const [cx, cy] = [num(a.cx), num(a.cy)];
    const rx = name === "circle" ? num(a.r) : num(a.rx);
    const ry = name === "circle" ? num(a.r) : num(a.ry);
    return { shape: { kind: "ellipse", cx, cy, rx, ry }, pts: corners({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }) };
  }
  if (name === "path") return a.d ? { shape: { kind: "path", d: a.d }, pts: pathPoints(a.d) } : null;
  if (name === "line") {
    const pts: Pt[] = [
      [num(a.x1), num(a.y1)],
      [num(a.x2), num(a.y2)],
    ];
    return { shape: { kind: "path", d: `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]}` }, pts };
  }
  if (name === "polygon" || name === "polyline") {
    const p = pointsPath(a.points ?? "", name === "polygon");
    return { shape: { kind: "path", d: p.d }, pts: p.pts };
  }
  return null;
}

/** The centre of a box. */
export const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// ── Reading ───────────────────────────────────────────────────────────────────

/** What a group (or a shape's own attributes) puts its contents under. */
interface Frame {
  m: Matrix | null;
  inherit: Record<string, string>;
  opacity: number;
  clips: Clip[];
}

/** A shape read, before it is placed (box, transform, clips) and given its part. */
type Drawn = Omit<Op, "part" | "box" | "lbox" | "m" | "clips" | "pivot"> & { pts: Pt[] };

/** The frame an element's contents are drawn in: its parent's, then its own transform, clip and paint. Null: not readable. */
function frameFor(parent: Frame, a: Record<string, string>, clipDefs: Map<string, Clip>): Frame | null {
  let m = parent.m;
  if (a.transform) {
    const t = parseTransform(a.transform);
    if (!t) return null;
    m = m ? multiply(m, t) : t;
  }
  if (m && isIdentity(m)) m = null;
  let clips = parent.clips;
  const ref = a["clip-path"];
  if (ref && ref !== "none") {
    const id = /^url\(#([^)]+)\)$/.exec(ref.trim())?.[1];
    const def = id ? clipDefs.get(id) : undefined;
    if (!def) return null;
    // A clip is drawn in the user space of what uses it, its transform included.
    const shapes = def.shapes.map((s) => ({ shape: s.shape, m: m && s.m ? multiply(m, s.m) : (m ?? s.m) }));
    clips = [...clips, { shapes, box: boxOf(corners(def.box).map((p) => applyMatrix(m, p))) }];
  }
  const inherit = { ...parent.inherit };
  for (const k of INHERITED) if (a[k] != null) inherit[k] = a[k];
  return { m, inherit, opacity: parent.opacity * num(a.opacity, 1), clips };
}

/** A shape read, placed under its frame. */
function place(d: Drawn, frame: Frame): Omit<Op, "part"> {
  const { pts, ...rest } = d;
  const box = boxOf(pts.map((p) => applyMatrix(frame.m, p)));
  const pivot = frame.clips.length ? frame.clips[frame.clips.length - 1].box : box;
  return { ...rest, box, lbox: boxOf(pts), m: frame.m, clips: frame.clips, pivot };
}

/**
 * Parses one SVG file. `eyes`: an eyes layer, all of it turns with the face.
 * Returns null for art it can't take apart (see the top of the file).
 */
export function parseRig(svg: string, eyes = false): Rig | null {
  const gradients = new Map<string, Gradient>();
  const clipDefs = new Map<string, Clip>();
  const raw: Omit<Op, "part">[] = [];
  let w = 128;
  let h = 128;
  let grad: Gradient | null = null;
  let text: { a: Record<string, string>; frame: Frame; start: number } | null = null;
  const stack: Frame[] = [{ m: null, inherit: {}, opacity: 1, clips: [] }];
  /** A <clipPath> being read: its shapes go to it, not to the drawing. */
  let clipping: { id: string; m: Matrix | null; shapes: Clip["shapes"]; pts: Pt[] } | null = null;
  const closeClip = () => {
    if (!clipping) return;
    clipDefs.set(clipping.id, { shapes: clipping.shapes, box: boxOf(clipping.pts) });
    clipping = null;
  };

  for (const match of svg.matchAll(TAG)) {
    const [whole, closing, name, rawAttrs, selfClosing] = match;
    const a = attrs(rawAttrs);
    if (closing) {
      if (name === "linearGradient") grad = null;
      if (name === "g" && stack.length > 1) stack.pop();
      if (name === "clipPath") closeClip();
      if (name === "text" && text) {
        const content = svg.slice(text.start, match.index).trim();
        raw.push(place(textOp({ ...text.a, ...text.frame.inherit }, content, text.frame.opacity), text.frame));
        text = null;
      }
      continue;
    }
    if (a.filter || a.mask) return null;
    if (name === "svg") {
      const vb = (a.viewBox ?? "").split(/[\s,]+/).map(Number);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        if (vb[0] !== 0 || vb[1] !== 0) return null;
        [w, h] = [vb[2], vb[3]];
      }
      continue;
    }
    if (name === "linearGradient") {
      if (a.gradientUnits === "userSpaceOnUse" || a.gradientTransform || a.href || a["xlink:href"]) return null;
      grad = { x1: num(a.x1), y1: num(a.y1), x2: num(a.x2, 1), y2: num(a.y2), stops: [] };
      if (a.id) gradients.set(a.id, grad);
      if (selfClosing) grad = null;
      continue;
    }
    if (name === "stop") {
      if (grad) {
        const off = a.offset?.endsWith("%") ? num(a.offset) / 100 : num(a.offset);
        grad.stops.push({ offset: off, color: a["stop-color"] ?? "#000", opacity: num(a["stop-opacity"], 1) });
      }
      continue;
    }
    if (name === "clipPath") {
      if (!a.id || a.clipPathUnits === "objectBoundingBox") return null;
      const own = a.transform ? parseTransform(a.transform) : null;
      if (a.transform && !own) return null;
      clipping = { id: a.id, m: own, shapes: [], pts: [] };
      if (selfClosing) closeClip();
      continue;
    }
    if (CONTAINERS.has(name)) continue;
    if (name !== "g" && !SHAPES.has(name)) return null;

    if (clipping) {
      // A clip's shape: only its outline counts.
      const geo = name === "g" || name === "text" ? null : geometry(name, a);
      if (!geo) return null;
      const t = a.transform ? parseTransform(a.transform) : null;
      if (a.transform && !t) return null;
      const m = clipping.m && t ? multiply(clipping.m, t) : (clipping.m ?? t);
      clipping.shapes.push({ shape: geo.shape, m });
      clipping.pts.push(...geo.pts.map((p) => applyMatrix(m, p)));
      continue;
    }

    const frame = frameFor(stack[stack.length - 1], a, clipDefs);
    if (!frame) return null;
    if (name === "g") {
      if (!selfClosing) stack.push(frame);
      continue;
    }
    if (name === "text") {
      if (!selfClosing) text = { a, frame, start: match.index + whole.length };
      continue;
    }
    const op = shapeOp(name, { ...a, ...frame.inherit }, gradients, frame.opacity);
    if (!op) return null;
    raw.push(place(op, frame));
  }
  if (!raw.length) return null;

  if (eyes) return { w, h, ops: raw.map((o) => ({ ...o, part: "eyes" as Part })), body: null };

  // The body: the biggest rectangle, if it is big enough to be one.
  let bodyAt = -1;
  let best = 0;
  raw.forEach((o, k) => {
    const area = o.box.w * o.box.h;
    if (o.shape.kind === "rect" && !o.clips.length && area > best) {
      best = area;
      bodyAt = k;
    }
  });
  if (best < w * h * 0.15) bodyAt = -1;
  const body = bodyAt >= 0 ? raw[bodyAt].box : null;
  const ops: Op[] = raw.map((o, k) => {
    if (!body) return { ...o, part: "body" };
    if (k < bodyAt) return { ...o, part: "back" };
    if (k === bodyAt) return { ...o, part: "body" };
    const p = o.pivot;
    const c = centre(p);
    // Over the body: the face; out past its edge (a sign held up): in front.
    if (c.x < body.x || c.x > body.x + body.w || c.y < body.y || c.y > body.y + body.h) return { ...o, part: "front" };
    // As wide as the body (a mask, a costume's pattern): skin, it stays put.
    if (p.w > body.w * SKIN_W || p.h > body.h * SKIN_H) return { ...o, part: "skin" };
    const bodyX = body.x + body.w / 2;
    const mouth = c.y > body.y + body.h * 0.6 && Math.abs(c.x - bodyX) < body.w * 0.22;
    return { ...o, part: mouth ? "mouth" : "face" };
  });
  return { w, h, ops, body };
}

/**
 * Arms of its own: a shape beside the body (not above or below it, as the
 * candle's wick is). The costumes have them, so the hello waves their arm
 * instead of drawing little hands behind it.
 */
export function hasArms(rig: Rig): boolean {
  const b = rig.body;
  if (!b) return false;
  return rig.ops.some((o) => {
    if (o.part !== "back" && o.part !== "front") return false;
    const c = centre(o.box);
    return (c.x < b.x || c.x > b.x + b.w) && c.y > b.y && c.y < b.y + b.h;
  });
}

function paintOf(v: string | undefined, gradients: Map<string, Gradient>, dflt: Paint): Paint | undefined {
  if (v == null) return dflt;
  if (v === "none" || v === "transparent") return null;
  const ref = /^url\(#([^)]+)\)$/.exec(v.trim());
  if (ref) {
    const g = gradients.get(ref[1]);
    return g ? { gradient: g } : undefined;
  }
  return { color: v };
}

function shapeOp(name: string, a: Record<string, string>, gradients: Map<string, Gradient>, opacity: number): Drawn | null {
  const geo = geometry(name, a);
  if (!geo) return null;
  const fill = paintOf(a.fill, gradients, name === "line" || name === "polyline" ? null : { color: "#000" });
  if (fill === undefined) return null;
  const stroke = a.stroke && a.stroke !== "none" ? a.stroke : null;
  if (stroke?.startsWith("url(")) return null;
  return {
    shape: geo.shape,
    fill,
    stroke,
    strokeWidth: num(a["stroke-width"], 1),
    cap: (a["stroke-linecap"] as CanvasLineCap) ?? "butt",
    join: (a["stroke-linejoin"] as CanvasLineJoin) ?? "miter",
    fillAlpha: opacity * num(a["fill-opacity"], 1),
    strokeAlpha: opacity * num(a["stroke-opacity"], 1),
    strokeUnder: (a["paint-order"] ?? "").trim().startsWith("stroke"),
    ...(a["data-melt"] === "over" ? { meltOver: true as const } : {}),
    pts: geo.pts,
  };
}

function textOp(a: Record<string, string>, content: string, opacity: number): Drawn {
  const size = num(a["font-size"], 12);
  const x = num(a.x);
  const y = num(a.y);
  const anchor = a["text-anchor"] ?? "start";
  const width = content.length * size * 0.6;
  const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
  return {
    shape: { kind: "text", x, y, text: content, size, family: a["font-family"] ?? "sans-serif", weight: a["font-weight"] ?? "normal", anchor },
    fill: a.fill === "none" ? null : { color: a.fill ?? "#000" },
    stroke: null,
    strokeWidth: 0,
    cap: "butt",
    join: "miter",
    fillAlpha: opacity,
    strokeAlpha: 1,
    strokeUnder: false,
    pts: corners({ x: left, y: y - size, w: width, h: size }),
  };
}

/**
 * Where a face feature centred at x lands when the head turns by `yaw`
 * (radians): the body is taken as a cylinder of its own width, so a feature
 * slides across it and narrows as it turns away — the face reads as round.
 */
export function turnFeature(x: number, body: Box, yaw: number): { x: number; scale: number } {
  const r = body.w / 2 + 4;
  const mid = body.x + body.w / 2;
  const a0 = Math.asin(Math.max(-0.99, Math.min(0.99, (x - mid) / r)));
  const a = a0 + yaw;
  return { x: mid + r * Math.sin(a), scale: Math.max(0.12, Math.cos(a)) / Math.cos(a0) };
}

/** The colours a change of mood fades between: the body's gradient ends and the wick's fill. */
export interface Palette {
  top: string;
  bottom: string;
  wick: string | null;
}

export function paletteOf(rig: Rig): Palette | null {
  const body = rig.ops.find((o) => o.part === "body");
  const g = body?.fill && "gradient" in body.fill ? body.fill.gradient : null;
  if (!g || g.stops.length < 2) return null;
  return { top: g.stops[0].color, bottom: g.stops[g.stops.length - 1].color, wick: wickOf(rig)?.color ?? null };
}

/** The cheeks: a pair of flat face ellipses mirrored across the body's middle (they blush). */
export function cheeksOf(rig: Rig): Op[] {
  if (!rig.body) return [];
  const mid = rig.body.x + rig.body.w / 2;
  const flat = rig.ops.filter((o) => o.part === "face" && o.shape.kind === "ellipse" && o.shape.ry < o.shape.rx);
  return flat.filter((o) => {
    const c = centre(o.box);
    return flat.some((t) => {
      const u = centre(t.box);
      return t !== o && Math.abs(u.x - (2 * mid - c.x)) < 1 && Math.abs(u.y - c.y) < 1;
    });
  });
}

/** The wick: a tall thin solid shape behind the body, through its middle. */
export function wickOf(rig: Rig): { op: Op; color: string } | null {
  if (!rig.body) return null;
  const mid = rig.body.x + rig.body.w / 2;
  for (const op of rig.ops) {
    if (op.part !== "back" || !op.fill || !("color" in op.fill)) continue;
    const c = centre(op.box);
    if (op.box.h > rig.body.h && op.box.w < rig.body.w * 0.3 && Math.abs(c.x - mid) < 4) return { op, color: op.fill.color };
  }
  return null;
}

/** How light a colour (#rgb or #rrggbb) is, 0–1 (relative luminance); null for anything else. */
function lightness(color: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A halo under the mouth: a lighter, wider copy of one of its lines, drawn
 * under it (the bee's, in the face's own colour, so its mouth reads where it
 * meets a dark stripe). The ink is the first line's colour: the engine fills
 * a mouth it opens with it (paint.ts → drawMouth), and rings it in the halo.
 * Null: none, the open mouth has no ring.
 */
export function mouthHalo(rig: Rig): string | null {
  let halo = halos.get(rig);
  if (halo === undefined) halos.set(rig, (halo = findHalo(rig)));
  return halo;
}

const halos = new WeakMap<Rig, string | null>();

function findHalo(rig: Rig): string | null {
  const lines = rig.ops.filter((o) => o.part === "mouth" && o.stroke && o.strokeWidth > 0);
  const ink = lines.length ? lightness(lines[0].stroke!) : null;
  if (ink === null) return null;
  return (
    lines.find((o, k) => {
      const l = lightness(o.stroke!);
      if (l === null || l - ink < 0.3) return false;
      const shape = JSON.stringify(o.shape);
      return lines.slice(k + 1).some((d) => d.strokeWidth < o.strokeWidth && JSON.stringify(d.shape) === shape && lightness(d.stroke!) === ink);
    })?.stroke ?? null
  );
}
