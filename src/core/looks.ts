// Every look Candy can wear, named once, on shelves: hats, face accessories,
// colours, costumes and the island's backgrounds. The island's wardrobe and
// the closet window lay out the same shelves. Pure: names come translated
// when asked for, and a pick is worked out on the settings handed in.
//
// A new hat, face or colour: its id in state.ts, its art from the generator,
// its name here. A new kind of look: one more shelf in SHELVES, and the
// wardrobe and the closet both show it.

import { N_, t } from "./i18n";
import {
  FACE_IDS,
  OFFERED_COSTUMES,
  OUTFIT_IDS,
  SKIN_IDS,
  THEME_IDS,
  costumeName,
  type Companion,
  type Costume,
  type Face,
  type Outfit,
  type Skin,
  type Theme,
} from "./state";
import { ISLAND_THEMES } from "./themes";
import { NIGHTCAP, nightKey, wearsPyjamas } from "../mascot/night";
import { activeSeason, seasonKey } from "../mascot/seasons";

/** What a look is made of: the part of the settings the wardrobe changes. */
export type Look = Pick<Companion, "outfit" | "face" | "skin" | "customSkin" | "costume" | "theme">;

/**
 * Costume names live in state.ts (COSTUME_NAMES, costumeName): a character
 * keeps its own name, a common noun (the ones in NOUN_COSTUMES: robot, bee…)
 * is shown in the trader's language. Settings reads the same list.
 */
export { COSTUME_NAMES } from "./state";

/** Hat, face and colour names, translated where shown. */
const NAMES: Partial<Record<string, string>> = {
  none: N_("None"),
  // Hats.
  cap: N_("Cap"),
  crown: N_("Crown"),
  party: N_("Party hat"),
  headphones: N_("Headphones"),
  tophat: N_("Top hat"),
  cowboy: N_("Cowboy"),
  beanie: N_("Beanie"),
  halo: N_("Halo"),
  horns: N_("Horns"),
  wizard: N_("Wizard"),
  viking: N_("Viking"),
  bow: N_("Bow"),
  chef: N_("Chef"),
  pirate: N_("Pirate"),
  santa: N_("Santa"),
  grad: N_("Grad cap"),
  beret: N_("Beret"),
  propeller: N_("Propeller"),
  flowers: N_("Flower crown"),
  bunny: N_("Bunny ears"),
  pumpkin: N_("Pumpkin"),
  catears: N_("Cat ears"),
  rocket: N_("Rocket"),
  sombrero: N_("Sombrero"),
  hardhat: N_("Hard hat"),
  fez: N_("Fez"),
  jester: N_("Jester hat"),
  bucket: N_("Bucket hat"),
  frog: N_("Frog hat"),
  alien: N_("Alien antennae"),
  sprout: N_("Sprout"),
  mushroom: N_("Mushroom"),
  sweatband: N_("Sweatband"),
  unicorn: N_("Unicorn horn"),
  fedora: N_("Fedora"),
  nightcap: N_("Nightcap"),
  // Faces.
  shades: N_("Shades"),
  laser: N_("Laser eyes"),
  glasses: N_("Glasses"),
  monocle: N_("Monocle"),
  mustache: N_("Mustache"),
  starglasses: N_("Star glasses"),
  threed: N_("3D glasses"),
  eyepatch: N_("Eye patch"),
  heartglasses: N_("Heart glasses"),
  clownnose: N_("Clown nose"),
  beard: N_("Beard"),
  domino: N_("Hero mask"),
  vr: N_("VR headset"),
  pixel: N_("Pixel shades"),
  goggles: N_("Goggles"),
  whiskers: N_("Whiskers"),
  freckles: N_("Freckles"),
  bandaid: N_("Band-aid"),
  lollipop: N_("Lollipop"),
  bubblegum: N_("Bubble gum"),
  warpaint: N_("War paint"),
  dollareyes: N_("Dollar eyes"),
  facemask: N_("Face mask"),
  scarf: N_("Scarf"),
  aviators: N_("Aviators"),
  sleepmask: N_("Sleep mask"),
  snorkel: N_("Snorkel"),
  cateye: N_("Cat-eye glasses"),
  hypno: N_("Hypno glasses"),
  cyborg: N_("Cyborg eye"),
  partyhorn: N_("Party horn"),
  pacifier: N_("Pacifier"),
  bowtie: N_("Bow tie"),
  goldchain: N_("Gold chain"),
  // Colours.
  mint: N_("Mint"),
  neon: N_("Neon"),
  forest: N_("Forest"),
  lime: N_("Lime"),
  lemon: N_("Lemon"),
  gold: N_("Gold"),
  sunset: N_("Sunset"),
  peach: N_("Peach"),
  cherry: N_("Cherry"),
  ruby: N_("Ruby"),
  rose: N_("Rose"),
  magenta: N_("Magenta"),
  grape: N_("Grape"),
  lavender: N_("Lavender"),
  violet: N_("Violet"),
  teal: N_("Teal"),
  sky: N_("Sky"),
  ice: N_("Ice"),
  ocean: N_("Ocean"),
  navy: N_("Navy"),
  ghost: N_("Ghost white"),
  slate: N_("Slate"),
  charcoal: N_("Charcoal"),
  custom: N_("Custom"),
};

