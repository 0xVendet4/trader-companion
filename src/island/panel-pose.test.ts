import { describe, expect, it } from "vitest";
import { NO_PANEL, panelStep, requestPanel, restorePose, type IslandNow, type PanelEvent, type PanelOutcome, type Pose } from "./panel-pose";

const ticker: Pose = { fsm: "petit", view: "watchlist", minimized: false, pinned: false };

describe("a panel in the island", () => {
  it("opens, and remembers how the island was", () => {
    const step = requestPanel(null, "settings", ticker, { toggle: true });
    expect(step).toEqual({ kind: "open", panel: { kind: "settings", section: undefined, restore: ticker }, swap: false });
  });

  it("closes on its own button, the tray item or the shortcut again", () => {
    const open = { kind: "settings" as const, restore: ticker };
    expect(requestPanel(open, "settings", ticker, { toggle: true })).toEqual({ kind: "close" });
  });

  it("scrolls to a section when a link asks for one, instead of closing", () => {
    const open = { kind: "settings" as const, restore: ticker };
    expect(requestPanel(open, "settings", ticker, { section: "wallet", toggle: true })).toEqual({ kind: "reveal", section: "wallet" });
  });

  it("swaps one panel for the other, and still goes back to how the island was before the first", () => {
    const open = { kind: "closet" as const, restore: ticker };
    const later: Pose = { fsm: "home", view: "wardrobe", minimized: false, pinned: true };
    const step = requestPanel(open, "settings", later, { section: "appearance" });
    expect(step).toEqual({ kind: "open", panel: { kind: "settings", section: "appearance", restore: ticker }, swap: true });
  });

  it("puts the island back exactly as it was: the view, open or folded or hidden, pinned, minimized", () => {
    const wardrobe: Pose = { fsm: "home", view: "wardrobe", minimized: false, pinned: true };
    expect(restorePose({ kind: "closet", restore: wardrobe })).toEqual(wardrobe);
    const hidden: Pose = { fsm: "hidden", view: "alerts", minimized: true, pinned: false };
    expect(restorePose({ kind: "settings", restore: hidden })).toEqual(hidden);
    // The launch greeting had played: the ticker comes back.
    expect(restorePose({ kind: "settings", restore: { fsm: "greet", view: "greeting", minimized: false, pinned: false } })).toEqual({ ...ticker, fsm: "petit" });
  });
});

describe("a panel's session in the island", () => {
  const now = (pose: Pose, extra: Partial<IslandNow> = {}): IslandNow => ({ ...pose, menuOpen: false, menuPinned: false, inputFocused: false, ...extra });
  const run = (events: PanelEvent[]) => {
    let session = NO_PANEL;
    const out: PanelOutcome[] = [];
    for (const e of events) {
      const o = panelStep(session, e);
      session = o.session;
      out.push(o);
    }
    return out;
  };

  it("hidden → open → closed: frozen while open, hidden again after", () => {
    const hidden: Pose = { fsm: "hidden", view: "watchlist", minimized: false, pinned: false };
    const [open, close] = run([{ type: "request", kind: "settings", now: now(hidden), toggle: true }, { type: "close", restore: true }]);
    expect(open.frozen).toBe(true);
    expect(open.step?.kind).toBe("open");
    expect(close.frozen).toBe(false);
    expect(close.restore).toEqual(hidden);
    expect(close.session).toEqual(NO_PANEL);
  });

  it("minimized, from the tray: back to minimized", () => {
    const minimized: Pose = { fsm: "hidden", view: "alerts", minimized: true, pinned: false };
    const [, close] = run([{ type: "request", kind: "closet", now: now(minimized), toggle: true }, { type: "request", kind: "closet", now: now(ticker), toggle: true }]);
    expect(close.restore).toEqual(minimized);
  });

  it("Candy's menu open as the panel opens (the tray, the menu's Wardrobe): its pin doesn't stay", () => {
    const menu = now({ fsm: "home", view: "watchlist", minimized: false, pinned: true }, { menuOpen: true, menuPinned: false });
    const [, close] = run([{ type: "request", kind: "settings", now: menu, toggle: true }, { type: "close", restore: true }]);
    expect(close.restore?.pinned).toBe(false);
    // A pin the island had before the menu stays.
    const kept = now({ fsm: "home", view: "event", minimized: false, pinned: true }, { menuOpen: true, menuPinned: true });
    expect(run([{ type: "request", kind: "settings", now: kept }, { type: "close", restore: true }])[1].restore?.pinned).toBe(true);
  });

  it("a field being typed in as the panel opens: its pin ends with it", () => {
    const typing = now({ fsm: "home", view: "watchlist", minimized: false, pinned: true }, { inputFocused: true });
    expect(run([{ type: "request", kind: "settings", now: typing }, { type: "close", restore: true }])[1].restore?.pinned).toBe(false);
  });

  it("an alert while open waits, and shows once the panel closes", () => {
    const [, alert, close] = run([{ type: "request", kind: "settings", now: now(ticker) }, { type: "alert" }, { type: "close", restore: true }]);
    expect(alert.held).toBe(true);
    expect(alert.frozen).toBe(true);
    expect(close.showAlert).toBe(true);
    // No panel: an alert is the island's as always.
    expect(panelStep(NO_PANEL, { type: "alert" }).held).toBe(false);
  });

  it("swaps Settings for the Closet and back, then closes to how the island was before the first", () => {
    const wardrobe: Pose = { fsm: "home", view: "wardrobe", minimized: false, pinned: false };
    const later = now({ fsm: "home", view: "watchlist", minimized: false, pinned: true });
    const [, swap, back, close] = run([
      { type: "request", kind: "closet", now: now(wardrobe), toggle: true },
      { type: "request", kind: "settings", now: later, section: "seasonal" },
      { type: "request", kind: "closet", now: later, toggle: true },
      { type: "close", restore: true },
    ]);
    expect(swap.step).toMatchObject({ kind: "open", swap: true, panel: { kind: "settings", section: "seasonal" } });
    expect(back.step).toMatchObject({ kind: "open", swap: true, panel: { kind: "closet" } });
    expect(close.restore).toEqual(wardrobe);
  });

  it("closed for a view (a tab, the wardrobe): nothing to put back, the island stays open for it", () => {
    const [, close] = run([{ type: "request", kind: "settings", now: now(ticker) }, { type: "close", restore: false }]);
    expect(close.restore).toBeUndefined();
    expect(close.frozen).toBe(false);
  });
});
