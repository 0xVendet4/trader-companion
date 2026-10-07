// Writes the placeholder mascot — Candy, a little candle — into public/mascot/:
// one SVG per frame, the eyes as their own layer (eyes/, they follow the
// mouse), whole-face stills for icons (still/), accessories, and mascot.json,
// the manifest the app reads.
//
//   node scripts/gen-placeholder-mascot.mjs
//
// This is stand-in art. The final character replaces the files in
// public/mascot/ (PNG or SVG, any names) and their entries in mascot.json;
// see ASSETS.md for the list of expressions and the sizes to deliver.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "mascot");

const INK = "#0b1f12";
const RIM = "#06140b";

const PALETTES = {
  green: { top: "#86efac", bottom: "#16a34a", wick: "#15803d" },
  red: { top: "#fca5a5", bottom: "#dc2626", wick: "#991b1b" },
  amber: { top: "#fde68a", bottom: "#f59e0b", wick: "#b45309" },
  grey: { top: "#e5e7eb", bottom: "#9ca3af", wick: "#6b7280" },
  sleepy: { top: "#bbf7d0", bottom: "#5f8f73", wick: "#3f6b52" },
};

const L = 50; // left eye x
const R = 78; // right eye x
const EY = 60; // eye y

const line = (d, w = 4) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="#fde047" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
}

function heart(cx, cy, s) {
  const d = `M${cx} ${cy + 6 * s} C${cx - 10 * s} ${cy - 1 * s} ${cx - 6 * s} ${cy - 9 * s} ${cx} ${cy - 4 * s} C${cx + 6 * s} ${cy - 9 * s} ${cx + 10 * s} ${cy - 1 * s} ${cx} ${cy + 6 * s} Z`;
  return `<path d="${d}" fill="#fb7185" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
}

const EYES = {
  open: [L, R]
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="${EY}" rx="7.5" ry="10" fill="${INK}"/><circle cx="${x + 2.5}" cy="${EY - 4.5}" r="3" fill="#fff"/>`,
    )
    .join(""),
  blink: [L, R].map((x) => line(`M${x - 7} ${EY + 1} Q${x} ${EY + 4} ${x + 7} ${EY + 1}`)).join(""),
  happy: [L, R].map((x) => line(`M${x - 7} ${EY + 3} Q${x} ${EY - 7} ${x + 7} ${EY + 3}`)).join(""),
  closed: [L, R].map((x) => line(`M${x - 7} ${EY - 1} Q${x} ${EY + 6} ${x + 7} ${EY - 1}`)).join(""),
  wide: [L, R]
    .map(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="11" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="${x}" cy="${EY + 1}" r="4" fill="${INK}"/>`,
    )
    .join(""),
  half: [L, R]
    .map(
      (x) =>
        `<path d="M${x - 7.5} ${EY} A7.5 8 0 0 0 ${x + 7.5} ${EY} Z" fill="${INK}"/>${line(`M${x - 9} ${EY} L${x + 9} ${EY}`, 3)}`,
    )
    .join(""),
  stars: star(L, EY, 10) + star(R, EY, 10),
  hearts: heart(L, EY, 1.1) + heart(R, EY, 1.1),
  dots: [L, R].map((x) => `<circle cx="${x}" cy="${EY}" r="4.5" fill="${INK}"/>`).join(""),
  // Narrowed, concentrating.
  narrow: [L, R]
    .map((x) => `<ellipse cx="${x}" cy="${EY + 1}" rx="7.5" ry="5.5" fill="${INK}"/><circle cx="${x + 2.5}" cy="${EY - 1.5}" r="2" fill="#fff"/>`)
    .join(""),
  // Big and shiny: two highlights each.
  sparkle: [L, R]
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="${EY}" rx="8.5" ry="11" fill="${INK}"/><circle cx="${x + 2.5}" cy="${EY - 4.5}" r="3.2" fill="#fff"/><circle cx="${x - 2.5}" cy="${EY + 4}" r="1.6" fill="#fff"/>`,
    )
    .join(""),
  // Spirals: the world is spinning.
  spiral: [L, R]
    .map((x) => line(`M${x} ${EY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7.5 7.5 0 1 1 -15 0`, 2.6))
    .join(""),
  // Pleased with itself: closed, curving down at the ends.
  smug: [L, R].map((x) => line(`M${x - 8} ${EY + 2} Q${x} ${EY - 4} ${x + 8} ${EY + 2}`, 4.5)).join(""),
};

// Eyes that look around are drawn apart from the frames, on their own layer
// (mascot.json → eyes): `face` stays in the frame (the white of wide eyes),
// `look` moves. Eyes not listed (closed, half-shut) stay in the frame.
const EYE_LAYERS = {
  open: { face: "", look: EYES.open },
  narrow: { face: "", look: EYES.narrow },
  sparkle: { face: "", look: EYES.sparkle },
  happy: { face: "", look: EYES.happy },
  wide: {
    face: [L, R].map((x) => `<circle cx="${x}" cy="${EY}" r="11" fill="#fff" stroke="${INK}" stroke-width="3"/>`).join(""),
    look: [L, R].map((x) => `<circle cx="${x}" cy="${EY + 1}" r="4" fill="${INK}"/>`).join(""),
  },
  stars: { face: "", look: EYES.stars },
  hearts: { face: "", look: EYES.hearts },
  dots: { face: "", look: EYES.dots },
};

const BROWS = {
  none: "",
  worried: line(`M${L - 8} ${EY - 10} L${L + 7} ${EY - 15}`) + line(`M${R + 8} ${EY - 10} L${R - 7} ${EY - 15}`),
  stern: line(`M${L - 9} ${EY - 15} L${L + 7} ${EY - 9}`) + line(`M${R + 9} ${EY - 15} L${R - 7} ${EY - 9}`),
  // One brow up: "oh, what's that?"
  raised: line(`M${L - 8} ${EY - 18} Q${L} ${EY - 23} ${L + 8} ${EY - 18}`) + line(`M${R - 8} ${EY - 13} L${R + 8} ${EY - 13}`),
  flat: line(`M${L - 8} ${EY - 14} L${L + 8} ${EY - 14}`) + line(`M${R - 8} ${EY - 14} L${R + 8} ${EY - 14}`),
};

const MOUTHS = {
  smile: line("M55 77 Q64 86 73 77"),
  small: line("M59 79 Q64 83 69 79", 3.5),
  grin: `<path d="M53 76 Q64 93 75 76 Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M58 84 Q64 89 70 84 Q64 81 58 84 Z" fill="#fb7185"/>`,
  flat: line("M57 81 L71 81"),
  wavy: line("M53 82 Q57 78 61 82 T69 82 T77 82", 3.5),
  o: `<ellipse cx="64" cy="82" rx="6" ry="7.5" fill="${INK}"/>`,
  smallO: `<ellipse cx="64" cy="81" rx="3.5" ry="4.2" fill="${INK}"/>`,
  frown: line("M55 84 Q64 76 73 84"),
  smirk: line("M56 80 Q66 84 74 76"),
  short: line("M60 81 L68 81", 3.5),
  // Teeth clenched.
  grit:
    `<rect x="53" y="76" width="22" height="10" rx="4" fill="#fff" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M60 76 L60 86 M64 76 L64 86 M68 76 L68 86 M53 81 L75 81" stroke="${INK}" stroke-width="1.6"/>`,
};

function arm(x1, y1, x2, y2, color) {
  return (
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${RIM}" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`
  );
}

const EXTRAS = {
  // Red in the face.
  flush: () =>
    `<ellipse cx="42" cy="74" rx="9" ry="5.5" fill="#ef4444" opacity="0.5"/><ellipse cx="86" cy="74" rx="9" ry="5.5" fill="#ef4444" opacity="0.5"/>` +
    `<path d="M88 34 L94 30 M92 40 L99 38 M86 28 L88 22" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  // A little "phew" of breath.
  puff: () =>
    `<path d="M80 84 q4 -5 9 -2 q5 -3 8 2 q4 3 -1 6 q-3 4 -8 1 q-5 2 -8 -2 q-3 -3 0 -5 Z" fill="#e0f2fe" stroke="${INK}" stroke-width="1.5"/>`,
  tear: () =>
    `<path d="M${L - 4} ${EY + 9} C${L - 7} ${EY + 15} ${L - 7} ${EY + 18} ${L - 4} ${EY + 19} C${L - 1} ${EY + 18} ${L - 1} ${EY + 15} ${L - 4} ${EY + 9} Z" fill="#7dd3fc" stroke="${INK}" stroke-width="1.5"/>`,
  sweat2: () =>
    `<path d="M97 32 C93 39 91 43 94 47 C97 50 102 48 102 44 C102 41 100 38 97 32 Z" fill="#7dd3fc" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M31 40 C28 45 27 48 29 50 C31 52 34 51 34 48 C34 46 33 44 31 40 Z" fill="#7dd3fc" stroke="${INK}" stroke-width="2"/>`,
  sweat: () =>
    `<path d="M97 32 C93 39 91 43 94 47 C97 50 102 48 102 44 C102 41 100 38 97 32 Z" fill="#7dd3fc" stroke="${INK}" stroke-width="2"/>`,
  armsUpA: (p) => arm(32, 66, 16, 46, p.bottom) + arm(96, 66, 112, 46, p.bottom),
  armsUpB: (p) => arm(32, 64, 12, 38, p.bottom) + arm(96, 64, 116, 38, p.bottom),
  waveA: (p) => arm(96, 66, 114, 44, p.bottom) + arm(32, 84, 22, 96, p.bottom),
  waveB: (p) => arm(96, 66, 119, 54, p.bottom) + arm(32, 84, 22, 96, p.bottom),
  stopSign: (p) => {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      pts.push(`${(108 + Math.cos(a) * 15).toFixed(1)},${(92 + Math.sin(a) * 15).toFixed(1)}`);
    }
    return (
      arm(96, 84, 104, 92, p.bottom) +
      `<polygon points="${pts.join(" ")}" fill="#ef4444" stroke="#fff" stroke-width="2.5"/>` +
      `<text x="108" y="95" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#fff" text-anchor="middle">STOP</text>`
    );
  },
};

