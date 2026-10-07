// In a browser, the settings open over the page instead of in a new tab: the
// settings page in a frame, in a panel. Both pages share localStorage, so a
// change there reaches the island through the usual `storage` event.

import { h } from "../views/dom";

let panel: HTMLElement | null = null;

export function openSettingsPanel() {
  if (panel) return;
  const close = () => {
    panel?.remove();
    panel = null;
    window.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const frame = h("iframe", { class: "settings-frame", src: "settings.html", title: "Settings" });
  const closeBtn = h("button", { class: "settings-close", type: "button", title: "Close (Esc)", text: "×", onclick: close });
  const box = h("div", { class: "settings-box" }, closeBtn, frame);
  panel = h("div", { id: "settings-panel" }, box);
  // A press on the dimmed backdrop closes it; one inside the box doesn't.
  panel.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    if (e.target === panel) close();
  });
  window.addEventListener("keydown", onKey);
  document.body.append(panel);
}
