// Bee: Candy as a round little bumblebee. Sunny yellow with dark stripes (one
// across the forehead, one round the bottom), small see-through wings behind
// the shoulders that flutter up and down when excited, celebrating or waving,
// two antennae with round tips that show the mood too (perked up when alert,
// drooping when sad or sleepy, one bent when confused, hearts at the tips in
// love), big glossy brown-black eyes, brown arms and feet light enough to show
// on the island's black, and a tiny stinger underneath.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/bee/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the body (Candy's, so hats and face accessories sit as they do on him), the
// stripes are clipped to it so they stay put as skin, brows and cheeks turn
// with the face, the mouth opens when it swallows, the eyes are layers.

const BE = {
  top: "#ffe56d",
  bottom: "#f5a90e",
  rim: "#1d1306",
  stripe: "#2f2215",
  /** The antennae and the stinger: dark, lighter at the top, a soft glint. */
  limb: "#6a5440",
  limbDeep: "#2d2116",
  limbSheen: "#9a8268",
  /** Arms and feet: a warm brown, light enough to show on the island's black at ticker size. */
  arm: "#a7865f",
  armDeep: "#4a3826",
  sheen: "#c9ad8a",
  wing: "#eef9ff",
  wingEdge: "#27303a",
  vein: "#9dcdec",
  eye: "#21160a",
  iris: "#7a4a17",
  mouth: "#5c1c10",
  tongue: "#fb7185",
  cheek: "#ff8a9e",
};

/** The body's corners: Candy's box (28, 24, 72 x 82), rounder than his (22). */
const RX = 32;

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.8, color = BE.rim) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A colour (#rrggbb) `t` of the way from `a` to `b`. */
const mixHex = (a, b, t) =>
  "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");

/** How much wider a halo is than its line: 1.5 each side. */
const HALO = 3;

/**
 * A dark line on a halo in the face's own colour, a little wider: unseen on
 * the yellow, it keeps the line from sinking into a dark stripe when the face
 * looks up or down over one.
 */
const haloed = (d, w, glow) => line(d, w + HALO, glow) + line(d, w);

/**
 * A mouth on its halo. `outline`: its shape's tag without paint (`<path d=".."`),
 * `art`: the mouth itself, `w`: its outline's width. A bare dark outline goes
 * first: the engine fills a mouth it opens wide (a swallow, a laugh) with the
 * colour of the first line it finds (paint.ts → drawMouth), and rings it in the
 * halo after it (rig.ts → mouthHalo), so it reads over the bottom stripe too.
 */
const ringed = (outline, art, w, glow) =>
  `${outline} fill="none" stroke="${BE.rim}" stroke-width="${w}" stroke-linejoin="round"/>` +
  `${outline} fill="none" stroke="${glow}" stroke-width="${w + HALO}" stroke-linejoin="round"/>` +
  art;
/** A line mouth on its halo, its bare first copy as in `ringed`. */
const mouthLine = (d, w, glow) => line(d, w) + haloed(d, w, glow);

// ── The body's parts ─────────────────────────────────────────────────────────

/**
 * The stripes, clipped to the body: across the forehead, arching under the
 * top of the head (hats hide its middle), and round the bottom, curving like
 * the belly of a ball, a yellow tip under it. Both keep clear of the face as it
 * moves: the face (brows, mouth) goes up or down MAX_PITCH (6) when Candy looks
 * up or down, the stripes stay (skin). The bottom one's top edge is at y 97 in
 * the middle, more than 6 under every mouth (rig.test.ts checks it); the brows
 * have their halo under the forehead one.
 */
const STRIPES =
  `<path d="M20 36 Q64 20 108 36 L108 42.2 Q64 26.2 20 42.2 Z" fill="${BE.stripe}"/>` +
  `<path d="M20 86 Q64 108 108 86 L108 92.4 Q64 114.4 20 92.4 Z" fill="${BE.stripe}"/>` +
  // A soft shine on the stripes, so they read as round.
  `<path d="M37 95 Q48 99.4 60 99.8" fill="none" stroke="#6b5642" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>` +
  `<path d="M37 35.6 Q47 31.8 58 30.2" fill="none" stroke="#6b5642" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>` +
  // Light on the yellow, top left.
  `<ellipse cx="38.6" cy="52" rx="3.2" ry="7.6" fill="#fffbe0" opacity="0.55"/>`;

