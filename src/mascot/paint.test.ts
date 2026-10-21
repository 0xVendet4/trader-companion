/// <reference types="node" />
// paint.ts draws on a canvas, which node has none of: these tests draw on a
// recording stand-in and read back what was filled, in what order, and the
// geometry of the shapes it filled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { drawRig, meltSeat, type Look } from "./paint";
import { parseRig, type Box, type Op, type Rig } from "./rig";

const art = (f: string) => readFileSync(join(__dirname, "..", "..", "public", "mascot", f), "utf8");

type Call = [string, ...unknown[]];

/** A Path2D that remembers how it was drawn (its `d`, or its calls). */
class FakePath {
  d: string | null;
  calls: Call[] = [];
  constructor(d?: unknown) {
    this.d = typeof d === "string" ? d : null;
    return new Proxy(this, {
      get: (t, k) => (k in t ? t[k as keyof FakePath] : (...a: unknown[]) => t.calls.push([String(k), ...a])),
    });
  }
}

class FakeMatrix {
  constructor(public m: unknown) {}
}

/** One fill or stroke: what it painted with, and the path (null: the context's own path). */
interface Mark {
  kind: "fill" | "stroke";
  style: unknown;
  path: FakePath | null;
}

/** A 2D context that records every fill and stroke, and ignores the rest. */
function recorder(): { c: CanvasRenderingContext2D; marks: Mark[] } {
  const marks: Mark[] = [];
  const state: Record<string, unknown> = {};
  const gradient = () => ({ addColorStop() {} });
  const c = new Proxy(state, {
    get: (t, k) => {
      if (k === "fill" || k === "stroke") {
        return (p?: unknown) => marks.push({ kind: k, style: k === "fill" ? t.fillStyle : t.strokeStyle, path: p instanceof FakePath ? p : null });
      }
      if (k === "createLinearGradient" || k === "createRadialGradient") return gradient;
      if (typeof k === "string" && k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => {
      t[k as string] = v;
      return true;
    },
  });
  return { c: c as unknown as CanvasRenderingContext2D, marks };
}

beforeAll(() => {
  Object.assign(globalThis, { Path2D: FakePath, DOMMatrix: FakeMatrix });
});

const look = (more: Partial<Look>): Look => ({ yaw: 0, pitch: 0, ...more });

function draw(rig: Rig, l: Look): Mark[] {
  const { c, marks } = recorder();
  drawRig(c, rig, (op) => op.part !== "eyes", l, rig.body);
  return marks;
}

/** Where a path of the art was last filled (the ghost's sheet is drawn twice: behind him and over him), or -1. */
function filled(marks: Mark[], op: Op): number {
  if (op.shape.kind !== "path") return -1;
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i].kind === "fill" && marks[i].path?.d === op.shape.d) return i;
  return -1;
}

/** Inside the body's rounded rect, grown by `e` (art units). */
function insideRound(b: Box, rx: number, ry: number, e: number, x: number, y: number): boolean {
  if (x < b.x - e || x > b.x + b.w + e || y < b.y - e || y > b.y + b.h + e) return false;
  const cx = Math.min(Math.max(x, b.x + rx), b.x + b.w - rx);
  const cy = Math.min(Math.max(y, b.y + ry), b.y + b.h - ry);
  const dx = (x - cx) / (rx + e);
  const dy = (y - cy) / (ry + e);
  return dx * dx + dy * dy <= 1.0001;
}

/** The wax with no mood colours on: paint.ts's own cream. */
const WAX = "#fef3c7";

