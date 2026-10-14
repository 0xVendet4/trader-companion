// Ghost: Candy as a little sheet ghost. A white sheet with a round top, a
// wavy hem that flutters when it moves (hello, celebrating, excited), a soft
// glow around its edge and a pale band of light just inside it, so it looks a
// little see-through on the island's black. Big glossy eyes, pink cheeks, a
// small mouth, and the sheet's corners for arms. It goes blue when sad, pink
// when angry, green when sick.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/ghost/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the body, in Candy's place (hats and face accessories sit as they do on
// him). The sheet is drawn twice around it: behind (what shows when he turns
// his back) and over it as skin, hem and all, so the outline runs unbroken
// from the top down to the hem. The sheet over him is marked data-melt="over":
// on a strong drop his wax runs down the sheet (paint.ts → meltSeat). Cheeks, brows and mouth turn with the face,
// the eyes are layers, the arms and the glow stay behind.

const GH = {
  top: "#ffffff",
  bottom: "#dfe5f3",
  hem: "#c9d2ea",
  rim: "#1b1d3f",
  ink: "#1b1d3f",
  glow: "#c7d2fe",
  light: "#c3cdf6",
  fold: "#b7c2df",
  mouth: "#3b1838",
  tongue: "#fb7185",
  blush: "#fb8fb6",
};

/** The sheet's colours by mood: top, bottom, the hem's lowest point. */
const TINT = {
  white: [GH.top, GH.bottom, GH.hem],
  // Feeling blue.
  blue: ["#eef4ff", "#b8cbee", "#9fb5e3"],
  // Red with anger.
  pink: ["#fff1f3", "#f6c3cd", "#eda9b8"],
  // Green about the gills.
  green: ["#f1f7e8", "#c5d9b0", "#acc699"],
  // Dim, half asleep.
  dim: ["#f3f4fa", "#cfd5e6", "#b9c1d8"],
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.6, color = GH.ink) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ── The sheet ────────────────────────────────────────────────────────────────

/** The sheet's sides meet the hem here; the top is Candy's body with rounder corners (r 30). */
const SIDE_L = 26.2;
const SIDE_R = 128 - SIDE_L;
const HEM_Y = 101;
const DIP_Y = 105;

/**
 * The sheet's hem: four round lobes from right to left, with points between.
 * `flow` shifts which lobes hang lower, so two frames make it flutter.
 */
function hem(flow) {
  const deep = [116, 112.6, 116, 112.6];
  const shift = [0.9, -0.9, 0.9, -0.9];
  const depths = flow ? deep.map((d, i) => deep[(i + 1) % 4] + (i === 0 ? -0.6 : 0)) : deep;
  const sh = flow ? shift.map((s) => -s) : shift;
  const w = (SIDE_R - SIDE_L) / 4;
  let d = "";
  for (let i = 0; i < 4; i++) {
    const xa = SIDE_R - i * w;
    const xb = xa - w;
    const ya = i === 0 ? HEM_Y : DIP_Y;
    const yb = i === 3 ? HEM_Y : DIP_Y;
    const xm = xa - w / 2 + sh[i];
    const yd = depths[i];
    d += ` C${f(xa)} ${f(ya + 5)} ${f(xm + w * 0.3)} ${f(yd)} ${f(xm)} ${f(yd)}`;
    d += ` C${f(xm - w * 0.3)} ${f(yd)} ${f(xb)} ${f(yb + 5)} ${f(xb)} ${f(yb)}`;
  }
  return { d, low: Math.max(...depths) };
}

/** The whole sheet's outline: up the left side, round over the top, down the right, the hem back. */
function sheet(flow) {
  const k = 16.57; // a quarter circle of radius 30, as a curve
  const h = hem(flow);
  const d =
    `M${SIDE_L} ${HEM_Y} C${SIDE_L + 0.6} 88 28 72 28 54 C28 ${f(54 - k)} ${f(58 - k)} 24 58 24 L70 24 C${f(70 + k)} 24 100 ${f(54 - k)} 100 54 ` +
    `C100 72 ${SIDE_R - 0.6} 88 ${SIDE_R} ${HEM_Y}${h.d} Z`;
  return { d, low: h.low };
}

/** Folds of the sheet down to the hem's points. */
const FOLDS =
  `<path d="M45.4 88 Q46.4 97 45.6 104 M64.4 86 Q63.6 96 64 104 M82.6 88 Q81.6 97 82.4 104" fill="none" stroke="${GH.fold}" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>`;