/** The wings behind the left shoulder: a big one up and out, a small one under it. `lift` turns them up (degrees) about their root. */
function wings(lift = 0) {
  const art =
    `<path d="M34 47 C25 46.4 9.6 40.6 7 29.4 C5.2 21 14.6 17.2 22 23.4 C28.2 28.6 32.6 38.4 34 47 Z" fill="${BE.wing}" fill-opacity="0.65" stroke="${BE.wingEdge}" stroke-width="2.8" stroke-linejoin="round"/>` +
    `<path d="M31.6 44.4 C25 39.4 17.2 32.6 12.6 25.6" fill="none" stroke="${BE.vein}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<path d="M33 55.4 C25.6 58 14.4 60.6 11 55 C8 49.6 14 45.2 21.4 47 C26.8 48.4 30.8 51.6 33 55.4 Z" fill="${BE.wing}" fill-opacity="0.65" stroke="${BE.wingEdge}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="M30.4 53.6 C24.6 52.2 18.4 51.4 14 52.2" fill="none" stroke="${BE.vein}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<ellipse cx="14.6" cy="27.4" rx="2.2" ry="3.4" transform="rotate(-38 14.6 27.4)" fill="#ffffff" opacity="0.85"/>`;
  return lift ? `<g transform="rotate(${lift} 34 50)">${art}</g>` : art;
}

/** The antenna's round tip at (x, y): dark with a shine, or a heart (in love). */
function tip(x, y, heart = false) {
  if (heart) {
    const s = 0.62;
    const d = `M${x} ${f(y + 6 * s)} C${f(x - 10 * s)} ${f(y - s)} ${f(x - 6 * s)} ${f(y - 9 * s)} ${x} ${f(y - 4 * s)} C${f(x + 6 * s)} ${f(y - 9 * s)} ${f(x + 10 * s)} ${f(y - s)} ${x} ${f(y + 6 * s)} Z`;
    return `<path d="${d}" fill="#fb7185" stroke="${BE.rim}" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke"/><circle cx="${f(x - 1.8)}" cy="${f(y - 2.2)}" r="1.1" fill="#ffffff" opacity="0.9"/>`;
  }
  return (
    `<circle cx="${x}" cy="${y}" r="4.6" fill="url(#el)" stroke="${BE.rim}" stroke-width="2.4"/>` +
    `<circle cx="${f(x - 1.4)}" cy="${f(y - 1.5)}" r="1.3" fill="#ffffff" opacity="0.85"/>`
  );
}

/** Antennae on the left (the right one is its mirror): stalk path and tip, by how they stand. */
const ANTENNA = {
  // At rest: up and out.
  up: { d: "M57 29 Q55 16 47.4 10.6", tip: [46.6, 10] },
  // Perked up, straight and tall: alert, excited.
  perk: { d: "M57 29 Q56.4 16 52.6 7.4", tip: [52.2, 6.6] },
  // Drooping out to the side: sad, sleepy, tired.
  droop: { d: "M57 29 Q55.6 15.4 47.6 14.6 Q42.4 14.4 39.6 19.6", tip: [39.2, 20.6] },
};
function antenna(kind, heart = false) {
  const a = ANTENNA[kind];
  return (
    `<path d="${a.d}" fill="none" stroke="${BE.rim}" stroke-width="4.8" stroke-linecap="round"/>` +
    `<path d="${a.d}" fill="none" stroke="${BE.limb}" stroke-width="1.6" stroke-linecap="round"/>` +
    tip(a.tip[0], a.tip[1], heart)
  );
}