/** A frame. `eyesApart`: leave out what the eyes layer draws. */
function svg({ palette, eyes, brows = "none", mouth, cheeks = 0.55, extras = [] }, eyesApart = true) {
  const p = PALETTES[palette];
  const extra = extras.map((e) => EXTRAS[e](p)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset="1" stop-color="${p.bottom}"/></linearGradient></defs>
<rect x="60" y="6" width="8" height="116" rx="4" fill="${p.wick}" stroke="${RIM}" stroke-width="5" paint-order="stroke"/>
${extra.includes("STOP") ? "" : extra}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#g)" stroke="${RIM}" stroke-width="5" paint-order="stroke"/>
<ellipse cx="42" cy="75" rx="7" ry="4.5" fill="#f9a8d4" opacity="${cheeks}"/><ellipse cx="86" cy="75" rx="7" ry="4.5" fill="#f9a8d4" opacity="${cheeks}"/>
${BROWS[brows]}${eyesApart && EYE_LAYERS[eyes] ? EYE_LAYERS[eyes].face : EYES[eyes]}${MOUTHS[mouth]}
${extra.includes("STOP") ? extra : ""}
</svg>
`;
}

// name → art; states below reference these by file name. Candy is a candle:
// green, and red on a loss (worried, shocked, sad, stop). The trader's colour
// pick tints the green moods (see src/mascot/skins.ts); the red ones are
// `tint: false` and stay red under any colour. The face, brows, sweat and
// effects tell the rest.
const FRAMES = {
  "idle.svg": { palette: "green", eyes: "open", mouth: "smile" },
  "happy.svg": { palette: "green", eyes: "happy", mouth: "grin", cheeks: 0.85 },
  "celebrate-1.svg": { palette: "green", eyes: "stars", mouth: "grin", cheeks: 0.85, extras: ["armsUpA"] },
  "celebrate-2.svg": { palette: "green", eyes: "stars", mouth: "grin", cheeks: 0.85, extras: ["armsUpB"] },
  "worried.svg": { palette: "red", eyes: "open", brows: "worried", mouth: "wavy", extras: ["sweat"] },
  "shocked.svg": { palette: "red", eyes: "wide", brows: "worried", mouth: "o" },
  "sleepy.svg": { palette: "sleepy", eyes: "closed", mouth: "smallO", cheeks: 0.35 },
  "alert.svg": { palette: "green", eyes: "wide", mouth: "smallO" },
  "tired.svg": { palette: "sleepy", eyes: "half", mouth: "flat", cheeks: 0.3, extras: ["sweat"] },
  "stop.svg": { palette: "red", eyes: "open", brows: "stern", mouth: "flat", extras: ["stopSign"] },
  "confused.svg": { palette: "green", eyes: "dots", mouth: "wavy", cheeks: 0.3 },
  "love.svg": { palette: "green", eyes: "hearts", mouth: "smile", cheeks: 0.9 },
  "wave-1.svg": { palette: "green", eyes: "happy", mouth: "grin", cheeks: 0.85, extras: ["waveA"] },
  "wave-2.svg": { palette: "green", eyes: "happy", mouth: "grin", cheeks: 0.85, extras: ["waveB"] },
  "proud.svg": { palette: "green", eyes: "smug", mouth: "smirk", cheeks: 0.8 },
  "sad.svg": { palette: "red", eyes: "open", brows: "worried", mouth: "frown", cheeks: 0.3, extras: ["tear"] },
  "bored.svg": { palette: "green", eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
  "focused.svg": { palette: "green", eyes: "narrow", brows: "stern", mouth: "short", cheeks: 0.4 },
  "nervous.svg": { palette: "green", eyes: "wide", brows: "worried", mouth: "grit", cheeks: 0.3, extras: ["sweat2"] },
  "curious.svg": { palette: "green", eyes: "open", brows: "raised", mouth: "smallO", cheeks: 0.55 },
  "angry.svg": { palette: "green", eyes: "narrow", brows: "stern", mouth: "frown", cheeks: 0, extras: ["flush"] },
  "excited.svg": { palette: "green", eyes: "sparkle", mouth: "grin", cheeks: 0.9 },
  "relieved.svg": { palette: "green", eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, extras: ["sweat", "puff"] },
  "dizzy.svg": { palette: "green", eyes: "spiral", mouth: "wavy", cheeks: 0.35 },
  "cool.svg": { palette: "green", eyes: "narrow", brows: "raised", mouth: "smirk", cheeks: 0.45 },
  "sick.svg": { palette: "sleepy", eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, extras: ["sweat"] },
};

// Accessories, on the same 128 canvas so they line up with every frame.
const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
${body}
</svg>
`;
const OUTFITS = {
  "outfits/cap.svg": wrap(
    `<path d="M34 34 Q36 12 64 12 Q92 12 94 34 Z" fill="#3b82f6" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M86 32 Q104 30 114 36 Q102 40 86 38 Z" fill="#2563eb" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<circle cx="64" cy="13" r="3.5" fill="#1d4ed8" stroke="${RIM}" stroke-width="2"/>`,
  ),
  "outfits/shades.svg": wrap(
    `<rect x="37" y="51" width="24" height="16" rx="6" fill="#0b0f19" stroke="${RIM}" stroke-width="3"/>` +
      `<rect x="67" y="51" width="24" height="16" rx="6" fill="#0b0f19" stroke="${RIM}" stroke-width="3"/>` +
      `<path d="M61 57 Q64 54 67 57" fill="none" stroke="${RIM}" stroke-width="3"/>` +
      `<path d="M41 55 L48 55 M71 55 L78 55" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2.5" stroke-linecap="round"/>`,
  ),
  "outfits/crown.svg": wrap(
    `<path d="M40 30 L42 10 L53 20 L64 6 L75 20 L86 10 L88 30 Z" fill="#facc15" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<circle cx="64" cy="22" r="3.5" fill="#ef4444"/><circle cx="50" cy="25" r="2.5" fill="#3b82f6"/><circle cx="78" cy="25" r="2.5" fill="#22c55e"/>`,
  ),
  "outfits/party.svg": wrap(
    `<path d="M46 30 L72 2 L88 26 Z" fill="#f472b6" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M56 19 L78 12 M63 26 L84 20" stroke="#fde047" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="72" cy="3" r="5" fill="#fde047" stroke="${RIM}" stroke-width="2.5"/>`,
  ),
  "outfits/headphones.svg": wrap(
    `<path d="M28 58 Q28 14 64 14 Q100 14 100 58" fill="none" stroke="${RIM}" stroke-width="10" stroke-linecap="round"/>` +
      `<path d="M28 58 Q28 14 64 14 Q100 14 100 58" fill="none" stroke="#a855f7" stroke-width="5" stroke-linecap="round"/>` +
      `<rect x="18" y="50" width="16" height="26" rx="6" fill="#a855f7" stroke="${RIM}" stroke-width="4"/>` +
      `<rect x="94" y="50" width="16" height="26" rx="6" fill="#a855f7" stroke="${RIM}" stroke-width="4"/>`,
  ),
};

Object.assign(OUTFITS, {
  "outfits/tophat.svg": wrap(
    `<rect x="46" y="2" width="36" height="24" rx="3" fill="#111827" stroke="${RIM}" stroke-width="4"/>` +
      `<rect x="46" y="18" width="36" height="6" fill="#dc2626"/>` +
      `<rect x="34" y="24" width="60" height="7" rx="3.5" fill="#111827" stroke="${RIM}" stroke-width="4"/>`,
  ),
  "outfits/cowboy.svg": wrap(
    `<path d="M44 28 Q44 6 56 8 Q64 12 72 8 Q84 6 84 28 Z" fill="#a16207" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M18 26 Q30 36 64 34 Q98 36 110 26 Q100 22 84 27 L44 27 Q28 22 18 26 Z" fill="#ca8a04" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M45 24 L83 24" stroke="#78350f" stroke-width="4"/>`,
  ),
  "outfits/beanie.svg": wrap(
    `<path d="M33 34 Q34 8 64 8 Q94 8 95 34 Z" fill="#ef4444" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<rect x="31" y="28" width="66" height="10" rx="4" fill="#b91c1c" stroke="${RIM}" stroke-width="4"/>` +
      `<path d="M46 14 L46 28 M56 10 L56 28 M64 9 L64 28 M72 10 L72 28 M82 14 L82 28" stroke="#fca5a5" stroke-opacity="0.5" stroke-width="2"/>` +
      `<circle cx="64" cy="7" r="6" fill="#f8fafc" stroke="${RIM}" stroke-width="3"/>`,
  ),
  "outfits/halo.svg": wrap(
    `<ellipse cx="64" cy="9" rx="24" ry="6" fill="none" stroke="#fde68a" stroke-opacity="0.45" stroke-width="9"/>` +
      `<ellipse cx="64" cy="9" rx="24" ry="6" fill="none" stroke="#facc15" stroke-width="4"/>`,
  ),
  "outfits/horns.svg": wrap(
    `<path d="M38 30 Q30 18 34 4 Q42 18 50 26 Z" fill="#dc2626" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M90 30 Q98 18 94 4 Q86 18 78 26 Z" fill="#dc2626" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>`,
  ),
  "outfits/wizard.svg": wrap(
    `<path d="M40 30 L66 0 L88 30 Z" fill="#6d28d9" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<ellipse cx="64" cy="30" rx="32" ry="6" fill="#5b21b6" stroke="${RIM}" stroke-width="4"/>` +
      `<path d="M62 14 l2 4 4 .6 -3 3 .7 4 -3.7 -2 -3.7 2 .7 -4 -3 -3 4 -.6z" fill="#fde047"/>` +
      `<circle cx="74" cy="22" r="2" fill="#fde047"/><circle cx="54" cy="24" r="1.6" fill="#fde047"/>`,
  ),
  "outfits/viking.svg": wrap(
    `<path d="M34 36 Q34 12 64 12 Q94 12 94 36 Z" fill="#9ca3af" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M62 12 L66 12 L66 36 L62 36 Z" fill="#6b7280"/>` +
      `<path d="M36 26 Q18 22 16 2 Q26 18 40 20 Z" fill="#f5f5f4" stroke="${RIM}" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M92 26 Q110 22 112 2 Q102 18 88 20 Z" fill="#f5f5f4" stroke="${RIM}" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<rect x="32" y="32" width="64" height="7" rx="3" fill="#78716c" stroke="${RIM}" stroke-width="3.5"/>`,
  ),
  "outfits/laser.svg": wrap(
    `<path d="M50 60 L4 72 L4 48 Z" fill="#ef4444" fill-opacity="0.35"/>` +
      `<path d="M78 60 L124 72 L124 48 Z" fill="#ef4444" fill-opacity="0.35"/>` +
      `<circle cx="50" cy="60" r="10" fill="#ef4444" fill-opacity="0.35"/><circle cx="78" cy="60" r="10" fill="#ef4444" fill-opacity="0.35"/>` +
      `<circle cx="50" cy="60" r="5.5" fill="#fecaca"/><circle cx="78" cy="60" r="5.5" fill="#fecaca"/>`,
  ),
});

// More hats.
Object.assign(OUTFITS, {
  "outfits/bow.svg": wrap(
    `<path d="M64 20 L40 8 Q34 20 40 32 Z" fill="#f472b6" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M64 20 L88 8 Q94 20 88 32 Z" fill="#f472b6" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M46 14 Q44 20 46 26 M82 14 Q84 20 82 26" stroke="#fbcfe8" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
      `<rect x="57" y="13" width="14" height="14" rx="5" fill="#ec4899" stroke="${RIM}" stroke-width="4"/>`,
  ),
  "outfits/chef.svg": wrap(
    `<path d="M40 30 Q28 26 32 14 Q36 4 48 8 Q54 -2 64 2 Q74 -2 80 8 Q92 4 96 14 Q100 26 88 30 Z" fill="#f8fafc" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<rect x="38" y="26" width="52" height="12" rx="3" fill="#f1f5f9" stroke="${RIM}" stroke-width="4"/>` +
      `<path d="M52 12 Q54 20 52 26 M76 12 Q74 20 76 26" stroke="#cbd5e1" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  ),
  "outfits/pirate.svg": wrap(
    `<path d="M22 32 Q30 8 64 6 Q98 8 106 32 Q86 24 64 30 Q42 24 22 32 Z" fill="#111827" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M30 28 Q64 18 98 28" stroke="#facc15" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<circle cx="64" cy="15" r="5" fill="#f8fafc"/><circle cx="62" cy="14" r="1.3" fill="#111827"/><circle cx="66" cy="14" r="1.3" fill="#111827"/>` +
      `<path d="M57 22 L71 26 M71 22 L57 26" stroke="#f8fafc" stroke-width="2" stroke-linecap="round"/>`,
  ),
});

// Even more hats.
const flower = (cx, cy, petal) =>
  [0, 72, 144, 216, 288]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<circle cx="${(cx + Math.cos(r) * 4.2).toFixed(1)}" cy="${(cy + Math.sin(r) * 4.2).toFixed(1)}" r="3.6" fill="${petal}" stroke="${RIM}" stroke-width="1.5"/>`;
    })
    .join("") + `<circle cx="${cx}" cy="${cy}" r="2.8" fill="#fde047" stroke="${RIM}" stroke-width="1.2"/>`;
Object.assign(OUTFITS, {
  "outfits/santa.svg": wrap(
    `<path d="M36 30 Q44 4 72 4 Q96 4 108 20 Q96 20 92 30 Z" fill="#dc2626" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<rect x="31" y="25" width="66" height="11" rx="5.5" fill="#f8fafc" stroke="${RIM}" stroke-width="4"/>` +
      `<circle cx="108" cy="21" r="6.5" fill="#f8fafc" stroke="${RIM}" stroke-width="3"/>`,
  ),
  "outfits/grad.svg": wrap(
    `<path d="M42 20 L42 34 Q64 40 86 34 L86 20 Z" fill="#1f2937" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M64 4 L110 16 L64 28 L18 16 Z" fill="#111827" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M64 16 L100 22 L100 36" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/>` +
      `<rect x="97" y="34" width="6" height="9" rx="2" fill="#facc15" stroke="${RIM}" stroke-width="1.5"/>` +
      `<circle cx="64" cy="16" r="3" fill="#facc15"/>`,
  ),
  "outfits/beret.svg": wrap(
    `<path d="M26 30 Q22 12 58 9 Q98 8 102 22 Q98 32 66 32 Q40 34 26 30 Z" fill="#be123c" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<rect x="56" y="3" width="6" height="8" rx="2.5" fill="#9f1239" stroke="${RIM}" stroke-width="2.5"/>` +
      `<path d="M40 16 Q60 11 84 14" stroke="#fda4af" stroke-opacity="0.5" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  ),
  "outfits/propeller.svg": wrap(
    `<path d="M34 34 Q34 12 64 12 Q94 12 94 34 Z" fill="#facc15" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M50 15 Q46 24 46 33 L56 33 Q56 22 58 13 Z" fill="#ef4444"/>` +
      `<path d="M78 15 Q82 24 82 33 L72 33 Q72 22 70 13 Z" fill="#3b82f6"/>` +
      `<path d="M34 34 Q34 12 64 12 Q94 12 94 34 Z" fill="none" stroke="${RIM}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M64 12 L64 5" stroke="${RIM}" stroke-width="3"/>` +
      `<ellipse cx="53" cy="5" rx="11" ry="3.2" fill="#ef4444" stroke="${RIM}" stroke-width="2"/>` +
      `<ellipse cx="75" cy="5" rx="11" ry="3.2" fill="#3b82f6" stroke="${RIM}" stroke-width="2"/>` +
      `<circle cx="64" cy="5" r="2.6" fill="#f8fafc" stroke="${RIM}" stroke-width="1.5"/>`,
  ),
  "outfits/flowers.svg": wrap(
    `<path d="M28 30 Q64 12 100 30" fill="none" stroke="#15803d" stroke-width="4" stroke-linecap="round"/>` +
      flower(32, 29, "#f9a8d4") + flower(47, 22, "#fde68a") + flower(64, 19, "#c4b5fd") + flower(81, 22, "#fda4af") + flower(96, 29, "#a5f3fc"),
  ),
  "outfits/bunny.svg": wrap(
    `<ellipse cx="46" cy="16" rx="9" ry="16" transform="rotate(-14 46 16)" fill="#f8fafc" stroke="${RIM}" stroke-width="4"/>` +
      `<ellipse cx="46" cy="17" rx="4" ry="10" transform="rotate(-14 46 17)" fill="#f9a8d4"/>` +
      `<ellipse cx="82" cy="16" rx="9" ry="16" transform="rotate(14 82 16)" fill="#f8fafc" stroke="${RIM}" stroke-width="4"/>` +
      `<ellipse cx="82" cy="17" rx="4" ry="10" transform="rotate(14 82 17)" fill="#f9a8d4"/>`,
  ),
});

