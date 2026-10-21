// Copy the contract address.
const copy = document.getElementById("copy");
copy?.addEventListener("click", async () => {
  const ca = document.getElementById("ca")?.textContent?.trim() ?? "";
  try {
    await navigator.clipboard.writeText(ca);
    copy.textContent = "Copied";
    copy.classList.add("done");
    setTimeout(() => {
      copy.textContent = "Copy";
      copy.classList.remove("done");
    }, 1600);
  } catch {
    getSelection()?.selectAllChildren(document.getElementById("ca"));
  }
});

// Try it, or watch the tour, in the same screen. Phones can't click around
// the desk, so they start on the tour.
const screen = document.querySelector(".screen");
const frame = screen?.querySelector("iframe");
const note = document.getElementById("screen-note");
const MODES = {
  play: { src: "/demo.html?play&format=horizontal", note: "This is the real Candy, on demo data. Click around." },
  tour: { src: "/demo.html?format=horizontal", note: "The tour, about a minute. Press play, with sound on." },
};
const tabs = [...document.querySelectorAll(".modes button")];
const show = (mode) => {
  if (!screen || !frame) return;
  screen.dataset.mode = mode;
  for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.mode === mode));
  if (note) note.textContent = MODES[mode].note;
  frame.src = MODES[mode].src;
};
for (const t of tabs) t.addEventListener("click", () => show(t.dataset.mode));
if (matchMedia("(max-width: 700px)").matches) show("tour");