/** A thin brown arm from the shoulder (31, 70), turned `deg` up; a round mitten. Short enough that the hand stays on the canvas held out level. */
function arm(deg) {
  const art =
    `<path d="M31 70 L20.6 89" stroke="${BE.rim}" stroke-width="10.8" stroke-linecap="round"/>` +
    `<path d="M31 70 L20.6 89" stroke="${BE.arm}" stroke-width="6.8" stroke-linecap="round"/>` +
    `<path d="M29 71.8 L22.8 83.2" stroke="${BE.sheen}" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>` +
    `<circle cx="20" cy="90.8" r="5.6" fill="url(#ea)" stroke="${BE.rim}" stroke-width="2.2"/>` +
    `<circle cx="18.2" cy="88.8" r="1.5" fill="#ffffff" opacity="0.7"/>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}

/** A short brown leg on a round little foot. */
const FOOT =
  `<path d="M44 100 L44 108" stroke="${BE.rim}" stroke-width="7.4" stroke-linecap="round"/>` +
  `<path d="M44 100 L44 108" stroke="${BE.arm}" stroke-width="3.8" stroke-linecap="round"/>` +
  `<rect x="34.6" y="107" width="19.6" height="10.4" rx="5.2" fill="url(#ea)" stroke="${BE.rim}" stroke-width="2.6"/>` +
  `<path d="M38.4 110.4 L44.4 110.4" stroke="${BE.sheen}" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>`;

/** The stinger, a little dark point under the body, between the feet. */
const STINGER =
  `<path d="M58.6 100 L69.4 100 L64.7 117.2 Q64 118.6 63.3 117.2 Z" fill="url(#el)" stroke="${BE.rim}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M62.4 107.6 L63.6 113.6" stroke="${BE.limbSheen}" stroke-width="1.2" stroke-linecap="round"/>`;

// ── The face ─────────────────────────────────────────────────────────────────

/**
 * One glossy eye: dark brown-black, a warm crescent at the bottom, a big glint
 * and a small one. `lid`: [y at x−12, y at x+12], only what is under that
 * line shows and the lid is drawn on it.
 */
function eye(x, id, { rx = 8, ry = 10.4, glints = [[2.8, -4.4, 3.1], [-2.8, 4, 1.5]], lid = null, cy = EY } = {}) {
  const s = 0.82;
  const c = 0.57;
  const inner =
    `<ellipse cx="${x}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${BE.eye}"/>` +
    `<path d="M${f(x - rx * s)} ${f(cy + ry * c)} A${rx} ${ry} 0 0 0 ${f(x + rx * s)} ${f(cy + ry * c)} Q${x} ${f(cy + ry * 0.2)} ${f(x - rx * s)} ${f(cy + ry * c)} Z" fill="${BE.iris}"/>` +
    glints.map(([gx, gy, r]) => `<circle cx="${f(x + gx)}" cy="${f(cy + gy)}" r="${r}" fill="#ffffff"/>`).join("");
  if (!lid) return inner;
  const [a, b] = lid;
  const k = (rx + 1.4) / 12;
  return (
    `<clipPath id="${id}"><path d="M${x - 12} ${a} L${x + 12} ${b} L${x + 12} ${f(cy + ry + 4)} L${x - 12} ${f(cy + ry + 4)} Z"/></clipPath>` +
    `<g clip-path="url(#${id})">${inner}</g>` +
    line(`M${f(x - rx - 1.4)} ${f((a + b) / 2 - ((b - a) / 2) * k)} L${f(x + rx + 1.4)} ${f((a + b) / 2 + ((b - a) / 2) * k)}`, 3.2)
  );
}

/** A star (`r` its outer radius), filled. */
function starD(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.47;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(" L")} Z`;
}
const heartD = (cx, cy, s) =>
  `M${cx} ${f(cy + 6 * s)} C${f(cx - 10 * s)} ${f(cy - s)} ${f(cx - 6 * s)} ${f(cy - 9 * s)} ${cx} ${f(cy - 4 * s)} C${f(cx + 6 * s)} ${f(cy - 9 * s)} ${f(cx + 10 * s)} ${f(cy - s)} ${cx} ${f(cy + 6 * s)} Z`;

