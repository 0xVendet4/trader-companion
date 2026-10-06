// Draws the daily recap (see recap.ts) as a 1200 × 675 PNG — the size X and
// Telegram show uncropped — with the mascot in its current look. Everything is
// drawn on a canvas from the app's own files, so nothing leaves the machine
// until the trader pastes the image somewhere. Token symbols are drawn as
// canvas text, never parsed as markup.

import { resolveState, type Manifest } from "../mascot/mascot";
import type { Recap } from "./recap";

export const CARD_W = 1200;
export const CARD_H = 675;

export interface CardLook {
  manifest: Manifest;
  /** CSS filter for the skin (see skins.ts). */
  filter: string;
  hat: string | null;
  face: string | null;
}

const BASE = "mascot/";
const FONT = `"Segoe UI", system-ui, -apple-system, sans-serif`;
const TONES = { up: "#34d399", down: "#f4505e", flat: "#f5f6f8" } as const;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = BASE + src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits, then cuts it with "…" if it must. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: number, min = 18): string {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && s > min) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  let t = text;
  while (ctx.measureText(t).width > maxW && t.length > 1) t = `${t.slice(0, -2)}…`;
  return t;
}

/** Splits a line into at most two that fit the width. */
function wrap2(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(" ");
  for (let i = words.length - 1; i > 0; i--) {
    const a = words.slice(0, i).join(" ");
    if (ctx.measureText(a).width <= maxW) return [a, words.slice(i).join(" ")];
  }
  return [text];
}

export async function drawRecapCard(recap: Recap, look: CardLook, site: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");

  // Background.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, "#0d1322");
  bg.addColorStop(1, "#000000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(250, 360, 20, 250, 360, 330);
  glow.addColorStop(0, "rgba(74, 222, 128, 0.18)");
  glow.addColorStop(1, "rgba(74, 222, 128, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 600, CARD_H);

  // Title and date.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f5f6f8";
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(recap.title, 60, 78);
  ctx.fillStyle = "#9aa0aa";
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(`My day · ${recap.date}`, 60, 114);

  // The mascot: its frame for the day's mood, its eyes, then face and hat.
  const def = resolveState(look.manifest, recap.mood);
  const [frame, eyes, face, hat] = await Promise.all([
    def ? loadImage(def.frames[0]) : Promise.resolve(null),
    def?.eyes ? loadImage(def.eyes) : Promise.resolve(null),
    look.face ? loadImage(look.face) : Promise.resolve(null),
    look.hat ? loadImage(look.hat) : Promise.resolve(null),
  ]);
  const M = 300;
  const mx = 100;
  const my = 150;
  if (frame) {
    ctx.save();
    ctx.filter = look.filter;
    ctx.drawImage(frame, mx, my, M, M);
    ctx.restore();
  }
  if (eyes) ctx.drawImage(eyes, mx, my, M, M);
  if (face) ctx.drawImage(face, mx, my, M, M);
  if (hat) ctx.drawImage(hat, mx, my, M, M);

  // Its speech bubble, under it.
  ctx.font = `700 26px ${FONT}`;
  const lines = wrap2(ctx, recap.headline, 330);
  const bh = 34 * lines.length + 30;
  const by = my + M + 26;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 60, by, 380, bh, 20);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(240, by);
  ctx.lineTo(250, by - 14);
  ctx.lineTo(262, by);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, 250, by + 40 + i * 34));
  ctx.textAlign = "left";

  // Tiles: two columns, up to three rows.
  const gx = 480;
  const gy = 150;
  const tw = 320;
  const th = 138;
  const gap = 20;
  recap.tiles.forEach((t, i) => {
    const x = gx + (i % 2) * (tw + gap);
    const y = gy + Math.floor(i / 2) * (th + gap);
    ctx.fillStyle = "#121826";
    roundRect(ctx, x, y, tw, th, 20);
    ctx.fill();
    ctx.fillStyle = "#8b919b";
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(t.label.toUpperCase(), x + 24, y + 38);
    ctx.fillStyle = TONES[t.tone];
    const value = fitText(ctx, t.value, tw - 48, 40, 800, 22);
    ctx.fillText(value, x + 24, y + 86);
    if (t.sub) {
      ctx.fillStyle = "#9aa0aa";
      const sub = fitText(ctx, t.sub, tw - 48, 19, 600, 14);
      ctx.fillText(sub, x + 24, y + 118);
    }
  });

  // Footer.
  ctx.fillStyle = "#6b7079";
  ctx.font = `600 18px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`${site.replace(/^https?:\/\//, "")} · not financial advice`, CARD_W - 60, CARD_H - 34);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card"))), "image/png"));
}
