// Candy on the notification-area icon (see mascot/tray.ts): drawn on a small
// canvas and handed to Rust, only when the look changes. No timers: it runs on
// state changes alone.

import { Bridge } from "../core/bridge";
import { State } from "../core/state";
import { artUrl, dressed } from "../mascot/mascot";
import { lookFilter } from "../mascot/skins";
import { trayKey, trayLook, type TrayLook } from "../mascot/tray";

/** Windows scales it down to the tray's 16–24 px. */
const SIZE = 32;

let shown = "";
const images = new Map<string, Promise<HTMLImageElement>>();

function image(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    const img = new Image();
    img.src = artUrl(src);
    p = img.decode().then(() => img);
    // A failed load may work next time (the art is local, but still).
    p.catch(() => images.delete(src));
    images.set(src, p);
  }
  return p;
}

/** Redraws the tray icon if Candy's look changed since the last one. */
export function syncTrayIcon() {
  const art = State.art;
  if (!art) return;
  const look = trayLook(
    dressed(art, State.companion.costume),
    State.mood.state,
    lookFilter(State.companion),
    State.paused,
    State.unseen?.kind === "alert",
  );
  const key = trayKey(look);
  if (key === shown) return;
  shown = key;
  void draw(look, key);
}

async function draw(look: TrayLook, key: string) {
  try {
    const [frame, eyes] = await Promise.all([look.frame ? image(look.frame) : null, look.eyes ? image(look.eyes) : null]);
    // A newer look came along while the art loaded.
    if (key !== shown) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.filter = look.filter;
    if (frame) ctx.drawImage(frame, 0, 0, SIZE, SIZE);
    ctx.filter = "none";
    if (eyes) ctx.drawImage(eyes, 0, 0, SIZE, SIZE);
    if (look.dot) {
      // An amber dot in the corner, cut out of the candle so it reads on any taskbar.
      const x = SIZE - 7;
      const y = 7;
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#f5a524";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    await Bridge.setTrayIcon(Array.from(data), SIZE, SIZE);
  } catch {
    // The icon stays as it was; the next change tries again.
    if (key === shown) shown = "";
  }
}
