/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { normalizeSettings, validRpcUrl, type Settings } from "./state";
import {
  COMPACT,
  COMPACT_H,
  COMPACT_SCREEN_H,
  COMPACT_W,
  FLOAT_MARGIN,
  HEADER_H,
  MASCOT_CAPTION_H,
  NORMAL,
  PANEL_H,
  SIDEBAR_W,
  SIDE_PANEL_H,
  SIDE_PANEL_W,
  SIDE_TAB_H,
  compactFor,
  density,
  floatsUp,
  islandCorners,
  islandOrigin,
  islandSize,
  mascotPlacement,
  sidebarHeight,
  tickerSeat,
  viewHeight,
} from "./layout";
import { OUTFIT_IDS, type IslandViewName } from "./state";
import { islandIds, shelfOf } from "./looks";

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
    expect(islandSize("compact", "watchlist", 3, "left")).toEqual({ w: NORMAL.tickerH, h: SIDE_TAB_H });
    expect(islandSize("hidden", "watchlist", 3, "right").w).toBe(0);
    expect(islandSize("hidden", "watchlist", 3, "float")).toEqual(islandSize("compact", "watchlist", 3, "top"));
    // Open on a side edge, it is a sidebar: narrow, and taller for the same list.
    const side = islandSize("expanded", "watchlist", 3, "left");
    const top = islandSize("expanded", "watchlist", 3, "top");
    expect(side.w).toBe(SIDEBAR_W);
    expect(side.h).toBeGreaterThan(top.h);
    expect(islandSize("expanded", "watchlist", 30, "right").h).toBeLessThanOrEqual(SIDE_PANEL_H - 20);
    // The sidebar's discipline pane has a row for its foot's second line; a wider face (a monospace theme) adds one for the session line. Nothing else moves.
    // Classic: 70 + 72 above the pane, the pane (196) and the foot's row.
    expect(islandSize("expanded", "discipline", 0, "left").h).toBe(70 + 72 + 196 + 14);
    expect(islandSize("expanded", "discipline", 0, "left", false, true).h).toBe(islandSize("expanded", "discipline", 0, "left").h + 14);
    expect(islandSize("expanded", "discipline", 0, "top", false, true)).toEqual(islandSize("expanded", "discipline", 0, "top"));
    expect(islandSize("expanded", "watchlist", 3, "left", false, true)).toEqual(islandSize("expanded", "watchlist", 3, "left"));
    // And on the compact island too.
    expect(islandSize("expanded", "discipline", 0, "left", true, true).h).toBe(islandSize("expanded", "discipline", 0, "left", true).h + 14);
  });
});

