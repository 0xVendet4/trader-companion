/// <reference types="node" />
// The face accessories: every one the wardrobe offers has its art, and the
// newer ones sit where they belong in every mood, on Candy and on every
// costume: what goes over the eyes covers them (looking around included),
// what goes in the mouth sits on the mouth. Accessories are drawn as pictures
// over the frame (mascot.ts → drawTop); here their shapes are read with the
// rig's parser and measured against the eyes and mouths they go over.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FACE_IDS, normalizeSettings } from "../core/state";
import { MASCOT_STATES, dressed, mouthShift, type Manifest, type StateDef } from "./mascot";
import { piecesOf } from "./pieces";
import { applyMatrix, centre, parseRig, type Op } from "./rig";

const DIR = join(__dirname, "..", "..", "public", "mascot");
const art = (f: string) => readFileSync(join(DIR, f), "utf8");
const manifest = JSON.parse(art("mascot.json")) as Manifest & { costumes: Record<string, { states: Record<string, StateDef> }> };

type Pt = [number, number];

/** How far the pupils wander on top of the face's turn (mascot.ts PUPIL_X, PUPIL_Y). */
const GAZE: Pt[] = [
  [0, 0],
  [2.2, 1.6],
  [-2.2, 1.6],
  [2.2, -1.6],
  [-2.2, -1.6],
];

/** An SVG arc, as points (the endpoint parametrisation of the SVG spec, turned to centre and angles). */
function arcPoints([x1, y1]: Pt, rx: number, ry: number, deg: number, large: boolean, sweep: boolean, [x2, y2]: Pt): Pt[] {
  if (!rx || !ry) return [[x2, y2]];
  const phi = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const xp = (cos * (x1 - x2)) / 2 + (sin * (y1 - y2)) / 2;
  const yp = (-sin * (x1 - x2)) / 2 + (cos * (y1 - y2)) / 2;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) [rx, ry] = [rx * Math.sqrt(lambda), ry * Math.sqrt(lambda)];
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const [cxp, cyp] = [(coef * rx * yp) / ry, (-coef * ry * xp) / rx];
  const [cx, cy] = [cos * cxp - sin * cyp + (x1 + x2) / 2, sin * cxp + cos * cyp + (y1 + y2) / 2];
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const pts: Pt[] = [];
  for (let k = 1; k <= 24; k++) {
    const t = t1 + (dt * k) / 24;
    pts.push([cx + rx * cos * Math.cos(t) - ry * sin * Math.sin(t), cy + rx * sin * Math.cos(t) + ry * cos * Math.sin(t)]);
  }
  return pts;
}

