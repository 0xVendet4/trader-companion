/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useWords, type Dict, type Lang } from "../core/i18n";
import { lookName } from "../core/looks";
import { COSTUME_IDS, COSTUME_NAMES, NOUN_COSTUMES, OFFERED_COSTUMES, costumeName, normalizeSettings, offeredCostumes } from "../core/state";
import de from "../i18n/de";
import es from "../i18n/es";
import fr from "../i18n/fr";
import ja from "../i18n/ja";
import ko from "../i18n/ko";
import pt from "../i18n/pt";
import ru from "../i18n/ru";
import tr from "../i18n/tr";
import zh from "../i18n/zh";
import { MASCOT_STATES, dressed, resolveState, type Manifest } from "./mascot";
import { lookFilter } from "./skins";

const DIR = join(__dirname, "..", "..", "public", "mascot");
const manifest = JSON.parse(readFileSync(join(DIR, "mascot.json"), "utf8")) as Manifest & {
  costumes: Record<string, { exclusive?: boolean }>;
};

describe("costumes", () => {
  it("every costume has art, for every mood, on disk", () => {
    // A friend's "edition" costume is not in the repository (editions/, ignored).
    for (const id of COSTUME_IDS.filter((c) => c !== "none" && c !== "edition")) {
      const states = manifest.costumes?.[id]?.states;
      expect(states, id).toBeTruthy();
      for (const s of MASCOT_STATES) {
        const def = states![s];
        expect(def?.frames.length, `${id} ${s}`).toBeGreaterThan(0);
        for (const f of [...def!.frames, def!.eyes, def!.eyesBlink, def!.blink].filter(Boolean)) {
          expect(existsSync(join(DIR, f!)), f).toBe(true);
        }
      }
    }
  });

  it("dresses the mascot in a costume's frames, keeping Candy's motion", () => {
    const gengar = dressed(manifest, "gengar");
    expect(resolveState(gengar, "idle")?.frames[0]).toBe("costumes/gengar/idle.svg");
    expect(resolveState(gengar, "celebrate")?.motion).toBe(resolveState(manifest, "celebrate")?.motion);
    expect(gengar.outfits).toBe(manifest.outfits);
    expect(dressed(manifest, "none")).toBe(manifest);
    expect(dressed(manifest, "nobody")).toBe(manifest);
  });

  it("the astronaut and the ninja draw every mood their own way", () => {
    for (const id of ["astronaut", "ninja"]) {
      const states = manifest.costumes?.[id]?.states;
      expect(states, id).toBeTruthy();
      const seen = new Map<string, string>();
      for (const s of MASCOT_STATES) {
        // No mood borrows another's art: each has a frame of its own, and no two frames are the same picture.
        for (const f of states![s]!.frames) {
          const svg = readFileSync(join(DIR, f), "utf8");
          expect(seen.get(svg), `${id}: ${s} draws the same as ${seen.get(svg)}`).toBeUndefined();
          seen.set(svg, s);
        }
      }
      expect(resolveState(dressed(manifest, id), "wave")?.frames).toHaveLength(2);
      expect(resolveState(dressed(manifest, id), "idle")?.eyesBlink).toBeTruthy();
      // Cool is not focused with a different crease: other eyes (a wink, a sun visor).
      expect(states!.cool!.eyes ?? "none", id).not.toBe(states!.focused!.eyes ?? "none");
    }
    expect(OFFERED_COSTUMES).toEqual(expect.arrayContaining(["astronaut", "ninja"]));
  });

  describe("names", () => {
    afterEach(() => useWords("en", {}));

    it("one list for the wardrobe and Settings: a common noun in the trader's language, a character's name as it is", () => {
      useWords("pt", pt);
      expect(costumeName("astronaut")).toBe("Astronauta");
      expect(costumeName("ninja")).toBe("Ninja");
      expect(costumeName("robot")).toBe("Robô");
      expect(costumeName("dino")).toBe("Dinossauro");
      expect(costumeName("ghost")).toBe("Fantasma");
      expect(costumeName("penguin")).toBe("Pinguim");
      expect(costumeName("bee")).toBe("Abelha");
      expect(costumeName("pug")).toBe("Pug");
      expect(costumeName("gengar")).toBe("Gengar");
      expect(costumeName("none")).toBe("Candy");
      useWords("en", {});
      expect(costumeName("robot")).toBe("Robot");
      expect(costumeName("dino")).toBe("Dinosaur");
      expect(costumeName("bull")).toBe("Bull");
      expect(costumeName("bear")).toBe("Bear");
      expect(costumeName("ghost")).toBe("Ghost");
      expect(costumeName("penguin")).toBe("Penguin");
      expect(costumeName("bee")).toBe("Bee");
    });

    it("the bull and the bear go by the animal's word in every language, not the market's English", () => {
      // The rule for all nine (the island's backgrounds of the same name read the same):
      // no English left in a translated list of nouns (Astronauta, Robô, Touro, Urso).
      const animals: [Lang, Dict, string, string][] = [
        ["pt", pt, "Touro", "Urso"],
        ["es", es, "Toro", "Oso"],
        ["fr", fr, "Taureau", "Ours"],
        ["de", de, "Bulle", "Bär"],
        ["ru", ru, "Бык", "Медведь"],
        ["tr", tr, "Boğa", "Ayı"],
        ["zh", zh, "公牛", "熊"],
        ["ja", ja, "雄牛", "クマ"],
        ["ko", ko, "황소", "곰"],
      ];
      for (const [lang, words, bull, bear] of animals) {
        useWords(lang, words);
        expect([costumeName("bull"), costumeName("bear")], lang).toEqual([bull, bear]);
      }
    });

    it("the Ghost colour and the ghost costume are named apart, so each language names both its own way", () => {
      expect([lookName("ghost"), costumeName("ghost")]).toEqual(["Ghost white", "Ghost"]);
      for (const [lang, words, colour, costume] of [
        ["zh", zh, "幽灵白", "幽灵"],
        ["de", de, "Geisterweiß", "Gespenst"],
        ["ja", ja, "ゴースト", "おばけ"],
        ["ko", ko, "고스트 화이트", "유령"],
        ["fr", fr, "Blanc spectral", "Fantôme"],
      ] as const) {
        useWords(lang, words);
        expect([lookName("ghost"), costumeName("ghost")]).toEqual([colour, costume]);
      }
    });

    it("every common noun is translated, and only those: no character's name is sent to be translated", () => {
      // A merge that drops one of these from the list fails here, not on a screenshot.
      expect([...NOUN_COSTUMES].sort()).toEqual(["astronaut", "bear", "bee", "bull", "dino", "ghost", "ninja", "penguin", "pug", "robot"]);
      for (const id of COSTUME_IDS) {
        // A language that had a word for every name: only the nouns take it.
        useWords("pt", { [COSTUME_NAMES[id]]: "translated" });
        expect(costumeName(id), id).toBe(NOUN_COSTUMES.includes(id) ? "translated" : COSTUME_NAMES[id]);
      }
      for (const id of NOUN_COSTUMES) expect(pt[COSTUME_NAMES[id]], id).toBeTruthy();
    });
  });

  it("a costume keeps its own colours", () => {
    const customSkin = { hue: 0, sat: 100, light: 100 };
    expect(lookFilter({ costume: "gengar", skin: "ocean", customSkin })).toBe("none");
    expect(lookFilter({ costume: "none", skin: "mint", customSkin })).toBe("none");
    expect(lookFilter({ costume: "none", skin: "ocean", customSkin })).not.toBe("none");
  });

  it("offers the exclusive costume only in a friend's build", () => {
    expect(offeredCostumes(false)).not.toContain("edition");
    expect(offeredCostumes(true)).toContain("edition");
    expect(offeredCostumes(true)).toContain("gengar");
    // A regular build (the tests run as one).
    expect(OFFERED_COSTUMES).toEqual(offeredCostumes(false));
  });

  it("keeps friends' exclusive costumes out of the public manifest", () => {
    expect(manifest.costumes.edition).toBeUndefined();
    expect(Object.values(manifest.costumes).filter((c) => c.exclusive)).toEqual([]);
  });

  it("the robot, the dinosaur, the bull, the bear, the ghost and the penguin have a face of their own in every mood, with eyes that look and blink", () => {
    for (const id of ["robot", "dino", "bull", "bear", "ghost", "penguin"]) {
      const states = manifest.costumes[id].states;
      for (const s of MASCOT_STATES) {
        const def = states[s]!;
        // Not V's one face for all: each mood its own frame (wave and celebrate, two).
        expect(def.frames.map((f) => f.replace(/-\d\.svg$/, ".svg")), `${id} ${s}`).toEqual(def.frames.map(() => `costumes/${id}/${s}.svg`));
        // Eyes of their own, not Candy's.
        for (const e of [def.eyes, def.eyesBlink].filter(Boolean)) expect(e!.startsWith(`costumes/${id}/eyes-`), `${id} ${s}: ${e}`).toBe(true);
        // Candy's motion and effect.
        expect(def.motion, `${id} ${s}`).toBe(manifest.states[s]?.motion);
        expect(def.fx, `${id} ${s}`).toBe(manifest.states[s]?.fx);
      }
      // Eyes that follow the mouse and blink at rest.
      expect(states.idle?.eyes && states.idle?.eyesBlink, id).toBeTruthy();
      // The hello waves its own arm: two frames.
      expect(states.wave?.frames, id).toHaveLength(2);
      // So does the celebration.
      expect(states.celebrate?.frames, id).toHaveLength(2);
      // A dozen moods or more with eyes that look around.
      expect(MASCOT_STATES.filter((s) => states[s]?.eyes).length, id).toBeGreaterThan(12);
    }
    // The dinosaur's tail wags when excited: down, then up.
    const excited = manifest.costumes.dino.states.excited!.frames;
    expect(excited).toEqual(["costumes/dino/excited-1.svg", "costumes/dino/excited-2.svg"]);
    expect(readFileSync(join(DIR, excited[0]), "utf8")).not.toBe(readFileSync(join(DIR, excited[1]), "utf8"));
    expect(manifest.costumes.robot.name).toBe("Robot");
    expect(manifest.costumes.dino.name).toBe("Dinosaur");
    expect(OFFERED_COSTUMES).toEqual(expect.arrayContaining(["robot", "dino"]));
  });

  it("the bull paws the ground and the bear the air when excited; every frame is a picture of its own", () => {
    for (const id of ["bull", "bear"]) {
      const states = manifest.costumes[id].states;
      const excited = states.excited!.frames;
      expect(excited, id).toEqual([`costumes/${id}/excited-1.svg`, `costumes/${id}/excited-2.svg`]);
      expect(states.excited!.fps, id).toBeGreaterThan(0);
      // No two moods share a picture (wave and celebrate are two frames each, all different).
      const seen = new Map<string, string>();
      for (const s of MASCOT_STATES) {
        for (const f of states[s]!.frames) {
          const svg = readFileSync(join(DIR, f), "utf8");
          expect(seen.get(svg), `${id}: ${f} draws the same as ${seen.get(svg)}`).toBeUndefined();
          seen.set(svg, f);
        }
      }
      // Cool is not focused with a different crease.
      expect(states.cool!.eyes, id).not.toBe(states.focused!.eyes);
    }
    expect(manifest.costumes.bull.name).toBe("Bull");
    expect(manifest.costumes.bear.name).toBe("Bear");
    // After the others (dino and older), the bear right after the bull, a friend's edition last.
    expect(COSTUME_IDS.indexOf("bull")).toBeGreaterThan(COSTUME_IDS.indexOf("dino"));
    expect(COSTUME_IDS.indexOf("bear")).toBe(COSTUME_IDS.indexOf("bull") + 1);
    expect(COSTUME_IDS.at(-1)).toBe("edition");
    expect(OFFERED_COSTUMES).toEqual(expect.arrayContaining(["bull", "bear"]));
  });

  it("the ghost and the penguin draw every mood their own way, and move when excited", () => {
    for (const [id, name] of [["ghost", "Ghost"], ["penguin", "Penguin"]] as const) {
      const states = manifest.costumes[id].states;
      const seen = new Map<string, string>();
      for (const s of MASCOT_STATES) {
        // No mood borrows another's art, and no two frames are the same picture.
        for (const f of states[s]!.frames) {
          const svg = readFileSync(join(DIR, f), "utf8");
          expect(seen.get(svg), `${id}: ${s} draws the same as ${seen.get(svg)}`).toBeUndefined();
          seen.set(svg, s);
        }
      }
      // The ghost's hem flutters, the penguin flaps: two frames.
      expect(states.excited!.frames, id).toEqual([`costumes/${id}/excited-1.svg`, `costumes/${id}/excited-2.svg`]);
      // Cool is a wink, not focused's steady look.
      expect(states.cool!.eyes, id).toBe(`costumes/${id}/eyes-wink.svg`);
      expect(states.cool!.eyes, id).not.toBe(states.focused!.eyes);
      expect(manifest.costumes[id].name).toBe(name);
      expect(COSTUME_NAMES[id]).toBe(name);
    }
    // Both after the dinosaur, then the bee and the pug, a friend's edition last.
    expect(COSTUME_IDS.slice(-5)).toEqual(["ghost", "penguin", "bee", "pug", "edition"]);
    expect(OFFERED_COSTUMES).toEqual(expect.arrayContaining(["ghost", "penguin"]));
  });

  it("the bee has a face of its own in every mood, and its wings beat when excited, cheering or waving", () => {
    const bee = manifest.costumes.bee;
    expect(bee.name).toBe("Bee");
    const states = bee.states;
    const seen = new Map<string, string>();
    for (const s of MASCOT_STATES) {
      const def = states[s]!;
      // Each mood its own frame (wave, celebrate and excited, two), no two the same picture.
      expect(def.frames.map((f) => f.replace(/-\d\.svg$/, ".svg")), s).toEqual(def.frames.map(() => `costumes/bee/${s}.svg`));
      for (const f of def.frames) {
        const svg = readFileSync(join(DIR, f), "utf8");
        expect(seen.get(svg), `${s} draws the same as ${seen.get(svg)}`).toBeUndefined();
        seen.set(svg, s);
      }
      // Eyes of its own, not Candy's; Candy's motion and effect.
      for (const e of [def.eyes, def.eyesBlink].filter(Boolean)) expect(e!.startsWith("costumes/bee/eyes-"), `${s}: ${e}`).toBe(true);
      expect(def.motion, s).toBe(manifest.states[s]?.motion);
      expect(def.fx, s).toBe(manifest.states[s]?.fx);
    }
    expect(states.idle?.eyes && states.idle?.eyesBlink).toBeTruthy();
    expect(MASCOT_STATES.filter((s) => states[s]?.eyes).length).toBeGreaterThan(12);
    // Cool is a wink, not focused's steady look.
    expect(states.cool?.eyes).not.toBe(states.focused?.eyes);
    for (const s of ["excited", "celebrate", "wave"] as const) {
      const frames = states[s]!.frames;
      expect(frames, s).toHaveLength(2);
      // The second frame has the wings up: the same bee, the wings turned.
      const [down, up] = frames.map((f) => readFileSync(join(DIR, f), "utf8"));
      const lifted = /<g transform="rotate\(\d+ 34 50\)">/g;
      expect(down.match(lifted), s).toBeNull();
      expect(up.match(lifted), s).toHaveLength(2);
    }
    expect(states.excited?.fps).toBe(4);
    expect(OFFERED_COSTUMES).toContain("bee");
  });

  it("the pug has a face of its own in every mood; its propeller spins when excited, cheering or waving, and the lollipop goes up when proud", () => {
    const pug = manifest.costumes.pug;
    expect(pug.name).toBe("Pug");
    // His mouth sits lower than Candy's: what is held in it goes down with it.
    expect((pug as { mouthDrop?: number }).mouthDrop).toBe(7);
    const states = pug.states;
    const seen = new Map<string, string>();
    for (const s of MASCOT_STATES) {
      const def = states[s]!;
      // Each mood its own frame (wave, celebrate and excited, two), no two the same picture.
      expect(def.frames.map((f) => f.replace(/-\d\.svg$/, ".svg")), s).toEqual(def.frames.map(() => `costumes/pug/${s}.svg`));
      for (const f of def.frames) {
        const svg = readFileSync(join(DIR, f), "utf8");
        expect(seen.get(svg), `${s} draws the same as ${seen.get(svg)}`).toBeUndefined();
        seen.set(svg, s);
      }
      // Eyes of his own, not Candy's; Candy's motion and effect.
      for (const e of [def.eyes, def.eyesBlink].filter(Boolean)) expect(e!.startsWith("costumes/pug/eyes-"), `${s}: ${e}`).toBe(true);
      expect(def.motion, s).toBe(manifest.states[s]?.motion);
      expect(def.fx, s).toBe(manifest.states[s]?.fx);
    }
    expect(states.idle?.eyes && states.idle?.eyesBlink).toBeTruthy();
    expect(MASCOT_STATES.filter((s) => states[s]?.eyes).length).toBeGreaterThan(12);
    // Cool is a wink, not focused's steady look.
    expect(states.cool?.eyes).toBe("costumes/pug/eyes-wink.svg");
    expect(states.cool?.eyes).not.toBe(states.focused?.eyes);
    const spinning = /<g transform="rotate\(\d+ 64 9\.2\)">/g;
    for (const s of ["excited", "celebrate", "wave"] as const) {
      const frames = states[s]!.frames;
      expect(frames, s).toHaveLength(2);
      // The propeller turns between the two frames: the same pug, the blades turned in the first.
      const [turned, straight] = frames.map((f) => readFileSync(join(DIR, f), "utf8"));
      expect(turned.match(spinning), s).toHaveLength(1);
      expect(straight.match(spinning), s).toBeNull();
    }
    expect(readFileSync(join(DIR, states.idle!.frames[0]), "utf8").match(spinning)).toBeNull();
    // The lollipop arm lifted: proud and cheering, not at rest.
    const lifted = /<g transform="rotate\(\d+ 40 76\)">/g;
    expect(readFileSync(join(DIR, states.proud!.frames[0]), "utf8").match(lifted)).toHaveLength(2);
    expect(readFileSync(join(DIR, states.celebrate!.frames[0]), "utf8").match(lifted)).toHaveLength(2);
    expect(readFileSync(join(DIR, states.idle!.frames[0]), "utf8").match(lifted)).toBeNull();
    expect(states.excited?.fps).toBe(4);
    expect(OFFERED_COSTUMES).toContain("pug");
  });

  it("older or hand-edited settings fall back to Candy, renamed costumes stay on", () => {
    expect(normalizeSettings({ companion: { costume: "bee" } } as never).companion.costume).toBe("bee");
    expect(normalizeSettings({ companion: { costume: "pug" } } as never).companion.costume).toBe("pug");
    expect(normalizeSettings({ companion: { costume: "robot" } } as never).companion.costume).toBe("robot");
    expect(normalizeSettings({ companion: { costume: "dino" } } as never).companion.costume).toBe("dino");
    expect(normalizeSettings({ companion: { costume: "bull" } } as never).companion.costume).toBe("bull");
    expect(normalizeSettings({ companion: { costume: "bear" } } as never).companion.costume).toBe("bear");
    expect(normalizeSettings({ companion: { costume: "ghost" } } as never).companion.costume).toBe("ghost");
    expect(normalizeSettings({ companion: { costume: "penguin" } } as never).companion.costume).toBe("penguin");
    // The colour called Ghost is a colour: as a costume id it is the ghost, and the colour stays as it was.
    const both = normalizeSettings({ companion: { skin: "ghost", costume: "none" } } as never).companion;
    expect([both.skin, both.costume]).toEqual(["ghost", "none"]);
    expect(normalizeSettings({}).companion.costume).toBe("none");
    expect(normalizeSettings({ companion: { costume: "pikachu" } } as never).companion.costume).toBe("none");
    expect(normalizeSettings({ companion: { costume: "spiderman" } } as never).companion.costume).toBe("spiderman");
    expect(normalizeSettings({ companion: { costume: "yovich" } } as never).companion.costume).toBe("gengar");
    expect(normalizeSettings({ companion: { costume: "mrshadow" } } as never).companion.costume).toBe("shadow");
    expect(normalizeSettings({ companion: { costume: "astronaut" } } as never).companion.costume).toBe("astronaut");
    expect(normalizeSettings({ companion: { costume: "ninja" } } as never).companion.costume).toBe("ninja");
    // Not offered by this build.
    expect(normalizeSettings({ companion: { costume: "edition" } } as never).companion.costume).toBe("none");
  });
});
