// The wardrobe: hat, face accessory, colour and costume, picked inside the
// island with Candy itself as the preview, and the island's own background.
// The shelves and their names are core/looks.ts's; every look, large, with the
// free colour's sliders, is in the closet panel (src/closet), one click away.

import { h, clear, svg } from "./dom";
import { ICONS } from "./icons";
import { iconBtn, type ViewActions, type ViewHost } from "./shared";
import { islandSwatch, lookCandy } from "./look-art";
import { Companion } from "../companion";
import { t } from "../core/i18n";
import { SHELVES, islandIds, pickLook, tryOn, type Shelf } from "../core/looks";
import { MAX_ISLAND_TRANSPARENCY, State, type Theme } from "../core/state";
import { applyTheme } from "../core/themes";

export function buildWardrobe(actions: ViewActions): ViewHost {
  let shelf: Shelf = SHELVES[0];
  const tabs = SHELVES.map((s) => {
    const b = h("button", { class: "seg-btn", text: t(s.label) });
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
  // Every look, large: the Closet opens in the island.
  const closet = h(
    "button",
    { class: "wardrobe-closet", type: "button", title: t("Open the closet") },
    svg(ICONS.closet, 13, { stroke: 1.7 }),
    h("span", { text: t("Open the closet") }),
  );
  closet.addEventListener("click", () => {
    actions.blip();
    actions.openCloset();
  });

  // The Island shelf's transparency, under the backgrounds: the island fades
  // under the thumb as it moves, and the setting is kept when it is let go.
  const alpha = h("input", { type: "range", min: 0, max: MAX_ISLAND_TRANSPARENCY, step: 1, class: "alpha-range", title: t("Transparency") }) as HTMLInputElement;
  const alphaValue = h("span", { class: "alpha-value" });
  const foot = h("label", { class: "wardrobe-foot" }, h("span", { class: "alpha-label", text: t("Transparency") }), alpha, alphaValue);
  const paintAlpha = () => {
    const v = State.companion.islandTransparency;
    alpha.value = String(v);
    alpha.style.setProperty("--fill", `${(v / MAX_ISLAND_TRANSPARENCY) * 100}%`);
    alphaValue.textContent = `${v}%`;
  };
  alpha.addEventListener("input", () => {
    const c = State.companion;
    c.islandTransparency = Number(alpha.value);
    applyTheme(document.body, c.theme, c.islandTransparency);
    paintAlpha();
  });
  alpha.addEventListener("change", () => {
    Companion.save();
    actions.applyLook();
    actions.blip();
  });
  const el = h(
    "div",
    { class: "view wardrobe" },
    h("div", { class: "wardrobe-head" }, h("div", { class: "seg" }, ...tabs), closet, back),
    grid,
    foot,
  );

  /**
   * Applies a pick to the settings as they are now: the app swaps the whole
   * settings object when it echoes a save back, so a look must never hold on
   * to the one it was drawn from.
   */
  function pick(on: Shelf, id: string) {
    pickLook(State.companion, on, id, new Date());
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
    tabs.forEach((b, i) => b.classList.toggle("on", SHELVES[i] === shelf));
    if (!art) return;
    const here = shelf;
    // Costumes and backgrounds go by name: bigger cards, named.
    const named = here.id === "costume" || here.on === "island";
    grid.classList.toggle("named", named);
    // Costume names stay on one line (ellipsis); the backgrounds' names wrap.
    grid.classList.toggle("costumes", here.id === "costume");
    grid.classList.toggle("islands", here.on === "island");
    foot.classList.toggle("on", here.on === "island");
    // Three full rows of hats: the closet has the rest (CLOSET_ONLY).
    for (const id of islandIds(here)) {
      const name = here.name(id);
      // Hats and faces are shown on the costume being worn, in its colour.
      const look = here.on === "island" ? islandSwatch(id as Theme, true) : lookCandy(art, tryOn(c, here, id));
      const b = h(
        "button",
        { class: `look ${here.worn(c, id) ? "on" : ""}`, type: "button", title: name },
        look,
        named ? h("span", { class: "look-name", text: name }) : null,
      );
      b.addEventListener("click", () => pick(here, id));
      // Resting the pointer on a look tries it on Candy (not the backgrounds).
      if (here.on === "candy") {
        b.addEventListener("mouseenter", () => actions.previewLook((now) => here.wear(now, id)));
        b.addEventListener("mouseleave", () => actions.previewLook(null));
      }
      grid.append(b);
    }
  }

  let key = "";
  function sync() {
    const c = State.companion;
    // The slider follows the setting (the Settings panel may have moved it) without redrawing the looks.
    paintAlpha();
    const next = `${shelf.id}|${c.theme}|${c.costume}|${c.outfit}|${c.face}|${c.skin}|${JSON.stringify(c.customSkin)}|${State.art ? 1 : 0}`;
    if (next === key) return;
    key = next;
    render();
  }
  return { el, sync };
}