/**
 * Faces whose id is also a colour's: the rose held in the teeth shares "rose"
 * with the Rose colour. Its own line, since a language may name the two apart
 * (the colour is "Rosé" in German, the flower "Rose").
 */
const FACE_NAMES: Partial<Record<string, string>> = {
  rose: N_("Red rose"),
};

/** Which shelf an id is named for, where two shelves share an id (see FACE_NAMES). */
type NamedShelf = "hat" | "face" | "colour";

/** The English name of a hat, a face accessory or a colour, or null when it has none yet. */
export function lookNameKey(id: string, shelf?: NamedShelf): string | null {
  return (shelf === "face" ? FACE_NAMES[id] : undefined) ?? NAMES[id] ?? null;
}

/** A hat's, a face accessory's or a colour's name in the trader's language (an unnamed one: its id, capitalised). */
export function lookName(id: string, shelf?: NamedShelf): string {
  const name = lookNameKey(id, shelf);
  return name ? t(name) : id.charAt(0).toUpperCase() + id.slice(1);
}

export type ShelfId = "hat" | "face" | "colour" | "costume" | "island";

/** One kind of look, as the wardrobe and the closet lay it out. */
export interface Shelf {
  id: ShelfId;
  /** The island wardrobe's tab: one short word (N_, t() where shown). */
  label: string;
  /** The closet's tab (N_). */
  title: string;
  /** Its looks, in picker order. */
  ids: readonly string[];
  /** A look's name, in the trader's language. */
  name(id: string): string;
  /** That one is what `c` has on. */
  worn(c: Look, id: string): boolean;
  /** Puts it on `c`. */
  wear(c: Look, id: string): void;
  /** Worn by Candy (tried on him while pointed at), or by the island around him. */
  on: "candy" | "island";
}

export const SHELVES: readonly Shelf[] = [
  {
    id: "hat",
    label: N_("Hat"),
    title: N_("Hats"),
    ids: OUTFIT_IDS,
    name: lookName,
    worn: (c, id) => c.outfit === id,
    wear: (c, id) => (c.outfit = id as Outfit),
    on: "candy",
  },
  {
    id: "face",
    label: N_("Face"),
    title: N_("Faces"),
    ids: FACE_IDS,
    name: (id) => lookName(id, "face"),
    worn: (c, id) => c.face === id,
    wear: (c, id) => (c.face = id as Face),
    on: "candy",
  },
  {
    // Colours are Candy's own: picking one takes a costume off.
    id: "colour",
    label: N_("Colour"),
    title: N_("Colours"),
    ids: SKIN_IDS,
    name: lookName,
    worn: (c, id) => c.costume === "none" && c.skin === id,
    wear: (c, id) => {
      c.skin = id as Skin;
      c.costume = "none";
    },
    on: "candy",
  },
  {
    // Only the costumes this build offers (a friend's edition has one more).
    id: "costume",
    label: N_("Costume"),
    title: N_("Costumes"),
    ids: OFFERED_COSTUMES,
    name: (id) => costumeName(id as Costume),
    worn: (c, id) => c.costume === id,
    wear: (c, id) => (c.costume = id as Costume),
    on: "candy",
  },
  {
    id: "island",
    label: N_("Island"),
    title: N_("Island"),
    ids: THEME_IDS,
    name: (id) => t(ISLAND_THEMES[id as Theme]?.name ?? id),
    worn: (c, id) => c.theme === id,
    wear: (c, id) => (c.theme = id as Theme),
    on: "island",
  },
];

