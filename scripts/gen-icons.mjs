// Draws the placeholder app icon (Candy, the candle) into the PNG/ICO set Tauri
// needs. No dependencies: shapes are rasterised here and encoded with node:zlib.
// Replace the shapes below — or the PNGs it writes — once the final mascot art
// exists.
//
//   node scripts/gen-icons.mjs
//
// The PNG and ICO encoders come from Coucou's gen-icons.mjs (MIT, © Louis Raillé).

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");

// ── Candy ─────────────────────────────────────────────────────────────────────
// Every shape is described on a 128×128 grid and tested per sub-sample.

const SS = 4; // supersampling factor

function roundRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    const cx = Math.max(x0 + r, Math.min(x1 - r, x));
    const cy = Math.max(y0 + r, Math.min(y1 - r, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
}

function ellipse(cx, cy, rx, ry) {
  return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/** A smile: the lower part of a ring. */
function smile(cx, cy, r, thick, halfWidth) {
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d <= r && d >= r - thick && y > cy + 2 && Math.abs(x - cx) <= halfWidth;
  };
}

const RIM = 5;
const SHAPES = [
  // Dark rim first, so the icon still reads on a light taskbar.
  { test: roundRect(60 - RIM, 6 - RIM, 68 + RIM, 122 + RIM, 4 + RIM), color: [6, 20, 11, 255] },
  { test: roundRect(28 - RIM, 24 - RIM, 100 + RIM, 106 + RIM, 22 + RIM), color: [6, 20, 11, 255] },
  // Wick through the body.
  { test: roundRect(60, 6, 68, 122, 4), color: [21, 128, 61, 255] },
  // Body, with a vertical gradient (see shade()).
  { test: roundRect(28, 24, 100, 106, 22), color: "body" },
  // Cheeks.
  { test: ellipse(42, 78, 7, 4.5), color: [249, 168, 212, 170] },
  { test: ellipse(86, 78, 7, 4.5), color: [249, 168, 212, 170] },
  // Eyes and their highlights.
  { test: ellipse(50, 60, 7.5, 10), color: [11, 31, 18, 255] },
  { test: ellipse(78, 60, 7.5, 10), color: [11, 31, 18, 255] },
  { test: ellipse(52.5, 55.5, 2.8, 3.2), color: [255, 255, 255, 255] },
  { test: ellipse(80.5, 55.5, 2.8, 3.2), color: [255, 255, 255, 255] },
  // Smile.
  { test: smile(64, 68, 14, 4.5, 11), color: [11, 31, 18, 255] },
];

const TOP = [134, 239, 172]; // #86EFAC
const BOTTOM = [22, 163, 74]; // #16A34A

function shade(y) {
  const t = Math.max(0, Math.min(1, (y - 24) / 82));
  return [...TOP.map((c, i) => c + (BOTTOM[i] - c) * t), 255];
}

function renderCandy(size) {
  const px = new Uint8Array(size * size * 4);
  const k = 128 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = (x + (sx + 0.5) / SS) * k;
          const gy = (y + (sy + 0.5) / SS) * k;
          // Composite the shapes back to front (premultiplied, src-over).
          let pr = 0, pg = 0, pb = 0, pa = 0;
          for (const s of SHAPES) {
            if (!s.test(gx, gy)) continue;
            const c = s.color === "body" ? shade(gy) : s.color;
            const ca = c[3] / 255;
            pr = c[0] * ca + pr * (1 - ca);
            pg = c[1] * ca + pg * (1 - ca);
            pb = c[2] * ca + pb * (1 - ca);
            pa = ca + pa * (1 - ca);
          }
          r += pr; g += pg; b += pb; a += pa;
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      const alpha = a / n;
      px[o] = alpha > 0 ? Math.round(r / n / alpha) : 0;
      px[o + 1] = alpha > 0 ? Math.round(g / n / alpha) : 0;
      px[o + 2] = alpha > 0 ? Math.round(b / n / alpha) : 0;
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

// ── PNG ───────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO (PNG-in-ICO, Vista and later) ─────────────────────────────────────────

function encodeICO(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir[o] = e.size >= 256 ? 0 : e.size;
    dir[o + 1] = e.size >= 256 ? 0 : e.size;
    dir[o + 2] = 0;
    dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

// ── Go ────────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });

const png = (size) => encodePNG(size, renderCandy(size));

const files = {
  "32x32.png": png(32),
  "128x128.png": png(128),
  "128x128@2x.png": png(256),
  "icon.png": png(512),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`${name} — ${data.length} bytes`);
}

const ico = encodeICO([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png(size) })));
writeFileSync(join(OUT, "icon.ico"), ico);
console.log(`icon.ico — ${ico.length} bytes`);
