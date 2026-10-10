import { describe, expect, it } from "vitest";
import type { Manifest } from "./mascot";
import { TOOLTIP_MAX, trayKey, trayLook, trayTooltip } from "./tray";

const manifest: Manifest = {
  name: "test",
  states: {
    idle: { frames: ["idle.svg"], eyes: "eyes/open.svg", eyesBlink: "eyes/blink.svg" },
    worried: { frames: ["worried.svg"], eyes: "eyes/open.svg", tint: false },
  },
};
const PINK = "hue-rotate(200deg)";

describe("the tray icon", () => {
  it("wears the mood and the trader's colour", () => {
    expect(trayLook(manifest, "idle", PINK, false, false)).toEqual({ frame: "idle.svg", eyes: "eyes/open.svg", filter: PINK, dot: false });
  });

  it("keeps a red mood red, whatever the colour", () => {
    expect(trayLook(manifest, "worried", PINK, false, false).filter).toBe("none");
  });

  it("borrows a missing mood's look like the island does", () => {
    expect(trayLook(manifest, "happy", PINK, false, false).frame).toBe("idle.svg");
  });

  it("greys out with its eyes shut while paused", () => {
    const look = trayLook(manifest, "worried", PINK, true, false);
    expect(look).toEqual({ frame: "idle.svg", eyes: "eyes/blink.svg", filter: "grayscale(1) brightness(0.8)", dot: false });
  });

  it("shows a dot for an alert nobody has seen, and only redraws on a change", () => {
    const quiet = trayLook(manifest, "idle", PINK, false, false);
    const alerted = trayLook(manifest, "idle", PINK, false, true);
    expect(alerted.dot).toBe(true);
    expect(trayKey(alerted)).not.toBe(trayKey(quiet));
    expect(trayKey(trayLook(manifest, "idle", PINK, false, false))).toBe(trayKey(quiet));
  });
});

describe("the tray tooltip", () => {
  it("says which Candy, how today went and what moved most", () => {
    expect(trayTooltip("0.1.13", { total: 0.42, count: 3, unit: "SOL" }, "BONK +12.4% today", false)).toBe(
      "Candy 0.1.13\nToday: +0.42 SOL (3 trades)\nTop mover: BONK +12.4% today",
    );
    expect(trayTooltip("0.1.13", { total: -35, count: 1, unit: "USD" }, null, true)).toBe("Candy 0.1.13 (paused)\nToday: −35.0 USD (1 trade)");
    expect(trayTooltip("0.1.13", null, null, false)).toBe("Candy 0.1.13\nToday: no trades yet");
  });

  it("never runs past what Windows shows", () => {
    const long = trayTooltip("0.1.13", { total: 1, count: 2, unit: "SOL" }, `${"X".repeat(200)} +5% today`, false);
    expect(long.length).toBe(TOOLTIP_MAX);
    expect(long.endsWith("…")).toBe(true);
  });
});
