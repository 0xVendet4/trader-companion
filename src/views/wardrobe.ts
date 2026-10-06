// The wardrobe: hat, face accessory, colour and costume, picked inside the
// island with Candy itself as the preview, and the island's own background.
// The free colour's sliders stay in Settings.

import { h, clear } from "./dom";
import { ICONS } from "./icons";
import { iconBtn, type ViewActions, type ViewHost } from "./shared";
import { Companion } from "../companion";
import { EDITION_NAME, FACE_IDS, OFFERED_COSTUMES, OUTFIT_IDS, SKIN_IDS, State, THEME_IDS, type Companion as Look, type Costume, type Face, type Outfit, type Skin } from "../core/state";
import { ISLAND_THEMES } from "../core/themes";
import { accessory, dressed, miniCandy } from "../mascot/mascot";
import { seasonKey } from "../mascot/seasons";
import { lookFilter, skinFilter } from "../mascot/skins";

type Shelf = "hat" | "face" | "colour" | "costume" | "island";
const SHELVES: [Shelf, string][] = [
  ["hat", "Hat"],
  ["face", "Face"],
  ["colour", "Colour"],
  ["costume", "Costume"],
  ["island", "Island"],
];

/** A little island in a background, with a token on it, for the Island shelf. */
function islandSwatch(id: (typeof THEME_IDS)[number]): HTMLElement {
  const t = ISLAND_THEMES[id];
  const el = h("span", { class: "island-swatch" }, h("i", { class: "sw-dot" }), h("i", { class: "sw-line" }), h("i", { class: "sw-up" }));
  el.style.background = t.background;
  if (t.ring) el.style.boxShadow = t.ring;
  // Its own accent, not the one the island wears now.
  el.style.setProperty("--accent", t.accent ?? "#4ade80");
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

const label = (id: string) =>
  ({
    none: "None",
    tophat: "Top hat",
    party: "Party hat",
    grad: "Grad cap",
    flowers: "Flower crown",
    bunny: "Bunny ears",
    laser: "Laser eyes",
    starglasses: "Star glasses",
    threed: "3D glasses",
    eyepatch: "Eye patch",
    heartglasses: "Heart glasses",
    clownnose: "Clown nose",
    domino: "Hero mask",
    vr: "VR headset",
    catears: "Cat ears",
    pixel: "Pixel shades",
    bandaid: "Band-aid",
    bubblegum: "Bubble gum",
    warpaint: "War paint",
    dollareyes: "Dollar eyes",
    facemask: "Face mask",
  })[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

export function buildWardrobe(actions: ViewActions): ViewHost {
  let shelf: Shelf = "hat";
  const tabs = SHELVES.map(([s, text]) => {
    const b = h("button", { class: "seg-btn", text });
    b.addEventListener("click", () => {
      shelf = s;
      actions.blip();
      key = "";
      sync();
    });
    return b;
  });
  const grid = h("div", { class: "wardrobe-grid" });
  const back = iconBtn(ICONS.xmark, "Close the wardrobe", () => actions.setView(State.lastTab));
  const more = h("a", { class: "wardrobe-more", text: "Custom colour and more in Settings", onclick: () => actions.openSettings() });
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
    tabs.forEach((t, i) => t.classList.toggle("on", SHELVES[i][0] === shelf));
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
                  name: ISLAND_THEMES[id].name,
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