describe("compact island", () => {
  const TABS: IslandViewName[] = ["watchlist", "trending", "alerts", "positions", "wallets", "discipline", "wardrobe", "music"];

  it("is the trader's choice, or the display's height on auto", () => {
    expect(compactFor("on", 2160)).toBe(true);
    expect(compactFor("off", 600)).toBe(false);
    // A 1366 × 768 laptop and a 1440 × 900 MacBook Air; not a 1080p desktop.
    expect(compactFor("auto", 768)).toBe(true);
    expect(compactFor("auto", COMPACT_SCREEN_H)).toBe(true);
    expect(compactFor("auto", 1080)).toBe(false);
    // The height is the one Rust reports: logical px, after the display's
    // scaling. A 1080p monitor at Windows' 125 % has 864 px of room, so it
    // gets the compact island (the settings hint says so); at 100 % it keeps
    // the normal one.
    expect(compactFor("auto", 1080 / 1.25)).toBe(true);
    expect(compactFor("auto", 2160 / 2)).toBe(false);
    // The display not known yet: the normal island.
    expect(compactFor("auto", 0)).toBe(false);
  });

  it("is a step smaller in every height, and the normal island keeps its numbers", () => {
    expect(density(false)).toBe(NORMAL);
    expect(density(true)).toBe(COMPACT);
    for (const k of Object.keys(NORMAL) as (keyof typeof NORMAL)[]) expect(COMPACT[k]).toBeLessThan(NORMAL[k]);
    expect(NORMAL.headerH).toBe(HEADER_H);
    expect(NORMAL.tickerH).toBe(COMPACT_H);
    // What the island measured before densities: the normal numbers are unchanged.
    expect(viewHeight("watchlist", 4)).toBe(HEADER_H + 4 * 30 + 26 + 50 + 24);
    expect(viewHeight("watchlist", 0)).toBe(HEADER_H + 132);
    expect(viewHeight("positions", 3)).toBe(HEADER_H + 3 * 40 + 203);
    expect(viewHeight("alerts", 2)).toBe(HEADER_H + 132);
    expect(viewHeight("wallets", 3)).toBe(HEADER_H + 3 * 48 + 6 + 62);
    expect(viewHeight("discipline", 1)).toBe(PANEL_H - 20);
  });

  it("makes every tab view lower, the ticker shorter, and never taller than the window", () => {
    for (const view of TABS) {
      for (const rows of [0, 1, 3, 6]) {
        const tall = islandSize("expanded", view, rows, "top", false);
        const low = islandSize("expanded", view, rows, "top", true);
        expect(low.w).toBe(tall.w);
        expect(low.h).toBeLessThan(tall.h);
        expect(low.h).toBeLessThanOrEqual(PANEL_H - 20);
        expect(low.h).toBeGreaterThanOrEqual(COMPACT.headerH + COMPACT.minBody);
      }
    }
    expect(islandSize("compact", "watchlist", 3, "top", true)).toEqual({ w: COMPACT_W, h: COMPACT.tickerH });
    expect(islandSize("compact", "watchlist", 3, "top", false)).toEqual({ w: COMPACT_W, h: COMPACT_H });
    // The side tab is the ticker upright: as thin as the ticker is tall.
    expect(islandSize("compact", "watchlist", 3, "left", true)).toEqual({ w: COMPACT.tickerH, h: SIDE_TAB_H });
    // The sidebar shrinks with its rows too; the event card and the greeting don't.
    expect(islandSize("expanded", "watchlist", 6, "right", true).h).toBeLessThan(islandSize("expanded", "watchlist", 6, "right", false).h);
    expect(islandSize("expanded", "event", 0, "top", true)).toEqual(islandSize("expanded", "event", 0, "top", false));
  });

  it("seats Candy's desktop flights where the page draws the ticker's mascot, and Rust's fallback is the normal top seat", async () => {
    // The seat the island pushes (set_ticker_seat): the ticker mascot's centre, compact or not, upright on a side edge.
    expect(tickerSeat("top", false)).toEqual({ cx: 22, cy: 16 });
    expect(tickerSeat("top", true)).toEqual({ cx: 8 + COMPACT.tickerMascot / 2, cy: COMPACT.tickerH / 2 });
    expect(tickerSeat("float", true)).toEqual(tickerSeat("top", true));
    expect(tickerSeat("left", false)).toEqual({ cx: COMPACT_H / 2, cy: COMPACT_H / 2 + 6 });
    expect(tickerSeat("right", true)).toEqual({ cx: COMPACT.tickerH / 2, cy: COMPACT.tickerH / 2 + 6 });
    // Until the page has said, desktop.rs uses ISLAND_MASCOT: it must be the normal top seat.
    const { readFileSync } = await import("node:fs");
    const rs = readFileSync(new URL("../../src-tauri/src/desktop.rs", import.meta.url), "utf8");
    const m = /const ISLAND_MASCOT: \(f64, f64\) = \(([\d.]+), ([\d.]+)\);/.exec(rs);
    expect(m).not.toBeNull();
    expect({ cx: Number(m![1]), cy: Number(m![2]) }).toEqual(tickerSeat("top", false));
  });

  it("keeps the mascot and its caption inside the lowest compact island, centred", () => {
    for (const view of TABS) {
      const h = islandSize("expanded", view, 0, "top", true).h;
      const m = mascotPlacement("expanded", view, h, "top", true);
      expect(m.size).toBe(COMPACT.mascot);
      const top = m.cy - m.size / 2;
      expect(top).toBeGreaterThanOrEqual(COMPACT.headerH);
      expect(top + m.size + MASCOT_CAPTION_H).toBeLessThanOrEqual(h);
      expect(Math.abs(top - COMPACT.headerH - (h - (top + m.size + MASCOT_CAPTION_H)))).toBeLessThan(1);
    }
    // In the ticker: a smaller mascot, centred on the shorter pill, 8 px from its edge.
    const t = mascotPlacement("compact", "watchlist", COMPACT.tickerH, "top", true);
    expect(t).toEqual({ cx: 8 + COMPACT.tickerMascot / 2, cy: COMPACT.tickerH / 2, size: COMPACT.tickerMascot, opacity: 1 });
    expect(mascotPlacement("compact", "watchlist", COMPACT_H)).toEqual({ cx: 22, cy: 16, size: 28, opacity: 1 });
    const side = mascotPlacement("compact", "watchlist", SIDE_TAB_H, "left", true);
    expect(side.cx).toBe(COMPACT.tickerH / 2);
    expect(side.size).toBe(COMPACT.tickerMascot);
  });

  it("is saved as auto, on or off, and older files get auto", () => {
    expect(normalizeSettings({} as Partial<Settings>).companion.compactIsland).toBe("auto");
    expect(normalizeSettings({ companion: { compactIsland: "on" } } as unknown as Partial<Settings>).companion.compactIsland).toBe("on");
    expect(normalizeSettings({ companion: { compactIsland: "off" } } as unknown as Partial<Settings>).companion.compactIsland).toBe("off");
    expect(normalizeSettings({ companion: { compactIsland: "yes" } } as unknown as Partial<Settings>).companion.compactIsland).toBe("auto");
    expect(normalizeSettings({ companion: { compactIsland: true } } as unknown as Partial<Settings>).companion.compactIsland).toBe("auto");
  });
});

