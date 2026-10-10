// The music card: what plays on the PC (any player the system knows about),
// its cover, a progress bar to drag, and the player's buttons. The card and its
// controls come from Coucou's Spotify card (MIT, © Louis Raillé). A click shows
// at once and the player confirms it, as there.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { type ViewActions, type ViewHost } from "./shared";
import { Bridge } from "../core/bridge";
import { coverFor, formatTime, musicPosition, volumeLevel, withPlaying, type NowPlaying } from "../core/music";
import { State } from "../core/state";

/** Sends a button press, showing its effect at once. */
function control(action: string, value?: number, optimistic?: (np: NowPlaying) => NowPlaying) {
  const np = State.nowPlaying;
  if (!np) return;
  if (optimistic) {
    State.nowPlaying = optimistic(np);
    State.notify();
  }
  void Bridge.mediaControl(action, value);
}

export function buildMusic(actions: ViewActions): ViewHost {
  const cover = h("div", { class: "np-cover" });
  const title = h("div", { class: "np-title" });
  const artist = h("div", { class: "np-artist" });
  const app = h("div", { class: "np-app" });

  // The bar: click or drag anywhere on it to seek.
  const fill = h("i", { class: "np-fill" });
  const knob = h("i", { class: "np-knob" });
  const bar = h("div", { class: "np-bar" }, h("i", { class: "np-track" }), fill, knob);
  const elapsed = h("span", { class: "np-time" });
  const total = h("span", { class: "np-time" });
  let dragging: number | null = null;
  const fractionAt = (e: PointerEvent) => {
    const r = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
  };
  bar.addEventListener("pointerdown", (e) => {
    const np = State.nowPlaying;
    if (!np?.canSeek || e.button !== 0) return;
    dragging = fractionAt(e);
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    paint();
  });
  bar.addEventListener("pointermove", (e) => {
    if (dragging == null) return;
    dragging = fractionAt(e);
    paint();
  });
  bar.addEventListener("pointerup", () => {
    const np = State.nowPlaying;
    if (dragging == null || !np) return;
    const target = dragging * np.duration;
    dragging = null;
    actions.blip();
    control("seek", target, (p) => ({ ...p, position: target, positionAt: Date.now() }));
  });

  const button = (icon: string, title: string, onClick: () => void, stroke?: number) => {
    const b = h("button", { class: "np-btn", title, onclick: () => onClick() }, svg(icon, 15, stroke ? { stroke } : {}));
    return b as HTMLButtonElement;
  };
  const shuffle = button(ICONS.shuffle, "Shuffle", () => control("shuffle", State.nowPlaying?.shuffle ? 0 : 1, (p) => ({ ...p, shuffle: !p.shuffle })), 1.8);
  const previous = button(ICONS.previous, "Previous", () => control("previous"));
  const play = button(ICONS.play, "Play", () => {
    actions.blip();
    control("playPause", undefined, (p) => withPlaying(p, !p.playing, Date.now()));
  });
  play.classList.add("np-play");
  const next = button(ICONS.next, "Next", () => control("next"));
  const repeat = button(ICONS.repeat, "Repeat", () => control("repeat", State.nowPlaying?.repeat ? 0 : 1, (p) => ({ ...p, repeat: !p.repeat })), 1.8);

  // Volume, where the player lets it be read (Linux players; not Windows).
  const volume = h("input", { type: "range", min: 0, max: 1, step: 0.01, class: "range np-volume", title: "Volume" }) as HTMLInputElement;
  const volumeIcon = h("span", { class: "np-vol-icon" });
  let volumeAt = 0;
  volume.addEventListener("input", () => {
    const v = Number(volume.value);
    const np = State.nowPlaying;
    if (np) State.nowPlaying = { ...np, volume: v };
    // At most one volume every 120 ms while the slider moves.
    const now = Date.now();
    if (now - volumeAt > 120) {
      volumeAt = now;
      void Bridge.mediaControl("volume", v);
    }
  });
  volume.addEventListener("change", () => void Bridge.mediaControl("volume", Number(volume.value)));
  const volumeRow = h("div", { class: "np-volume-row" }, volumeIcon, volume);

  const empty = h("div", { class: "np-empty", text: "Nothing is playing on this PC right now." });
  const card = h(
    "div",
    { class: "np-card" },
    cover,
    h(
      "div",
      { class: "np-main" },
      h("div", { class: "np-texts" }, title, artist, app),
      h("div", { class: "np-progress" }, elapsed, bar, total),
      h("div", { class: "np-controls" }, shuffle, previous, play, next, repeat, volumeRow),
    ),
  );
  const el = h("div", { class: "view music" }, card, empty);

  let coverShown: string | null = null;
  let iconShown = -1;
  function paint() {
    const np = State.nowPlaying;
    card.style.display = np ? "" : "none";
    empty.style.display = np ? "none" : "";
    if (!np) return;
    // Names come from the player: always text, never HTML.
    title.textContent = np.title;
    artist.textContent = np.artist || np.album;
    app.textContent = np.app;
    const url = coverFor(np);
    if (url !== coverShown) {
      coverShown = url;
      clear(cover);
      if (url) cover.append(h("img", { src: url, alt: "" }));
      else cover.append(svg(ICONS.note, 28));
    }
    const at = dragging != null ? dragging * np.duration : musicPosition(np, Date.now());
    const f = np.duration > 0 ? Math.min(1, at / np.duration) : 0;
    fill.style.width = `${f * 100}%`;
    knob.style.left = `${f * 100}%`;
    bar.classList.toggle("seekable", np.canSeek);
    bar.classList.toggle("dragging", dragging != null);
    elapsed.textContent = formatTime(at);
    total.textContent = np.duration > 0 ? formatTime(np.duration) : "";
    clear(play);
    play.append(svg(np.playing ? ICONS.pause : ICONS.play, 17));
    play.title = np.playing ? "Pause" : "Play";
    previous.disabled = !np.canPrevious;
    next.disabled = !np.canNext;
    shuffle.style.display = np.shuffle == null ? "none" : "";
    shuffle.classList.toggle("on", np.shuffle === true);
    repeat.style.display = np.repeat == null ? "none" : "";
    repeat.classList.toggle("on", np.repeat === true);
    volumeRow.style.display = np.volume == null ? "none" : "";
    if (np.volume != null) {
      if (document.activeElement !== volume) volume.value = String(np.volume);
      const level = volumeLevel(np.volume);
      if (level !== iconShown) {
        iconShown = level;
        clear(volumeIcon);
        volumeIcon.append(svg(level === 0 ? ICONS.speakerOff : ICONS.speakerOn, 12));
      }
    }
  }

  return {
    el,
    sync: paint,
    // Once a second while the card shows: the clock runs on.
    tick: paint,
  };
}