/** A corner of the sheet, hanging from under the body (pivot 36, 69), `deg` turned up. */
const ARM_D = "M38 62 C29.4 61.6 21 68 17 79.6 C15.4 84.4 15.8 89.2 19.4 90 C22.4 90.6 25 88 27.4 85.2 C30.6 81.4 33.8 77.6 38 76 Z";
function arm(deg) {
  const art =
    `<path d="${ARM_D}" fill="none" stroke="${GH.glow}" stroke-width="12" stroke-linejoin="round" opacity="0.1"/><path d="${ARM_D}" fill="none" stroke="${GH.glow}" stroke-width="8.6" stroke-linejoin="round" opacity="0.18"/>` +
    `<path d="${ARM_D}" fill="url(#ga)" stroke="${GH.rim}" stroke-width="4.6" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M29.6 70.4 Q24.6 76.6 21.6 85" fill="none" stroke="${GH.fold}" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`;
  return deg ? `<g transform="rotate(${deg} 36 69)">${art}</g>` : art;
}

/** Where the right arm's tip ends up when it turns `deg` up. */
function rightTip(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [18 - 36, 87 - 69];
  return [128 - (36 + dx * Math.cos(a) - dy * Math.sin(a)), 69 + dx * Math.sin(a) + dy * Math.cos(a)];
}

// ── The face ─────────────────────────────────────────────────────────────────

const pair = (one) => one(L) + one(R);

function heartD(cx, cy, s) {
  return `M${cx} ${f(cy + 6 * s)} C${f(cx - 10 * s)} ${f(cy - s)} ${f(cx - 6 * s)} ${f(cy - 9 * s)} ${cx} ${f(cy - 4 * s)} C${f(cx + 6 * s)} ${f(cy - 9 * s)} ${f(cx + 10 * s)} ${f(cy - s)} ${cx} ${f(cy + 6 * s)} Z`;
}

/** Big glossy eyes: a tall oval, a round glint up right and a little one down left. */
const glossy = (x, rx = 7.4, ry = 10.4) =>
  `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="${GH.ink}"/>` +
  `<circle cx="${f(x + rx * 0.3)}" cy="${f(EY - ry * 0.44)}" r="${f(rx * 0.43)}" fill="#ffffff"/>` +
  `<circle cx="${f(x - rx * 0.36)}" cy="${f(EY + ry * 0.42)}" r="${f(rx * 0.2)}" fill="#ffffff"/>`;