// For the seasons (see src/mascot/seasons.ts), and anyone's wardrobe.
Object.assign(OUTFITS, {
  "outfits/pumpkin.svg": wrap(
    `<path d="M62 6 Q60 0 66 -2" fill="none" stroke="#15803d" stroke-width="4" stroke-linecap="round"/>` +
      `<ellipse cx="64" cy="20" rx="27" ry="16" fill="#f97316" stroke="${RIM}" stroke-width="4"/>` +
      `<path d="M52 6 Q46 20 52 35 M64 4 L64 36 M76 6 Q82 20 76 35" fill="none" stroke="#c2410c" stroke-width="2.5"/>` +
      `<path d="M50 16 L55 11 L58 17 Z M70 17 L73 11 L78 16 Z" fill="#fde047" stroke="${RIM}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M50 24 L54 28 L58 25 L62 29 L66 25 L70 29 L74 25 L78 24 Q64 34 50 24 Z" fill="#fde047" stroke="${RIM}" stroke-width="1.5" stroke-linejoin="round"/>`,
  ),
});

// Two more hats.
Object.assign(OUTFITS, {
  "outfits/catears.svg": wrap(
    `<path d="M30 34 Q64 14 98 34" fill="none" stroke="${RIM}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M30 34 Q64 14 98 34" fill="none" stroke="#374151" stroke-width="3.5" stroke-linecap="round"/>` +
      `<path d="M35 31 L39 5 L60 22 Z" fill="#374151" stroke="${RIM}" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M41 24 L43 13 L53 21 Z" fill="#f9a8d4"/>` +
      `<path d="M93 31 L89 5 L68 22 Z" fill="#374151" stroke="${RIM}" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M87 24 L85 13 L75 21 Z" fill="#f9a8d4"/>`,
  ),
  "outfits/rocket.svg": wrap(
    `<path d="M58 29 Q64 42 70 29 Z" fill="#fbbf24" stroke="#f97316" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M56 21 L47 31 L56 29 Z M72 21 L81 31 L72 29 Z" fill="#ef4444" stroke="${RIM}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M64 1 C73 7 75 17 72 30 L56 30 C53 17 55 7 64 1 Z" fill="#e5e7eb" stroke="${RIM}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M64 1 C69 4 71 7 72 10 L56 10 C57 7 59 4 64 1 Z" fill="#ef4444"/>` +
      `<circle cx="64" cy="18" r="4.5" fill="#38bdf8" stroke="${RIM}" stroke-width="2.5"/>`,
  ),
});

// Face accessories: worn with any hat, drawn under it.
const heartAt = (cx, cy, s, fill) => {
  const d = `M${cx} ${cy + 6 * s} C${cx - 10 * s} ${cy - 1 * s} ${cx - 6 * s} ${cy - 9 * s} ${cx} ${cy - 4 * s} C${cx + 6 * s} ${cy - 9 * s} ${cx + 10 * s} ${cy - 1 * s} ${cx} ${cy + 6 * s} Z`;
  return `<path d="${d}" fill="${fill}" stroke="${RIM}" stroke-width="3" stroke-linejoin="round"/>`;
};
const starAt = (cx, cy, r, fill) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.5;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${RIM}" stroke-width="3" stroke-linejoin="round"/>`;
};
const FACES = {
  "faces/shades.svg": OUTFITS["outfits/shades.svg"],
  "faces/laser.svg": OUTFITS["outfits/laser.svg"],
  "faces/glasses.svg": wrap(
    `<circle cx="${L}" cy="${EY}" r="12" fill="#ffffff" fill-opacity="0.12" stroke="${RIM}" stroke-width="5"/>` +
      `<circle cx="${R}" cy="${EY}" r="12" fill="#ffffff" fill-opacity="0.12" stroke="${RIM}" stroke-width="5"/>` +
      `<circle cx="${L}" cy="${EY}" r="12" fill="none" stroke="#b45309" stroke-width="2.5"/>` +
      `<circle cx="${R}" cy="${EY}" r="12" fill="none" stroke="#b45309" stroke-width="2.5"/>` +
      `<path d="M62 58 Q64 55 66 58" fill="none" stroke="${RIM}" stroke-width="3.5"/>` +
      `<path d="M38 58 L29 55 M90 58 L99 55" stroke="${RIM}" stroke-width="3.5" stroke-linecap="round"/>`,
  ),
  "faces/monocle.svg": wrap(
    `<path d="M${R + 6} ${EY + 11} Q${R + 14} 84 96 96" fill="none" stroke="#facc15" stroke-width="2" stroke-dasharray="3 2"/>` +
      `<circle cx="${R}" cy="${EY}" r="13" fill="#ffffff" fill-opacity="0.15" stroke="${RIM}" stroke-width="5"/>` +
      `<circle cx="${R}" cy="${EY}" r="13" fill="none" stroke="#facc15" stroke-width="2.5"/>` +
      `<path d="M${R - 6} ${EY - 6} Q${R - 2} ${EY - 9} ${R + 3} ${EY - 8}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ),
  "faces/mustache.svg": wrap(
    `<path d="M64 72 Q58 66 50 69 Q42 72 36 68 Q38 78 48 79 Q58 80 64 75 Q70 80 80 79 Q90 78 92 68 Q86 72 78 69 Q70 66 64 72 Z" fill="#422006" stroke="${RIM}" stroke-width="3" stroke-linejoin="round"/>`,
  ),
  "faces/starglasses.svg": wrap(
    starAt(L, EY, 14, "#f472b6") + starAt(R, EY, 14, "#facc15") +
      `<path d="M61 58 Q64 55 67 58" fill="none" stroke="${RIM}" stroke-width="3"/>`,
  ),
};
Object.assign(FACES, {
  "faces/threed.svg": wrap(
    `<rect x="35" y="50" width="26" height="18" rx="3" fill="#ef4444" fill-opacity="0.75" stroke="#f8fafc" stroke-width="3.5"/>` +
      `<rect x="67" y="50" width="26" height="18" rx="3" fill="#22d3ee" fill-opacity="0.75" stroke="#f8fafc" stroke-width="3.5"/>` +
      `<path d="M61 56 L67 56" stroke="#f8fafc" stroke-width="3.5"/>` +
      `<path d="M35 55 L28 53 M93 55 L100 53" stroke="#f8fafc" stroke-width="3" stroke-linecap="round"/>`,
  ),
  "faces/eyepatch.svg": wrap(
    `<path d="M28 44 Q50 48 70 56 M86 64 Q94 68 100 72" fill="none" stroke="${RIM}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<ellipse cx="${R}" cy="${EY + 1}" rx="11" ry="12" fill="#111827" stroke="${RIM}" stroke-width="3"/>` +
      `<path d="M${R - 6} ${EY - 5} Q${R} ${EY - 8} ${R + 5} ${EY - 5}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ),
  "faces/heartglasses.svg": wrap(
    heartAt(L, EY + 2, 1.55, "#f43f5e") + heartAt(R, EY + 2, 1.55, "#f43f5e") +
      `<path d="M62 57 Q64 54 66 57" fill="none" stroke="${RIM}" stroke-width="3"/>` +
      `<path d="M${L - 8} ${EY - 4} L${L - 4} ${EY - 6} M${R - 8} ${EY - 4} L${R - 4} ${EY - 6}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2.5" stroke-linecap="round"/>`,
  ),
  "faces/clownnose.svg": wrap(
    `<circle cx="64" cy="70" r="7.5" fill="#ef4444" stroke="${RIM}" stroke-width="3"/>` +
      `<circle cx="61.5" cy="67.5" r="2.2" fill="#ffffff" fill-opacity="0.75"/>`,
  ),
  "faces/beard.svg": wrap(
    `<path d="M29 72 Q30 110 64 116 Q98 110 99 72 Q92 92 78 90 Q70 82 64 86 Q58 82 50 90 Q36 92 29 72 Z" fill="#78350f" stroke="${RIM}" stroke-width="3.5" stroke-linejoin="round"/>` +
      `<path d="M44 98 Q48 104 52 100 M62 104 Q66 110 70 104 M78 98 Q82 104 86 98" stroke="#a16207" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ),
  "faces/domino.svg": wrap(
    `<path fill-rule="evenodd" d="M30 54 Q46 42 64 52 Q82 42 98 54 Q98 70 84 72 Q72 72 64 64 Q56 72 44 72 Q30 70 30 54 Z ` +
      `M${L - 7} ${EY} a7 8 0 1 0 14 0 a7 8 0 1 0 -14 0 Z M${R - 7} ${EY} a7 8 0 1 0 14 0 a7 8 0 1 0 -14 0 Z" fill="#1d4ed8" stroke="${RIM}" stroke-width="3" stroke-linejoin="round"/>`,
  ),
  "faces/vr.svg": wrap(
    `<path d="M26 58 L34 58 M94 58 L102 58" stroke="${RIM}" stroke-width="6" stroke-linecap="round"/>` +
      `<rect x="32" y="46" width="64" height="26" rx="9" fill="#e5e7eb" stroke="${RIM}" stroke-width="4"/>` +
      `<rect x="38" y="51" width="52" height="16" rx="6" fill="#111827"/>` +
      `<path d="M44 55 L58 55" stroke="#22d3ee" stroke-opacity="0.8" stroke-width="2.5" stroke-linecap="round"/>`,
  ),
});
// Ten more faces.
const pixels = (cells, fill) => cells.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`).join("");
Object.assign(FACES, {
  "faces/pixel.svg": wrap(
    `<g shape-rendering="crispEdges">` +
      pixels([[32, 50, 64, 5], [35, 55, 26, 6], [39, 61, 18, 4], [67, 55, 26, 6], [71, 61, 18, 4]], "#0b0f19") +
      pixels([[39, 56, 4, 3], [43, 59, 4, 2], [71, 56, 4, 3], [75, 59, 4, 2]], "#ffffff") +
      `</g>`,
  ),
  "faces/goggles.svg": wrap(
    `<path d="M24 58 L104 58" stroke="#78350f" stroke-width="7" stroke-linecap="round"/>` +
      `<circle cx="${L}" cy="${EY}" r="13" fill="#fb923c" fill-opacity="0.6" stroke="#a16207" stroke-width="5"/>` +
      `<circle cx="${R}" cy="${EY}" r="13" fill="#fb923c" fill-opacity="0.6" stroke="#a16207" stroke-width="5"/>` +
      `<path d="M62 58 Q64 55 66 58" stroke="#a16207" stroke-width="4" fill="none"/>` +
      `<path d="M${L - 7} ${EY - 5} Q${L - 3} ${EY - 9} ${L + 2} ${EY - 8} M${R - 7} ${EY - 5} Q${R - 3} ${EY - 9} ${R + 2} ${EY - 8}" stroke="#ffffff" stroke-opacity="0.75" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  ),
  "faces/whiskers.svg": wrap(
    `<path d="M60 69 L68 69 L64 74 Z" fill="#f472b6" stroke="${RIM}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M42 70 L16 65 M42 74 L15 75 M42 78 L18 85 M86 70 L112 65 M86 74 L113 75 M86 78 L110 85" stroke="${RIM}" stroke-width="2.5" stroke-linecap="round"/>`,
  ),
  "faces/freckles.svg": wrap(
    [[37, 72], [43, 75], [39, 79], [46, 80], [81, 72], [87, 75], [83, 79], [90, 80]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#92400e" fill-opacity="0.8"/>`)
      .join(""),
  ),
  "faces/bandaid.svg": wrap(
    `<g transform="rotate(-28 88 78)"><rect x="76" y="73" width="24" height="10" rx="4" fill="#f5c99b" stroke="${RIM}" stroke-width="2"/>` +
      `<rect x="84" y="73.5" width="8" height="9" fill="#e8a76f"/>` +
      `<circle cx="80" cy="76" r="0.9" fill="#b07a4f"/><circle cx="80" cy="80" r="0.9" fill="#b07a4f"/><circle cx="96" cy="76" r="0.9" fill="#b07a4f"/><circle cx="96" cy="80" r="0.9" fill="#b07a4f"/></g>`,
  ),
  "faces/lollipop.svg": wrap(
    `<path d="M70 82 L96 96" stroke="#f8fafc" stroke-width="3.5" stroke-linecap="round"/>` +
      `<circle cx="100" cy="98" r="10" fill="#f472b6" stroke="${RIM}" stroke-width="2.5"/>` +
      `<path d="M100 98 m-5 0 a5 5 0 1 0 5 -5 a3 3 0 1 0 3 3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  ),
  "faces/bubblegum.svg": wrap(
    `<circle cx="64" cy="85" r="12" fill="#f9a8d4" fill-opacity="0.92" stroke="#ec4899" stroke-width="2.5"/>` +
      `<path d="M57 80 Q60 76 64 76" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="2.5" stroke-linecap="round"/>`,
  ),
  "faces/warpaint.svg": wrap(
    `<path d="M33 73 L48 70 M34 79 L49 76 M95 73 L80 70 M94 79 L79 76" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round"/>`,
  ),
  "faces/dollareyes.svg": wrap(
    [L, R]
      .map(
        (x) =>
          `<circle cx="${x}" cy="${EY}" r="10.5" fill="#22c55e" stroke="${RIM}" stroke-width="3"/>` +
          `<text x="${x}" y="${EY + 5}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#f0fdf4" text-anchor="middle">$</text>`,
      )
      .join(""),
  ),
  "faces/facemask.svg": wrap(
    `<path d="M34 72 L25 64 M94 72 L103 64" stroke="#e0f2fe" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M34 69 Q64 62 94 69 L92 90 Q64 101 36 90 Z" fill="#bae6fd" stroke="#0369a1" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M40 76 Q64 71 88 76 M40 83 Q64 79 88 83" fill="none" stroke="#7dd3fc" stroke-width="2"/>`,
  ),
});
delete OUTFITS["outfits/shades.svg"];
delete OUTFITS["outfits/laser.svg"];

