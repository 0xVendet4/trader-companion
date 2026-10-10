import { describe, expect, it } from "vitest";
import { SHORTCUTS, keyName, keysLabel, planShortcuts, recordPress, shortcutKeys, statusLabel, stepTab, twice, type ShortcutId } from "./shortcuts";

const press = (over: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code: string }>) => ({
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  code: "",
  ...over,
});

describe("shortcuts", () => {
  it("records a press with Ctrl, Alt or Win, never a bare key", () => {
    expect(recordPress(press({ ctrlKey: true, altKey: true, code: "KeyV" }))).toBe("CommandOrControl+Alt+V");
    expect(recordPress(press({ ctrlKey: true, shiftKey: true, code: "Space" }))).toBe("CommandOrControl+Shift+Space");
    expect(recordPress(press({ altKey: true, code: "ArrowRight" }))).toBe("Alt+Right");
    expect(recordPress(press({ code: "KeyA" }))).toBeNull();
    expect(recordPress(press({ shiftKey: true, code: "KeyA" }))).toBeNull();
    expect(recordPress(press({ ctrlKey: true, code: "ControlLeft" }))).toBeNull();
    expect(recordPress(press({ code: "F9" }))).toBe("F9");
  });

  it("records ⌘ as CommandOrControl on a Mac, and Control as itself", () => {
    expect(recordPress(press({ metaKey: true, altKey: true, code: "KeyV" }), true)).toBe("CommandOrControl+Alt+V");
    expect(recordPress(press({ ctrlKey: true, altKey: true, code: "KeyV" }), true)).toBe("Control+Alt+V");
    expect(keysLabel("CommandOrControl+Alt+Shift+V", true)).toBe("⌘ + ⌥ + ⇧ + V");
    expect(keysLabel("Control+Alt+Right", true)).toBe("⌃ + ⌥ + →");
  });

  it("names keys the way the accelerators do", () => {
    expect(keyName("KeyQ")).toBe("Q");
    expect(keyName("Digit7")).toBe("7");
    expect(keyName("F12")).toBe("F12");
    expect(keyName("F13")).toBeNull();
    expect(keyName("Backquote")).toBeNull();
  });

  it("reads keys for people", () => {
    expect(keysLabel("CommandOrControl+Alt+Right")).toBe("Ctrl + Alt + →");
    expect(keysLabel("")).toBe("Off");
  });

  it("finds two shortcuts on the same keys", () => {
    expect([...twice({ toggle: "CommandOrControl+Alt+A", alert: "commandorcontrol+alt+a", mute: "CommandOrControl+Alt+S" })].sort()).toEqual(["alert", "toggle"]);
    expect(twice({ toggle: "", alert: "" }).size).toBe(0);
  });

  it("keeps the show/hide and paste keys where older settings have them, the rest with defaults", () => {
    const c = { hotkey: "Alt+Shift+Space", pasteHotkey: "", shortcuts: { mute: "" } };
    expect(shortcutKeys(c, "toggle")).toBe("Alt+Shift+Space");
    expect(shortcutKeys(c, "paste")).toBe("");
    expect(shortcutKeys(c, "mute")).toBe("");
    expect(shortcutKeys(c, "wardrobe")).toBe("CommandOrControl+Alt+G");
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
  });

  it("plans each shortcut: off, types a character, used twice, or registered", () => {
    const keys = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.dflt])) as Record<ShortcutId, string>;
    keys.mute = "";
    keys.wardrobe = "CommandOrControl+Alt+A"; // the same keys as "alert", which comes first
    const types = SHORTCUTS.map((s) => (s.id === "paste" ? "ś" : ""));
    const plan = Object.fromEntries(planShortcuts(keys, types).map((p) => [p.id, p]));
    expect(plan.toggle.register).toBe("CommandOrControl+Shift+Space");
    expect(plan.paste.status).toEqual({ kind: "types", char: "ś" });
    expect(plan.mute.status).toEqual({ kind: "off" });
    expect(plan.alert.register).toBe("CommandOrControl+Alt+A");
    expect(plan.wardrobe.status).toEqual({ kind: "twice" });
  });

  it("steps through the tabs shown, wrapping round", () => {
    const tabs = ["watchlist", "trending", "alerts"];
    expect(stepTab(tabs, "trending", 1)).toBe("alerts");
    expect(stepTab(tabs, "alerts", 1)).toBe("watchlist");
    expect(stepTab(tabs, "watchlist", -1)).toBe("alerts");
    expect(stepTab(tabs, "event", 1)).toBe("watchlist");
    expect(stepTab(tabs, "event", -1)).toBe("alerts");
    expect(stepTab([], "event", 1)).toBeNull();
  });

  it("explains why a shortcut is not working", () => {
    expect(statusLabel({ kind: "types", char: "ą" })).toBe("Types “ą” on your keyboard");
    expect(statusLabel({ kind: "on" })).toBe("");
  });
});
