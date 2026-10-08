import { describe, expect, it } from "vitest";
import type { Manifest } from "./mascot";
import { trayKey, trayLook } from "./tray";

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
