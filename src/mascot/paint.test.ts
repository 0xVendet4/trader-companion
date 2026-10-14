/// <reference types="node" />
// paint.ts draws on a canvas, which node has none of: these tests draw on a
// recording stand-in and read back what was filled, in what order, and the
// geometry of the shapes it filled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { beakOf, drawRig, meltSeat, type Look } from "./paint";
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
    expect(meltSeat(parseRig(art("costumes/penguin/idle.svg"))!)).toMatchObject({ rx: 28, ry: 30, foot: 106 });
    expect(meltSeat(parseRig(art("costumes/robot/idle.svg"))!)).toMatchObject({ rx: 12, ry: 12 });
  });

  for (const [name, f] of [
    ["Candy", "worried.svg"],
    ["the ghost (rx 30)", "costumes/ghost/worried.svg"],
    ["the penguin (rx 28, ry 30)", "costumes/penguin/worried.svg"],
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

  it("the penguin: the wax runs over his white face too", () => {
    const rig = parseRig(art("costumes/penguin/sad.svg"))!;
    const white = rig.ops.find((o) => o.part === "skin" && o.fill && "color" in o.fill && o.fill.color === "#fbfcff")!;
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

describe("a beak opens instead of vanishing under a round mouth", () => {
  /** The penguin's colours: the upper beak's gradient, the dark of his outline. */
  const upper = (rig: Rig) => rig.ops.find((o) => o.part === "face" && o.fill && "gradient" in o.fill && o.fill.gradient.stops[0].color === "#fdba74")!;

  it("finds the penguin's upper beak, and no beak on Candy or any other costume", () => {
    for (const s of ["idle", "happy", "proud", "sad", "angry", "nervous", "sleepy", "cool"]) {
      const rig = parseRig(art(`costumes/penguin/${s}.svg`))!;
      expect(beakOf(rig), s).toBe(upper(rig));
    }
    for (const f of ["idle.svg", "happy.svg", "costumes/ghost/idle.svg", "costumes/dino/idle.svg", "costumes/robot/idle.svg", "costumes/gengar/idle.svg", "costumes/astronaut/idle.svg", "costumes/ninja/idle.svg", "costumes/shadow/idle.svg", "costumes/spiderman/idle.svg"]) {
      expect(beakOf(parseRig(art(f))!), f).toBeNull();
    }
  });

  for (const [what, mouth] of [
    ["wide open (a link held over him)", { open: 1, chew: 0 }],
    ["laughing", { open: 0.8, chew: 0, grin: true }],
    ["chewing", { open: 0, chew: 0.6 }],
  ] as const) {
    it(`${what}: the upper beak is painted over the opening, the art's lower beak gives way to an open one`, () => {
      for (const s of ["idle", "happy", "worried", "focused", "proud"]) {
        const rig = parseRig(art(`costumes/penguin/${s}.svg`))!;
        const marks = draw(rig, look({ mouth }));
        const beak = filled(marks, upper(rig));
        // The gape: a dark oval, filled in the art's outline colour, before the beak.
        const gape = marks.findIndex((m) => m.kind === "fill" && m.style === "#0b0f1a" && m.path?.calls.some((c) => c[0] === "ellipse"));
        expect(gape, s).toBeGreaterThan(-1);
        expect(beak, s).toBeGreaterThan(gape);
        // Painted once, and nothing round and dark over it afterwards.
        expect(marks.filter((m) => m.kind === "fill" && m.path?.d === (upper(rig).shape as { d: string }).d), s).toHaveLength(1);
        expect(marks.slice(beak + 1).some((m) => m.kind === "fill" && m.style === "#0b0f1a"), s).toBe(false);
        // The art's own mouth (the lower beak, the fish) is not drawn: the open one is, in orange.
        for (const o of rig.ops.filter((o) => o.part === "mouth")) expect(filled(marks, o), `${s}: a mouth shape`).toBe(-1);
        expect(marks.slice(gape, beak).some((m) => m.kind === "fill" && typeof m.style === "string" && /^rgb\(2[0-9]{2},/.test(m.style)), s).toBe(true);
      }
    });
  }

  it("the proud fish is all mouth: an open beak drops it whole, tail and all", () => {
    const rig = parseRig(art("costumes/penguin/proud.svg"))!;
    const fish = rig.ops.filter((o) => o.fill && "color" in o.fill && ["#60a5fa", "#93c5fd"].includes(o.fill.color));
    expect(fish).toHaveLength(2);
    for (const o of fish) expect(o.part).toBe("mouth");
  });

  it("Candy's own mouth still opens over everything", () => {
    const rig = parseRig(art("idle.svg"))!;
    const marks = draw(rig, look({ mouth: { open: 1, chew: 0 } }));
    const last = marks.filter((m) => m.kind === "fill").at(-2)!;
    // The dark oval, then the tongue: the last two fills.
    expect(last.path).toBeNull();
    expect(marks.filter((m) => m.kind === "fill").at(-1)!.style).toBe("#fb7185");
  });
});