/** A shape's outline as points on the art (curves cut into short lines, its transform applied): a polygon when it is closed. */
function outline(op: Op): Pt[] {
  const s = op.shape;
  const pts: Pt[] = [];
  if (s.kind === "ellipse") {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push([s.cx + Math.cos(a) * s.rx, s.cy + Math.sin(a) * s.ry]);
    }
  } else if (s.kind === "rect") {
    // A rounded rectangle, its corners in quarter circles.
    const corners: [number, number, number][] = [
      [s.x + s.w - s.rx, s.y + s.ry, -Math.PI / 2],
      [s.x + s.w - s.rx, s.y + s.h - s.ry, 0],
      [s.x + s.rx, s.y + s.h - s.ry, Math.PI / 2],
      [s.x + s.rx, s.y + s.ry, Math.PI],
    ];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (i / 8) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * s.rx, cy + Math.sin(a) * s.ry]);
      }
    }
  } else if (s.kind === "path") {
    const tokens = s.d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g) ?? [];
    let i = 0;
    let cmd = "";
    let p: Pt = [0, 0];
    let start: Pt = [0, 0];
    /** The last curve's second control point, for S and T. */
    let last: Pt | null = null;
    const n = () => parseFloat(tokens[i++]);
    const curve = (p0: Pt, ctrl: Pt[], end: Pt) => {
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const u = 1 - t;
        if (ctrl.length === 1) {
          const [c] = ctrl;
          pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * end[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * end[1]]);
        } else {
          const [c1, c2] = ctrl;
          const b = (a: number, b1: number, b2: number, d: number) => u * u * u * a + 3 * u * u * t * b1 + 3 * u * t * t * b2 + t * t * t * d;
          pts.push([b(p0[0], c1[0], c2[0], end[0]), b(p0[1], c1[1], c2[1], end[1])]);
        }
      }
    };
    while (i < tokens.length) {
      if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
      const rel = cmd === cmd.toLowerCase();
      const at = (): Pt => {
        const q: Pt = [n(), n()];
        return rel ? [p[0] + q[0], p[1] + q[1]] : q;
      };
      const C = cmd.toUpperCase();
      const mirrored = (): Pt => (last ? [2 * p[0] - last[0], 2 * p[1] - last[1]] : p);
      if (C === "Z") {
        p = start;
        last = null;
        continue;
      }
      if (C === "M" || C === "L") {
        p = at();
        pts.push(p);
        if (C === "M") {
          start = p;
          cmd = rel ? "l" : "L";
        }
        last = null;
      } else if (C === "H" || C === "V") {
        const v = n();
        p = C === "H" ? [rel ? p[0] + v : v, p[1]] : [p[0], rel ? p[1] + v : v];
        pts.push(p);
        last = null;
      } else if (C === "Q" || C === "T") {
        const c = C === "Q" ? at() : mirrored();
        const end = at();
        curve(p, [c], end);
        [p, last] = [end, c];
      } else if (C === "C" || C === "S") {
        const c1 = C === "C" ? at() : mirrored();
        const c2 = at();
        const end = at();
        curve(p, [c1, c2], end);
        [p, last] = [end, c2];
      } else if (C === "A") {
        const [rx, ry, deg, large, sweep] = [n(), n(), n(), n(), n()];
        const end = at();
        pts.push(...arcPoints(p, Math.abs(rx), Math.abs(ry), deg, !!large, !!sweep, end));
        p = end;
        last = null;
      } else {
        throw new Error(`outline: no ${cmd} here`);
      }
    }
  } else {
    const b = op.box;
    return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  }
  return pts.map((q) => applyMatrix(op.m, q));
}

/** Where a shape is seen: its box, cut to its clip-paths' boxes. */
function seen(op: Op) {
  let { x, y, w, h } = op.box;
  for (const c of op.clips) {
    const x1 = Math.min(x + w, c.box.x + c.box.w);
    const y1 = Math.min(y + h, c.box.y + c.box.h);
    x = Math.max(x, c.box.x);
    y = Math.max(y, c.box.y);
    [w, h] = [Math.max(0, x1 - x), Math.max(0, y1 - y)];
  }
  return { x, y, w, h };
}

