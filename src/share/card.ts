// Draws a recap (see recap.ts) as a 1200 × 675 PNG — the size X and Telegram
// show uncropped — or as a 1080 × 1920 story for Instagram, TikTok and Telegram
// stories, with the mascot in its current look. Everything is
// drawn on a canvas from the app's own files, so nothing leaves the machine
// until the trader pastes the image somewhere. Token symbols are drawn as
// canvas text, never parsed as markup.

import { resolveState, type Manifest } from "../mascot/mascot";
import type { Recap } from "./recap";

export const CARD_W = 1200;
export const CARD_H = 675;
/** The story card: 9:16. */
export const STORY_W = 1080;
export const STORY_H = 1920;
export type CardFormat = "wide" | "story";

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

/** The mascot for the recap's mood: its frame, its eyes, then face and hat, in a square. */
async function drawMascot(ctx: CanvasRenderingContext2D, recap: Recap, look: CardLook, x: number, y: number, size: number) {
  const def = resolveState(look.manifest, recap.mood);
  const [frame, eyes, face, hat] = await Promise.all([
    def ? loadImage(def.frames[0]) : Promise.resolve(null),
    def?.eyes ? loadImage(def.eyes) : Promise.resolve(null),
    look.face ? loadImage(look.face) : Promise.resolve(null),
    look.hat ? loadImage(look.hat) : Promise.resolve(null),
  ]);
  if (frame) {
    ctx.save();
    // A loss mood stays red under any colour (StateDef.tint).
    ctx.filter = def?.tint === false ? "none" : look.filter;
    ctx.drawImage(frame, x, y, size, size);
    ctx.restore();
  }
  for (const img of [eyes, face, hat]) if (img) ctx.drawImage(img, x, y, size, size);
}

/** One tile: its label, its value in its tone, a line under it. */
function drawTile(ctx: CanvasRenderingContext2D, t: Recap["tiles"][number], x: number, y: number, w: number, h: number, k = 1) {
  ctx.fillStyle = "#121826";
  roundRect(ctx, x, y, w, h, 20 * k);
  ctx.fill();
  ctx.fillStyle = "#8b919b";
  ctx.font = `700 ${18 * k}px ${FONT}`;
  ctx.fillText(t.label.toUpperCase(), x + 24 * k, y + 38 * k);
  ctx.fillStyle = TONES[t.tone];
  const value = fitText(ctx, t.value, w - 48 * k, 40 * k, 800, 22 * k);
  ctx.fillText(value, x + 24 * k, y + 86 * k);
  if (t.sub) {
    ctx.fillStyle = "#9aa0aa";
    const sub = fitText(ctx, t.sub, w - 48 * k, 19 * k, 600, 14 * k);
    ctx.fillText(sub, x + 24 * k, y + 118 * k);
  }
}

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the card"))), "image/png"));

/** "My day · Mon 5 Oct", "My week · 28 Sep – 4 Oct". */
const subtitle = (recap: Recap) => `${recap.kind === "week" ? "My week" : "My day"} · ${recap.date}`;

/** The story card (9:16): the mascot big on top, its line, the tiles under it. */
async function drawStory(recap: Recap, look: CardLook, name: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
  bg.addColorStop(0, "#0d1322");
  bg.addColorStop(1, "#000000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const glow = ctx.createRadialGradient(STORY_W / 2, 520, 30, STORY_W / 2, 520, 520);
  glow.addColorStop(0, "rgba(74, 222, 128, 0.2)");
  glow.addColorStop(1, "rgba(74, 222, 128, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_W, 1100);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f5f6f8";
  ctx.font = `800 56px ${FONT}`;
  ctx.fillText(recap.title, STORY_W / 2, 150);
  ctx.fillStyle = "#9aa0aa";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(subtitle(recap), STORY_W / 2, 206);

  const M = 520;
  await drawMascot(ctx, recap, look, (STORY_W - M) / 2, 250, M);

  // The bubble.
  ctx.font = `700 42px ${FONT}`;
  const lines = wrap2(ctx, recap.headline, 760);
  const bw = 860;
  const bh = 56 * lines.length + 50;
  const bx = (STORY_W - bw) / 2;
  const by = 250 + M + 40;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bx, by, bw, bh, 32);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(STORY_W / 2 - 16, by);
  ctx.lineTo(STORY_W / 2, by - 22);
  ctx.lineTo(STORY_W / 2 + 16, by);
  ctx.fill();
  ctx.fillStyle = "#111111";
  lines.forEach((l, i) => ctx.fillText(l, STORY_W / 2, by + 66 + i * 56));
  ctx.textAlign = "left";

  // The tiles: two columns, three rows.
  const k = 1.6;
  const tw = 440;
  const th = 138 * k;
  const gap = 30;
  const gx = (STORY_W - (tw * 2 + gap)) / 2;
  const gy = by + bh + 70;
  recap.tiles.forEach((t, i) => drawTile(ctx, t, gx + (i % 2) * (tw + gap), gy + Math.floor(i / 2) * (th + gap), tw, th, k));

  ctx.fillStyle = "#6b7079";
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${name} · not financial advice`, STORY_W / 2, STORY_H - 70);
  ctx.textAlign = "left";
  return toPng(canvas);
}

/** A recap card. `name` signs its footer: the app's name, never a link. */
export async function drawRecapCard(recap: Recap, look: CardLook, name: string, format: CardFormat = "wide"): Promise<Blob> {
  if (format === "story") return drawStory(recap, look, name);
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
  ctx.fillText(subtitle(recap), 60, 114);

  // The mascot in the mood of the day (or week).
  const M = 300;
  const my = 150;
  await drawMascot(ctx, recap, look, 100, my, M);

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
  recap.tiles.forEach((t, i) => drawTile(ctx, t, gx + (i % 2) * (tw + gap), gy + Math.floor(i / 2) * (th + gap), tw, th));

  // Footer.
  ctx.fillStyle = "#6b7079";
  ctx.font = `600 18px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`${name} · not financial advice`, CARD_W - 60, CARD_H - 34);
  ctx.textAlign = "left";

  return toPng(canvas);
}
