/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_YAW } from "./mascot";
import { mouthOpening } from "./paint";
import { centre, cheeksOf, hasArms, mouthHalo, paletteOf, parseRig, pathPoints, turnFeature, wickOf, type Op, type Rig } from "./rig";

const art = (f: string) => readFileSync(join(__dirname, "..", "..", "public", "mascot", f), "utf8");

describe("arms of its own", () => {
  it("the candle has none: his hello draws little hands", () => {
    for (const f of ["idle.svg", "happy.svg"]) expect(hasArms(parseRig(art(f))!), f).toBe(false);
  });

  it("every costume has them: its own arm waves instead", () => {
    // Idle, and happy (what he wears for the hello) where the costume has one.
    for (const f of [
      "gengar/idle", "gengar/happy", "spiderman/idle", "spiderman/happy", "shadow/idle", "shadow/happy", "v/idle",
      "astronaut/idle", "astronaut/happy", "ninja/idle", "ninja/happy",
      "robot/idle", "robot/happy", "robot/wave-1", "robot/wave-2", "dino/idle", "dino/happy", "dino/wave-1", "dino/wave-2",
      "bull/idle", "bull/happy", "bull/wave-1", "bull/wave-2", "bear/idle", "bear/happy", "bear/wave-1", "bear/wave-2",
      "ghost/idle", "ghost/happy", "ghost/wave-1", "ghost/wave-2", "penguin/idle", "penguin/happy", "penguin/wave-1", "penguin/wave-2",
    ]) {
      const rig = parseRig(art(`costumes/${f}.svg`));
      expect(rig, f).not.toBeNull();
      expect(hasArms(rig!), f).toBe(true);
    }
  });
});

