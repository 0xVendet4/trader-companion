/// <reference types="node" />
// Every place the island links into Settings (Discipline's "Edit", My
// wallet's "add it in Settings", the closet's "Seasonal looks…") must be
// something Settings tags as a target, or the link opens at the top with
// nothing lit up.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_TARGETS } from "../core/panel";

const root = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });

const settings = readFileSync(join(root, "settings", "main.ts"), "utf8");
/** What Settings tags: its sections (["id", fooSection()]) and single rows (target(…, "id")). */
const tagged = new Set([...settings.matchAll(/\[\s*"(\w+)",\s*\w+Section\(/g), ...settings.matchAll(/\),\s*"(\w+)"\)/g)].map((m) => m[1]));

describe("links into Settings", () => {
  it("each lands on something Settings tags", () => {
    const linked = new Set<string>();
    for (const file of files(root)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/openSettings\("(\w+)"\)|open\("settings",\s*"(\w+)"\)|openPanel\("settings",\s*\{\s*section:\s*"(\w+)"/g)) linked.add(m[1] ?? m[2] ?? m[3]);
    }
    expect(linked.size).toBeGreaterThanOrEqual(3);
    for (const id of linked) {
      expect(SETTINGS_TARGETS as readonly string[], id).toContain(id);
      expect(tagged, id).toContain(id);
    }
  });

  it("every target Settings can be opened at exists", () => {
    for (const id of SETTINGS_TARGETS) expect(tagged, id).toContain(id);
  });
});