const MANIFEST = {
  name: "Candy",
  outfits: {
    cap: "outfits/cap.svg",
    crown: "outfits/crown.svg",
    party: "outfits/party.svg",
    headphones: "outfits/headphones.svg",
    tophat: "outfits/tophat.svg",
    cowboy: "outfits/cowboy.svg",
    beanie: "outfits/beanie.svg",
    halo: "outfits/halo.svg",
    horns: "outfits/horns.svg",
    wizard: "outfits/wizard.svg",
    viking: "outfits/viking.svg",
    bow: "outfits/bow.svg",
    chef: "outfits/chef.svg",
    pirate: "outfits/pirate.svg",
    santa: "outfits/santa.svg",
    grad: "outfits/grad.svg",
    beret: "outfits/beret.svg",
    propeller: "outfits/propeller.svg",
    flowers: "outfits/flowers.svg",
    bunny: "outfits/bunny.svg",
    pumpkin: "outfits/pumpkin.svg",
    catears: "outfits/catears.svg",
    rocket: "outfits/rocket.svg",
  },
  faces: {
    shades: "faces/shades.svg",
    laser: "faces/laser.svg",
    glasses: "faces/glasses.svg",
    monocle: "faces/monocle.svg",
    mustache: "faces/mustache.svg",
    starglasses: "faces/starglasses.svg",
    threed: "faces/threed.svg",
    eyepatch: "faces/eyepatch.svg",
    heartglasses: "faces/heartglasses.svg",
    clownnose: "faces/clownnose.svg",
    beard: "faces/beard.svg",
    domino: "faces/domino.svg",
    vr: "faces/vr.svg",
    pixel: "faces/pixel.svg",
    goggles: "faces/goggles.svg",
    whiskers: "faces/whiskers.svg",
    freckles: "faces/freckles.svg",
    bandaid: "faces/bandaid.svg",
    lollipop: "faces/lollipop.svg",
    bubblegum: "faces/bubblegum.svg",
    warpaint: "faces/warpaint.svg",
    dollareyes: "faces/dollareyes.svg",
    facemask: "faces/facemask.svg",
  },
  states: {
    idle: { frames: ["idle.svg"], eyes: "eyes/open.svg", eyesBlink: "eyes/blink.svg", motion: "breathe" },
    happy: { frames: ["happy.svg"], eyes: "eyes/happy.svg", motion: "breathe" },
    celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"], eyes: "eyes/stars.svg", fps: 4, motion: "bounce", fx: "sparkles" },
    worried: { frames: ["worried.svg"], eyes: "eyes/open.svg", eyesBlink: "eyes/blink.svg", motion: "sway", tint: false },
    shocked: { frames: ["shocked.svg"], eyes: "eyes/wide.svg", motion: "shake", tint: false },
    sleepy: { frames: ["sleepy.svg"], motion: "droop", fx: "zzz" },
    alert: { frames: ["alert.svg"], eyes: "eyes/wide.svg", motion: "jump", fx: "bang" },
    tired: { frames: ["tired.svg"], motion: "droop" },
    stop: { frames: ["stop.svg"], eyes: "eyes/open.svg", eyesBlink: "eyes/blink.svg", motion: "breathe", tint: false },
    confused: { frames: ["confused.svg"], eyes: "eyes/dots.svg", motion: "sway", fx: "question" },
    love: { frames: ["love.svg"], eyes: "eyes/hearts.svg", motion: "breathe", fx: "hearts" },
    wave: { frames: ["wave-1.svg", "wave-2.svg"], eyes: "eyes/happy.svg", fps: 3, motion: "breathe" },
    proud: { frames: ["proud.svg"], motion: "bounce", fx: "sparkles" },
    sad: { frames: ["sad.svg"], eyes: "eyes/open.svg", eyesBlink: "eyes/blink.svg", motion: "droop", tint: false },
    bored: { frames: ["bored.svg"], motion: "sway", fx: "dots" },
    focused: { frames: ["focused.svg"], eyes: "eyes/narrow.svg", motion: "none" },
    nervous: { frames: ["nervous.svg"], eyes: "eyes/wide.svg", motion: "jitter" },
    curious: { frames: ["curious.svg"], eyes: "eyes/open.svg", eyesBlink: "eyes/blink.svg", motion: "tilt", fx: "question" },
    angry: { frames: ["angry.svg"], eyes: "eyes/narrow.svg", motion: "jitter" },
    excited: { frames: ["excited.svg"], eyes: "eyes/sparkle.svg", motion: "bounce", fx: "sparkles" },
    relieved: { frames: ["relieved.svg"], motion: "breathe" },
    dizzy: { frames: ["dizzy.svg"], motion: "woozy" },
    cool: { frames: ["cool.svg"], eyes: "eyes/narrow.svg", motion: "sway" },
    sick: { frames: ["sick.svg"], motion: "droop" },
  },
};

// The eyes layers, and whole faces for places that show a still image (the
// browser tab icon, notifications, the tour's title cards).
const EYE_FILES = {
  "eyes/open.svg": EYE_LAYERS.open.look,
  "eyes/narrow.svg": EYE_LAYERS.narrow.look,
  "eyes/sparkle.svg": EYE_LAYERS.sparkle.look,
  "eyes/blink.svg": EYES.blink,
  "eyes/happy.svg": EYE_LAYERS.happy.look,
  "eyes/wide.svg": EYE_LAYERS.wide.look,
  "eyes/stars.svg": EYE_LAYERS.stars.look,
  "eyes/hearts.svg": EYE_LAYERS.hearts.look,
  "eyes/dots.svg": EYE_LAYERS.dots.look,
};
const STILLS = ["idle.svg", "happy.svg", "alert.svg"];

// ── Costumes ──────────────────────────────────────────────────────────────────
// A costume replaces the whole body, with its own frames and eyes for every
// mood (motion and effects stay Candy's). Hats and faces still go on top; the
// colour pick does not apply. Files go in costumes/<id>/.

// Gengar: a purple ghost with pointed ears, a spiky crest, ragged arms, red
// eyes under angry brows and a wide toothy grin.
const YV = {
  top: "#8a5ccb",
  bottom: "#55309b",
  limb: "#6a41b0",
  light: "#9d74da",
  rim: "#1b0a2e",
  red: "#f04848",
  deep: "#b91c1c",
};
const YL = 48.5; // left eye x
const YR = 79.5; // right eye x
const YY = 61; // eye y
const yline = (d, w = 4) =>
  `<path d="${d}" fill="none" stroke="${YV.rim}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Candy's own eye art, in Gengar's ink. */
const yink = (s) => s.replaceAll(INK, YV.rim);
const mirror = (s) => `<g transform="translate(128 0) scale(-1 1)">${s}</g>`;

// The parts, drawn for the left side; the right is the mirror image.
const YV_EAR =
  `<path d="M34 48 L20.6 10.2 Q19.4 6.6 23 7.6 Q39 13.5 53 28 Z" fill="url(#yl)" stroke="${YV.rim}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M24.5 13.5 Q36 18 45.5 26.5 L33 40 Z" fill="${YV.bottom}" opacity="0.55"/>`;
const YV_ARM =
  `<path d="M31 60.5 C22 62.5 15.5 69.5 13 78.5 C12 82.2 11.6 85.6 11.8 89 L15.6 86.6 L17.8 91.6 L20.6 87.6 L23.3 92.6 L25.8 88.4 L29.5 90.8 L31 90.6 Z" fill="url(#yl)" stroke="${YV.rim}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M28 67 C23 73 21 80 22 88 L23.3 92.6 L25.8 88.4 L29.5 90.8 L30 90.6 L30 66 Z" fill="${YV.bottom}" opacity="0.5"/>`;
const YV_FOOT =
  `<path d="M35 98 L33.6 110.8 C33.2 113.8 34.6 116 37.4 116 L49 116 C51.6 116 52.6 114 51.6 111.4 L50.4 100 Z" fill="url(#yl)" stroke="${YV.rim}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M37 108 Q41 112.5 49.5 111.5" fill="none" stroke="${YV.light}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`;
const YV_CREST = `<path d="M49.6 30 L50.2 17.8 Q50.5 15.2 52.6 16.5 L58.7 20.4 L62.9 12.9 Q64 11.2 65.1 12.9 L69.3 20.4 L75.4 16.5 Q77.5 15.2 77.8 17.8 L78.4 30 Z" fill="url(#yl)" stroke="${YV.rim}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>`;

/** An arm, turned `deg` degrees up from hanging (positive raises it). */
const yarm = (deg) => (deg ? `<g transform="rotate(${deg} 29 64)">${YV_ARM}</g>` : YV_ARM);

/**
 * The part of a circle (centre cx, cy, radius r) below the line through
 * (ax, ay) and (bx, by): an eye cut flat by its brow.
 */
function eyeUnder(cx, cy, r, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = Math.sqrt(b * b - 4 * a * c);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  const p1 = [ax + t1 * dx, ay + t1 * dy];
  const p2 = [ax + t2 * dx, ay + t2 * dy];
  // The centre is below the line when the eye keeps more than half the circle.
  const side = dx * (cy - ay) - dy * (cx - ax);
  const large = (side > 0) === dx > 0 ? 1 : 0;
  const sweep = dx > 0 ? 0 : 1;
  const f = (n) => n.toFixed(2);
  return `M${f(p1[0])} ${f(p1[1])} A${r} ${r} 0 ${large} ${sweep} ${f(p2[0])} ${f(p2[1])} Z`;
}

/** A slit pupil, `h` tall. */
const slit = (x, y, w, h) => `<path d="M${x} ${y - h} Q${x + w} ${y} ${x} ${y + h} Q${x - w} ${y} ${x} ${y - h} Z" fill="${YV.rim}"/>`;

/**
 * One red eye: cut by a brow from (ax, ay) to (bx, by), a darker crescent
 * below, a pupil and a glint. `id` keeps the clip paths apart in one file.
 */
function redEye(id, shape, { cx, cy, pupil, glint }) {
  return (
    `<clipPath id="${id}"><path d="${shape}"/></clipPath>` +
    `<path d="${shape}" fill="${YV.red}"/>` +
    `<g clip-path="url(#${id})"><circle cx="${cx}" cy="${cy + 9}" r="9.5" fill="${YV.deep}"/><circle cx="${cx}" cy="${cy + 6}" r="8.6" fill="${YV.red}"/></g>` +
    pupil +
    glint +
    `<path d="${shape}" fill="none" stroke="${YV.rim}" stroke-width="3" stroke-linejoin="round"/>`
  );
}

/** Both eyes from the left one's recipe, the right one mirrored. */
const bothEyes = (left) => left("l") + mirror(left("r"));

const YV_EYES = {
  // The classic: brows sloping down to the middle.
  evil: bothEyes((id) => {
    const [ax, ay, bx, by] = [39, 49.4, 59, 66];
    const shape = eyeUnder(YL, YY, 9.4, ax, ay, bx, by);
    return (
      redEye(`e${id}`, shape, { cx: YL, cy: YY, pupil: slit(50.4, 64.6, 1.8, 3.7), glint: `<circle cx="47.8" cy="59.8" r="1.7" fill="#fff"/>` }) +
      yline(`M${ax - 1.5} ${ay - 1.3} L${bx + 1.5} ${by + 1.3}`, 4.6)
    );
  }),
  evilBlink: bothEyes(() => yline("M37.9 48.3 L60.3 66.7", 4.6) + yline("M41.5 61 Q47 67.5 55.5 66", 3.4)),
  // Grinning so hard the eyes narrow to slivers.
  glee: bothEyes((id) => {
    const [ax, ay, bx, by] = [39.4, 51.6, 58.8, 63.4];
    const shape = `M41.2 52.7 L57.6 62.7 Q47 67.6 41.2 52.7 Z`;
    return (
      redEye(`g${id}`, shape, { cx: YL, cy: 58, pupil: slit(50.5, 60.8, 1.2, 2.2), glint: "" }) +
      yline(`M${ax - 1.5} ${ay - 0.9} L${bx + 1.5} ${by + 0.9}`, 4.6)
    );
  }),
  // Brows up at the middle.
  worried: bothEyes((id) => {
    const [ax, ay, bx, by] = [39.6, 57.4, 58.4, 50.6];
    const shape = eyeUnder(YL, YY + 0.5, 8.4, ax, ay, bx, by);
    return (
      redEye(`w${id}`, shape, { cx: YL, cy: YY, pupil: `<circle cx="49.6" cy="63.4" r="2.6" fill="${YV.rim}"/>`, glint: `<circle cx="48.2" cy="60" r="1.4" fill="#fff"/>` }) +
      yline(`M${ax - 1.5} ${ay + 0.6} L${bx + 1.5} ${by - 0.6}`, 4.6)
    );
  }),
  // Round and startled, brows flown up.
  wide: bothEyes((id) => {
    const shape = `M${YL - 9} ${YY} A9 9 0 1 0 ${YL + 9} ${YY} A9 9 0 1 0 ${YL - 9} ${YY} Z`;
    return (
      redEye(`o${id}`, shape, { cx: YL, cy: YY, pupil: `<circle cx="${YL}" cy="${YY + 1}" r="2.6" fill="${YV.rim}"/>`, glint: `<circle cx="${YL - 2.2}" cy="${YY - 3.2}" r="1.7" fill="#fff"/>` }) +
      yline(`M${YL - 8} ${YY - 14.5} Q${YL} ${YY - 18.5} ${YL + 8} ${YY - 14.5}`, 4)
    );
  }),
};