describe("melting, on bodies rounder than Candy's", () => {
  it("reads the corners from the body's own rect", () => {
    expect(meltSeat(parseRig(art("idle.svg"))!)).toMatchObject({ rx: 22, ry: 22, foot: 106 });
    expect(meltSeat(parseRig(art("costumes/ghost/idle.svg"))!)).toMatchObject({ rx: 30, ry: 30 });
    expect(meltSeat(parseRig(art("costumes/floki/idle.svg"))!)).toMatchObject({ rx: 27, ry: 29, foot: 106 });
    expect(meltSeat(parseRig(art("costumes/robot/idle.svg"))!)).toMatchObject({ rx: 12, ry: 12 });
  });

  for (const [name, f] of [
    ["Candy", "worried.svg"],
    ["the ghost (rx 30)", "costumes/ghost/worried.svg"],
    ["Floki (rx 27, ry 29)", "costumes/floki/worried.svg"],
  ] as const) {
    it(`${name}: at the last stage nothing of the wax sticks out past the round of his top`, () => {
      const rig = parseRig(art(f))!;
      // The body's corners, as the art draws them.
      const { rx, ry } = rig.ops.find((o) => o.part === "body")!.shape as { rx: number; ry: number };
      const b = rig.body!;
      const wax = draw(rig, look({ melt: 1 })).filter((m) => m.kind === "fill" && m.style === WAX);
      // The pool, five drips and the puddle.
      expect(wax.length).toBe(7);
      const [pool, ...rest] = wax.map((m) => m.path!);
      // The pool's top corners: the body's, a little out (its outline sits on the body's).
      const corners = pool.calls.filter((c) => c[0] === "ellipse");
      expect(corners).toHaveLength(2);
      for (const c of corners) expect([c[3], c[4]]).toEqual([rx + 1.4, ry + 1.4]);
      expect(pool.calls.some((c) => c[0] === "arcTo")).toBe(false);
      // Every drip starts inside the pool, under the round top: no square top corner pokes out
      // (a run down a side hangs half off the body, its outer top round).
      for (const drip of rest.slice(0, -1)) {
        const [, x, y, w, , radii] = drip.calls.find((c) => c[0] === "roundRect") as [string, number, number, number, number, number[]];
        const square = [radii[0] === 0 ? x : null, radii[1] === 0 ? x + w : null].filter((v): v is number => v !== null);
        expect(square.length, `${f}: a drip at ${x}`).toBeGreaterThan(0);
        for (const cx of square) expect(insideRound(b, rx, ry, 1.4, cx, y), `${f}: a drip's top corner at ${cx}, ${y}`).toBe(true);
      }
    });
  }

  it("the ghost: the wax runs down the sheet, over it, not under it", () => {
    for (const f of ["costumes/ghost/idle.svg", "costumes/ghost/worried.svg", "costumes/ghost/sad.svg"]) {
      const rig = parseRig(art(f))!;
      const seat = meltSeat(rig)!;
      const sheet = rig.ops.find((o) => o.part === "skin" && o.fill && o.shape.kind === "path")!;
      expect(sheet.meltOver, f).toBe(true);
      expect(rig.ops.indexOf(seat.after), f).toBeGreaterThan(rig.ops.indexOf(sheet));
      // The puddle forms under the hem, not over the middle of the sheet.
      expect(seat.foot, f).toBeGreaterThanOrEqual(112);
      const marks = draw(rig, look({ melt: 1 }));
      const pool = marks.findIndex((m) => m.kind === "fill" && m.style === WAX);
      expect(pool, f).toBeGreaterThan(filled(marks, sheet));
      // Nothing of the sheet is painted after it: the drips show.
      for (const o of rig.ops.filter((o) => o.part === "skin")) expect(filled(marks, o), f).toBeLessThan(pool);
      // And the face is: cheeks, brows and mouth over the wax.
      const cheek = marks.findIndex((m) => m.kind === "fill" && m.style === "#fb8fb6");
      expect(cheek, f).toBeGreaterThan(pool);
    }
  });

  it("Floki: the wax runs over his white muzzle too", () => {
    const rig = parseRig(art("costumes/floki/sad.svg"))!;
    const white = rig.ops.find((o) => o.part === "skin" && o.fill && "color" in o.fill && o.fill.color === "#fff8ee")!;
    expect(white.meltOver).toBe(true);
    const marks = draw(rig, look({ melt: 0.67 }));
    expect(marks.findIndex((m) => m.kind === "fill" && m.style === WAX)).toBeGreaterThan(filled(marks, white));
  });

  it("art that marks nothing keeps the wax right over the body, as before", () => {
    for (const f of ["idle.svg", "costumes/robot/idle.svg", "costumes/dino/idle.svg", "costumes/spiderman/idle.svg"]) {
      const rig = parseRig(art(f))!;
      expect(meltSeat(rig)!.after.part, f).toBe("body");
      expect(rig.ops.some((o) => o.meltOver), f).toBe(false);
    }
  });

  it("with his back turned (body and back parts only), the wax still shows", () => {
    const rig = parseRig(art("costumes/ghost/idle.svg"))!;
    const { c, marks } = recorder();
    drawRig(c, rig, (op) => op.part === "back" || op.part === "body" || op.part === "front", look({ melt: 1 }), rig.body);
    expect(marks.filter((m) => m.kind === "fill" && m.style === WAX).length).toBe(7);
  });
});
