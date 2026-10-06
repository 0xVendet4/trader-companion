import { describe, expect, it } from "vitest";
import { normalizeSettings, validRpcUrl, type Settings } from "./state";
import {
  FLOAT_MARGIN,
  HEADER_H,
  MASCOT_CAPTION_H,
  PANEL_H,
  SIDEBAR_W,
  SIDE_PANEL_H,
  SIDE_PANEL_W,
  SIDE_TAB_H,
  SIDE_TAB_W,
  floatsUp,
  islandCorners,
  islandOrigin,
  islandSize,
  mascotPlacement,
  viewHeight,
} from "./layout";

describe("mascot placement", () => {
  it("keeps the mascot and its caption centred in the left column, however tall the island", () => {
    for (const rows of [0, 1, 3, 6]) {
      const islandH = viewHeight("watchlist", rows);
      const m = mascotPlacement("expanded", "watchlist", islandH);
      const groupTop = m.cy - m.size / 2;
      const groupBottom = groupTop + m.size + MASCOT_CAPTION_H;
      const spaceAbove = groupTop - HEADER_H;
      const spaceBelow = islandH - groupBottom;
      expect(Math.abs(spaceAbove - spaceBelow)).toBeLessThan(1);
    }
  });

  it("never tucks the mascot under the header on a short island", () => {
    const m = mascotPlacement("expanded", "watchlist", HEADER_H + 60);
    expect(m.cy - m.size / 2).toBeGreaterThanOrEqual(HEADER_H);
  });
});

describe("placement", () => {
  it("glues the island to its edge, centred along it", () => {
    expect(islandOrigin("top", 320, 32)).toEqual({ x: 200, y: 0 });
    expect(islandOrigin("left", 70, 140)).toEqual({ x: 0, y: (SIDE_PANEL_H - 140) / 2 });
    expect(islandOrigin("right", 70, 140)).toEqual({ x: SIDE_PANEL_W - 70, y: (SIDE_PANEL_H - 140) / 2 });
  });

  it("hangs a floating island from the window's top, or its bottom in the lower half", () => {
    expect(islandOrigin("float", 320, 32, floatsUp(0.3))).toEqual({ x: 200, y: FLOAT_MARGIN });
    expect(islandOrigin("float", 320, 32, floatsUp(0.8))).toEqual({ x: 200, y: PANEL_H - FLOAT_MARGIN - 32 });
  });

  it("rounds only the corners away from the edge", () => {
    expect(islandCorners("top", 14)).toBe("0 0 14px 14px");
    expect(islandCorners("left", 14)).toBe("0 14px 14px 0");
    expect(islandCorners("right", 14)).toBe("14px 0 0 14px");
    expect(islandCorners("float", 14)).toBe("14px");
  });

  it("stands the compact island upright on a side edge, and never hides a floating one", () => {
    expect(islandSize("compact", "watchlist", 3, "left")).toEqual({ w: SIDE_TAB_W, h: SIDE_TAB_H });
    expect(islandSize("hidden", "watchlist", 3, "right").w).toBe(0);
    expect(islandSize("hidden", "watchlist", 3, "float")).toEqual(islandSize("compact", "watchlist", 3, "top"));
    // Open on a side edge, it is a sidebar: narrow, and taller for the same list.
    const side = islandSize("expanded", "watchlist", 3, "left");
    const top = islandSize("expanded", "watchlist", 3, "top");
    expect(side.w).toBe(SIDEBAR_W);
    expect(side.h).toBeGreaterThan(top.h);
    expect(islandSize("expanded", "watchlist", 30, "right").h).toBeLessThanOrEqual(SIDE_PANEL_H - 20);
  });
});

describe("placement settings", () => {
  it("repairs a saved placement: unknown values, missing or empty fractions, the floating display", () => {
    const old = normalizeSettings({ screen: "primary" } as Partial<Settings>);
    expect(old).toMatchObject({ placement: "top", floatX: 0.5, floatY: 0.12, floatScreen: "" });
    const odd = normalizeSettings({ placement: "middle", floatX: null, floatY: "", floatScreen: 3 } as unknown as Partial<Settings>);
    expect(odd).toMatchObject({ placement: "top", floatX: 0.5, floatY: 0.12, floatScreen: "" });
    const kept = normalizeSettings({ placement: "float", floatX: 1.4, floatY: 0, floatScreen: "\\\\.\\DISPLAY2" } as Partial<Settings>);
    expect(kept).toMatchObject({ placement: "float", floatX: 1, floatY: 0, floatScreen: "\\\\.\\DISPLAY2" });
  });
});

describe("own Solana RPC", () => {
  it("takes a plain https URL, key and all, and nothing else", () => {
    expect(validRpcUrl("")).toBe(true);
    expect(validRpcUrl("https://solana-mainnet.g.alchemy.com/v2/abc123")).toBe(true);
    expect(validRpcUrl("https://mainnet.helius-rpc.com/?api-key=abc123")).toBe(true);
    for (const bad of ["http://solana-mainnet.g.alchemy.com/v2/abc", "https://user:pass@x.example/", "solana-mainnet.g.alchemy.com/v2/abc", "javascript:alert(1)"]) {
      expect(validRpcUrl(bad)).toBe(false);
    }
  });

  it("is repaired in older or odd settings files", () => {
    expect(normalizeSettings({} as Partial<Settings>).rpcUrl).toBe("");
    expect(normalizeSettings({ rpcUrl: 7 } as unknown as Partial<Settings>).rpcUrl).toBe("");
    expect(normalizeSettings({ rpcUrl: "  https://x.example/k  " } as Partial<Settings>).rpcUrl).toBe("https://x.example/k");
  });
});