function inside([px, py]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function edgeDistance([px, py]: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

/** What hides what is under it: the accessory's big solid shapes, each with the reach of its outline. */
function solids(face: string): { poly: Pt[]; reach: number }[] {
  const rig = parseRig(art(manifest.faces![face]), true)!;
  return rig.ops
    .filter((o) => o.fill && o.fillAlpha >= 0.9 && o.box.w * o.box.h >= 200 && o.shape.kind !== "text")
    .map((o) => ({ poly: outline(o), reach: o.stroke && o.strokeAlpha >= 0.9 ? o.strokeWidth / 2 : 0 }));
}

/** How deep a point is under the solid shapes (negative: outside them all). */
function depth(p: Pt, cover: { poly: Pt[]; reach: number }[]): number {
  let best = -Infinity;
  for (const { poly, reach } of cover) {
    const d = edgeDistance(p, poly);
    best = Math.max(best, inside(p, poly) ? d + reach : reach - d);
  }
  return best;
}

/** Where an eye shape reaches: its outline, and half its stroke past it. */
function reachOf(op: Op): Pt[] {
  const w = op.stroke && op.strokeWidth > 0 ? op.strokeWidth / 2 : 0;
  return outline(op).flatMap(([x, y]) => (w ? [[x - w, y], [x + w, y], [x, y - w], [x, y + w]] : [[x, y]])) as Pt[];
}

/** Candy and every costume: each look's states. */
const LOOKS: [string, Record<string, StateDef>][] = [
  ["candy", manifest.states as Record<string, StateDef>],
  ...Object.entries(manifest.costumes).map(([id, c]) => [id, c.states] as [string, Record<string, StateDef>]),
];

/** The eyes of a state: its eye layers (they wander), and the eyes drawn in its frames (they don't). */
function eyesOf(def: StateDef): { op: Op; wanders: boolean }[] {
  const out: { op: Op; wanders: boolean }[] = [];
  for (const src of [def.eyes, def.eyesBlink]) {
    if (src) for (const op of parseRig(art(src), true)?.ops ?? []) out.push({ op, wanders: true });
  }
  for (const f of def.frames) {
    for (const op of parseRig(art(f))?.ops ?? []) {
      if (op.part !== "face" || op.box.w * op.box.h > 900) continue;
      const c = centre(seen(op));
      // Where the eyes are: brows, cheeks, tears and sweat are elsewhere.
      if ((Math.abs(c.x - 50) <= 9 || Math.abs(c.x - 78) <= 9) && Math.abs(c.y - 60) <= 9) out.push({ op, wanders: false });
    }
  }
  return out;
}

/** A brow: a line, no fill, above the eye's middle (a happy eye's arch is lower). */
const browLike = (op: Op) => op.fill == null && centre(seen(op)).y < 56;

/**
 * The mouth of a frame: where its mouth shapes are, leaving out a patch they
 * are all drawn on (Shadow's muzzle). Null for a mask with no mouth drawn
 * (Spiderman at rest): what sits low in the middle of the body then is the
 * spider on his chest, not a mouth.
 */
function mouthOf(frame: string, drop = 0): { x: number; y: number; w: number; h: number } | null {
  const ops = (parseRig(art(frame))?.ops ?? []).filter((o) => o.part === "mouth" && centre(seen(o)).y - drop <= 90);
  // The biggest one, when every other is drawn on it, is the patch.
  const [big, ...rest] = [...ops].sort((a, b) => seen(b).w * seen(b).h - seen(a).w * seen(a).h);
  const b = big ? seen(big) : null;
  const patch =
    b &&
    rest.length > 0 &&
    rest.every((q) => {
      const c = centre(seen(q));
      return c.x >= b.x && c.x <= b.x + b.w && c.y >= b.y && c.y <= b.y + b.h;
    });
  const shapes = patch ? rest : ops;
  if (!shapes.length) return null;
  // A line's box has no height: its stroke gives it one.
  const boxes = shapes.map((o) => {
    const b = seen(o);
    const w = o.stroke ? o.strokeWidth / 2 : 0;
    return { x: b.x - w, y: b.y - w, w: b.w + 2 * w, h: b.h + 2 * w };
  });
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  // Where it sits for an accessory that goes down with it (see mouthShift).
  return { x, y: y - drop, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** How much lower than Candy's a look draws its mouth (a bull's on its snout). */
const dropOf = (look: string) => manifest.costumes?.[look]?.mouthDrop ?? 0;

const NEW_FACES = ["aviators", "sleepmask", "snorkel", "cateye", "hypno", "cyborg", "partyhorn", "pacifier", "rose", "bowtie", "goldchain"];

describe("face accessories", () => {
  it("every face the wardrobe offers has art on disk, and the art offers no face the settings would drop", () => {
    const faces = FACE_IDS.filter((id) => id !== "none");
    expect(Object.keys(manifest.faces ?? {}).sort()).toEqual([...faces].sort());
    for (const id of faces) expect(existsSync(join(DIR, manifest.faces![id])), id).toBe(true);
    // The eleven newest, at the end of the list: the Face shelf's three full rows.
    expect(FACE_IDS.slice(-11)).toEqual(NEW_FACES);
  });

  it("a saved new face stays on; an unknown one comes off", () => {
    for (const id of NEW_FACES) expect(normalizeSettings({ companion: { face: id } } as never).companion.face, id).toBe(id);
    expect(normalizeSettings({ companion: { face: "tiara" } } as never).companion.face).toBe("none");
  });

  it("faces in pieces: the party horn's curl, the pacifier's ring and the chain's coin swing loose", () => {
    for (const [face, part] of [["partyhorn", "curl"], ["pacifier", "ring"], ["goldchain", "coin"], ["scarf", "left"]]) {
      const set = piecesOf(manifest.pieces, manifest.faces![face]);
      expect(set, face).toBeTruthy();
      expect(set!.parts.map((p) => p.src)).toContain(`faces/${face}/${part}.svg`);
      for (const file of [set!.base, ...set!.parts.map((p) => p.src)].filter(Boolean)) expect(existsSync(join(DIR, file!)), file).toBe(true);
      // Each turns about the point it hangs from, on the base.
      const base = parseRig(art(set!.base!), true)!;
      for (const p of set!.parts) {
        const near = base.ops.some((o) => {
          const b = o.box;
          return p.pivot[0] >= b.x - 3 && p.pivot[0] <= b.x + b.w + 3 && p.pivot[1] >= b.y - 3 && p.pivot[1] <= b.y + b.h + 3;
        });
        expect(near, `${p.src} hangs from ${JSON.stringify(p.pivot)}`).toBe(true);
      }
    }
  });

  describe("over the eyes: covered in every mood, on Candy and every costume", () => {
    // Which eyes each covers: both, or the right one only (the cyborg's plate).
    const COVERS: [string, (x: number) => boolean][] = [
      ["aviators", () => true],
      ["sleepmask", () => true],
      ["hypno", () => true],
      ["cyborg", (x) => x > 64],
    ];
    for (const [face, side] of COVERS) {
      it(`${face}: Candy's eyes, wherever they look, stay under it`, () => {
        const cover = solids(face);
        expect(cover.length, face).toBeGreaterThan(0);
        for (const [state, def] of Object.entries(manifest.states as Record<string, StateDef>)) {
          for (const { op, wanders } of eyesOf(def)) {
            if (!side(centre(op.box).x)) continue;
            for (const p of reachOf(op)) {
              for (const [gx, gy] of wanders ? GAZE : [[0, 0]]) {
                const at: Pt = [p[0] + gx, p[1] + gy];
                expect(depth(at, cover), `${face} on ${state}: an eye reaches ${at.map((v) => v.toFixed(1))}`).toBeGreaterThanOrEqual(-0.5);
              }
            }
          }
        }
      });

      it(`${face}: every costume's eyes are under it`, () => {
        const cover = solids(face);
        for (const [look, states] of LOOKS.slice(1)) {
          for (const s of MASCOT_STATES) {
            for (const { op, wanders } of eyesOf(states[s]!)) {
              const c = centre(seen(op));
              // A costume's brows may show over it (Gengar's fly up when he is startled): not an eye.
              if (!side(c.x) || browLike(op)) continue;
              // The middle of each eye shape, well under it; the edges are seen on screenshots.
              for (const [gx, gy] of wanders ? GAZE : [[0, 0]]) {
                expect(depth([c.x + gx, c.y + gy], cover), `${face} on ${look} ${s}: ${JSON.stringify(seen(op))}`).toBeGreaterThanOrEqual(2);
              }
            }
          }
        }
      });
    }

    it("the cyborg's plate leaves the left eye to look out", () => {
      const cover = solids("cyborg");
      for (const { op } of eyesOf(manifest.states.idle!)) {
        if (centre(op.box).x < 64) expect(depth([centre(op.box).x, centre(op.box).y], cover)).toBeLessThan(0);
      }
    });

    for (const face of ["cateye", "snorkel"]) {
      it(`${face}: clear glass, the eyes inside it in every mood, on Candy and every costume`, () => {
        const rig = parseRig(art(manifest.faces![face]), true)!;
        // The glass: a see-through fill.
        const glass = rig.ops.filter((o) => o.fill && o.fillAlpha < 0.5 && o.box.w * o.box.h >= 200).map(outline);
        expect(glass.length, face).toBeGreaterThan(0);
        for (const [look, states] of LOOKS) {
          for (const s of MASCOT_STATES) {
            for (const { op, wanders } of eyesOf(states[s]!)) {
              const c = centre(seen(op));
              if (browLike(op)) continue;
              for (const [gx, gy] of wanders ? GAZE : [[0, 0]]) {
                const p: Pt = [c.x + gx, c.y + gy];
                expect(glass.some((g) => inside(p, g)), `${face} on ${look} ${s}: an eye at ${p.map((v) => v.toFixed(1))}`).toBe(true);
              }
            }
          }
        }
      });
    }
  });

  describe("in the mouth: on it in every mood, on Candy and every costume", () => {
    it("what is held in the mouth or hung under it goes down with a mouth drawn lower, nothing else does", () => {
      expect([...manifest.mouthFaces!].sort()).toEqual(["bowtie", "bubblegum", "goldchain", "lollipop", "pacifier", "partyhorn", "rose"]);
      const bull = dressed(manifest, "bull");
      expect(mouthShift(bull, manifest.faces!.pacifier)).toBe(dropOf("bull"));
      expect(dropOf("bull")).toBeGreaterThan(0);
      expect(mouthShift(bull, manifest.faces!.bowtie)).toBe(dropOf("bull"));
      expect(mouthShift(bull, manifest.faces!.shades)).toBe(0);
      expect(mouthShift(bull, manifest.faces!.mustache)).toBe(0);
      expect(mouthShift(bull, null)).toBe(0);
      expect(mouthShift(dressed(manifest, "none"), manifest.faces!.pacifier)).toBe(0);
      expect(mouthShift(dressed(manifest, "dino"), manifest.faces!.pacifier)).toBe(0);
    });

    /** The part of each that the mouth holds: the pacifier's shield, the horn's mouthpiece, the rose's stem. */
    const held = (face: string, src: string, pick: (o: Op) => boolean) => {
      const ops = parseRig(art(src), true)!.ops.filter(pick);
      expect(ops.length, face).toBeGreaterThan(0);
      return ops;
    };
    const pieces = (face: string) => piecesOf(manifest.pieces, manifest.faces![face])!;

    it("the pacifier's shield and the party horn's mouthpiece sit over every mouth", () => {
      const shield = held("pacifier", pieces("pacifier").base!, (o) => o.fill != null && o.box.w > 30).map(outline);
      const mouthpiece = held("partyhorn", pieces("partyhorn").base!, (o) => o.fill != null && o.box.w > 15).map(outline);
      for (const [look, states] of LOOKS) {
        for (const s of MASCOT_STATES) {
          for (const f of states[s]!.frames) {
            const mouth = mouthOf(f, dropOf(look));
            if (!mouth) continue;
            const c = centre(mouth);
            const p: Pt = [c.x, c.y];
            // The mouth's middle under the piece (within its outline's stroke):
            // a piece only near it reads as resting on a lip.
            expect(shield.some((g) => inside(p, g) || edgeDistance(p, g) < 1), `pacifier on ${look} ${s}: mouth at ${p.map((v) => v.toFixed(1))}`).toBe(true);
            expect(mouthpiece.some((g) => inside(p, g) || edgeDistance(p, g) < 1), `party horn on ${look} ${s}: mouth at ${p.map((v) => v.toFixed(1))}`).toBe(true);
          }
        }
      }
    });

    it("the rose's stem runs across every mouth", () => {
      const stem = held("rose", manifest.faces!.rose, (o) => o.fill == null && o.stroke === "#16a34a" && o.box.w > 40)[0];
      const line = outline(stem);
      /** The stem's height where it crosses x. */
      const yAt = (x: number) => {
        for (let i = 1; i < line.length; i++) {
          const [a, b] = [line[i - 1], line[i]];
          if ((a[0] - x) * (b[0] - x) <= 0) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
        }
        return NaN;
      };
      for (const [look, states] of LOOKS) {
        for (const s of MASCOT_STATES) {
          for (const f of states[s]!.frames) {
            const mouth = mouthOf(f, dropOf(look));
            if (!mouth) continue;
            const c = centre(mouth);
            const y = yAt(c.x);
            // Through the mouth, or within a stroke of its edge.
            expect(y, `rose on ${look} ${s}: stem at ${y.toFixed(1)}, mouth ${JSON.stringify(mouth)}`).toBeGreaterThanOrEqual(mouth.y - 4);
            expect(y, `rose on ${look} ${s}: stem at ${y.toFixed(1)}, mouth ${JSON.stringify(mouth)}`).toBeLessThanOrEqual(mouth.y + mouth.h + 4);
          }
        }
      }
    });

    it("the bow tie and the gold chain hang under every mouth, like the scarf", () => {
      for (const face of ["bowtie", "goldchain", "scarf"]) {
        const src = pieces(face)?.base ?? manifest.faces![face];
        // Its top edge across the middle of the body.
        const top = Math.min(
          ...parseRig(art(src), true)!.ops.flatMap((o) =>
            outline(o)
              .filter(([x]) => Math.abs(x - 64) <= 6)
              .map(([, y]) => y - (o.stroke ? o.strokeWidth / 2 : 0)),
          ),
        );
        for (const [look, states] of LOOKS) {
          for (const s of MASCOT_STATES) {
            for (const f of states[s]!.frames) {
              const mouth = mouthOf(f, manifest.mouthFaces!.includes(face) ? dropOf(look) : 0);
              if (!mouth) continue;
              expect(top, `${face} on ${look} ${s}: its middle starts at ${top.toFixed(1)}, the mouth's at ${centre(mouth).y.toFixed(1)}`).toBeGreaterThan(centre(mouth).y + 4);
            }
          }
        }
      }
    });
  });
});