const YV_MOUTH_EDGE = "M39.3 70.6 Q63.8 82 88.3 70.6 C86.2 83.6 76.4 90.2 63.8 90.2 C51.2 90.2 41.4 83.6 39.3 70.6 Z";
const teeth = (id, edge, xs, y0, y1, shade) =>
  `<clipPath id="${id}"><path d="${edge}"/></clipPath>` +
  `<path d="${edge}" fill="#fff"/>` +
  `<g clip-path="url(#${id})">${shade}<path d="${xs.map((x) => `M${x} ${y0} L${x} ${y1}`).join(" ")}" stroke="${YV.rim}" stroke-width="2.4"/></g>` +
  `<path d="${edge}" fill="none" stroke="${YV.rim}" stroke-width="3.6" stroke-linejoin="round"/>`;

const YV_MOUTHS = {
  grin: teeth("m", YV_MOUTH_EDGE, [47.5, 55.6, 63.8, 72, 80.1], 68, 94, `<path d="M38 69 Q63.8 81 89.6 69 L89.6 74 Q63.8 86 38 74 Z" fill="#e4e1ec"/>`),
  // Wider still: celebrating.
  wide: teeth(
    "m",
    "M37.6 69.4 Q63.8 80.4 90 69.4 C88.6 86.4 78 94 63.8 94 C49.6 94 39 86.4 37.6 69.4 Z",
    [46.2, 54.8, 63.8, 72.8, 81.4],
    66,
    97,
    `<path d="M36 68 Q63.8 79.4 91.6 68 L91.6 73 Q63.8 84.4 36 73 Z" fill="#e4e1ec"/>`,
  ),
  // Teeth clenched, corners down a little.
  grimace: teeth(
    "m",
    "M42 76.6 Q63.8 72.4 85.6 76.6 L84.6 86 Q63.8 83.2 43 86 Z",
    [49.4, 56.6, 63.8, 71, 78.2],
    70,
    90,
    `<path d="M40 75 Q63.8 70.6 87.6 75 L87.6 79 Q63.8 74.8 40 79 Z" fill="#e4e1ec"/>`,
  ),
  // Teeth bared upside down.
  frown: teeth("m", "M44 86 Q63.8 72 83.6 86 Q63.8 80.8 44 86 Z", [53.4, 63.8, 74.2], 70, 90, ""),
  o:
    `<path d="M55.4 80 C55.4 72.6 72.2 72.6 72.2 80 C72.2 88.6 55.4 88.6 55.4 80 Z" fill="${YV.rim}"/>` +
    `<path d="M58.4 85.2 Q63.8 80.4 69.2 85.2 Q63.8 88 58.4 85.2 Z" fill="#f472b6"/>` +
    `<path d="M57.6 75.4 L59.6 79.6 L61.4 75 Z M70 75.4 L68 79.6 L66.2 75 Z" fill="#fff"/>`,
  smallO: `<ellipse cx="63.8" cy="81" rx="4.2" ry="5" fill="${YV.rim}"/>`,
  smirk: yline("M48 78.4 Q64 86 80.6 75") + yline("M78.4 73.8 L82.4 76.4", 3),
  flat: yline("M51 81 L76.6 81"),
  wavy: yline("M48 82 Q52 78 56 82 T64 82 T72 82 T80 82", 3.6),
};

/** A stop sign at (cx, cy), for the costumes to hold up. */
function stopSign(cx, cy, r = 14.5) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return (
    `<polygon points="${pts.join(" ")}" fill="#ef4444" stroke="#fff" stroke-width="2.5"/>` +
    `<text x="${cx}" y="${cy + 3}" font-family="Arial, sans-serif" font-size="7.8" font-weight="700" fill="#fff" text-anchor="middle">STOP</text>`
  );
}

/** A frame of Gengar: limbs, body, face; `eyes` drawn here only if it has no layer. */
function yovich({ eyes = null, mouth, arms = [0, 0], extras = [], stop = false, pale = false }) {
  const p = { bottom: YV.limb };
  const extra = extras.map((e) => EXTRAS[e](p)).join("");
  const [top, bottom] = pale ? ["#a68cc9", "#6e5a92"] : [YV.top, YV.bottom];
  const sign = stop ? stopSign(110, 52) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="yb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="yl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${YV.light}"/><stop offset="1" stop-color="${YV.limb}"/></linearGradient></defs>
${YV_EAR}${mirror(YV_EAR)}${YV_CREST}
${yarm(arms[0])}${mirror(yarm(arms[1]))}
${YV_FOOT}${mirror(YV_FOOT)}
<rect x="28" y="24" width="72" height="82" rx="18" fill="url(#yb)" stroke="${YV.rim}" stroke-width="5" paint-order="stroke"/>
<path d="M33 90 Q34.5 101 47 101.5 L81 101.5 Q93.5 101 95 90" fill="none" stroke="${YV.bottom}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
${eyes ? yink(EYES[eyes]) : ""}${YV_MOUTHS[mouth]}
${extra}${sign}
</svg>
`;
}

const YV_FRAMES = {
  "idle.svg": { mouth: "grin" },
  "happy.svg": { mouth: "wide" },
  "celebrate-1.svg": { mouth: "wide", arms: [70, 70] },
  "celebrate-2.svg": { mouth: "wide", arms: [105, 105] },
  "worried.svg": { mouth: "grimace", extras: ["sweat"] },
  "shocked.svg": { mouth: "o" },
  "sleepy.svg": { eyes: "closed", mouth: "smirk" },
  "tired.svg": { eyes: "half", mouth: "flat", extras: ["sweat"] },
  "stop.svg": { mouth: "grimace", arms: [0, 95], stop: true },
  "confused.svg": { mouth: "wavy" },
  "wave-1.svg": { mouth: "wide", arms: [0, 95] },
  "wave-2.svg": { mouth: "wide", arms: [0, 130] },
  "proud.svg": { eyes: "smug", mouth: "smirk" },
  "sad.svg": { mouth: "frown", extras: ["tear"] },
  "bored.svg": { eyes: "half", mouth: "flat" },
  "focused.svg": { mouth: "flat" },
  "curious.svg": { mouth: "smallO" },
  "angry.svg": { mouth: "grimace", extras: ["flush"] },
  "relieved.svg": { eyes: "closed", mouth: "smirk", extras: ["sweat", "puff"] },
  "dizzy.svg": { eyes: "spiral", mouth: "wavy" },
  "cool.svg": { mouth: "smirk" },
  "sick.svg": { eyes: "closed", mouth: "wavy", extras: ["sweat"], pale: true },
};

// Each mood: Gengar's frames and eyes; motion, frame rate and effect come from Candy's.
const YD = "costumes/gengar/";
const yeyes = (name, blink) => ({ eyes: `${YD}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${YD}eyes-${blink}.svg` } : {}) });
const YV_LOOK = {
  idle: { frames: ["idle.svg"], ...yeyes("evil", "evil-blink") },
  happy: { frames: ["happy.svg"], ...yeyes("glee") },
  celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"], eyes: "eyes/stars.svg" },
  worried: { frames: ["worried.svg"], ...yeyes("worried") },
  shocked: { frames: ["shocked.svg"], ...yeyes("wide") },
  sleepy: { frames: ["sleepy.svg"] },
  alert: { frames: ["shocked.svg"], ...yeyes("wide") },
  tired: { frames: ["tired.svg"] },
  stop: { frames: ["stop.svg"], ...yeyes("evil", "evil-blink") },
  confused: { frames: ["confused.svg"], eyes: "eyes/dots.svg" },
  love: { frames: ["idle.svg"], eyes: "eyes/hearts.svg" },
  wave: { frames: ["wave-1.svg", "wave-2.svg"], ...yeyes("glee") },
  proud: { frames: ["proud.svg"] },
  sad: { frames: ["sad.svg"], ...yeyes("worried") },
  bored: { frames: ["bored.svg"] },
  focused: { frames: ["focused.svg"], ...yeyes("evil", "evil-blink") },
  nervous: { frames: ["worried.svg"], ...yeyes("wide") },
  curious: { frames: ["curious.svg"], ...yeyes("wide") },
  angry: { frames: ["angry.svg"], ...yeyes("evil") },
  excited: { frames: ["happy.svg"], ...yeyes("evil") },
  relieved: { frames: ["relieved.svg"] },
  dizzy: { frames: ["dizzy.svg"] },
  cool: { frames: ["cool.svg"], ...yeyes("evil", "evil-blink") },
  sick: { frames: ["sick.svg"] },
};
const YV_EYE_FILES = {
  "eyes-evil.svg": YV_EYES.evil,
  "eyes-evil-blink.svg": YV_EYES.evilBlink,
  "eyes-glee.svg": YV_EYES.glee,
  "eyes-worried.svg": YV_EYES.worried,
  "eyes-wide.svg": YV_EYES.wide,
};

// Spiderman: Candy in a web-slinger's suit. Red with a curved web, blue side
// panels, a black spider on the front and big white lenses that change shape
// with the mood: the mask's whole face. Arms shoot webs when it celebrates.
const SP = {
  red: "#ef3b3b",
  redDeep: "#b4161b",
  blue: "#3b6fe0",
  blueDeep: "#1d3a9e",
  ink: "#0b0b0f",
  web: "#3a0709",
  crease: "#6d0d10",
};
const SL = 47.5; // left lens centre x as drawn (see leftLens; the right one is mirrored)
const SY = 62; // lens centre y as drawn

const sline = (d, w = 4.2, color = SP.ink) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A web: spokes from (cx, cy) and rings that sag toward the middle between them. */
function spiderWeb(cx, cy) {
  const N = 16;
  const rings = [8, 15.5, 23.5, 32.5, 42.5, 53.5, 66];
  const at = (a, r) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const ang = (i) => (i * 2 * Math.PI) / N;
  let d = "";
  for (let i = 0; i < N; i++) d += `M${cx} ${cy} L${at(ang(i), 80)} `;
  for (const r of rings) {
    for (let i = 0; i < N; i++) d += `M${at(ang(i), r)} Q${at((ang(i) + ang(i + 1)) / 2, r * 0.8)} ${at(ang(i + 1), r)} `;
  }
  return d;
}

/** The left lens in each shape; the right one is its mirror image. */
const LENS = {
  open: "M41.5 51.5 H53.5 Q58 51.5 58 56 V68 Q58 72.5 53.5 72.5 H41.5 Q37 72.5 37 68 V56 Q37 51.5 41.5 51.5 Z",
  // Squinting up with a grin: a dome with its bottom pushed up.
  glee: "M37 64.5 C37 49.5 58 49.5 58 64.5 Q47.5 57.5 37 64.5 Z",
  // The top slants down to the middle.
  angry: "M41.5 55 L54 60 Q58 61.6 58 65.5 V68 Q58 72.5 53.5 72.5 H41.5 Q37 72.5 37 68 V58.8 Q37 54.4 41.5 55 Z",
  // The top slants down to the outside.
  worried: "M41.5 60 L53.5 54.6 Q58 53.2 58 57.6 V68 Q58 72.5 53.5 72.5 H41.5 Q37 72.5 37 68 V64.2 Q37 61.6 41.5 60 Z",
  wide: `M${SL - 11.6} ${SY} A11.6 12.6 0 1 0 ${SL + 11.6} ${SY} A11.6 12.6 0 1 0 ${SL - 11.6} ${SY} Z`,
  // Lids down to a steady look.
  narrow: "M37 58.5 H58 V68 Q58 72.5 53.5 72.5 H41.5 Q37 72.5 37 68 Z",
  half: "M37 64 H58 V68 Q58 72.5 53.5 72.5 H41.5 Q37 72.5 37 68 Z",
  smug: "M37 61.5 L58 64.5 V68 Q58 72.5 53.5 72.5 H41.5 Q37 72.5 37 68 Z",
  heart: `M${SL} 72.5 C${SL - 14} 63 ${SL - 10} 50.5 ${SL} 57 C${SL + 10} 50.5 ${SL + 14} 63 ${SL} 72.5 Z`,
};
/** A lens: white with a soft shade, in a thick black rim; `id` keeps gradients apart. */
const lensArt = (d, id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e1ec"/></linearGradient>` +
  `<path d="${d}" fill="url(#${id})" stroke="${SP.ink}" stroke-width="4.2" stroke-linejoin="round"/>`;
/**
 * The lenses are drawn around (47.5, 62) and worn a little bigger and lower,
 * as on the suit: both eyes from the left one's art.
 */
const leftLens = (art) => `<g transform="translate(46.75 63) scale(1.08) translate(-47.5 -62)">${art}</g>`;
const pair = (make) => leftLens(make("ll")) + mirror(leftLens(make("lr")));
const lenses = (shape) => pair((id) => lensArt(LENS[shape], id));

function starLens(cx, cy, r, id) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return lensArt(`M${pts.join(" L")} Z`, id);
}

