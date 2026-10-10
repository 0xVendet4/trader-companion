// The wardrobe: hat, face accessory, colour and costume, picked inside the
// island with Candy itself as the preview, and the island's own background.
// The free colour's sliders stay in Settings.

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { N_, t } from "../core/i18n";
import { EDITION_NAME, FACE_IDS, OFFERED_COSTUMES, OUTFIT_IDS, SKIN_IDS, State, THEME_IDS, type Companion as Look, type Costume, type Face, type Outfit, type Skin } from "../core/state";
import { ISLAND_THEMES } from "../core/themes";
import { accessory, dressed, miniCandy } from "../mascot/mascot";
import { seasonKey } from "../mascot/seasons";
import { lookFilter, skinFilter } from "../mascot/skins";

type Shelf = "hat" | "face" | "colour" | "costume" | "island";
const SHELVES: [Shelf, string][] = [
  ["hat", N_("Hat")],
  ["face", N_("Face")],
  ["colour", N_("Colour")],
  ["costume", N_("Costume")],
  ["island", N_("Island")],
];

/** A little island in a background, with a token on it, for the Island shelf. */
function islandSwatch(id: (typeof THEME_IDS)[number]): HTMLElement {
  const theme = ISLAND_THEMES[id];
  const el = h("span", { class: "island-swatch" }, h("i", { class: "sw-dot" }), h("i", { class: "sw-line" }), h("i", { class: "sw-up" }));
  el.style.background = theme.background;
  if (theme.ring) el.style.boxShadow = theme.ring;
  // Its own accent, not the one the island wears now.
  el.style.setProperty("--accent", theme.accent ?? "#4ade80");
  return el;
}

/** Costume names; "none" is Candy itself. */
const COSTUME_NAMES: Record<Costume, string> = {
  none: "Candy",
  gengar: "Gengar",
  spiderman: "Spiderman",
  shadow: "Shadow",
  v: "V",
  edition: EDITION_NAME,
};

/** Hat, face and colour names (the same as Settings'), translated where shown. */
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
  ghost: N_("Ghost"),
  slate: N_("Slate"),
  charcoal: N_("Charcoal"),
  custom: N_("Custom"),
};

const label = (id: string) => {
  const name = NAMES[id];
  return name ? t(name) : id.charAt(0).toUpperCase() + id.slice(1);
};

export function buildWardrobe(actions: ViewActions): ViewHost {
  let shelf: Shelf = "hat";
  const tabs = SHELVES.map(([s, text]) => {
    const b = h("button", { class: "seg-btn", text: t(text) });
    b.addEventListener("click", () => {
      shelf = s;
      actions.blip();
      key = "";
      sync();
    });
    return b;
  });
  const grid = h("div", { class: "wardrobe-grid" });
  const back = iconBtn(ICONS.xmark, t("Close the wardrobe"), () => actions.setView(State.lastTab));
  const more = h("a", { class: "wardrobe-more", text: t("Custom colour and more in Settings"), onclick: () => actions.openSettings() });
  const el = h(
    "div",
    { class: "view wardrobe" },
    h("div", { class: "wardrobe-head" }, h("div", { class: "seg" }, ...tabs), more, back),
    grid,
  );

  /**
   * Applies a pick to the settings as they are now: the app swaps the whole
   * settings object when it echoes a save back, so a look must never hold on
   * to the one it was drawn from.
   */
  function pick(apply: (c: Look) => void) {
    apply(State.companion);
    // A look picked during a season wins until the season ends.
    State.companion.seasonOff = seasonKey(new Date()) ?? State.companion.seasonOff;
    Companion.save();
    actions.applyLook();
    actions.blip();
    key = "";
    sync();
  }

  function render() {
    const c = State.companion;
    const art = State.art;
    clear(grid);
    tabs.forEach((b, i) => b.classList.toggle("on", SHELVES[i][0] === shelf));
    if (!art) return;
    // Hats and faces are shown on the costume being worn.
    const body = dressed(art, c.costume);
    const filter = lookFilter(c);
    const hat = accessory(art, "outfits", c.outfit);
    const face = accessory(art, "faces", c.face);
    const items: { id: string; name: string; on: boolean; look: () => HTMLElement; apply: (c: Look) => void }[] =
      shelf === "hat"
        ? OUTFIT_IDS.map((id) => ({
            id,
            name: label(id),
            on: c.outfit === id,
            look: () => miniCandy(body, { hat: accessory(art, "outfits", id), face, filter }),
            apply: (now) => (now.outfit = id as Outfit),
          }))
        : shelf === "face"
          ? FACE_IDS.map((id) => ({
              id,
              name: label(id),
              on: c.face === id,
              look: () => miniCandy(body, { hat, face: accessory(art, "faces", id), filter }),
              apply: (now) => (now.face = id as Face),
            }))
          : shelf === "colour"
            ? // Colours are Candy's: picking one takes a costume off.
              SKIN_IDS.map((id) => ({
                id,
                name: label(id),
                on: c.costume === "none" && c.skin === id,
                look: () => miniCandy(art, { hat, face, filter: skinFilter(id as Skin, c.customSkin) }),
                apply: (now) => {
                  now.skin = id as Skin;
                  now.costume = "none";
                },
              }))
            : shelf === "costume"
              ? OFFERED_COSTUMES.map((id) => ({
                  id,
                  name: COSTUME_NAMES[id],
                  on: c.costume === id,
                  look: () => miniCandy(dressed(art, id), { hat, face, filter: id === "none" ? skinFilter(c.skin, c.customSkin) : "none" }),
                  apply: (now) => (now.costume = id),
                }))
              : THEME_IDS.map((id) => ({
                  id,
                  name: t(ISLAND_THEMES[id].name),
                  on: c.theme === id,
                  look: () => islandSwatch(id),
                  apply: (now) => (now.theme = id),
                }));
    // Costumes and backgrounds go by name: bigger cards, named.
    const named = shelf === "costume" || shelf === "island";
    grid.classList.toggle("named", named);
    grid.classList.toggle("islands", shelf === "island");
    for (const it of items) {
      const b = h(
        "button",
        { class: `look ${it.on ? "on" : ""}`, type: "button", title: it.name },
        it.look(),
        named ? h("span", { class: "look-name", text: it.name }) : null,
      );
      b.addEventListener("click", () => pick(it.apply));
      // Resting the pointer on a look tries it on Candy (not the backgrounds).
      if (shelf !== "island") {
        b.addEventListener("mouseenter", () => actions.previewLook(it.apply));
        b.addEventListener("mouseleave", () => actions.previewLook(null));
      }
      grid.append(b);
    }
  }

  let key = "";
  function sync() {
    const c = State.companion;
    const next = `${shelf}|${c.theme}|${c.costume}|${c.outfit}|${c.face}|${c.skin}|${JSON.stringify(c.customSkin)}|${State.art ? 1 : 0}`;
    if (next === key) return;
    key = next;
    render();
  }
  return { el, sync };
}
