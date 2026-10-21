import { describe, expect, it } from "vitest";
import { DesktopController, isOverBody, pointerDistance, shouldSleep, windowDragTopLeft, type DesktopPorts } from "./desktop-logic";

function harness(over: Partial<{ alert: boolean; flyOut: boolean }> = {}) {
  const log: string[] = [];
  const timers: (() => void)[] = [];
  let alert = over.alert ?? false;
  const ports: DesktopPorts = {
    flyOut: async (anywhere) => {
      log.push(`flyOut${anywhere ? "(anywhere)" : ""}`);
      return over.flyOut ?? true;
    },
    flyHome: async (forget) => {
      log.push(`flyHome${forget ? "(forget)" : ""}`);
      return true;
    },
    setAway: (away) => log.push(`away=${away}`),
    react: (state) => log.push(`react:${state}`),
    play: (sound) => log.push(`play:${sound}`),
    alertActive: () => alert,
    revealIsland: () => log.push("reveal"),
    later: (fn) => timers.push(fn),
  };
  const c = new DesktopController(ports);
  return { c, log, timers, setAlert: (on: boolean) => (alert = on) };
}

describe("the desktop life cycle", () => {
  it("flies out at launch only if he lives there, and lands", async () => {
    const { c, log } = harness();
    await c.launchFlyIfNeeded();
    expect(log).toEqual([]);
    c.enabled = true;
    await c.launchFlyIfNeeded();
    expect(log).toEqual(["away=true", "flyOut"]);
    expect(c.phase).toBe("onDesktop");
  });

  it("stays home when his spot's display is gone", async () => {
    const { c, log } = harness({ flyOut: false });
    c.enabled = true;
    await c.launchFlyIfNeeded();
    expect(log).toEqual(["away=true", "flyOut", "away=false"]);
    expect(c.phase).toBe("home");
    expect(c.enabled).toBe(false);
  });

  it("comes home for an alert card and flies back out once it is dismissed", async () => {
    const { c, log, timers, setAlert } = harness();
    c.enabled = true;
    await c.launchFlyIfNeeded();
    setAlert(true);
    c.updateAlert(true);
    expect(c.phase).toBe("retracting");
    expect(log.at(-1)).toBe("play:eep");
    timers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.phase).toBe("atIslandForAlert");
    expect(log).toContain("flyHome");
    expect(log).toContain("reveal");
    setAlert(false);
    c.updateAlert(false);
    expect(c.phase).toBe("home");
    timers.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.phase).toBe("onDesktop");
  });

  it("goes home for good on a double click, and a drop on the desktop installs him", async () => {
    const { c, log } = harness();
    c.installed();
    expect(c.enabled).toBe(true);
    expect(c.phase).toBe("onDesktop");
    await c.flyHome();
    expect(c.phase).toBe("home");
    expect(c.enabled).toBe(false);
    expect(log).toContain("flyHome(forget)");
    expect(log.at(-1)).toBe("play:greet");
  });
});

describe("desktop helpers", () => {
  it("dozes off only after a while with the pointer away", () => {
    expect(shouldSleep(130, 300)).toBe(true);
    expect(shouldSleep(130, 20)).toBe(false);
    expect(shouldSleep(60, 300)).toBe(false);
    expect(pointerDistance(true, { x: 140, y: 140 }, 0)).toBe(0);
    expect(pointerDistance(true, null, 0)).toBe(Infinity);
    expect(pointerDistance(false, null, 1000)).toBe(0);
    expect(pointerDistance(false, null, 9000)).toBe(Infinity);
  });

  it("hits the body, not the corners, and moves the window with the pointer", () => {
    expect(isOverBody({ x: 140, y: 140 })).toBe(true);
    expect(isOverBody({ x: 5, y: 5 })).toBe(false);
    expect(windowDragTopLeft({ x: 100, y: 200 }, { x: 60, y: 30 }, { x: 50, y: 20 }, 2)).toEqual({ x: 120, y: 220 });
  });
});