const SP_LENSES = {
  open: lenses("open"),
  blink: pair(() => sline("M38.5 63.5 Q47.5 66.5 56.5 63.5")),
  glee: lenses("glee"),
  angry: lenses("angry"),
  worried: lenses("worried"),
  wide: lenses("wide"),
  narrow: lenses("narrow"),
  half: lenses("half"),
  smug: lenses("smug"),
  closed: pair(() => sline("M38.5 62 Q47.5 69.5 56.5 62")),
  hearts: lenses("heart"),
  stars: pair((id) => starLens(SL, SY, 12.5, id)),
  spiral: pair(
    (id) => lensArt(LENS.open, id) + sline(`M${SL} ${SY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7 7 0 1 1 -14 0`, 2),
  ),
  // One lens wide, the other squinting: "huh?"
  confused: leftLens(lensArt(LENS.wide, "ll")) + mirror(leftLens(lensArt(LENS.narrow, "lr"))),
};

/** Folds in the mask where the mouth is: the fabric shows the expression. */
const SP_MOUTHS = {
  none: "",
  smile: sline("M54 80 Q64 87 74 80", 2.6, SP.crease),
  smirk: sline("M55 82.5 Q66 85.5 74.5 78.5", 2.6, SP.crease),
  frown: sline("M54.5 85 Q64 78.5 73.5 85", 2.6, SP.crease),
  flat: sline("M57 82.5 L71 82.5", 2.6, SP.crease),
  wavy: sline("M52 82.5 Q56 79.5 60 82.5 T68 82.5 T76 82.5", 2.4, SP.crease),
  o: `<ellipse cx="64" cy="82.5" rx="4.6" ry="5.4" fill="${SP.crease}" opacity="0.75"/>`,
  smallO: `<ellipse cx="64" cy="82" rx="3" ry="3.6" fill="${SP.crease}" opacity="0.75"/>`,
};

/** A black spider on the front. */
const spiderMark = (() => {
  const legs = [
    "M62.4 93.6 L57.6 90.2 L55.6 85.4",
    "M62.2 95 L56.6 93.6 L53.6 90.6",
    "M62.2 96.6 L56.4 98.6 L54.2 102.4",
    "M62.4 97.8 L58.4 101.6 L57.6 105.2",
  ].join(" ");
  return (
    `<path d="${legs}" fill="none" stroke="${SP.ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
    mirror(`<path d="${legs}" fill="none" stroke="${SP.ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`) +
    `<ellipse cx="64" cy="96.6" rx="2.5" ry="4.2" fill="${SP.ink}"/><circle cx="64" cy="91.4" r="1.9" fill="${SP.ink}"/>`
  );
})();

/** Where a hand at (x, y) ends up when its arm turns `deg` about the shoulder (31, 70). */
function turned(x, y, deg) {
  const a = (deg * Math.PI) / 180;
  const dx = x - 31;
  const dy = y - 70;
  return [31 + dx * Math.cos(a) - dy * Math.sin(a), 70 + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** An arm hanging from the side, turned `deg` up: red, with a webbed red hand. */
function spArm(deg) {
  const art =
    `<path d="M31 70 L19.5 91" stroke="${SP.ink}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M31 70 L19.5 91" stroke="${SP.red}" stroke-width="6.4" stroke-linecap="round"/>` +
    `<path d="M29.6 72.4 L22.6 85.2" stroke="${SP.blue}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="18.6" cy="93.2" r="5.6" fill="${SP.red}" stroke="${SP.ink}" stroke-width="2.4"/>` +
    `<path d="M18.6 88.2 L18.6 98.2 M13.8 93.2 L23.4 93.2 M15.2 89.8 L22 96.6 M22 89.8 L15.2 96.6" stroke="${SP.web}" stroke-width="0.8"/>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}

/** A blue leg in a red boot with a web on it. */
const SP_BOOT =
  `<path d="M42 100 L42 108" stroke="${SP.ink}" stroke-width="8" stroke-linecap="round"/>` +
  `<path d="M42 100 L42 108" stroke="${SP.blue}" stroke-width="4.4" stroke-linecap="round"/>` +
  `<rect x="31.5" y="114.6" width="24" height="4.6" rx="2.3" fill="${SP.ink}"/>` +
  `<path d="M32.4 115.4 Q32 107.6 42.4 106.8 Q52.6 106.6 55 112.2 L55.4 115.4 Z" fill="${SP.red}" stroke="${SP.ink}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<path d="M42.6 107.2 L42.4 115 M42.5 111 Q37 110.4 33.4 113 M42.5 111 Q48.6 109.4 54 112.4" fill="none" stroke="${SP.web}" stroke-width="0.9"/>`;
/** Web lines shot from both hands, with a little splat where they stick. */
const webShot = (hx, hy, tx, ty) =>
  `<path d="M${hx} ${hy} L${tx} ${ty}" stroke="#f1f5f9" stroke-width="1.8" stroke-linecap="round"/>` +
  `<path d="M${tx - 3} ${ty} L${tx + 3} ${ty} M${tx} ${ty - 3} L${tx} ${ty + 3} M${tx - 2.2} ${ty - 2.2} L${tx + 2.2} ${ty + 2.2} M${tx + 2.2} ${ty - 2.2} L${tx - 2.2} ${ty + 2.2}" stroke="#f1f5f9" stroke-width="1.2" stroke-linecap="round"/>`;
/** Webs from both hands, for arms turned `deg` up. */
function spWebs(deg) {
  const [hx, hy] = turned(18.6, 93.2, deg).map((n) => +n.toFixed(1));
  const tx = Math.max(4, hx - 8);
  return webShot(hx, hy, tx, 6) + webShot(128 - hx, hy, 128 - tx, 6);
}

const SP_EXTRAS = {
  ...EXTRAS,
  // Under the lens, not in it.
  tear: () =>
    `<path d="M44 75.5 C41 81.5 41 84.5 44 85.5 C47 84.5 47 81.5 44 75.5 Z" fill="#7dd3fc" stroke="${SP.ink}" stroke-width="1.5"/>`,
};

/** A frame of Spiderman; `lens` drawn here only when the eyes have no layer. */
function spidermax({ lens = null, mouth = "none", arms = [0, 0], webs = false, extras = [], stop = false, pale = false }) {
  const p = { bottom: SP.red };
  const behind =
    spArm(arms[0]) + mirror(spArm(arms[1])) + SP_BOOT + mirror(SP_BOOT) + (webs ? spWebs(arms[0]) : "") + extras.map((e) => SP_EXTRAS[e](p)).join("");
  const sign = stop ? stopSign(110, 52) : "";
  const [top, bottom] = pale ? ["#d98989", "#a24b4f"] : [SP.red, SP.redDeep];
  const body = `<rect x="28" y="24" width="72" height="82" rx="22"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="sr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SP.blue}"/><stop offset="1" stop-color="${SP.blueDeep}"/></linearGradient><linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${SP.redDeep}"/><stop offset="0.45" stop-color="${top}"/><stop offset="1" stop-color="${SP.redDeep}"/></linearGradient><clipPath id="sc">${body}</clipPath></defs>
<rect x="59" y="5" width="10" height="30" rx="5" fill="url(#sw)" stroke="${SP.ink}" stroke-width="5" paint-order="stroke"/>
${behind}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#sr)"/>
<g clip-path="url(#sc)">
<path d="${spiderWeb(64, SY)}" fill="none" stroke="${SP.web}" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>
<path d="M20 79 Q41 84 50.5 112 L20 112 Z" fill="url(#sb)" stroke="${SP.ink}" stroke-width="1.8"/>
<path d="M108 79 Q87 84 77.5 112 L108 112 Z" fill="url(#sb)" stroke="${SP.ink}" stroke-width="1.8"/>
<ellipse cx="44" cy="35" rx="13" ry="7" fill="#ffffff" opacity="0.13" transform="rotate(-24 44 35)"/>
</g>
<rect x="28" y="24" width="72" height="82" rx="22" fill="none" stroke="${SP.ink}" stroke-width="5"/>
${spiderMark}
${lens ? SP_LENSES[lens] : ""}${SP_MOUTHS[mouth]}
${sign}
</svg>
`;
}

const SP_FRAMES = {
  "idle.svg": {},
  "happy.svg": { mouth: "smile" },
  "celebrate-1.svg": { lens: "stars", mouth: "smile", arms: [70, 70], webs: true },
  "celebrate-2.svg": { lens: "stars", mouth: "smile", arms: [105, 105], webs: true },
  "worried.svg": { mouth: "wavy", extras: ["sweat"] },
  "shocked.svg": { mouth: "o" },
  "sleepy.svg": { lens: "closed" },
  "tired.svg": { lens: "half", mouth: "flat", extras: ["sweat"] },
  "stop.svg": { mouth: "flat", arms: [0, 95], stop: true },
  "confused.svg": { lens: "confused", mouth: "wavy" },
  "love.svg": { lens: "hearts", mouth: "smile" },
  "wave-1.svg": { mouth: "smile", arms: [0, 95] },
  "wave-2.svg": { mouth: "smile", arms: [0, 130] },
  "proud.svg": { lens: "smug", mouth: "smirk" },
  "sad.svg": { mouth: "frown", extras: ["tear"] },
  "bored.svg": { lens: "half", mouth: "flat" },
  "curious.svg": { mouth: "smallO" },
  "angry.svg": { mouth: "frown", extras: ["flush"] },
  "relieved.svg": { lens: "closed", mouth: "smile", extras: ["sweat", "puff"] },
  "dizzy.svg": { lens: "spiral", mouth: "wavy" },
  "cool.svg": { lens: "smug", mouth: "smirk" },
  "sick.svg": { lens: "closed", mouth: "wavy", extras: ["sweat"], pale: true },
};
const SD = "costumes/spiderman/";
const seyes = (name, blink) => ({ eyes: `${SD}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${SD}eyes-${blink}.svg` } : {}) });
const SP_LOOK = {
  idle: { frames: ["idle.svg"], ...seyes("open", "blink") },
  happy: { frames: ["happy.svg"], ...seyes("glee") },
  celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"] },
  worried: { frames: ["worried.svg"], ...seyes("worried") },
  shocked: { frames: ["shocked.svg"], ...seyes("wide") },
  sleepy: { frames: ["sleepy.svg"] },
  alert: { frames: ["shocked.svg"], ...seyes("wide") },
  tired: { frames: ["tired.svg"] },
  stop: { frames: ["stop.svg"], ...seyes("angry") },
  confused: { frames: ["confused.svg"] },
  love: { frames: ["love.svg"] },
  wave: { frames: ["wave-1.svg", "wave-2.svg"], ...seyes("glee") },
  proud: { frames: ["proud.svg"] },
  sad: { frames: ["sad.svg"], ...seyes("worried") },
  bored: { frames: ["bored.svg"] },
  focused: { frames: ["idle.svg"], ...seyes("narrow", "blink") },
  nervous: { frames: ["worried.svg"], ...seyes("wide") },
  curious: { frames: ["curious.svg"], ...seyes("wide") },
  angry: { frames: ["angry.svg"], ...seyes("angry") },
  excited: { frames: ["happy.svg"], ...seyes("wide") },
  relieved: { frames: ["relieved.svg"] },
  dizzy: { frames: ["dizzy.svg"] },
  cool: { frames: ["cool.svg"] },
  sick: { frames: ["sick.svg"] },
};
const SP_EYE_FILES = Object.fromEntries(
  ["open", "blink", "glee", "angry", "worried", "wide", "narrow"].map((n) => [`eyes-${n}.svg`, SP_LENSES[n]]),
);

// Shadow: a dark hedgehog. Charcoal (not black, so it shows on the black
// island) with red-striped quills, a red streak down the forehead, gold-lined
// ears, a tan muzzle, red eyes under a scowl, white chest fur, gloves with gold
// rings and red jet shoes.
const SH = {
  top: "#4a4a58",
  bottom: "#1c1c23",
  red: "#d42330",
  redLight: "#ef4651",
  gold: "#f2b233",
  tan: "#f4c99a",
  tanDeep: "#dca46e",
  ink: "#050507",
};
const SHL = 52.5; // left eye centre x (the right one is mirrored: 75.5)
const SHY = 60; // eye y
const shline = (d, w = 3, color = SH.ink) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Candy's own eye art, in Shadow's ink. */
const shink = (s) => s.replaceAll(INK, SH.ink);

/** A quill from a base (two points) to a tip, with a red streak along its middle. */
function quill([ax, ay], [bx, by], [tx, ty]) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const at = (k, px, py) => `${(px + (tx - px) * k).toFixed(2)} ${(py + (ty - py) * k).toFixed(2)}`;
  // The streak: a thin sliver from the base's middle most of the way up.
  const sa = [mx + (ax - mx) * 0.32, my + (ay - my) * 0.32];
  const sb = [mx + (bx - mx) * 0.32, my + (by - my) * 0.32];
  return (
    `<path d="M${ax} ${ay} Q${at(0.55, ax, ay)} ${tx} ${ty} Q${at(0.55, bx, by)} ${bx} ${by} Z" fill="url(#hq)" stroke="${SH.ink}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M${sa[0].toFixed(2)} ${sa[1].toFixed(2)} L${at(0.78, mx, my)} L${sb[0].toFixed(2)} ${sb[1].toFixed(2)} Z" fill="${SH.red}"/>`
  );
}
const SH_QUILLS_LEFT =
  quill([32, 40], [52, 27], [12, 3]) + // up and out
  quill([30, 38], [30, 60], [1, 27]) + // out, sweeping up
  quill([30, 56], [31, 74], [6, 52]); // lower, sweeping up