describe("reading Candy's art", () => {
  it("takes a frame apart: wick behind, the body, the face and the mouth on it", () => {
    const rig = parseRig(art("idle.svg"))!;
    expect(rig).not.toBeNull();
    expect(rig.body).toEqual({ x: 28, y: 24, w: 72, h: 82 });
    const parts = rig.ops.map((o) => o.part);
    expect(parts[0]).toBe("back"); // the wick
    expect(parts[1]).toBe("body");
    expect(parts.slice(2)).toEqual(["face", "face", "mouth"]); // two cheeks, the smile
    expect(wickOf(rig)?.color).toBe("#15803d");
    expect(paletteOf(rig)).toEqual({ top: "#86efac", bottom: "#16a34a", wick: "#15803d" });
  });

  it("knows a grin with its tongue is all mouth, and the brows are face", () => {
    const happy = parseRig(art("happy.svg"))!;
    expect(happy.ops.filter((o) => o.part === "mouth")).toHaveLength(2);
    const sad = parseRig(art("sad.svg"))!;
    const brows = sad.ops.filter((o) => o.part === "face" && o.shape.kind === "path" && o.fill === null);
    // And its tear, on the face now (it used to sit behind the body, unseen).
    expect(sad.ops.some((o) => o.part === "face" && o.fill && "color" in o.fill && o.fill.color === "#7dd3fc")).toBe(true);
    expect(brows).toHaveLength(2);
    expect(paletteOf(sad)?.top).toBe("#fca5a5");
  });

  it("finds the two cheeks, and none on art without a mirrored pair", () => {
    const idle = parseRig(art("idle.svg"))!;
    const cheeks = cheeksOf(idle);
    expect(cheeks).toHaveLength(2);
    expect(cheeks.map((o) => (o.shape.kind === "ellipse" ? o.shape.cx : -1)).sort((a, b) => a - b)).toEqual([42, 86]);
    const lone = parseRig(`<svg viewBox="0 0 128 128"><rect x="28" y="24" width="72" height="82"/><ellipse cx="42" cy="75" rx="7" ry="4.5"/></svg>`)!;
    expect(cheeksOf(lone)).toHaveLength(0);
  });

  it("puts a sign held out past the body in front", () => {
    const stop = parseRig(art("stop.svg"))!;
    const front = stop.ops.filter((o) => o.part === "front");
    expect(front.some((o) => o.shape.kind === "text")).toBe(true);
  });

  it("reads an eyes layer whole", () => {
    const eyes = parseRig(art("eyes/open.svg"), true)!;
    expect(eyes.ops).toHaveLength(4);
    expect(eyes.ops.every((o) => o.part === "eyes")).toBe(true);
    expect(centre(eyes.ops[0].box)).toEqual({ x: 50, y: 60 });
  });

  it("reads the paint: gradients, outlines under the fill, opacity", () => {
    const rig = parseRig(art("idle.svg"))!;
    const body = rig.ops[1];
    expect(body.fill && "gradient" in body.fill ? body.fill.gradient.stops.map((s) => s.color) : null).toEqual(["#86efac", "#16a34a"]);
    expect(body.strokeUnder).toBe(true);
    expect(body.stroke).toBe("#06140b");
    expect(rig.ops[2].fillAlpha).toBeCloseTo(0.55);
  });

  it("reads the melt's mark: data-melt=\"over\" on a shape or on its group, nothing else", () => {
    const rig = parseRig(
      `<svg viewBox="0 0 128 128"><rect x="28" y="24" width="72" height="82"/>` +
        `<path d="M26 24 L102 24 L102 116 L26 116 Z" fill="#fff" data-melt="over"/>` +
        `<g data-melt="over"><ellipse cx="64" cy="90" rx="30" ry="12"/></g>` +
        `<ellipse cx="41" cy="74" rx="7" ry="4" data-melt="under"/><ellipse cx="87" cy="74" rx="7" ry="4"/></svg>`,
    )!;
    expect(rig.ops.map((o) => o.meltOver ?? false)).toEqual([false, true, true, false, false]);
    // Unmarked shapes carry no mark at all (art read before it compares equal).
    expect("meltOver" in rig.ops[0]).toBe(false);
  });

  it("gives up on art it can't take apart, so it is drawn as a picture", () => {
    expect(parseRig(`<svg viewBox="0 0 128 128"><image href="x.png" width="128" height="128"/></svg>`)).toBeNull();
    expect(parseRig(`<svg viewBox="0 0 128 128"><rect width="99" height="99" mask="url(#m)"/></svg>`)).toBeNull();
    expect(parseRig(`<svg viewBox="0 0 128 128"><g transform="perspective(3)"><rect width="99" height="99"/></g></svg>`)).toBeNull();
    expect(parseRig(`<svg viewBox="0 0 128 128"><rect width="99" height="99" clip-path="url(#nowhere)"/></svg>`)).toBeNull();
    expect(parseRig(`<svg viewBox="0 0 128 128"></svg>`)).toBeNull();
  });

  it("reads groups: a mirrored copy lands on the other side, a group's paint reaches what it holds", () => {
    const rig = parseRig(
      `<svg viewBox="0 0 128 128"><rect x="28" y="24" width="72" height="82"/>` +
        `<ellipse cx="45" cy="60" rx="5" ry="7"/>` +
        `<g transform="translate(128 0) scale(-1 1)" fill="#123456" opacity="0.5"><ellipse cx="45" cy="60" rx="5" ry="7"/></g></svg>`,
    )!;
    const [left, right] = rig.ops.slice(1);
    expect(centre(left.box)).toEqual({ x: 45, y: 60 });
    expect(centre(right.box)).toEqual({ x: 83, y: 60 });
    expect(right.fill).toEqual({ color: "#123456" });
    expect(right.fillAlpha).toBeCloseTo(0.5);
    expect(right.lbox).toEqual(left.box);
    expect(rig.ops.map((o) => o.part)).toEqual(["body", "face", "face"]);
  });

  it("moves a clipped group as one, by its clip", () => {
    const rig = parseRig(
      `<svg viewBox="0 0 128 128"><rect x="28" y="24" width="72" height="82"/>` +
        `<clipPath id="m"><path d="M50 80 L78 80 L78 92 L50 92 Z"/></clipPath>` +
        `<g clip-path="url(#m)"><path d="M48 84 L80 84"/><path d="M60 78 L60 94"/></g></svg>`,
    )!;
    const clipped = rig.ops.slice(1);
    expect(clipped.every((o) => o.clips.length === 1 && o.part === "mouth")).toBe(true);
    expect(clipped.map((o) => o.pivot)).toEqual([clipped[0].clips[0].box, clipped[0].clips[0].box]);
  });

  it("takes every costume apart too, with its body found", () => {
    const manifest = JSON.parse(art("mascot.json")) as {
      costumes: Record<string, { states: Record<string, { frames: string[]; eyes?: string; eyesBlink?: string }> }>;
    };
    for (const [id, costume] of Object.entries(manifest.costumes)) {
      for (const def of Object.values(costume.states)) {
        for (const f of def.frames) expect(parseRig(art(f))?.body, `${id}: ${f}`).toBeTruthy();
        for (const e of [def.eyes, def.eyesBlink]) if (e) expect(parseRig(art(e), true), `${id}: ${e}`).not.toBeNull();
      }
    }
  });

  it("reads the robot and the dinosaur like Candy: body in Candy's place, a face that turns, the rest stays put", () => {
    for (const id of ["robot", "dino"]) {
      for (const f of ["idle", "happy", "worried", "angry", "sick", "stop"]) {
        const rig = parseRig(art(`costumes/${id}/${f}.svg`))!;
        const at = `${id}/${f}`;
        // Where Candy's is: hats and face accessories land where they do on him.
        expect(rig.body, at).toEqual({ x: 28, y: 24, w: 72, h: 82 });
        // Its colours fade between moods; the antenna is not a wick to recolour.
        expect(paletteOf(rig), at).not.toBeNull();
        expect(wickOf(rig), at).toBeNull();
        // Two cheeks that blush, a mouth that opens to swallow.
        expect(cheeksOf(rig), at).toHaveLength(2);
        expect(rig.ops.some((o) => o.part === "mouth"), at).toBe(true);
        // The screen, the belly, the panels and spots are skin (clipped to the
        // body): only small features slide across the face when it turns.
        expect(rig.ops.some((o) => o.part === "skin"), at).toBe(true);
        for (const o of rig.ops.filter((o) => o.part === "face" || o.part === "mouth")) expect(o.pivot.w, at).toBeLessThan(rig.body!.w * 0.45);
        // The antenna, the plates, the tail, ears and limbs behind.
        expect(rig.ops.filter((o) => o.part === "back").length, at).toBeGreaterThan(4);
      }
    }
    // The stop sign is held out in front.
    for (const id of ["robot", "dino"]) {
      const stop = parseRig(art(`costumes/${id}/stop.svg`))!;
      expect(stop.ops.some((o) => o.part === "front" && o.shape.kind === "text"), id).toBe(true);
    }
  });

  it("puts the new costumes' eyes where Candy's are, so glasses fit and the gaze reads", () => {
    for (const f of [
      "robot/eyes-open", "robot/eyes-angry", "robot/eyes-hearts", "dino/eyes-open", "dino/eyes-narrow", "dino/eyes-stars",
      "bull/eyes-open", "bull/eyes-angry", "bull/eyes-worried", "bull/eyes-cool", "bear/eyes-open", "bear/eyes-teary", "bear/eyes-wink",
    ]) {
      const eyes = parseRig(art(`costumes/${f}.svg`), true)!;
      expect(eyes, f).not.toBeNull();
      const xs = eyes.ops.map((o) => centre(o.box).x);
      const ys = eyes.ops.map((o) => centre(o.box).y);
      // Left and right of the middle, around Candy's 50 and 78, at his eye height.
      expect(Math.min(...xs), f).toBeGreaterThan(38);
      expect(Math.max(...xs), f).toBeLessThan(90);
      expect(xs.some((x) => x < 60) && xs.some((x) => x > 68), f).toBe(true);
      for (const y of ys) expect(Math.abs(y - 60), f).toBeLessThan(8);
    }
  });

  it("reads the bull and the bear like Candy: body in Candy's place, a face that turns, the rest stays put", () => {
    for (const id of ["bull", "bear"]) {
      for (const f of ["idle", "happy", "worried", "angry", "sick", "stop", "excited-1", "excited-2"]) {
        const rig = parseRig(art(`costumes/${id}/${f}.svg`))!;
        const at = `${id}/${f}`;
        // Where Candy's is: hats and face accessories land where they do on him.
        expect(rig.body, at).toEqual({ x: 28, y: 24, w: 72, h: 82 });
        // Its colours fade between moods; the bull's tuft is not a wick to recolour.
        expect(paletteOf(rig), at).not.toBeNull();
        expect(wickOf(rig), at).toBeNull();
        // Two cheeks that blush (not the nostrils), a mouth that opens to swallow.
        expect(cheeksOf(rig), at).toHaveLength(2);
        expect(rig.ops.some((o) => o.part === "mouth"), at).toBe(true);
        // The belly and the shine are skin (clipped to the body).
        expect(rig.ops.some((o) => o.part === "skin"), at).toBe(true);
        // Horns, ears, the tuft, arms and legs behind.
        expect(rig.ops.filter((o) => o.part === "back").length, at).toBeGreaterThan(4);
      }
      // The stop sign is held out in front.
      const stop = parseRig(art(`costumes/${id}/stop.svg`))!;
      expect(stop.ops.some((o) => o.part === "front" && o.shape.kind === "text"), id).toBe(true);
    }
  });

  it("turns the bull's snout and the bear's muzzle with the face, as one piece that stays on it", () => {
    const pale = (o: { fill: unknown }, top: string) => !!o.fill && typeof o.fill === "object" && "gradient" in o.fill && (o.fill as { gradient: { stops: { color: string }[] } }).gradient.stops[0].color === top;
    for (const [id, top, inside] of [
      ["bull", "#e2fbe9", ["#0b3a1e", "#facc15"]], // the nostrils and the ring
      ["bear", "#fde8d3", ["#3a1410"]], // the nose
    ] as const) {
      for (const f of ["idle", "happy", "shocked", "angry", "sad", "excited-1", "sick"]) {
        const rig = parseRig(art(`costumes/${id}/${f}.svg`))!;
        const at = `${id}/${f}`;
        const body = rig.body!;
        const snout = rig.ops.find((o) => pale(o, top))!;
        expect(snout, at).toBeTruthy();
        // On the face, never the mouth: the mouth hides while he swallows, the snout stays.
        expect(snout.part, at).toBe("face");
        // What is on it moves with it: same part, turned about the same point.
        for (const color of inside) {
          const on = rig.ops.filter((o) => o.fill && "color" in o.fill ? o.fill.color === color : o.stroke === color);
          expect(on.length, `${at}: ${color}`).toBeGreaterThan(0);
          for (const o of on) {
            expect(o.part, `${at}: ${color}`).toBe("face");
            expect(centre(o.pivot).x, `${at}: ${color}`).toBeCloseTo(centre(snout.pivot).x);
          }
        }
        // The mouth that opens to swallow is drawn on it.
        const mouth = rig.ops.filter((o) => o.part === "mouth");
        const y = mouth.reduce((s, o) => s + centre(o.box).y, 0) / mouth.length;
        expect(y, at).toBeGreaterThan(snout.box.y);
        expect(y, at).toBeLessThan(snout.box.y + snout.box.h);
        // Turned as far as the face goes, it stays inside the body's outline.
        const px = centre(snout.pivot).x;
        const edge = snout.strokeWidth / 2;
        for (const yaw of [-MAX_YAW, MAX_YAW]) {
          const t = turnFeature(px, body, yaw);
          expect(t.x + (snout.box.x - edge - px) * t.scale, `${at} at ${yaw}`).toBeGreaterThanOrEqual(body.x);
          expect(t.x + (snout.box.x + snout.box.w + edge - px) * t.scale, `${at} at ${yaw}`).toBeLessThanOrEqual(body.x + body.w);
        }
      }
    }
  });

  it("opens the bull's and the bear's mouth under the nose: the nostrils and the nose stay in sight", () => {
    // The mouth opens wide while a link is held over him (up to a minute),
    // chews after a swallow and laughs: wherever mouthOpening (paint.ts) puts
    // it, in every mood and on the way open (the spring overshoots to 1.2),
    // its top stays under the nose.
    const manifest = JSON.parse(art("mascot.json")) as { costumes: Record<string, { states: Record<string, { frames: string[] }> }> };
    const OPENINGS: { open: number; chew: number; grin?: boolean }[] = [
      ...Array.from({ length: 25 }, (_, k) => ({ open: k * 0.05, chew: 0 })),
      ...[0.2, 0.6, 1].map((chew) => ({ open: 0, chew })),
      ...[0.4, 0.7, 1].map((open) => ({ open, chew: 0, grin: true })),
    ];
    for (const [id, nose] of [
      ["bull", "#0b3a1e"], // the nostrils
      ["bear", "#3a1410"], // the nose
    ] as const) {
      const frames = new Set(Object.values(manifest.costumes[id].states).flatMap((d) => d.frames));
      for (const f of frames) {
        const rig = parseRig(art(f))!;
        const body = rig.body!;
        const ops = rig.ops.filter((o) => o.fill && "color" in o.fill && o.fill.color === nose);
        expect(ops.length, f).toBeGreaterThan(0);
        for (const o of ops) expect(o.part, f).toBe("face");
        const below = Math.max(...ops.map((o) => o.box.y + o.box.h + (o.stroke ? o.strokeWidth / 2 : 0)));
        for (const m of OPENINGS) {
          const { cy, ry } = mouthOpening(rig, body, m);
          // A laugh's teeth start a unit above its flat top.
          const top = m.grin ? cy - 1 : cy - ry;
          expect(top, `${f}: ${JSON.stringify(m)} opens at ${top.toFixed(1)}, the nose ends at ${below.toFixed(1)}`).toBeGreaterThanOrEqual(below);
        }
      }
    }
  });

  it("reads every one of Candy's own frames and eyes", () => {
    const manifest = JSON.parse(art("mascot.json")) as { states: Record<string, { frames: string[]; eyes?: string; eyesBlink?: string }> };
    for (const def of Object.values(manifest.states)) {
      for (const f of def.frames) expect(parseRig(art(f))?.body, f).toBeTruthy();
      for (const e of [def.eyes, def.eyesBlink]) if (e) expect(parseRig(art(e), true), e).not.toBeNull();
    }
  });
});

