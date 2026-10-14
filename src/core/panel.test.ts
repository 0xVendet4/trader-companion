import { describe, expect, it } from "vitest";
import { PANEL_MAX_TRANSPARENCY, PANEL_PAD, PANEL_SIZE, SETTINGS_TARGETS, anchoredAt, clampInto, growRect, panelFrame, panelInWindow, panelMascot, panelShowSpot, shownTransparency, type Rect } from "./panel";
import { COMPACT_H, COMPACT_W, PANEL_W, FLOAT_MARGIN, islandOrigin } from "./layout";

const FHD: Rect = { x: 0, y: 0, w: 1920, h: 1040 };
const inside = (r: Rect, area: Rect) => r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h;

describe("the panel's window", () => {
  it("grows down from the top edge, centred like the island", () => {
    const { win, panel } = panelFrame(FHD, "top", PANEL_SIZE.settings);
    expect(win).toEqual({ x: (1920 - 720) / 2, y: 0, w: 720, h: 760 });
    expect(panel).toEqual({ x: PANEL_PAD, y: 0, w: 680, h: 740 });
  });

  it("grows inward from a side edge, centred vertically", () => {
    const left = panelFrame(FHD, "left", PANEL_SIZE.closet);
    expect(left.win).toEqual({ x: 0, y: (1040 - 680) / 2, w: 900, h: 680 });
    expect(left.panel).toEqual({ x: 0, y: PANEL_PAD, w: 880, h: 640 });
    const right = panelFrame(FHD, "right", PANEL_SIZE.closet);
    expect(right.win).toEqual({ x: 1920 - 900, y: (1040 - 680) / 2, w: 900, h: 680 });
    expect(right.panel).toEqual({ x: PANEL_PAD, y: PANEL_PAD, w: 880, h: 640 });
  });

  it("opens around a floating ticker: down in the upper half, up in the lower half", () => {
    // The ticker's centre at (960, 260): its top is 16 px above, the panel's top there.
    const down = panelFrame(FHD, "float", PANEL_SIZE.closet, { x: 0.5, y: 0.25 });
    expect(down.win.y + down.panel.y).toBe(260 - 16);
    expect(down.win.x + down.panel.x + down.panel.w / 2).toBe(960);
    // At (960, 780): the panel's bottom on the ticker's bottom.
    const up = panelFrame(FHD, "float", PANEL_SIZE.closet, { x: 0.5, y: 0.75 });
    expect(up.win.y + up.panel.y + up.panel.h).toBe(780 + 16);
  });

  it("never leaves the work area, and is as big as fits on a small screen", () => {
    // 1366 × 768 with a 40 px taskbar.
    const laptop: Rect = { x: 0, y: 0, w: 1366, h: 728 };
    for (const placement of ["top", "left", "right", "float"] as const) {
      for (const kind of ["settings", "closet"] as const) {
        for (const fy of [0, 0.3, 0.7, 1]) {
          const { win, panel } = panelFrame(laptop, placement, PANEL_SIZE[kind], { x: fy, y: fy });
          expect(inside(win, laptop), `${placement} ${kind} ${fy}`).toBe(true);
          expect(inside({ ...panel, x: win.x + panel.x, y: win.y + panel.y }, laptop)).toBe(true);
        }
      }
    }
    const top = panelFrame(laptop, "top", PANEL_SIZE.settings);
    expect(top.win.h).toBe(728);
    expect(top.panel.h).toBe(728 - PANEL_PAD);
    // A work area that doesn't start at 0 (a second display, a taskbar on top).
    const second: Rect = { x: 1920, y: 40, w: 1280, h: 680 };
    const side = panelFrame(second, "right", PANEL_SIZE.settings);
    expect(side.win).toEqual({ x: 1920 + 1280 - 700, y: 40, w: 700, h: 680 });
  });

  it("keeps the room for the ring only on the free sides", () => {
    expect(panelInWindow("top", 720, 760)).toEqual({ x: 20, y: 0, w: 680, h: 740 });
    expect(panelInWindow("left", 700, 780)).toEqual({ x: 0, y: 20, w: 680, h: 740 });
    expect(panelInWindow("float", 40, 30)).toEqual({ x: 20, y: 20, w: 0, h: 0 });
  });

  it("grows out of the island where it is, and shrinks back into it", () => {
    const panel = { x: 20, y: 0, w: 680, h: 740 };
    // The open island (660 × 200) centred at the top: it stays centred and on the edge as it grows.
    const top = { x: 30, y: 0, w: 660, h: 200 };
    expect(growRect(top, panel, 660, 200)).toEqual({ x: 30, y: 0 });
    expect(growRect(top, panel, 670, 470)).toEqual({ x: 25, y: 0 });
    expect(growRect(top, panel, 680, 740)).toEqual({ x: 20, y: 0 });
    // The side tab against the right edge, centred: it stays against the edge.
    const side = { x: 20, y: 20, w: 680, h: 740 };
    const tab = { x: 668, y: 20 + 195, w: 32, h: 350 };
    const half = growRect(tab, side, 356, 545);
    expect(half.x + 356).toBeCloseTo(700);
    expect(half.y + 545 / 2).toBeCloseTo(20 + 370);
    // An axis whose size doesn't change follows the other.
    expect(growRect({ x: 0, y: 0, w: 680, h: 100 }, { x: 40, y: 0, w: 680, h: 740 }, 680, 420)).toEqual({ x: 20, y: 0 });
    // Nothing changes size: at the panel.
    expect(growRect(panel, panel, 680, 740)).toEqual({ x: 20, y: 0 });
  });

  it("a floating ticker on a laptop: the panel is clamped to the screen, and the island grows out of the ticker's real spot", () => {
    const laptop: Rect = { x: 0, y: 0, w: 1366, h: 728 };
    const float = { x: 0.1, y: 0.3 };
    const { win, panel } = panelFrame(laptop, "float", PANEL_SIZE.settings, float);
    // Too tall to open from the ticker: clamped to the top, and to the left edge.
    expect(win.y).toBe(0);
    expect(win.x).toBe(0);
    // The ticker's window, by the same rule as the island's (island.rs window_frame).
    const cx = float.x * laptop.w;
    const cy = float.y * laptop.h;
    const tickerWin = { x: Math.max(0, cx - PANEL_W / 2), y: cy - FLOAT_MARGIN - COMPACT_H / 2 };
    const o = islandOrigin("float", COMPACT_W, COMPACT_H);
    const ticker = { x: tickerWin.x + o.x - win.x, y: tickerWin.y + o.y - win.y, w: COMPACT_W, h: COMPACT_H };
    const from = clampInto(ticker, win);
    // It starts where the ticker is on screen (not at the panel's top)…
    expect(growRect(from, panel, COMPACT_W, COMPACT_H)).toEqual({ x: from.x, y: from.y });
    expect(from.y + win.y).toBeCloseTo(cy - COMPACT_H / 2);
    // …slides as it grows, and lands on the panel.
    const mid = growRect(from, panel, (COMPACT_W + panel.w) / 2, (COMPACT_H + panel.h) / 2);
    expect(mid.y).toBeGreaterThan(panel.y);
    expect(mid.y).toBeLessThan(from.y);
    expect(growRect(from, panel, panel.w, panel.h)).toEqual({ x: panel.x, y: panel.y });
  });

  it("keeps a rect inside the window it must sit in", () => {
    expect(clampInto({ x: -10, y: 900, w: 100, h: 50 }, { w: 720, h: 760 })).toEqual({ x: 0, y: 710, w: 100, h: 50 });
    expect(clampInto({ x: 900, y: 10, w: 1000, h: 50 }, { w: 720, h: 760 })).toEqual({ x: 0, y: 10, w: 1000, h: 50 });
  });

  it("anchors the island to the window's point that stays put, so it doesn't jump as the window changes under it", () => {
    // At the top: the island window 720 wide, the closet's panel window 920, both centred; the island 350 wide.
    const own = anchoredAt("top", { x: 185, y: 0 }, { w: 720, h: 340 });
    const panel = anchoredAt("top", { x: 185 + 100, y: 0 }, { w: 920, h: 660 });
    expect(own).toEqual(panel);
    expect(own.left).toBe("calc(50% + -175px)");
    // On the right edge: the island window 400 × 640, the panel's 900 × 680, both against the edge and centred.
    const tab = anchoredAt("right", { x: 368, y: 145 }, { w: 400, h: 640 });
    expect(anchoredAt("right", { x: 368 + 500, y: 145 + 20 }, { w: 900, h: 680 })).toEqual(tab);
    expect(anchoredAt("left", { x: 0, y: 145 }, { w: 400, h: 640 })).toEqual(anchoredAt("left", { x: 0, y: 165 }, { w: 700, h: 680 }));
    // Floating: no such point, plain pixels.
    expect(anchoredAt("float", { x: 12.345, y: 7 }, { w: 720, h: 340 })).toEqual({ left: "12.35px", top: "7px" });
  });

  it("keeps Candy and his hat inside the panel at the top edge", () => {
    expect(panelMascot("top").cy - panelMascot("top").size / 2).toBeGreaterThanOrEqual(6);
    expect(panelMascot("left").cy).toBeLessThan(panelMascot("top").cy);
    const show = panelShowSpot("top", 680);
    expect(show.cx).toBe(340);
    expect(show.cy - show.size / 2).toBeGreaterThanOrEqual(10);
    expect(show.size).toBeGreaterThanOrEqual(90);
  });

  it("is only a little see-through under a panel, unless the slider is being dragged", () => {
    expect(shownTransparency(70, false)).toBe(70);
    expect(shownTransparency(70, true)).toBe(PANEL_MAX_TRANSPARENCY);
    expect(shownTransparency(5, true)).toBe(5);
    expect(shownTransparency(70, true, 60)).toBe(60);
    expect(shownTransparency(70, true, 0)).toBe(0);
  });

  it("names every place a link can open Settings at once", () => {
    expect(new Set(SETTINGS_TARGETS).size).toBe(SETTINGS_TARGETS.length);
  });
});
