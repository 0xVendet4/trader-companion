import { describe, expect, it } from "vitest";
import { Tracked } from "./anim";
import { CLOSE_MS, OPEN_DAMPING, OPEN_RESPONSE } from "./layout";

/** Opens 184 → 660 px at 60 fps: when it looks done, when the loop stops, how far it overshoots. */
function open(response: number, damping: number) {
  const t = new Tracked(184);
  t.springTo(660, response, damping);
  let now = 0;
  let looksDone = Infinity;
  let peak = 0;
  for (let frame = 0; frame < 600; frame++) {
    now += 1000 / 60;
    t.step(1 / 60, now);
    peak = Math.max(peak, t.value);
    if (looksDone === Infinity && Math.abs(660 - t.value) < 1) looksDone = now;
    if (!t.animating) return { looksDone, stops: now, overshoot: peak - 660 };
  }
  return { looksDone, stops: Infinity, overshoot: peak - 660 };
}

describe("island motion", () => {
  it("opens at least twice as fast as Coucou's Mac spring", () => {
    const before = open(0.5, 0.72);
    const after = open(OPEN_RESPONSE, OPEN_DAMPING);
    expect(after.looksDone).toBeLessThan(300);
    expect(after.looksDone).toBeLessThan(before.looksDone / 2);
    // The frame loop must not keep running long after the motion is over.
    expect(after.stops).toBeLessThan(500);
  });

  it("barely overshoots on the way open", () => {
    expect(open(OPEN_RESPONSE, OPEN_DAMPING).overshoot).toBeLessThan(2);
  });

  it("closes in under a fifth of a second", () => {
    const t = new Tracked(660);
    t.curveTowards(0, CLOSE_MS, 0);
    let now = 0;
    while (t.animating && now < 1000) {
      now += 1000 / 60;
      t.step(1 / 60, now);
    }
    expect(now).toBeLessThanOrEqual(CLOSE_MS + 17);
  });
});