describe("placement settings", () => {
  it("repairs a saved placement: unknown values, missing or empty fractions, the floating display", () => {
    // None saved, or one this build doesn't know: the default, floating near the top.
    const old = normalizeSettings({ screen: "primary" } as Partial<Settings>);
    expect(old).toMatchObject({ placement: "float", floatX: 0.5, floatY: 0.12, floatScreen: "" });
    const odd = normalizeSettings({ placement: "middle", floatX: null, floatY: "", floatScreen: 3 } as unknown as Partial<Settings>);
    expect(odd).toMatchObject({ placement: "float", floatX: 0.5, floatY: 0.12, floatScreen: "" });
    expect(normalizeSettings({ placement: "top" } as Partial<Settings>).placement).toBe("top");
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

describe("wardrobe in the sidebar", () => {
  it("has room for six rows of hats on six columns, inside the side window", () => {
    const hats = islandIds(shelfOf("hat")).length;
    expect(hats).toBeLessThan(OUTFIT_IDS.length);
    expect(Math.ceil(hats / 6)).toBe(6);
    const h = sidebarHeight("wardrobe", 0);
    expect(h).toBeLessThanOrEqual(SIDE_PANEL_H - 20);
    expect(islandSize("expanded", "wardrobe", 0, "right").h).toBe(h);
  });

  it("fits the faces as the hats: six rows on the sidebar's six columns, three on the compact island's fourteen", () => {
    const faces = islandIds(shelfOf("face")).length;
    const hats = islandIds(shelfOf("hat")).length;
    expect(Math.ceil(faces / 6)).toBeLessThanOrEqual(Math.ceil(hats / 6));
    expect(Math.ceil(faces / 14)).toBe(3);
    expect(faces % 12).toBe(0);
  });

  it("gives the compact island's wardrobe three rows of fourteen for the hats, still lower than the normal one", () => {
    const hats = islandIds(shelfOf("hat")).length;
    expect(Math.ceil(hats / 14)).toBe(3);
    // Three rows of 34 px looks with 3 px gaps (style.css), under the shelf switch.
    expect(COMPACT.wardrobeH).toBeGreaterThanOrEqual(3 * 34 + 2 * 3 + 60);
    expect(viewHeight("wardrobe", 0, undefined, COMPACT)).toBeLessThan(viewHeight("wardrobe", 0, undefined, NORMAL));
  });
});
