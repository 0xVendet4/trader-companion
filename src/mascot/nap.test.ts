import { describe, expect, it } from "vitest";
import { FLOURISHES, shouldFlourish, type Flourish } from "./flourish";
import { NAP_IDLE_MS, calmForNap, napDue, napEnds, wakeFor, type NapScene } from "./nap";

const calm: NapScene = { enabled: true, mood: "idle", melting: false, waiting: false, busy: false };

describe("a nap in a little bed", () => {
  it("only with the PC idle long enough and the market calm", () => {
    expect(napDue(NAP_IDLE_MS - 1, calm)).toBe(false);
    expect(napDue(NAP_IDLE_MS, calm)).toBe(true);
    expect(napDue(NAP_IDLE_MS, { ...calm, mood: "bored" })).toBe(true);
    expect(napDue(NAP_IDLE_MS, { ...calm, mood: "sleepy" })).toBe(true);
    for (const mood of ["worried", "shocked", "celebrate", "happy", "sick", "focused"] as const) {
      expect(napDue(NAP_IDLE_MS * 3, { ...calm, mood }), mood).toBe(false);
    }
  });

  it("never while something waits, he melts, he can't lie down or it is off", () => {
    expect(calmForNap({ ...calm, waiting: true })).toBe(false);
    expect(calmForNap({ ...calm, melting: true })).toBe(false);
    expect(calmForNap({ ...calm, busy: true })).toBe(false);
    expect(calmForNap({ ...calm, enabled: false })).toBe(false);
  });

  it("wakes him with a start when something happens, quietly when it can't go on", () => {
    expect(napEnds(calm)).toBeNull();
    expect(napEnds({ ...calm, mood: "bored" })).toBeNull();
    expect(napEnds({ ...calm, waiting: true })).toBe("startled");
    expect(napEnds({ ...calm, mood: "shocked" })).toBe("startled");
    expect(napEnds({ ...calm, melting: true })).toBe("startled");
    expect(napEnds({ ...calm, enabled: false })).toBe("quiet");
    expect(napEnds({ ...calm, busy: true, waiting: true })).toBe("quiet");
  });

  it("wakes gently when the trader is back (the away card), with a start on news", () => {
    expect(wakeFor("away")).toBe("back");
    for (const kind of ["alert", "lossLimit", "macro", "weekRecap"] as const) expect(wakeFor(kind), kind).toBe("startled");
  });

  it("is not every idle stretch: a chance, then a quiet time", () => {
    const last = new Map<Flourish, number>();
    const t0 = 1_800_000_000_000;
    expect(FLOURISHES.nap.chance).toBeLessThan(1);
    expect(shouldFlourish("nap", last, t0, 0.99)).toBe(false);
    expect(shouldFlourish("nap", last, t0, 0)).toBe(true);
    expect(shouldFlourish("nap", last, t0 + FLOURISHES.nap.quietMs - 1, 0)).toBe(false);
    expect(shouldFlourish("nap", last, t0 + FLOURISHES.nap.quietMs, 0)).toBe(true);
  });
});