/**
 * Looks the island's wardrobe leaves to the closet (and Settings): its Hat
 * shelf is exactly three full rows of twelve. The nightcap, the 37th, is
 * worn with the pyjamas after midnight anyway (night.ts).
 */
export const CLOSET_ONLY: readonly string[] = [NIGHTCAP];

/** A shelf's looks as the island's wardrobe lays them out (see CLOSET_ONLY). */
export function islandIds(shelf: Shelf): readonly string[] {
  return shelf.ids.filter((id) => !CLOSET_ONLY.includes(id));
}

/** A shelf by its id. */
export function shelfOf(id: ShelfId): Shelf {
  return SHELVES.find((s) => s.id === id) ?? SHELVES[0];
}

/** The look alone, copied: changing the copy leaves the settings as they are. */
export function copyLook(c: Look): Look {
  return { outfit: c.outfit, face: c.face, skin: c.skin, customSkin: { ...c.customSkin }, costume: c.costume, theme: c.theme };
}

/** A copy of the look with one more thing on: what a card shows, what pointing at it tries on. */
export function tryOn(c: Look, shelf: Shelf, id: string): Look {
  const look = copyLook(c);
  shelf.wear(look, id);
  return look;
}

/**
 * Puts a picked look on the settings. A look Candy wears, picked during a
 * season, wins over the season's until it ends (see seasons.ts), and picked
 * after midnight, over the pyjamas until morning (night.ts); a background
 * leaves the season's hat and the pyjamas on.
 */
export function pickLook(c: Companion, shelf: Shelf, id: string, now: Date): void {
  shelf.wear(c, id);
  if (shelf.on !== "candy") return;
  c.seasonOff = seasonKey(now) ?? c.seasonOff;
  c.nightOff = nightKey(now) ?? c.nightOff;
}

/** What decides what Candy has on over the trader's picks: the seasons and the night. */
type Dressing = Pick<Companion, "outfit" | "face" | "costume" | "seasonal" | "seasonOff" | "pyjamas" | "nightOff">;

/**
 * The hat and face Candy has on right now, as the island puts them on: the
 * trader's, or the season's for a few days; after midnight, the pyjamas and
 * the nightcap (a season's hat stays on, a costume wins).
 */
export function wearing(c: Dressing, now: Date): { outfit: Outfit; face: Face; pyjamas: boolean } {
  const season = activeSeason(now, c.seasonal, c.seasonOff);
  const pyjamas = wearsPyjamas(now, c.pyjamas, c.nightOff, c.costume);
  return { outfit: season?.hat ?? (pyjamas ? NIGHTCAP : c.outfit), face: season?.face ?? c.face, pyjamas };
}

/** The whole look as the island shows it now (the season's hat or face, or the nightcap, included). */
export function shownLook(c: Look & Dressing, now: Date): Look {
  const { outfit, face } = wearing(c, now);
  return { ...copyLook(c), outfit, face };
}

/** The seasons by the English names seasons.ts keeps a pick under ("Christmas 2026"). */
const SEASON_NAMES: Partial<Record<string, string>> = {
  "New Year": N_("New Year"),
  Christmas: N_("Christmas"),
  Halloween: N_("Halloween"),
  "Valentine's Day": N_("Valentine's Day"),
};

/**
 * What the season has put on Candy over the trader's own look, as a note
 * ("Santa for Christmas"): pickers mark the trader's own pick, and say this
 * next to it. Null on an ordinary day, with seasons off, or once a look was
 * picked this season.
 */
export function seasonNote(c: Pick<Companion, "seasonal" | "seasonOff">, now: Date): string | null {
  const season = activeSeason(now, c.seasonal, c.seasonOff);
  const id = season?.hat ?? season?.face;
  if (!season || !id) return null;
  const name = SEASON_NAMES[season.name];
  return t("{look} for {season}", { look: lookName(id, season.hat ? "hat" : "face"), season: name ? t(name) : season.name });
}

/**
 * The pyjamas' note, after midnight while Candy wears them over the trader's
 * own look (no season's note then): null otherwise.
 */
export function nightNote(c: Dressing, now: Date): string | null {
  if (seasonNote(c, now)) return null;
  return wearing(c, now).pyjamas ? t("Pyjamas after midnight") : null;
}