const SH_QUILLS = quill([50, 30], [78, 30], [64, 0]) + SH_QUILLS_LEFT + mirror(SH_QUILLS_LEFT);
const SH_EAR =
  `<path d="M31 37 L34.4 9.6 Q35.2 6.8 37.6 8.6 L57 27 Z" fill="url(#hq)" stroke="${SH.ink}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M36.6 31 L38.4 15.4 L51 27 Q43 25.6 36.6 31 Z" fill="${SH.gold}" stroke="${SH.ink}" stroke-width="1.4" stroke-linejoin="round"/>`;

/** An arm hanging from the side, turned `deg` up; a white glove with a gold ring. */
function shArm(deg) {
  const art =
    `<path d="M31 70 L19.5 91" stroke="${SH.ink}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M31 70 L19.5 91" stroke="${SH.top}" stroke-width="6.4" stroke-linecap="round"/>` +
    `<ellipse cx="21.8" cy="86.8" rx="5.2" ry="2.6" fill="${SH.gold}" stroke="${SH.ink}" stroke-width="1.4" transform="rotate(28.7 21.8 86.8)"/>` +
    `<circle cx="18.4" cy="93.2" r="5.8" fill="#f8fafc" stroke="${SH.ink}" stroke-width="2.4"/>` +
    `<path d="M15.6 92 Q18.4 90.6 21.2 92" fill="none" stroke="#cbd5e1" stroke-width="1.2" stroke-linecap="round"/>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}

/** A jet shoe: red with a white band, black sole, a gold ring at the ankle. */
const SH_SHOE =
  `<path d="M42 100 L42 108" stroke="${SH.ink}" stroke-width="7" stroke-linecap="round"/>` +
  `<path d="M42 100 L42 108" stroke="${SH.bottom}" stroke-width="3.4" stroke-linecap="round"/>` +
  `<rect x="31.5" y="114.6" width="24" height="4.6" rx="2.3" fill="${SH.ink}"/>` +
  `<path d="M32.4 115.4 Q32 107.6 42.4 106.8 Q52.6 106.6 55 112.2 L55.4 115.4 Z" fill="${SH.red}" stroke="${SH.ink}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<path d="M36 110.6 Q44.6 107.8 53.6 111 L54.6 113.4 Q44.6 110.6 34.8 113.6 Z" fill="#f8fafc"/>` +
  `<ellipse cx="42" cy="106.2" rx="5.6" ry="1.9" fill="${SH.gold}" stroke="${SH.ink}" stroke-width="1.2"/>`;

/** Shadow's eye: white under a brow from (ax, ay) to (bx, by), a red iris, a pupil. */
function shEye(id, { ax, ay, bx, by, iris = [54.2, 61.6], ir = 4.6, rx = 8.2, ry = 10.6 }) {
  const y = (x) => ay + ((by - ay) * (x - ax)) / (bx - ax);
  const cut = ax == null ? "M30 30 H70 V90 H30 Z" : `M30 ${y(30).toFixed(2)} L70 ${y(70).toFixed(2)} L70 90 L30 90 Z`;
  const shape = `<ellipse cx="${SHL}" cy="${SHY}" rx="${rx}" ry="${ry}" transform="rotate(10 ${SHL} ${SHY})"/>`;
  return (
    `<clipPath id="${id}"><path d="${cut}"/></clipPath>` +
    `<g clip-path="url(#${id})">` +
    shape.replace("/>", ` fill="#ffffff" stroke="${SH.ink}" stroke-width="2.6"/>`) +
    `<circle cx="${iris[0]}" cy="${iris[1]}" r="${ir}" fill="${SH.red}"/><circle cx="${iris[0]}" cy="${iris[1]}" r="${(ir * 0.5).toFixed(2)}" fill="${SH.ink}"/>` +
    `<circle cx="${iris[0] - ir * 0.35}" cy="${iris[1] - ir * 0.4}" r="1.3" fill="#fff"/>` +
    `</g>` +
    (ax == null ? "" : shline(`M${ax - 1} ${y(ax - 1).toFixed(2)} L${bx + 1} ${y(bx + 1).toFixed(2)}`, 4.2))
  );
}
const shEyes = (o) => shEye("hl", o) + mirror(shEye("hr", o));

const SH_EYES = {
  // The usual scowl.
  stern: shEyes({ ax: 42, ay: 49.6, bx: 63, by: 57 }),
  blink: mirror(shline("M42.4 49.4 L63.4 57", 4.2) + shline("M44.6 61 Q52.4 65.6 61 62", 3)) + shline("M42.4 49.4 L63.4 57", 4.2) + shline("M44.6 61 Q52.4 65.6 61 62", 3),
  // Lids down, pleased with itself.
  smug: shEyes({ ax: 42, ay: 57, bx: 63, by: 59.6, iris: [54.4, 64.2], ir: 4.2 }),
  worried: shEyes({ ax: 42, ay: 55.6, bx: 63, by: 49.6 }),
  wide: shEyes({ ax: null, iris: [SHL + 0.6, SHY + 0.6], ir: 3.4, rx: 8.8, ry: 11.2 }) + shline("M44 45 Q51.6 41.6 59 44.4") + mirror(shline("M44 45 Q51.6 41.6 59 44.4")),
};

const SH_MOUTHS = {
  frown: shline("M58.6 81.4 Q64 78.2 69.4 81.4", 2.8),
  smirk: shline("M57.6 80.4 Q65 83.6 71 78.2", 2.8) + `<path d="M66.2 81.6 L67.4 84.6 L68.8 81.2 Z" fill="#fff" stroke="${SH.ink}" stroke-width="0.8" stroke-linejoin="round"/>`,
  grin:
    `<path d="M55.6 78 Q64 90 72.4 78 Q64 81 55.6 78 Z" fill="#3a0b10" stroke="${SH.ink}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M60 84.4 Q64 81.8 68 84.4 Q64 87 60 84.4 Z" fill="#f472b6"/>` +
    `<path d="M58.6 79.4 L60 82.6 L61.4 79.8 Z M66.6 79.8 L68 82.6 L69.4 79.4 Z" fill="#fff"/>`,
  grit:
    `<rect x="57" y="78.4" width="14" height="6.6" rx="2.4" fill="#fff" stroke="${SH.ink}" stroke-width="2"/>` +
    `<path d="M60.5 78.4 L60.5 85 M64 78.4 L64 85 M67.5 78.4 L67.5 85 M57 81.7 L71 81.7" stroke="${SH.ink}" stroke-width="1.1"/>`,
  sad: shline("M57.6 83 Q64 77.6 70.4 83", 2.8),
  flat: shline("M59 81 L69 81", 2.8),
  wavy: shline("M56 81.4 Q59 79 62 81.4 T68 81.4 T74 81.4", 2.4),
  o: `<ellipse cx="64" cy="81.6" rx="3.8" ry="4.6" fill="#3a0b10" stroke="${SH.ink}" stroke-width="2"/>`,
  smallO: `<ellipse cx="64" cy="81.2" rx="2.4" ry="2.9" fill="#3a0b10" stroke="${SH.ink}" stroke-width="1.6"/>`,
};

const SH_EXTRAS = {
  ...EXTRAS,
  tear: () =>
    `<path d="M47 71 C44 77 44 80 47 81 C50 80 50 77 47 71 Z" fill="#7dd3fc" stroke="${SH.ink}" stroke-width="1.5"/>`,
};

/** A frame of Shadow; `eyes` drawn here only when they have no layer. */
function shadow({ eyes = null, mouth = "frown", arms = [0, 0], extras = [], stop = false, pale = false }) {
  const p = { bottom: SH.bottom };
  const extra = extras.map((e) => SH_EXTRAS[e](p)).join("");
  const [top, bottom] = pale ? ["#6f7480", "#3a3e48"] : [SH.top, SH.bottom];
  const sign = stop ? stopSign(110, 52) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="hq" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><clipPath id="hc"><rect x="28" y="24" width="72" height="82" rx="22"/></clipPath></defs>
${SH_QUILLS}
${SH_EAR}${mirror(SH_EAR)}
${shArm(arms[0])}${mirror(shArm(arms[1]))}
${SH_SHOE}${mirror(SH_SHOE)}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#hb)" stroke="${SH.ink}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#hc)">
<path d="M58.6 18 L69.4 18 L64 47 Z" fill="${SH.red}"/><path d="M62 18 L64.6 18 L64 40 Z" fill="${SH.redLight}"/>
<ellipse cx="45" cy="33" rx="12" ry="5.5" fill="#ffffff" opacity="0.1" transform="rotate(-22 45 33)"/>
<path d="M49 108 C49.6 102.6 52.4 99.6 56.4 98.6 C55 101.4 55.6 103.4 57.6 104.2 C57.4 98 60.4 93.6 64.6 91.4 C62.8 96 63.6 99.8 66.2 101.6 C66.8 97.6 69.6 95.2 73.4 95 C71.4 98 71.2 101 72.4 103.4 C74.2 101.6 76.6 100.8 79.2 101.4 C77.8 103.2 78.2 105.6 79.4 108 Z" fill="#f8fafc" stroke="${SH.ink}" stroke-width="1.8" stroke-linejoin="round"/>
</g>
<path d="M38.4 74.6 Q38.6 69.4 45.6 70.6 Q55.4 72.4 60.4 66.2 Q64 61.4 67.6 66.2 Q72.6 72.4 82.4 70.6 Q89.4 69.4 89.6 74.6 Q89.4 88.8 64 89.6 Q38.6 88.8 38.4 74.6 Z" fill="${SH.tan}" stroke="${SH.ink}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M44 84 Q64 92 84 84" fill="none" stroke="${SH.tanDeep}" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
<ellipse cx="64" cy="72.6" rx="2.8" ry="2.1" fill="${SH.ink}"/><circle cx="63.2" cy="72" r="0.7" fill="#fff" opacity="0.8"/>
${eyes ? shink(EYES[eyes]) : ""}${SH_MOUTHS[mouth]}
${extra}${sign}
</svg>
`;
}

const SHF = {
  "idle.svg": {},
  "happy.svg": { mouth: "smirk" },
  "celebrate-1.svg": { eyes: "stars", mouth: "grin", arms: [70, 70] },
  "celebrate-2.svg": { eyes: "stars", mouth: "grin", arms: [105, 105] },
  "worried.svg": { mouth: "wavy", extras: ["sweat"] },
  "shocked.svg": { mouth: "o" },
  "sleepy.svg": { eyes: "closed", mouth: "smallO" },
  "tired.svg": { eyes: "half", mouth: "flat", extras: ["sweat"] },
  "stop.svg": { mouth: "flat", arms: [0, 100], stop: true },
  "confused.svg": { eyes: "dots", mouth: "wavy" },
  "love.svg": { eyes: "hearts", mouth: "smirk" },
  "wave-1.svg": { mouth: "smirk", arms: [0, 95] },
  "wave-2.svg": { mouth: "smirk", arms: [0, 130] },
  "sad.svg": { mouth: "sad", extras: ["tear"] },
  "bored.svg": { eyes: "half", mouth: "flat" },
  "focused.svg": { mouth: "flat" },
  "curious.svg": { mouth: "smallO" },
  "angry.svg": { mouth: "grit", extras: ["flush"] },
  "excited.svg": { mouth: "grin" },
  "relieved.svg": { eyes: "closed", mouth: "smirk", extras: ["sweat", "puff"] },
  "dizzy.svg": { eyes: "spiral", mouth: "wavy" },
  "sick.svg": { eyes: "closed", mouth: "wavy", extras: ["sweat"], pale: true },
};
const HD = "costumes/shadow/";
const sheyes = (name, blink) => ({ eyes: `${HD}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${HD}eyes-${blink}.svg` } : {}) });
const SH_LOOK = {
  idle: { frames: ["idle.svg"], ...sheyes("stern", "blink") },
  happy: { frames: ["happy.svg"], ...sheyes("smug") },
  celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"] },
  worried: { frames: ["worried.svg"], ...sheyes("worried") },
  shocked: { frames: ["shocked.svg"], ...sheyes("wide") },
  sleepy: { frames: ["sleepy.svg"] },
  alert: { frames: ["shocked.svg"], ...sheyes("wide") },
  tired: { frames: ["tired.svg"] },
  stop: { frames: ["stop.svg"], ...sheyes("stern", "blink") },
  confused: { frames: ["confused.svg"] },
  love: { frames: ["love.svg"] },
  wave: { frames: ["wave-1.svg", "wave-2.svg"], ...sheyes("smug") },
  proud: { frames: ["happy.svg"], ...sheyes("smug") },
  sad: { frames: ["sad.svg"], ...sheyes("worried") },
  bored: { frames: ["bored.svg"] },
  focused: { frames: ["focused.svg"], ...sheyes("stern", "blink") },
  nervous: { frames: ["worried.svg"], ...sheyes("wide") },
  curious: { frames: ["curious.svg"], ...sheyes("wide") },
  angry: { frames: ["angry.svg"], ...sheyes("stern") },
  excited: { frames: ["excited.svg"], ...sheyes("wide") },
  relieved: { frames: ["relieved.svg"] },
  dizzy: { frames: ["dizzy.svg"] },
  cool: { frames: ["happy.svg"], ...sheyes("smug", "blink") },
  sick: { frames: ["sick.svg"] },
};
const SH_EYE_FILES = Object.fromEntries(["stern", "blink", "smug", "worried", "wide"].map((n) => [`eyes-${n}.svg`, SH_EYES[n]]));

// V: the whole face is the smiling mask (ivory, rosy cheeks, arched brows,
// smiling eye slits, a thin mustache curled up and a strip of a goatee), under
// a wide-brimmed black hat, long dark hair down the sides, a cloak, black
// gloves and boots. A mask never changes: every frame wears the same face (no
// eyes layer either, the holes of a mask do not wander). Moods show in the
// body only: arms up, a wave, a stop sign, a red rose in love, and the motion
// and effects every costume gets.
const VV = {
  mask: "#f8eedf",
  maskDeep: "#e2cba9",
  crease: "#cdb18d",
  line: "#1d1512",
  cheek: "#ee9890",
  hat: "#43434f",
  hatDeep: "#17171c",
  band: "#0b0b0e",
  hair: "#46332a",
  hairDeep: "#1e140f",
  cloth: "#565665",
  clothDeep: "#24242c",
  ink: "#050507",
};
const vfill = (d, color = VV.line) => `<path d="${d}" fill="${color}"/>`;
const vline = (d, w = 2.2, color = VV.line) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Both sides from the left one's art. */
const vboth = (left) => left + mirror(left);

/** The mask's face, the same in every mood. */
const V_FACE =
  // Cheeks, nose and the creases of the smile.
  vboth(`<ellipse cx="42.6" cy="69.6" rx="7.4" ry="5" fill="${VV.cheek}" opacity="0.55"/>`) +
  vline("M64.4 58.6 Q62 66 62.4 69.6 Q64 71.4 66 69.8", 1.5, VV.crease) +
  vboth(vline("M41.6 76.6 Q43 82.8 47.6 86.4", 1.4, VV.crease)) +
  // Arched brows, smiling eye slits, the mustache curled up.
  vboth(vfill("M37 52 Q43 40 59.2 46.4 Q45.4 46.4 37 52 Z")) +
  vboth(vfill("M39 58.6 Q47.6 52.4 57.6 57.6 Q47.6 61 39 58.6 Z")) +
  vboth(vline("M64 74.6 C59 73 53 74.4 49 76 C45 77.6 42 75.4 42.8 71.8 C43.2 70 45.6 69.8 46 71.4", 2.4)) +
  // The smile, curling up at the ends, and the goatee.
  vline("M49 80.4 Q64 89 79 80.4", 2) +
  vboth(vline("M49 80.4 Q46.6 79.6 47 77.2", 1.6)) +
  vfill("M62.6 88.4 Q64 87.6 65.4 88.4 L64.7 101.6 Q64 103.2 63.3 101.6 Z");

const V_HAIR =
  `<path d="M33 30 C24 40 21.4 60 22.6 80 C23.4 93 20.4 101 23.8 108.4 L33.6 106 C30.6 92 31 62 36.4 34 Z" fill="url(#vh)" stroke="${VV.ink}" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M29.4 44 C26.4 58 26.2 76 27.2 92" fill="none" stroke="#6b5145" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>`;
const V_CLOAK = `<path d="M30 66 Q14 96 16.6 114 Q64 120 111.4 114 Q114 96 98 66 Z" fill="${VV.clothDeep}" stroke="${VV.ink}" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke"/><path d="M27.6 74 Q20 94 20.6 110" fill="none" stroke="#5c5c6a" stroke-width="1.3" stroke-linecap="round"/>`;

/** An arm in a dark sleeve, turned `deg` up; a black glove. */
function vArm(deg) {
  const art =
    `<path d="M31 70 L19.5 91" stroke="${VV.ink}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M31 70 L19.5 91" stroke="${VV.cloth}" stroke-width="6.4" stroke-linecap="round"/>` +
    `<circle cx="18.6" cy="93.2" r="5.6" fill="${VV.clothDeep}" stroke="${VV.ink}" stroke-width="2.4"/>` +
    `<path d="M15.4 91.6 Q18.6 89.6 21.8 91.6" fill="none" stroke="#6b6b7a" stroke-width="1.2" stroke-linecap="round"/>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}
const V_BOOT =
  `<path d="M42 100 L42 108" stroke="${VV.ink}" stroke-width="8" stroke-linecap="round"/>` +
  `<path d="M42 100 L42 108" stroke="${VV.cloth}" stroke-width="4.4" stroke-linecap="round"/>` +
  `<rect x="31.5" y="114.6" width="24" height="4.6" rx="2.3" fill="${VV.ink}"/>` +
  `<path d="M32.4 115.4 Q32 107.6 42.4 106.8 Q52.6 106.6 55 112.2 L55.4 115.4 Z" fill="${VV.clothDeep}" stroke="${VV.ink}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<path d="M36 110.4 Q42 108.4 47 109" fill="none" stroke="#6b6b7a" stroke-width="1.2" stroke-linecap="round"/>`;
const V_HAT =
  `<path d="M40.4 32 L43.6 6 Q64 1.6 84.4 6 L87.6 32 Z" fill="url(#vt)" stroke="${VV.ink}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M41.6 24.4 Q64 21.4 86.4 24.4 L87.4 31 Q64 28.4 40.6 31 Z" fill="${VV.band}"/>` +
  `<path d="M47 9 L45.4 22" fill="none" stroke="#7a7a88" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>` +
  `<path d="M5 33.6 Q18 25.6 64 26.6 Q110 25.6 123 33.6 Q110 40.6 64 39.6 Q18 40.6 5 33.6 Z" fill="url(#vt)" stroke="${VV.ink}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M12 33.4 Q30 29 52 29" fill="none" stroke="#7a7a88" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`;

/** A red rose held up in the right hand (arm turned `deg`). */
function vRose(deg) {
  const [hx, hy] = turned(18.6, 93.2, deg);
  const x = +(128 - hx).toFixed(1);
  const y = +hy.toFixed(1);
  return (
    `<path d="M${x} ${y} L${x - 4} ${y - 14}" stroke="#15803d" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M${x - 2.2} ${y - 7} q-4 -3 -6 0 q3 2.4 6 0 Z" fill="#22c55e"/>` +
    `<circle cx="${x - 4.4}" cy="${y - 17.6}" r="5.2" fill="#dc2626" stroke="${VV.ink}" stroke-width="1.6"/>` +
    vline(`M${x - 4.4} ${y - 17.6} m-1 0 a1.2 1.2 0 1 1 2.4 0 a2.8 2.8 0 1 1 -5.6 0`, 1.1, "#7f1d1d")
  );
}

/** A frame of V: the same mask, the body posed. */
function vee({ arms = [0, 0], stop = false, rose = false }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="vm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${VV.mask}"/><stop offset="1" stop-color="${VV.maskDeep}"/></linearGradient><linearGradient id="vt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${VV.hat}"/><stop offset="1" stop-color="${VV.hatDeep}"/></linearGradient><linearGradient id="vh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${VV.hair}"/><stop offset="1" stop-color="${VV.hairDeep}"/></linearGradient></defs>
${V_CLOAK}
${V_HAIR}${mirror(V_HAIR)}
${vArm(arms[0])}${mirror(vArm(arms[1]))}
${V_BOOT}${mirror(V_BOOT)}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#vm)" stroke="${VV.ink}" stroke-width="5" paint-order="stroke"/>
${V_FACE}
${V_HAT}
${rose ? vRose(arms[1]) : ""}${stop ? stopSign(110, 52) : ""}
</svg>
`;
}

const VF = {
  "idle.svg": {},
  "celebrate-1.svg": { arms: [70, 70] },
  "celebrate-2.svg": { arms: [105, 105] },
  "stop.svg": { arms: [0, 95], stop: true },
  "love.svg": { arms: [0, 115], rose: true },
  "wave-1.svg": { arms: [0, 95] },
  "wave-2.svg": { arms: [0, 130] },
};
const VD = "costumes/v/";
// Every mood not posed below stands still in the mask.
const V_LOOK = Object.fromEntries(Object.keys(MANIFEST.states).map((s) => [s, { frames: ["idle.svg"] }]));
Object.assign(V_LOOK, {
  celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"] },
  excited: { frames: ["celebrate-1.svg", "celebrate-2.svg"] },
  stop: { frames: ["stop.svg"] },
  love: { frames: ["love.svg"] },
  wave: { frames: ["wave-1.svg", "wave-2.svg"] },
});

/** A costume's states: its frames and eyes, Candy's motion, frame rate and effect. */
function costumeStates(who, dir, looks) {
  const states = {};
  for (const [state, def] of Object.entries(MANIFEST.states)) {
    const look = looks[state];
    if (!look) throw new Error(`${who} has no look for ${state}`);
    const { frames: _f, eyes: _e, eyesBlink: _b, blink: _w, ...rest } = def;
    states[state] = { ...rest, ...look, frames: look.frames.map((f) => dir + f) };
  }
  return states;
}
MANIFEST.costumes = {
  gengar: { name: "Gengar", states: costumeStates("Gengar", YD, YV_LOOK) },
  spiderman: { name: "Spiderman", states: costumeStates("Spiderman", SD, SP_LOOK) },
  shadow: { name: "Shadow", states: costumeStates("Shadow", HD, SH_LOOK) },
  v: { name: "V", states: costumeStates("V", VD, V_LOOK) },
};

for (const dir of ["outfits", "faces", "eyes", "still", YD, SD, HD, VD]) mkdirSync(join(OUT, dir), { recursive: true });
for (const [name, art] of Object.entries(YV_FRAMES)) writeFileSync(join(OUT, YD, name), yovich(art));
for (const [name, art] of Object.entries(YV_EYE_FILES)) writeFileSync(join(OUT, YD, name), wrap(art));
for (const [name, art] of Object.entries(SP_FRAMES)) writeFileSync(join(OUT, SD, name), spidermax(art));
for (const [name, art] of Object.entries(SP_EYE_FILES)) writeFileSync(join(OUT, SD, name), wrap(art));
for (const [name, art] of Object.entries(SHF)) writeFileSync(join(OUT, HD, name), shadow(art));
for (const [name, art] of Object.entries(SH_EYE_FILES)) writeFileSync(join(OUT, HD, name), wrap(art));
for (const [name, art] of Object.entries(VF)) writeFileSync(join(OUT, VD, name), vee(art));
// Stills with their eyes in, for previews outside the app.
writeFileSync(join(OUT, YD, "still.svg"), yovich(YV_FRAMES["idle.svg"]).replace("</svg>", `${YV_EYES.evil}\n</svg>`));
writeFileSync(join(OUT, SD, "still.svg"), spidermax({ lens: "open" }));
writeFileSync(join(OUT, VD, "still.svg"), vee({}));
writeFileSync(join(OUT, HD, "still.svg"), shadow({}).replace("</svg>", `${SH_EYES.stern}
</svg>`));
for (const [name, art] of Object.entries(FRAMES)) {
  writeFileSync(join(OUT, name), svg(art));
}
for (const name of STILLS) writeFileSync(join(OUT, "still", name), svg(FRAMES[name], false));
for (const [name, art] of Object.entries(EYE_FILES)) writeFileSync(join(OUT, name), wrap(art));
for (const [name, art] of Object.entries({ ...OUTFITS, ...FACES })) {
  writeFileSync(join(OUT, name), art);
}
writeFileSync(join(OUT, "mascot.json"), JSON.stringify(MANIFEST, null, 2) + "\n");
console.log(`${Object.keys(FRAMES).length} frames + mascot.json → ${OUT}`);

// A friend's exclusive costume is drawn by editions/<id>/draw.mjs, which is
// kept out of the repository with what it draws: editions/<id>/costume.json and
// editions/<id>/mascot/costumes/<id>/ (see vite.config.ts and pack-edition.mjs).
const EDITIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "editions");
for (const id of existsSync(EDITIONS) ? readdirSync(EDITIONS) : []) {
  const script = join(EDITIONS, id, "draw.mjs");
  if (!existsSync(script)) continue;
  const dir = `costumes/${id}/`;
  const { default: draw } = await import(pathToFileURL(script).href);
  const { name, frames, look } = draw({ mirror, EXTRAS, stopSign, EYES, INK, dir });
  mkdirSync(join(EDITIONS, id, "mascot", dir), { recursive: true });
  for (const [file, art] of Object.entries(frames)) writeFileSync(join(EDITIONS, id, "mascot", dir, file), art);
  writeFileSync(join(EDITIONS, id, "costume.json"), JSON.stringify({ name, states: costumeStates(name, dir, look) }, null, 2) + "\n");
  console.log(`${name} (friend edition) → editions/${id}/`);
}