export default function drawBee({ mirror, EXTRAS, stopSign, EYES, INK, dir, wrap }) {
  /** Candy's own eye art, in the bee's ink. */
  const ink = (s) => s.replaceAll(INK, BE.rim);
  const pair = (one) => one(L, "l") + one(R, "r");
  /** A left eye's art (by the id of its clip) and its mirror image on the right. */
  const slanted = (left) => left("l") + mirror(left("r"));

  const EYE = {
    open: pair((x, s) => eye(x, `o${s}`)),
    blink: pair((x) => line(`M${x - 7.6} ${EY + 1} Q${x} ${EY + 6} ${x + 7.6} ${EY + 1}`, 3.6)),
    happy: pair((x) => line(`M${x - 7.4} ${EY + 3} Q${x} ${EY - 7.5} ${x + 7.4} ${EY + 3}`, 4.2)),
    // Startled: white all round, a small pupil.
    wide: pair(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="10.2" fill="#ffffff" stroke="${BE.rim}" stroke-width="2.8"/>` +
        `<circle cx="${x}" cy="${EY + 0.8}" r="4.2" fill="${BE.eye}"/><circle cx="${f(x + 1.4)}" cy="${f(EY - 0.8)}" r="1.4" fill="#ffffff"/>`,
    ),
    // Lids half down: steady.
    narrow: pair((x, s) => eye(x, `n${s}`, { lid: [EY - 2, EY - 2], glints: [[2.8, 0.4, 2.2], [-2.8, 5.4, 1.2]] })),
    // Big and bright: three glints.
    sparkle: pair((x, s) => eye(x, `s${s}`, { rx: 8.8, ry: 11.2, glints: [[3, -4.8, 3.4], [-3, 4.6, 1.8], [-3.4, -4.4, 1.1]] })),
    // Lids sloping down to the outside: worried. Wet glints: sad.
    worried: slanted((s) => eye(L, `w${s}`, { lid: [EY - 3, EY - 11] })),
    sad: slanted((s) => eye(L, `d${s}`, { lid: [EY - 2, EY - 10], glints: [[2.8, -1.4, 2.8], [-2.4, 3.4, 2.1], [2.4, 5.4, 1]] })),
    // Lids sloping down to the middle: a scowl.
    angry: slanted((s) => eye(L, `a${s}`, { lid: [EY - 11, EY - 1], glints: [[1.6, 1.6, 2.2]] })),
    hearts: pair((x) => `<path d="${heartD(x, EY + 0.6, 1.16)}" fill="#fb4f7c" stroke="${BE.rim}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${f(x - 3.6)}" cy="${EY - 3}" r="1.6" fill="#ffffff" opacity="0.9"/>`),
    // Stars in white, a yellow one would vanish on yellow.
    stars: pair((x) => `<path d="${starD(x, EY, 10.6)}" fill="#ffffff" stroke="${BE.rim}" stroke-width="2.4" stroke-linejoin="round"/><path d="${starD(x, EY + 0.4, 4.6)}" fill="#ff9f1a"/>`),
    dots: pair((x) => `<circle cx="${x}" cy="${EY}" r="4.8" fill="${BE.eye}"/><circle cx="${f(x + 1.4)}" cy="${EY - 1.6}" r="1.3" fill="#ffffff"/>`),
    // "What's that?": one eye opens wide.
    curious: eye(L, "cl", { lid: [EY - 4, EY - 4], glints: [[2.6, -0.6, 2.4], [-2.6, 4.8, 1.2]] }) + eye(R, "cr", { rx: 9.2, ry: 11.8, glints: [[3, -5, 3.4], [-3, 4.6, 1.7]] }),
    // A wink.
    wink: eye(L, "kl", { lid: [EY - 3.4, EY - 1.4], glints: [[2.6, 1, 2.2], [-2.6, 5.4, 1.2]] }) + line(`M${R - 7.4} ${EY + 3} Q${R} ${EY - 5} ${R + 7.4} ${EY + 3}`, 4.2),
    // The ones below have no layer: drawn in the frame.
    closed: ink(EYES.closed),
    half: pair((x, s) => eye(x, `h${s}`, { lid: [EY + 1, EY + 1], glints: [[2.6, 4.4, 1.6]] })),
    smug: ink(EYES.smug),
    spiral: ink(EYES.spiral),
    // Queasy: squeezed shut.
    squeeze: line(`M${L - 6} ${EY - 5} L${L + 5} ${EY} L${L - 6} ${EY + 5}`, 3.8) + line(`M${R + 6} ${EY - 5} L${R - 5} ${EY} L${R + 6} ${EY + 5}`, 3.8),
  };

  // Brows, a little higher than Candy's: the eyes are taller. Under the forehead
  // stripe, each on its halo (`glow`: the face's colour there), so a brow
  // still reads where it meets the stripe when Candy looks up.
  const BROWS = {
    none: () => "",
    worried: (glow) => haloed(`M${L - 8} ${EY - 12} L${L + 7} ${EY - 16.6}`, 3.8, glow) + haloed(`M${R + 8} ${EY - 12} L${R - 7} ${EY - 16.6}`, 3.8, glow),
    stern: (glow) => haloed(`M${L - 9} ${EY - 16.6} L${L + 7} ${EY - 11}`, 3.8, glow) + haloed(`M${R + 9} ${EY - 16.6} L${R - 7} ${EY - 11}`, 3.8, glow),
    raised: (glow) => haloed(`M${L - 8} ${EY - 16.4} Q${L} ${EY - 20.4} ${L + 8} ${EY - 16.4}`, 3.8, glow) + haloed(`M${R - 8} ${EY - 14} L${R + 8} ${EY - 14}`, 3.8, glow),
    flat: (glow) => haloed(`M${L - 8} ${EY - 14.6} L${L + 8} ${EY - 14.6}`, 3.8, glow) + haloed(`M${R - 8} ${EY - 14.6} L${R + 8} ${EY - 14.6}`, 3.8, glow),
  };

  // Mouths, each on its halo (`glow`: the face's colour there), see `ringed`.
  const GRIN = `<path d="M52 76 Q64 95 76 76 Z"`;
  const SNARL = `<path d="M52.6 87.2 Q53.6 76 64 76 Q74.4 76 75.4 87.2 Q64 82.4 52.6 87.2 Z"`;
  const MOUTHS = {
    smile: (glow) => mouthLine("M54.6 77 Q64 86.6 73.4 77", 3.8, glow),
    small: (glow) => mouthLine("M59 79 Q64 83 69 79", 3.4, glow),
    grin: (glow) =>
      ringed(
        GRIN,
        `${GRIN} fill="${BE.mouth}"/>` +
          `<path d="M57 84.4 Q64 80 71 84.4 Q64 89.4 57 84.4 Z" fill="${BE.tongue}"/>` +
          `${GRIN} fill="none" stroke="${BE.rim}" stroke-width="2.8" stroke-linejoin="round"/>`,
        2.8,
        glow,
      ),
    flat: (glow) => mouthLine("M57 81 L71 81", 3.8, glow),
    short: (glow) => mouthLine("M60 81 L68 81", 3.4, glow),
    wavy: (glow) => mouthLine("M53 82 Q57 78 61 82 T69 82 T77 82", 3.4, glow),
    o: (glow) =>
      ringed(
        `<ellipse cx="64" cy="81.4" rx="5.8" ry="6.8"`,
        `<ellipse cx="64" cy="81.4" rx="5.8" ry="6.8" fill="${BE.mouth}" stroke="${BE.rim}" stroke-width="2.6"/><path d="M60.4 85 Q64 82.4 67.6 85 Q64 87.2 60.4 85 Z" fill="${BE.tongue}"/>`,
        2.6,
        glow,
      ),
    smallO: (glow) =>
      ringed(`<ellipse cx="64" cy="81" rx="3.6" ry="4.3"`, `<ellipse cx="64" cy="81" rx="3.6" ry="4.3" fill="${BE.mouth}" stroke="${BE.rim}" stroke-width="2.2"/>`, 2.2, glow),
    frown: (glow) => mouthLine("M55 84.6 Q64 76 73 84.6", 3.8, glow),
    smirk: (glow) => mouthLine("M56 80 Q66 84 74 76", 3.8, glow),
    // Teeth clenched.
    grit: (glow) =>
      ringed(
        `<rect x="53" y="76" width="22" height="10" rx="4"`,
        `<rect x="53" y="76" width="22" height="10" rx="4" fill="#ffffff" stroke="${BE.rim}" stroke-width="2.6"/>` +
          `<path d="M59.6 76.6 L59.6 85.4 M64 76.6 L64 85.4 M68.4 76.6 L68.4 85.4 M53.6 81 L74.4 81" stroke="${BE.rim}" stroke-width="1.5"/>`,
        2.6,
        glow,
      ),
    // A buzz of anger: open, the corners down, the top teeth showing.
    snarl: (glow) =>
      ringed(
        SNARL,
        `${SNARL} fill="${BE.mouth}"/>` +
          `<path d="M55.4 79.8 Q64 75.4 72.6 79.8 L72 81.6 Q64 78.4 56 81.6 Z" fill="#ffffff"/>` +
          `${SNARL} fill="none" stroke="${BE.rim}" stroke-width="2.6" stroke-linejoin="round"/>`,
        2.6,
        glow,
      ),
    // The tongue out, a little cheeky.
    blep: (glow) =>
      ringed(
        `<path d="M60.4 80.4 L67.6 80.4 L67.6 85 Q64 89.6 60.4 85 Z"`,
        line("M54.6 77.6 Q59.4 82 64 79.6 Q68.6 82 73.4 77.6", 3.4 + HALO, glow) +
          `<path d="M60.4 80.4 L67.6 80.4 L67.6 85 Q64 89.6 60.4 85 Z" fill="${BE.tongue}" stroke="${BE.rim}" stroke-width="2.2" stroke-linejoin="round"/>` +
          `<path d="M64 81.4 L64 85.2" stroke="#e11d48" stroke-width="1.2" stroke-linecap="round"/>` +
          line("M54.6 77.6 Q59.4 82 64 79.6 Q68.6 82 73.4 77.6", 3.4),
        2.2,
        glow,
      ),
  };

  const OWN = {
    // Red in the face: the cheeks themselves go red (see `flushed`), and the anger marks.
    flush: () => {
      // A cross of popping veins up by the corner of the head, red.
      const d = "M90.6 26.6 Q92.6 31.4 89 32.6 M97.4 26.6 Q95.4 31.4 99 32.6 M90.6 40.6 Q92.6 35.8 89 34.6 M97.4 40.6 Q95.4 35.8 99 34.6";
      return line(d, 5.4) + line(d, 2.6, "#ef4444");
    },
    // A drop of sweat off the side of the head, clear of the stripes.
    sweat: () =>
      `<path d="M104 40 C100.4 46.4 98.6 50 101.2 53.6 C103.8 56.4 108.4 54.6 108.4 51 C108.4 48.2 106.6 45.4 104 40 Z" fill="#7dd3fc" stroke="${BE.rim}" stroke-width="2"/>`,
    sweat2: () =>
      OWN.sweat() +
      `<path d="M23.6 45 C20.8 50 19.8 52.8 21.6 55 C23.4 57 26.6 56 26.6 53 C26.6 51 25.6 48.8 23.6 45 Z" fill="#7dd3fc" stroke="${BE.rim}" stroke-width="2"/>`,
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: BE.limb });

  /** A frame of the bee; `eyes` drawn here only when they have no layer. */
  function bee({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.55, arms = [0, 0], flap = 0, feelers = "up", hearts = false, extras = [], stop = false, pale = false }) {
    const [top, bottom] = pale ? ["#eef0b6", "#b9c26a"] : [BE.top, BE.bottom];
    // The halos take the face's colour where they sit (its gradient at the brows' and the mouth's height).
    const glow = { brows: mixHex(top, bottom, 0.24), mouth: mixHex(top, bottom, 0.7) };
    // Pink on yellow reads well: rosy cheeks a little more of it, faint ones
    // less. Flushed, the cheeks go red; still the one pair of cheeks, so a
    // blush on top lands on them.
    const flushed = extras.includes("flush");
    const blush = flushed ? "0.75" : (cheeks >= 0.5 ? Math.min(0.92, cheeks * 1.1) : cheeks * 0.8).toFixed(2);
    const cheek = flushed ? "#ef4444" : BE.cheek;
    // One antenna bent (confused), else both alike.
    const [left, right] = feelers === "bent" ? ["up", "droop"] : [feelers, feelers];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="eb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="el" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BE.limb}"/><stop offset="1" stop-color="${BE.limbDeep}"/></linearGradient><linearGradient id="ea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BE.arm}"/><stop offset="1" stop-color="${BE.armDeep}"/></linearGradient><clipPath id="ec"><rect x="28" y="24" width="72" height="82" rx="${RX}"/></clipPath></defs>
${wings(flap)}${mirror(wings(flap))}
${antenna(left, hearts)}${mirror(antenna(right, hearts))}
${arm(arms[0])}${mirror(arm(arms[1]))}
${STINGER}${FOOT}${mirror(FOOT)}
<rect x="28" y="24" width="72" height="82" rx="${RX}" fill="url(#eb)" stroke="${BE.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#ec)">${STRIPES}</g>
<ellipse cx="41" cy="76" rx="7" ry="4.5" fill="${cheek}" opacity="${blush}"/><ellipse cx="87" cy="76" rx="7" ry="4.5" fill="${cheek}" opacity="${blush}"/>
${BROWS[brows](glow.brows)}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth](glow.mouth)}
${extras.map(extra).join("")}${stop ? stopSign(110, 52) : ""}
</svg>
`;
  }

  // name → art, as Candy's own: every mood its face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.85 },
    // The wings beat in a cheer, the hello and when excited: down, then up.
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.85, arms: [70, 70], feelers: "perk" },
    "celebrate-2.svg": { mouth: "grin", cheeks: 0.85, arms: [105, 105], feelers: "perk", flap: 20 },
    "worried.svg": { brows: "worried", mouth: "wavy", cheeks: 0.3, feelers: "droop", extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.2, feelers: "perk" },
    "sleepy.svg": { eyes: "closed", mouth: "smallO", cheeks: 0.35, feelers: "droop" },
    "alert.svg": { brows: "raised", mouth: "smallO", feelers: "perk" },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, feelers: "droop", extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", cheeks: 0.3, arms: [0, 95], stop: true },
    "confused.svg": { mouth: "wavy", cheeks: 0.3, feelers: "bent" },
    "love.svg": { mouth: "smile", cheeks: 0.95, hearts: true },
    "wave-1.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 95] },
    // Up past the shoulder, the forearm still out from behind the wing.
    "wave-2.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 115], flap: 20 },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.8 },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, feelers: "droop", extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25, feelers: "droop" },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.4 },
    "nervous.svg": { brows: "worried", mouth: "grit", cheeks: 0.3, feelers: "perk", extras: ["sweat2"] },
    "curious.svg": { brows: "raised", mouth: "smallO", feelers: "bent" },
    "angry.svg": { brows: "stern", mouth: "snarl", cheeks: 0, feelers: "perk", extras: ["flush"] },
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, feelers: "perk" },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, feelers: "perk", flap: 20 },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.35, feelers: "bent" },
    "cool.svg": { brows: "raised", mouth: "blep", cheeks: 0.5 },
    "sick.svg": { eyes: "squeeze", brows: "worried", mouth: "wavy", cheeks: 0, feelers: "droop", extras: ["sweat"], pale: true },
  };

  const LAYERS = ["open", "blink", "happy", "wide", "narrow", "sparkle", "worried", "sad", "angry", "hearts", "stars", "dots", "curious", "wink"];
  const eyes = (name, blink) => ({ eyes: `${dir}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${dir}eyes-${blink}.svg` } : {}) });
  const LOOK = {
    idle: { frames: ["idle.svg"], ...eyes("open", "blink") },
    happy: { frames: ["happy.svg"], ...eyes("happy") },
    celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"], ...eyes("stars") },
    worried: { frames: ["worried.svg"], ...eyes("worried", "blink") },
    shocked: { frames: ["shocked.svg"], ...eyes("wide") },
    sleepy: { frames: ["sleepy.svg"] },
    alert: { frames: ["alert.svg"], ...eyes("wide") },
    tired: { frames: ["tired.svg"] },
    stop: { frames: ["stop.svg"], ...eyes("open", "blink") },
    confused: { frames: ["confused.svg"], ...eyes("dots", "blink") },
    love: { frames: ["love.svg"], ...eyes("hearts") },
    wave: { frames: ["wave-1.svg", "wave-2.svg"], ...eyes("happy") },
    proud: { frames: ["proud.svg"] },
    sad: { frames: ["sad.svg"], ...eyes("sad", "blink") },
    bored: { frames: ["bored.svg"] },
    focused: { frames: ["focused.svg"], ...eyes("narrow", "blink") },
    nervous: { frames: ["nervous.svg"], ...eyes("wide") },
    curious: { frames: ["curious.svg"], ...eyes("curious", "blink") },
    angry: { frames: ["angry.svg"], ...eyes("angry") },
    excited: { frames: ["excited-1.svg", "excited-2.svg"], fps: 4, ...eyes("sparkle") },
    relieved: { frames: ["relieved.svg"] },
    dizzy: { frames: ["dizzy.svg"] },
    cool: { frames: ["cool.svg"], ...eyes("wink", "blink") },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, art] of Object.entries(FRAMES)) files[name] = bee(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = bee({ eyes: "open" });
  return { name: "Bee", frames: files, look: LOOK };
}
