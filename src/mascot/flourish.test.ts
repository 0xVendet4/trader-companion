import { describe, expect, it } from "vitest";
import type { CompanionEvent } from "../core/state";
import { FLOURISHES, flameSize, flourishesFor, shouldFlourish, type Flourish } from "./flourish";

const T0 = 1_800_000_000_000;

describe("flourishes", () => {
  it("play only now and then: by chance, then quiet for a while", () => {
    const last = new Map<Flourish, number>();
    // The dice say no: nothing, and nothing remembered.
    expect(shouldFlourish("confetti", last, T0, 0.99)).toBe(false);
    expect(shouldFlourish("confetti", last, T0, 0.1)).toBe(true);
    // Quiet time: even a lucky roll waits.
    expect(shouldFlourish("confetti", last, T0 + 60_000, 0)).toBe(false);
    expect(shouldFlourish("confetti", last, T0 + FLOURISHES.confetti.quietMs, 0)).toBe(true);
  });

  it("never plays every time it could", () => {
    for (const rule of Object.values(FLOURISHES)) {
      expect(rule.chance).toBeLessThan(1);
      expect(rule.quietMs).toBeGreaterThan(0);
    }
  });

  it("matches the moment: up, down, the limit, a green week", () => {
    const alert = (tone: "up" | "down" | "warn"): CompanionEvent => ({ kind: "alert", id: "a", ruleId: "r", address: "x", title: "", detail: "", tone });
    expect(flourishesFor(alert("up"))).toEqual(["confetti", "joyJump", "flame"]);
    expect(flourishesFor(alert("down"))).toEqual(["cloud", "shrink"]);
    expect(flourishesFor(alert("warn"))).toEqual([]);
    expect(flourishesFor({ kind: "lossLimit", id: "l", total: -3, limit: 3, unit: "SOL" })).toEqual(["smoke"]);
    const week: CompanionEvent = { kind: "weekRecap", id: "w", from: 0, to: 1, label: "" };
    expect(flourishesFor(week, 2.5)).toEqual(["fireworks"]);
    expect(flourishesFor(week, -1)).toEqual([]);
  });

  it("lights the wick bigger the more the hour rose", () => {
    expect(flameSize(null)).toBeNull();
    expect(flameSize(1.5)).toBeNull();
    expect(flameSize(3)).toBeCloseTo(0.7);
    expect(flameSize(13)).toBeCloseTo(1.1);
    expect(flameSize(80)).toBe(1.5);
  });
});
