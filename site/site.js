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

// The parade loops: the same costumes twice, so the strip never ends.
const track = document.querySelector(".parade .track");
if (track) track.append(...[...track.children].map((n) => n.cloneNode(true)));