describe("the astronaut and the ninja, taken apart", () => {
  const manifest = JSON.parse(art("mascot.json")) as {
    costumes: Record<string, { states: Record<string, { frames: string[]; eyes?: string; eyesBlink?: string }> }>;
  };
  const inside = (b: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }, slack = 0) =>
    b.x >= o.x - slack && b.y >= o.y - slack && b.x + b.w <= o.x + o.w + slack && b.y + b.h <= o.y + o.h + slack;
  /** The visor's glass, or the ninja's slit: the face part with a skin-coloured fill the eyes sit in. */
  const window = (rig: ReturnType<typeof parseRig>, fill: (c: string) => boolean) =>
    rig!.ops.find((o) => o.part === "face" && o.fill && "gradient" in o.fill && fill(o.fill.gradient.stops[0].color));

  for (const id of ["astronaut", "ninja"]) {
    it(`${id}: Candy's body, so hats sit on it; a mouth that opens to swallow; the eyes where glasses go`, () => {
      const rig = parseRig(art(`costumes/${id}/idle.svg`))!;
      expect(rig.body).toEqual({ x: 28, y: 24, w: 72, h: 82 });
      expect(rig.ops.some((o) => o.part === "mouth"), id).toBe(true);
      const eyes = parseRig(art(manifest.costumes[id].states.idle.eyes!), true)!;
      const xs = eyes.ops.filter((o) => o.shape.kind === "ellipse" && o.box.w > 8).map((o) => centre(o.box));
      expect(xs).toHaveLength(2);
      // Candy's eyes are at (50, 60) and (78, 60): face accessories are drawn for them.
      for (const [c, x] of [[xs[0], 50], [xs[1], 78]] as const) {
        expect(Math.abs(c.x - x), id).toBeLessThan(2.5);
        expect(Math.abs(c.y - 60), id).toBeLessThan(2.5);
      }
    });

    it(`${id}: blushes in love`, () => {
      expect(cheeksOf(parseRig(art(`costumes/${id}/love.svg`))!)).toHaveLength(2);
    });
  }

  it("the visor turns with the face, the chest stays put, the antenna and arms are behind", () => {
    const rig = parseRig(art("costumes/astronaut/idle.svg"))!;
    const glass = window(rig, (c) => c === "#86efac");
    expect(glass?.part).toBe("face");
    // The chest panel's buttons, clipped to the body: skin.
    expect(rig.ops.some((o) => o.part === "skin" && o.fill && "color" in o.fill && o.fill.color === "#facc15")).toBe(true);
    // The antenna's light, behind.
    expect(rig.ops.find((o) => o.fill && "color" in o.fill && o.fill.color === "#fbbf24")?.part).toBe("back");
    // The face behind the glass goes red on a loss, as Candy does.
    expect(window(parseRig(art("costumes/astronaut/sad.svg")), (c) => c === "#fca5a5")).toBeTruthy();
  });

  it("the ninja's slit turns with the eyes, the headband stays put, its ends and the hilt are behind", () => {
    const rig = parseRig(art("costumes/ninja/idle.svg"))!;
    expect(window(rig, (c) => c === "#f8d3ad")?.part).toBe("face");
    const band = rig.ops.filter((o) => o.fill && "gradient" in o.fill && o.fill.gradient.stops[0].color === "#e11d48");
    // Across the forehead and the sash: skin; its two ends: behind.
    expect(band.filter((o) => o.part === "skin")).toHaveLength(2);
    expect(band.filter((o) => o.part === "back")).toHaveLength(2);
  });

  it("keeps its drops of sweat clear of the body and its outline: in front, nothing covers them when the face turns", () => {
    for (const id of ["astronaut", "ninja"]) {
      let drops = 0;
      for (const def of Object.values(manifest.costumes[id].states)) {
        for (const f of def.frames) {
          const rig = parseRig(art(f))!;
          const b = rig.body!;
          const body = rig.ops.find((o) => o.part === "body")!;
          // The body as drawn: its rectangle and half its outline.
          const edge = body.strokeWidth / 2;
          for (const o of rig.ops) {
            if (!(o.fill && "color" in o.fill && o.fill.color === "#7dd3fc") || o.part === "face") continue;
            drops++;
            expect(o.part, `${f}: a drop`).toBe("front");
            const r = o.strokeWidth / 2;
            const apart =
              o.box.x - r >= b.x + b.w + edge || o.box.x + o.box.w + r <= b.x - edge || o.box.y - r >= b.y + b.h + edge || o.box.y + o.box.h + r <= b.y - edge;
            expect(apart, `${f}: a drop at ${JSON.stringify(o.box)} touches the body`).toBe(true);
          }
        }
      }
      // Worried, tired, nervous (two), sick.
      expect(drops, id).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps the eyes inside the visor and the slit, in every mood", () => {
    for (const [id, fill] of [["astronaut", (c: string) => ["#86efac", "#fca5a5", "#bbf7d0"].includes(c)], ["ninja", (c: string) => c === "#f8d3ad" || c === "#dfe9cf"]] as const) {
      for (const [state, def] of Object.entries(manifest.costumes[id].states)) {
        for (const f of def.frames) {
          const frame = parseRig(art(f))!;
          const hole = window(frame, fill);
          expect(hole, `${id} ${state}: ${f}`).toBeTruthy();
          for (const e of [def.eyes, def.eyesBlink]) {
            if (!e) continue;
            // A little slack: the stroke of the glass, a heart's tip.
            for (const op of parseRig(art(e), true)!.ops) expect(inside(op.box, hole!.box, 1.5), `${id} ${state}: ${e} in ${f}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("the ghost and the penguin, taken apart", () => {
  const manifest = JSON.parse(art("mascot.json")) as {
    costumes: Record<string, { states: Record<string, { frames: string[]; eyes?: string; eyesBlink?: string }> }>;
  };
  const frames = (id: string) => Object.values(manifest.costumes[id].states).flatMap((d) => d.frames);
  const contains = (b: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

  it("reads them like Candy: body in Candy's place, cheeks and a mouth that turn, the rest stays put", () => {
    for (const id of ["ghost", "penguin"]) {
      for (const f of [...new Set(frames(id))]) {
        const rig = parseRig(art(f))!;
        // Where Candy's is: hats and face accessories land where they do on him.
        expect(rig.body, f).toEqual({ x: 28, y: 24, w: 72, h: 82 });
        expect(paletteOf(rig), f).not.toBeNull();
        expect(wickOf(rig), f).toBeNull();
        expect(cheeksOf(rig), f).toHaveLength(2);
        expect(rig.ops.some((o) => o.part === "mouth"), f).toBe(true);
        expect(rig.ops.some((o) => o.part === "skin"), f).toBe(true);
        // The arms (sheet corners, flippers), the glow, the tuft and the feet behind.
        expect(rig.ops.filter((o) => o.part === "back").length, f).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("the ghost's sheet lies over its body as skin, hem and all, so the outline runs unbroken", () => {
    for (const f of [...new Set(frames("ghost"))]) {
      const rig = parseRig(art(f))!;
      const b = rig.body!;
      const sheets = rig.ops.filter((o) => o.shape.kind === "path" && o.fill && "gradient" in o.fill && o.box.y + o.box.h > b.y + b.h + 6);
      // Once behind (what shows with his back turned), once over the body.
      expect(sheets.map((o) => o.part), f).toEqual(["back", "skin"]);
      const over = sheets[1];
      expect(rig.ops.indexOf(over), f).toBeGreaterThan(rig.ops.findIndex((o) => o.part === "body"));
      // It covers the body, outline included, and hangs past it in a hem.
      expect(over.box.x, f).toBeLessThanOrEqual(b.x);
      expect(over.box.x + over.box.w, f).toBeGreaterThanOrEqual(b.x + b.w);
      expect(over.box.y, f).toBeLessThanOrEqual(b.y);
      expect(over.box.y + over.box.h, f).toBeGreaterThan(110);
    }
    // The hem flutters: the two frames of a hello hang differently.
    const hem = (f: string) => parseRig(art(f))!.ops.find((o) => o.part === "skin" && o.shape.kind === "path")!;
    expect(hem("costumes/ghost/wave-1.svg").shape).not.toEqual(hem("costumes/ghost/wave-2.svg").shape);
  });

  it("the penguin's white face stays put under eyes that move, the beak turns with the face and opens as its mouth", () => {
    for (const f of [...new Set(frames("penguin"))]) {
      const rig = parseRig(art(f))!;
      const white = rig.ops.find((o) => o.part === "skin" && o.shape.kind === "path" && o.fill && "color" in o.fill && o.box.w > 60);
      expect(white, f).toBeTruthy();
      // Room for the eyes where Candy's are, and for them to look aside.
      for (const [x, y] of [[44, 60], [50, 60], [78, 60], [92, 60]]) expect(contains(white!.box, x, y), `${f}: ${x}`).toBe(true);
      // The upper beak, orange, turns with the face; the lower beak is the mouth.
      const orange = rig.ops.filter((o) => o.fill && "gradient" in o.fill && o.fill.gradient.stops[0].color === "#fdba74" && o.part !== "back");
      expect(orange.map((o) => o.part), f).toEqual(["face"]);
      expect(rig.ops.some((o) => o.part === "mouth" && o.fill && "color" in o.fill && o.fill.color === "#ea580c"), f).toBe(true);
    }
  });

  it("holds the stop sign out in front", () => {
    for (const id of ["ghost", "penguin"]) {
      const stop = parseRig(art(`costumes/${id}/stop.svg`))!;
      expect(stop.ops.some((o) => o.part === "front" && o.shape.kind === "text"), id).toBe(true);
    }
  });

  it("keeps its drops of sweat clear of the body and its outline: in front, nothing covers them", () => {
    for (const id of ["ghost", "penguin"]) {
      let drops = 0;
      for (const f of frames(id)) {
        const rig = parseRig(art(f))!;
        const b = rig.body!;
        const edge = rig.ops.find((o) => o.part === "body")!.strokeWidth / 2;
        for (const o of rig.ops) {
          if (!(o.fill && "color" in o.fill && o.fill.color === "#7dd3fc") || o.part === "face") continue;
          drops++;
          expect(o.part, `${f}: a drop`).toBe("front");
          const r = o.strokeWidth / 2;
          const apart =
            o.box.x - r >= b.x + b.w + edge || o.box.x + o.box.w + r <= b.x - edge || o.box.y - r >= b.y + b.h + edge || o.box.y + o.box.h + r <= b.y - edge;
          expect(apart, `${f}: a drop at ${JSON.stringify(o.box)} touches the body`).toBe(true);
        }
      }
      // Worried, tired, nervous (two), relieved, sick.
      expect(drops, id).toBeGreaterThanOrEqual(6);
    }
  });

  it("puts the eyes where Candy's are, so glasses fit and the gaze reads", () => {
    for (const id of ["ghost", "penguin"]) {
      for (const n of ["open", "blink", "happy", "wide", "narrow", "sparkle", "hearts", "stars", "dots", "wink"]) {
        const f = `costumes/${id}/eyes-${n}.svg`;
        const eyes = parseRig(art(f), true)!;
        expect(eyes, f).not.toBeNull();
        const xs = eyes.ops.map((o) => centre(o.box).x);
        const ys = eyes.ops.map((o) => centre(o.box).y);
        expect(Math.min(...xs), f).toBeGreaterThan(38);
        expect(Math.max(...xs), f).toBeLessThan(90);
        expect(xs.some((x) => x < 60) && xs.some((x) => x > 68), f).toBe(true);
        for (const y of ys) expect(Math.abs(y - 60), f).toBeLessThan(8);
      }
    }
  });
});

describe("the bee, taken apart", () => {
  const states = (JSON.parse(art("mascot.json")) as { costumes: Record<string, { states: Record<string, { frames: string[]; eyes?: string; eyesBlink?: string }> }> })
    .costumes.bee.states;
  /** The antennae's round tips: behind the body, as round as they come. */
  const tips = (f: string) =>
    parseRig(art(`costumes/bee/${f}.svg`))!.ops.filter((o) => o.part === "back" && o.shape.kind === "ellipse" && o.shape.rx === 4.6).map((o) => centre(o.box));

  it("reads like Candy: his body box, a face that turns, stripes that stay put, wings and arms of its own", () => {
    for (const f of ["idle", "happy", "worried", "angry", "sick", "stop", "wave-1", "wave-2", "excited-2", "love"]) {
      const rig = parseRig(art(`costumes/bee/${f}.svg`))!;
      // Where Candy's is: hats and face accessories land where they do on him.
      expect(rig.body, f).toEqual({ x: 28, y: 24, w: 72, h: 82 });
      expect(paletteOf(rig), f).not.toBeNull();
      // The stinger is no wick to recolour.
      expect(wickOf(rig), f).toBeNull();
      expect(hasArms(rig), f).toBe(true);
      expect(cheeksOf(rig), f).toHaveLength(2);
      expect(rig.ops.some((o) => o.part === "mouth"), f).toBe(true);
      // The stripes are skin, clipped to the body: they don't slide across the face.
      expect(rig.ops.filter((o) => o.part === "skin" && o.clips.length).length, f).toBeGreaterThanOrEqual(2);
      for (const o of rig.ops.filter((o) => o.part === "face" || o.part === "mouth")) expect(o.pivot.w, f).toBeLessThan(rig.body!.w * 0.45);
      // Wings, antennae, arms, feet and the stinger behind; the wings see-through.
      expect(rig.ops.filter((o) => o.part === "back").length, f).toBeGreaterThan(10);
      expect(rig.ops.some((o) => o.part === "back" && o.fillAlpha > 0.5 && o.fillAlpha < 1), f).toBe(true);
    }
    const stop = parseRig(art("costumes/bee/stop.svg"))!;
    expect(stop.ops.some((o) => o.part === "front" && o.shape.kind === "text")).toBe(true);
  });

  it("its antennae show the mood: up at rest, perked when alert, drooping when sad, hearts in love", () => {
    const y = (f: string) => {
      const t = tips(f);
      expect(t, f).toHaveLength(2);
      return Math.max(...t.map((c) => c.y));
    };
    expect(y("alert")).toBeLessThan(y("idle"));
    expect(y("sad")).toBeGreaterThan(y("idle"));
    expect(y("sleepy")).toBeGreaterThan(y("idle"));
    // Confused: one up, one bent.
    const bent = tips("confused").map((c) => c.y);
    expect(Math.abs(bent[0] - bent[1])).toBeGreaterThan(5);
    // In love the tips are hearts.
    expect(tips("love")).toHaveLength(0);
    const love = parseRig(art("costumes/bee/love.svg"))!;
    expect(love.ops.filter((o) => o.part === "back" && o.fill && "color" in o.fill && o.fill.color === "#fb7185")).toHaveLength(2);
  });

  /** Every frame of the bee, by name. */
  const frames = [...new Set(Object.values(states).flatMap((d) => d.frames))].map((f) => [f, parseRig(art(f))!] as const);
  /** How far the face drops or rises when Candy looks down or up (MAX_PITCH in mascot.ts). */
  const PITCH = 6;
  /** Points along a path of absolute M, L, Q, T and Z (the bee's mouths, brows and stripes), the curves' own points, not their control points. */
  const along = (d: string): [number, number][] => {
    const out: [number, number][] = [];
    const tokens = d.match(/[MLQTZ]|-?\d*\.?\d+/g)!;
    let at: [number, number] = [0, 0];
    let ctrl: [number, number] = [0, 0];
    let cmd = "";
    const n = () => +tokens.shift()!;
    const quad = (c: [number, number], end: [number, number]) => {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24;
        out.push([(1 - t) ** 2 * at[0] + 2 * t * (1 - t) * c[0] + t * t * end[0], (1 - t) ** 2 * at[1] + 2 * t * (1 - t) * c[1] + t * t * end[1]]);
      }
      ctrl = c;
      at = end;
    };
    while (tokens.length) {
      if (/[MLQTZ]/.test(tokens[0])) cmd = tokens.shift()!;
      if (cmd === "Z") continue;
      if (cmd === "M" || cmd === "L") {
        at = [n(), n()];
        ctrl = at;
        out.push(at);
      } else if (cmd === "Q") quad([n(), n()], [n(), n()]);
      else if (cmd === "T") quad([2 * at[0] - ctrl[0], 2 * at[1] - ctrl[1]], [n(), n()]);
    }
    return out;
  };
  /** How low a shape reaches, its outline included. */
  const bottomOf = (o: Op) => {
    const s = o.shape;
    const low = s.kind === "path" ? Math.max(...along(s.d).map(([, y]) => y)) : s.kind === "ellipse" ? s.cy + s.ry : s.kind === "rect" ? s.y + s.h : o.box.y + o.box.h;
    return low + (o.stroke ? o.strokeWidth / 2 : 0);
  };
  /** The brows: the dark lines over the eyes. */
  const browsOf = (rig: Rig) => rig.ops.filter((o) => o.part === "face" && o.stroke === "#1d1306" && o.shape.kind === "path" && o.fill === null && centre(o.box).y > 38 && centre(o.box).y < 50);
  /** The dark stripes (skin, clipped to the body): the forehead's and the bottom one. */
  const stripes = (rig: Rig) => {
    const dark = rig.ops.filter((o) => o.part === "skin" && o.clips.length && o.shape.kind === "path" && o.fill && "color" in o.fill && o.fill.color === "#2f2215");
    expect(dark).toHaveLength(2);
    return [...dark].sort((a, b) => a.box.y - b.box.y);
  };
  /** A stripe's edge (its first curve: the top one's bottom edge, the bottom one's top edge... see the art) at x. */
  const edgeAt = (stripe: Op, x: number, side: "top" | "bottom") => {
    const pts = along((stripe.shape as { d: string }).d);
    const near = pts.filter(([px]) => Math.abs(px - x) < 2.5).map(([, y]) => y);
    return side === "top" ? Math.min(...near) : Math.max(...near);
  };

  /** A light colour (#rrggbb): the halos, the face's yellow. */
  const light = (c: string) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) > 300;

  it("keeps every mouth clear of the bottom stripe, even looking down, and every brow of the forehead one, even looking up", () => {
    for (const [f, rig] of frames) {
      const [forehead, bottom] = stripes(rig);
      // The stripe's top edge is at y 97 in the middle.
      expect(edgeAt(bottom, 64, "top"), f).toBeGreaterThanOrEqual(96.5);
      // The mouth, less its halo: that one is in the face's colour, it may touch the stripe (and keeps the mouth off it).
      const mouth = rig.ops.filter((o) => o.part === "mouth" && !(o.fill === null && o.stroke && light(o.stroke)));
      expect(mouth.length, f).toBeGreaterThan(0);
      for (const o of mouth) {
        // Over the mouth's whole width: the face drops PITCH when Candy looks down, the stripe stays.
        for (let x = Math.ceil(o.box.x); x <= o.box.x + o.box.w; x++) expect(bottomOf(o) + PITCH, `${f}: mouth at x ${x}`).toBeLessThan(edgeAt(bottom, x, "top"));
      }
      // The brows: looking up all the way they rise PITCH, and reach at most 2 into the stripe, where their halo (1.5 a side) keeps them apart.
      for (const o of browsOf(rig)) {
        for (const [x, y] of along((o.shape as { d: string }).d)) expect(y - o.strokeWidth / 2 - PITCH, `${f}: brow at x ${x}`).toBeGreaterThan(edgeAt(forehead, x, "bottom") - 2);
      }
    }
  });

  it("draws every brow and mouth line on a halo in the face's colour, and rings its open mouth in it", () => {
    for (const [f, rig] of frames) {
      const lines = [...browsOf(rig), ...rig.ops.filter((o) => o.part === "mouth" && o.stroke === "#1d1306" && o.shape.kind === "path" && o.fill === null)];
      for (const o of lines) {
        const d = (o.shape as { d: string }).d;
        const halo = rig.ops.find((h) => h.shape.kind === "path" && h.shape.d === d && h.stroke && light(h.stroke) && h.strokeWidth >= o.strokeWidth + 2);
        expect(halo, `${f}: ${d}`).toBeTruthy();
        // The line is drawn again over it (a mouth's first, bare copy is under it: see the next lines).
        const last = Math.max(...rig.ops.map((h, k) => (h.shape.kind === "path" && h.shape.d === d && h.stroke === "#1d1306" ? k : -1)));
        expect(last, `${f}: ${d} over its halo`).toBeGreaterThan(rig.ops.indexOf(halo!));
      }
      // An open mouth is filled with the first line's colour, dark, and ringed in the halo.
      const ink = rig.ops.find((o) => o.part === "mouth" && o.stroke)!;
      expect(ink.stroke, f).toBe("#1d1306");
      const halo = mouthHalo(rig);
      expect(halo && light(halo), `${f}: ${halo}`).toBe(true);
    }
    // Pale when sick: the halo too.
    expect(mouthHalo(parseRig(art("costumes/bee/sick.svg"))!)).not.toBe(mouthHalo(parseRig(art("costumes/bee/idle.svg"))!));
  });

  it("is the only one whose open mouth gets a ring: no other art has a halo under its mouth", () => {
    const manifest = JSON.parse(art("mascot.json")) as { states: Record<string, { frames: string[] }>; costumes: Record<string, { states: Record<string, { frames: string[] }> }> };
    const others = [manifest.states, ...Object.entries(manifest.costumes).filter(([id]) => id !== "bee").map(([, c]) => c.states)];
    const files = new Set(others.flatMap((s) => Object.values(s).flatMap((d) => d.frames)));
    expect(files.size).toBeGreaterThan(100);
    for (const f of files) {
      const rig = parseRig(art(f));
      if (rig) expect(mouthHalo(rig), f).toBeNull();
    }
  });

  it("puts its eyes where Candy's are, so glasses fit and the gaze reads, in every layer", () => {
    const layers = new Set(Object.values(states).flatMap((d) => [d.eyes, d.eyesBlink].filter((e): e is string => !!e)));
    expect(layers.size).toBeGreaterThan(10);
    for (const e of layers) {
      const eyes = parseRig(art(e), true)!;
      expect(eyes, e).not.toBeNull();
      const xs = eyes.ops.map((o) => centre(o.box).x);
      expect(Math.min(...xs), e).toBeGreaterThan(38);
      expect(Math.max(...xs), e).toBeLessThan(90);
      expect(xs.some((x) => x < 60) && xs.some((x) => x > 68), e).toBe(true);
      for (const o of eyes.ops) expect(Math.abs(centre(o.box).y - 60), e).toBeLessThan(8);
    }
  });
});

describe("path boxes", () => {
  it("follows relative commands and arcs", () => {
    expect(pathPoints("M55 77 Q64 86 73 77")).toEqual([[55, 77], [64, 86], [73, 77]]);
    const spiral = pathPoints("M50 60 m-1 0 a1.5 1.5 0 1 1 3 0");
    expect(spiral[1]).toEqual([49, 60]);
    expect(spiral.at(-1)?.[0]).toBeGreaterThan(50);
  });

  it("stops on what it can't read instead of looping", () => {
    expect(pathPoints("M0 0 Z 4 4").length).toBe(1);
    expect(pathPoints("12 12")).toEqual([]);
  });
});

describe("turning the face", () => {
  const body = { x: 28, y: 24, w: 72, h: 82 };

  it("leaves the face alone looking ahead", () => {
    const t = turnFeature(50, body, 0);
    expect(t.x).toBeCloseTo(50);
    expect(t.scale).toBeCloseTo(1);
  });

  it("slides features the way it turns, the far side narrowing", () => {
    const left = turnFeature(50, body, 0.4);
    const right = turnFeature(78, body, 0.4);
    expect(left.x).toBeGreaterThan(50);
    expect(right.x).toBeGreaterThan(78);
    expect(right.scale).toBeLessThan(1);
    expect(left.scale).toBeGreaterThan(right.scale);
  });
});
