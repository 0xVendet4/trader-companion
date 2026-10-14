import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IslandStateMachine } from "./fsm";

describe("the island's state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const machine = () => {
    const fsm = new IslandStateMachine();
    const seen: string[] = [];
    fsm.onTransition = (_from, to) => seen.push(to);
    return { fsm, seen };
  };

  it("opens on a click only, unless Open on hover is on", () => {
    const { fsm, seen } = machine();
    fsm.mouseEntered();
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual(["petit"]);
    fsm.click();
    expect(fsm.state).toBe("home");
  });

  it("opens on a hover, and folds soon after the pointer leaves", () => {
    const { fsm, seen } = machine();
    fsm.openOnHover = true;
    fsm.mouseEntered();
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(["petit", "home"]);
    fsm.mouseLeft();
    vi.advanceTimersByTime(700);
    expect(fsm.state).toBe("petit");
  });

  it("stays open like a clicked one once clicked inside", () => {
    const { fsm } = machine();
    fsm.openOnHover = true;
    fsm.homeToPetitDelay = 15;
    fsm.mouseEntered();
    vi.advanceTimersByTime(300);
    fsm.userInteracted();
    fsm.mouseLeft();
    vi.advanceTimersByTime(2000);
    expect(fsm.state).toBe("home");
    vi.advanceTimersByTime(14_000);
    expect(fsm.state).toBe("petit");
  });

  it("does not open when the pointer only passes over the ticker", () => {
    const { fsm } = machine();
    fsm.openOnHover = true;
    fsm.mouseEntered();
    vi.advanceTimersByTime(100);
    fsm.mouseLeft();
    vi.advanceTimersByTime(1000);
    expect(fsm.state).toBe("petit");
  });

  it("says how long the auto-close counts, and when it stops", () => {
    const { fsm } = machine();
    const counts: (number | null)[] = [];
    fsm.onCountdown = (s) => counts.push(s);
    fsm.homeToPetitDelay = 8;
    fsm.forceHome();
    fsm.mouseLeft();
    fsm.mouseEntered();
    expect(counts).toEqual([8, null]);
    fsm.mouseLeft();
    vi.advanceTimersByTime(8000);
    expect(counts).toEqual([8, null, 8, null]);
    expect(fsm.state).toBe("petit");
  });

  it("keeps a pinned card open", () => {
    const { fsm } = machine();
    fsm.forceHome();
    fsm.pinned = true;
    fsm.mouseLeft();
    vi.advanceTimersByTime(60_000);
    expect(fsm.state).toBe("home");
  });

  it("holds a card open while something plays out, then counts down from there", () => {
    const { fsm } = machine();
    fsm.homeToPetitDelay = 8;
    fsm.forceHome();
    fsm.mouseLeft();
    vi.advanceTimersByTime(5000);
    fsm.hold(true, false);
    vi.advanceTimersByTime(20_000);
    expect(fsm.state).toBe("home");
    fsm.hold(false, false);
    vi.advanceTimersByTime(7000);
    expect(fsm.state).toBe("home");
    vi.advanceTimersByTime(1000);
    expect(fsm.state).toBe("petit");
  });

  it("lets go without a countdown while the pointer is in the island", () => {
    const { fsm } = machine();
    fsm.forceHome();
    fsm.hold(true, true);
    fsm.hold(false, true);
    vi.advanceTimersByTime(60_000);
    expect(fsm.state).toBe("home");
  });
  it("stays as it is while a panel fills the island: no fold, no hide, no hover-open", () => {
    const { fsm, seen } = machine();
    fsm.openOnHover = true;
    fsm.homeToPetitDelay = 1;
    fsm.petitToHiddenDelay = 1;
    fsm.forceHome();
    fsm.frozen = true;
    fsm.mouseLeft();
    vi.advanceTimersByTime(60_000);
    expect(fsm.state).toBe("home");
    fsm.mouseEntered();
    fsm.mouseLeft();
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual(["home"]);
    // Closed: the usual timers again.
    fsm.frozen = false;
    fsm.mouseLeft();
    vi.advanceTimersByTime(1_100);
    expect(fsm.state).toBe("petit");
  });
});
