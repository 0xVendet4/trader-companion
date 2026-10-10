/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { centre, cheeksOf, hasArms, paletteOf, parseRig, pathPoints, turnFeature, wickOf } from "./rig";

const art = (f: string) => readFileSync(join(__dirname, "..", "..", "public", "mascot", f), "utf8");

describe("arms of its own", () => {
  it("the candle has none: his hello draws little hands", () => {
    for (const f of ["idle.svg", "happy.svg"]) expect(hasArms(parseRig(art(f))!), f).toBe(false);
  });

  it("every costume has them: its own arm waves instead", () => {
    // Idle, and happy (what he wears for the hello) where the costume has one.
    for (const f of ["gengar/idle", "gengar/happy", "spiderman/idle", "spiderman/happy", "shadow/idle", "shadow/happy", "v/idle"]) {
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

  it("reads every one of Candy's own frames and eyes", () => {
    const manifest = JSON.parse(art("mascot.json")) as { states: Record<string, { frames: string[]; eyes?: string; eyesBlink?: string }> };
    for (const def of Object.values(manifest.states)) {
      for (const f of def.frames) expect(parseRig(art(f))?.body, f).toBeTruthy();
      for (const e of [def.eyes, def.eyesBlink]) if (e) expect(parseRig(art(e), true), e).not.toBeNull();
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