export default function drawGhost({ mirror, EXTRAS, stopSign, star, INK, dir, wrap }) {
  const EYE = {
    open: pair((x) => glossy(x)),
    blink: pair((x) => line(`M${x - 7.4} ${EY + 1.5} Q${x} ${EY + 6.5} ${x + 7.4} ${EY + 1.5}`, 3.6)),
    happy: pair((x) => line(`M${x - 7.4} ${EY + 3.5} Q${x} ${EY - 7.5} ${x + 7.4} ${EY + 3.5}`, 4.2)),
    // Round and startled: whites with a small pupil (the sheet is white too: the outline does it).
    wide: pair(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="10.2" fill="#ffffff" stroke="${GH.ink}" stroke-width="3.2"/>` +
        `<circle cx="${x}" cy="${EY + 0.8}" r="4.4" fill="${GH.ink}"/><circle cx="${x + 1.6}" cy="${EY - 1}" r="1.5" fill="#ffffff"/>`,
    ),
    // Lids half down: steady.
    narrow: pair(
      (x) =>
        `<path d="M${x - 7.6} ${EY - 1.6} L${x + 7.6} ${EY - 1.6} Q${x + 7.4} ${EY + 8} ${x} ${EY + 8} Q${x - 7.4} ${EY + 8} ${x - 7.6} ${EY - 1.6} Z" fill="${GH.ink}"/>` +
        `<circle cx="${x + 2.6}" cy="${EY + 1.6}" r="2" fill="#ffffff"/>` +
        line(`M${x - 8.6} ${EY - 2} L${x + 8.6} ${EY - 2}`, 3.2),
    ),
    sparkle: pair(
      (x) =>
        glossy(x, 8.4, 11.2) +
        `<path d="M${x - 3.6} ${EY - 7.6} l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1 Z" fill="#ffffff"/>`,
    ),
    hearts: pair((x) => `<path d="${heartD(x, EY + 1, 1.15)}" fill="#fb7185" stroke="${GH.ink}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${x - 3.4}" cy="${EY - 2.6}" r="1.6" fill="#ffffff" opacity="0.85"/>`),
    stars: (star(L, EY, 10) + star(R, EY, 10)).replaceAll(INK, GH.ink),
    dots: pair((x) => `<circle cx="${x}" cy="${EY}" r="4.6" fill="${GH.ink}"/>`),
    // A wink: the left eye open, the right one shut in a happy arc.
    wink: glossy(L) + line(`M${R - 7.4} ${EY + 3.5} Q${R} ${EY - 7.5} ${R + 7.4} ${EY + 3.5}`, 4.2),
    // No layer: in the frame.
    closed: pair((x) => line(`M${x - 7.4} ${EY - 0.5} Q${x} ${EY + 6.5} ${x + 7.4} ${EY - 0.5}`, 3.8)),
    half: pair(
      (x) =>
        `<path d="M${x - 7.4} ${EY + 0.6} A7.4 8 0 0 0 ${x + 7.4} ${EY + 0.6} Z" fill="${GH.ink}"/><circle cx="${x + 2.4}" cy="${EY + 3.4}" r="1.6" fill="#ffffff"/>` +
        line(`M${x - 9} ${EY + 0.6} L${x + 9} ${EY + 0.6}`, 3.2),
    ),
    smug: pair((x) => line(`M${x - 8} ${EY + 2.5} Q${x} ${EY - 4} ${x + 8} ${EY + 2.5}`, 4.4)),
    spiral: pair((x) => line(`M${x} ${EY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7.5 7.5 0 1 1 -15 0`, 2.6)),
  };

  // Brows over taller eyes: a little higher than Candy's, a little finer.
  const BROWS = {
    none: "",
    worried: line(`M${L - 8} ${EY - 12} L${L + 7} ${EY - 17}`) + line(`M${R + 8} ${EY - 12} L${R - 7} ${EY - 17}`),
    stern: line(`M${L - 9} ${EY - 17} L${L + 7} ${EY - 11}`) + line(`M${R + 9} ${EY - 17} L${R - 7} ${EY - 11}`),
    raised: line(`M${L - 8} ${EY - 19} Q${L} ${EY - 24} ${L + 8} ${EY - 19}`) + line(`M${R - 8} ${EY - 14.5} L${R + 8} ${EY - 14.5}`),
    flat: line(`M${L - 8} ${EY - 15.5} L${L + 8} ${EY - 15.5}`) + line(`M${R - 8} ${EY - 15.5} L${R + 8} ${EY - 15.5}`),
  };

  /** An open mouth: dark inside, the tongue at the bottom, the outline over both. */
  const open = (d, tongue) => `<path d="${d}" fill="${GH.mouth}"/>` + `<path d="${tongue}" fill="${GH.tongue}"/>` + `<path d="${d}" fill="none" stroke="${GH.ink}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const MOUTHS = {
    smile: line("M57.4 78.4 Q64 85.6 70.6 78.4"),
    small: line("M59.6 79.4 Q64 83 68.4 79.4", 3.2),
    grin: open("M54.6 76.4 Q64 78.2 73.4 76.4 Q72.4 89.4 64 89.4 Q55.6 89.4 54.6 76.4 Z", "M58.4 86 Q64 81.8 69.6 86 Q64 89.6 58.4 86 Z"),
    // Boo! A round open mouth.
    o: open("M64 74.6 C70.6 74.6 70.6 88.4 64 88.4 C57.4 88.4 57.4 74.6 64 74.6 Z", "M60 85.4 Q64 82.4 68 85.4 Q64 88.6 60 85.4 Z"),
    smallO: `<ellipse cx="64" cy="80.6" rx="3.6" ry="4.4" fill="${GH.mouth}" stroke="${GH.ink}" stroke-width="2.4"/>`,
    flat: line("M57.6 81 L70.4 81"),
    short: line("M60 81 L68 81", 3.4),
    wavy: line("M54 81.6 Q57.5 78 61 81.6 T68 81.6 T75 81.6", 3.2),
    frown: line("M56.6 84.4 Q64 76.6 71.4 84.4"),
    smirk: line("M56.4 80.4 Q66 84.4 73.6 76.6"),
    // A cat's mouth: pleased with itself.
    cat: line("M55.6 78.6 Q59.8 84.2 64 79.2 Q68.2 84.2 72.4 78.6", 3.4),
    // Cheeky: a smirk with the tongue out at the corner.
    tongue:
      `<path d="M64.6 80.6 Q65.4 89.4 70.6 88.6 Q75 87.6 73.4 79.4 Z" fill="${GH.tongue}" stroke="${GH.ink}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M69 81.4 L69.6 85.6" stroke="#e11d48" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/>` +
      line("M55.6 78.6 Q64.6 83.6 75.4 77.6"),
    grit:
      `<rect x="54" y="76" width="20" height="10" rx="4" fill="#ffffff" stroke="${GH.ink}" stroke-width="2.8"/>` +
      `<path d="M60.6 76 L60.6 86 M64 76 L64 86 M67.4 76 L67.4 86 M54 81 L74 81" stroke="${GH.ink}" stroke-width="1.5"/>`,
  };

  const drop = (d) => `<path d="${d}" fill="#7dd3fc" stroke="${GH.rim}" stroke-width="2"/>`;
  const OWN = {
    // Beside the sheet, clear of its outline (x 25.5 to 102.5): nothing covers them.
    sweat: () => drop("M109 26 C105.4 32.6 103.8 36.4 104.6 39.4 C105.6 43 111.4 43.6 113.2 40 C114.4 37.4 112.8 33.4 109 26 Z"),
    sweat2: () =>
      drop("M109 26 C105.4 32.6 103.8 36.4 104.6 39.4 C105.6 43 111.4 43.6 113.2 40 C114.4 37.4 112.8 33.4 109 26 Z") +
      drop("M18.6 32 C15.6 37 14.6 40 16.6 42 C18.6 44 21.6 43 21.6 40 C21.6 38 20.6 36 18.6 32 Z"),
    tear: () => `<path d="M44.6 70 C41.6 76 41.6 79 44.6 80 C47.6 79 47.6 76 44.6 70 Z" fill="#7dd3fc" stroke="${GH.ink}" stroke-width="1.6"/>`,
    // Anger marks off the top, red so they show on white and on the island's black.
    flush: () => line("M99 27 L105.5 22.5 M102 33.5 L109.5 31.5 M96.5 21.5 L98.5 14.5", 2.8, "#ef4444"),
    // A shiver down both sides.
    shiver: () =>
      mirror(line("M14.6 50 Q11.4 55 14.6 60 Q17.8 65 14.6 70", 2.4, GH.light) + line("M8.6 54 Q6.4 58 8.6 62", 2.2, GH.light)) +
      line("M14.6 50 Q11.4 55 14.6 60 Q17.8 65 14.6 70", 2.4, GH.light) +
      line("M8.6 54 Q6.4 58 8.6 62", 2.2, GH.light),
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: GH.bottom });

  /** A frame of the ghost; `eyes` drawn here only when they have no layer. */
  function ghost({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.55, arms = [0, 0], flow = 0, tint = "white", extras = [], stop = false }) {
    const [top, bottom, low] = TINT[tint];
    const s = sheet(flow);
    // The sheet's gradient runs past the body's (24 → 106) down to the hem: the same colours where they meet.
    const at = f((106 - 24) / (s.low - 24));
    const flushed = extras.includes("flush");
    const blush = flushed ? 0.75 : cheeks;
    const cheek = flushed ? "#ef4444" : GH.blush;
    let sign = "";
    if (stop) {
      const [tx, ty] = rightTip(arms[1]).map((n) => +n.toFixed(1));
      sign = stopSign(+(tx + 2).toFixed(1), +(ty + 1).toFixed(1));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="${at}" stop-color="${bottom}"/><stop offset="1" stop-color="${low}"/></linearGradient><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><clipPath id="gc"><path d="${s.d}"/></clipPath></defs>
${[[15, 0.08], [11, 0.13], [7.6, 0.22]].map(([w, a]) => `<path d="${s.d}" fill="none" stroke="${GH.glow}" stroke-width="${w}" stroke-linejoin="round" opacity="${a}"/>`).join("")}
${arm(arms[0])}${mirror(arm(arms[1]))}
<path d="${s.d}" fill="url(#gs)" stroke="${GH.rim}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>
<rect x="28" y="24" width="72" height="82" rx="30" fill="url(#gb)" stroke="${GH.rim}" stroke-width="5" paint-order="stroke"/>
<path d="${s.d}" fill="url(#gs)" stroke="${GH.rim}" stroke-width="5" stroke-linejoin="round" paint-order="stroke" data-melt="over"/>
<g clip-path="url(#gc)" data-melt="over">
${FOLDS}
<path d="${s.d}" fill="none" stroke="${GH.light}" stroke-width="6" stroke-linejoin="round" opacity="0.7"/>
</g>
<ellipse cx="41" cy="74.5" rx="7.2" ry="4.4" fill="${cheek}" opacity="${blush}"/><ellipse cx="87" cy="74.5" rx="7.2" ry="4.4" fill="${cheek}" opacity="${blush}"/>
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}
${extras.map(extra).join("")}${sign}
</svg>
`;
  }

  // name → art, every mood its own face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.8 },
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.8, arms: [72, 72], flow: 0 },
    "celebrate-2.svg": { mouth: "o", cheeks: 0.8, arms: [100, 100], flow: 1 },
    "worried.svg": { brows: "worried", mouth: "wavy", cheeks: 0.35, extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.25, extras: ["shiver"] },
    "sleepy.svg": { eyes: "closed", mouth: "smallO", cheeks: 0.35, tint: "dim" },
    "alert.svg": { mouth: "smallO", cheeks: 0.4 },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, tint: "dim", extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", cheeks: 0.4, arms: [0, 95], stop: true },
    "confused.svg": { mouth: "wavy", cheeks: 0.35 },
    "love.svg": { mouth: "cat", cheeks: 0.95 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 72], flow: 0 },
    "wave-2.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 102], flow: 1 },
    "proud.svg": { eyes: "smug", mouth: "cat", cheeks: 0.75 },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, tint: "blue", extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.35 },
    "nervous.svg": { brows: "worried", mouth: "grit", cheeks: 0.3, extras: ["sweat2", "shiver"] },
    "curious.svg": { brows: "raised", mouth: "smallO", cheeks: 0.5 },
    "angry.svg": { brows: "stern", mouth: "frown", tint: "pink", extras: ["flush"] },
    // The hem flutters: two frames.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, arms: [24, 24], flow: 0 },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, arms: [40, 40], flow: 1 },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.35 },
    "cool.svg": { mouth: "tongue", cheeks: 0.55 },
    "sick.svg": { eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, tint: "green", extras: ["sweat"] },
  };

  const LAYERS = ["open", "blink", "happy", "wide", "narrow", "sparkle", "hearts", "stars", "dots", "wink"];
  const eyes = (name, blink) => ({ eyes: `${dir}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${dir}eyes-${blink}.svg` } : {}) });
  const LOOK = {
    idle: { frames: ["idle.svg"], ...eyes("open", "blink") },
    happy: { frames: ["happy.svg"], ...eyes("happy") },
    celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"], ...eyes("stars") },
    worried: { frames: ["worried.svg"], ...eyes("open", "blink") },
    shocked: { frames: ["shocked.svg"], ...eyes("wide") },
    sleepy: { frames: ["sleepy.svg"] },
    alert: { frames: ["alert.svg"], ...eyes("wide") },
    tired: { frames: ["tired.svg"] },
    stop: { frames: ["stop.svg"], ...eyes("open", "blink") },
    confused: { frames: ["confused.svg"], ...eyes("dots", "blink") },
    love: { frames: ["love.svg"], ...eyes("hearts") },
    wave: { frames: ["wave-1.svg", "wave-2.svg"], ...eyes("happy") },
    proud: { frames: ["proud.svg"] },
    sad: { frames: ["sad.svg"], ...eyes("open", "blink") },
    bored: { frames: ["bored.svg"] },
    focused: { frames: ["focused.svg"], ...eyes("narrow", "blink") },
    nervous: { frames: ["nervous.svg"], ...eyes("wide") },
    curious: { frames: ["curious.svg"], ...eyes("open", "blink") },
    angry: { frames: ["angry.svg"], ...eyes("narrow") },
    excited: { frames: ["excited-1.svg", "excited-2.svg"], fps: 4, ...eyes("sparkle") },
    relieved: { frames: ["relieved.svg"] },
    dizzy: { frames: ["dizzy.svg"] },
    cool: { frames: ["cool.svg"], ...eyes("wink", "blink") },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, art] of Object.entries(FRAMES)) files[name] = ghost(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = ghost({ eyes: "open" });
  return { name: "Ghost", frames: files, look: LOOK };
}
