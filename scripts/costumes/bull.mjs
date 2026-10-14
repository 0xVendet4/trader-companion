// Bull: Candy as the market's green bull. A sturdy green body, ivory horns
// curving up from the top of the head with dark tips, little ears under them,
// a curly tuft between them, a pale snout with two nostrils wide apart and a
// gold ring hanging between and under them, hooves for hands and feet. He
// snorts steam when angry and paws the ground when excited.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/bull/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the body, Candy's own (so hats and face accessories sit where they do on
// him); the belly and the shine are clipped to it, so they stay put as skin;
// the snout, its nostrils and the ring are clipped to a box around the face,
// so they turn with it as one piece (and are not taken for the mouth, which
// hides while he swallows: the box is under 49 tall and its middle no lower
// than y 73.2, or the rig reads it as skin or as mouth); the eyes are layers.
// The mouth sits low on the snout: opened wide (a link held over him), it
// opens under the nostrils, which stay in sight (rig.test.ts).

const BU = {
  top: "#84e8a8",
  bottom: "#168043",
  limb: "#3dbb6b",
  limbDeep: "#14703a",
  rim: "#06140b",
  tuft: "#11612f",
  tuftLight: "#3aa463",
  snoutTop: "#e2fbe9",
  snoutBottom: "#a7e5be",
  nostril: "#0b3a1e",
  hornTop: "#fffbef",
  horn: "#ead8ae",
  hornTip: "#9c8358",
  ear: "#f4a6b8",
  hoofTop: "#56606e",
  hoof: "#1f2630",
  ring: "#facc15",
  ringDeep: "#b7791f",
  mouth: "#4a1420",
  tongue: "#fb7185",
  belly: "#d5f7df",
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.8, color = BU.rim) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** The left horn: out from the top corner of the head, curving up to a point. */
const HORN_D = "M35 45 C20 45 8.6 35 9.8 10.4 Q10.6 6.6 13.4 9.6 C15.2 24 25.6 30.6 43 29.6 Z";
const HORN =
  `<path d="${HORN_D}" fill="url(#bh)" stroke="${BU.rim}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
  `<g clip-path="url(#bk)"><path d="M0 0 L30 0 L30 15.4 Q16 21 0 18.4 Z" fill="${BU.hornTip}"/>` +
  `<path d="M15.6 34.4 Q21 40.2 30 40.8" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/></g>` +
  `<path d="M11.6 22.6 Q14.6 23.4 16.4 21 M13.6 30.4 Q17.6 31 19.6 27.8" fill="none" stroke="#c9b17f" stroke-width="1.6" stroke-linecap="round"/>`;

/** A little ear under the horn, pink inside. */
const EAR =
  `<path d="M33 50.6 Q20.4 53.4 12.6 46.4 Q19.6 39.2 32 41.6 Z" fill="url(#bl)" stroke="${BU.rim}" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M30 48.2 Q22.4 49.6 17.6 46.4 Q22.4 43 30 44 Z" fill="${BU.ear}"/>`;

/** The curly tuft between the horns, over where Candy's wick would be. */
const TUFT =
  `<path d="M48.6 31 C45.4 24.6 49.6 18.6 55.6 20.4 C55.4 13 61.4 9.4 64 12.6 C66.6 9.4 72.6 13 72.4 20.4 C78.4 18.6 82.6 24.6 79.4 31 Z" fill="${BU.tuft}" stroke="${BU.rim}" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M54.6 25.4 Q57.4 22.6 60.6 24.6 M63.8 18 Q66 15.6 68.6 17.4 M67.4 25.6 Q70.6 22.8 73.6 25" fill="none" stroke="${BU.tuftLight}" stroke-width="1.8" stroke-linecap="round"/>`;

/** A hoof, pointing down from (19.5, 91): dark, split at the tip, a shine. */
const HAND_HOOF =
  `<path d="M14.2 90.6 Q19.5 89 24.8 90.6 L25.8 97.6 Q25.9 99.9 23.6 100 L21.2 100 L19.5 97.2 L17.8 100 L15.4 100 Q13.1 99.9 13.2 97.6 Z" fill="url(#bf)" stroke="${BU.rim}" stroke-width="2.2" stroke-linejoin="round"/>` +
  `<path d="M15.8 92.6 L16.2 96.4" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>` +
  `<ellipse cx="19.5" cy="90.4" rx="6" ry="2.6" fill="${BU.limb}" stroke="${BU.rim}" stroke-width="2"/>`;

/** An arm from the shoulder (31, 70), turned `deg` up, ending in a hoof. */
function arm(deg) {
  const art =
    `<path d="M31 70 L19.5 89.6" stroke="${BU.rim}" stroke-width="10.6" stroke-linecap="round"/>` +
    `<path d="M31 70 L19.5 89.6" stroke="${BU.limb}" stroke-width="6" stroke-linecap="round"/>` +
    `<g transform="rotate(30.4 19.5 90)">${HAND_HOOF}</g>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}

/** Where the right hand ends up when its arm turns `deg` up. */
function rightHand(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [19.5 - 31, 95 - 70];
  return [128 - (31 + dx * Math.cos(a) - dy * Math.sin(a)), 70 + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** A short green leg on a split hoof; `lift` raises it (pawing the ground). */
function foot(lift = 0) {
  const art =
    `<path d="M42 100 L42 107" stroke="${BU.rim}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M42 100 L42 107" stroke="${BU.limb}" stroke-width="4.4" stroke-linecap="round"/>` +
    `<path d="M33.2 108 Q42 105.6 50.8 108 L52.4 116.4 Q52.7 119 50 119 L45.4 119 L42 115.2 L38.6 119 L34 119 Q31.3 119 31.6 116.4 Z" fill="url(#bf)" stroke="${BU.rim}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="M35.6 110.6 L35 115.4" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" opacity="0.45"/>` +
    `<ellipse cx="42" cy="107.6" rx="10" ry="3.2" fill="${BU.limb}" stroke="${BU.rim}" stroke-width="2.2"/>`;
  // Up and a little out, the toe tipped up: pawing.
  return lift ? `<g transform="translate(-2 ${-lift}) rotate(-14 34 118)">${art}</g>` : art;
}

/** A little cloud of dust where a hoof comes down. */
const dust = (x, y, s = 1) =>
  `<path d="M${x - 5 * s} ${y} q${-1 * s} ${-4 * s} ${3 * s} ${-4.4 * s} q${1.6 * s} ${-3.4 * s} ${5 * s} ${-1.6 * s} q${3.6 * s} ${-0.6 * s} ${3.6 * s} ${3 * s} q${2.6 * s} ${1.6 * s} ${0.4 * s} ${3 * s} Z" fill="#e7e5e4" stroke="${BU.rim}" stroke-width="1.5" stroke-linejoin="round" opacity="0.92"/>`;

/**
 * One eye: white, a pupil and a glint; `lid` [outer y, inner y] keeps only
 * what is below a lid. `side`: 1 for the left eye (its inner side is to the
 * right), −1 for the right one.
 */
function eye(x, id, side, { rx = 7.2, ry = 9, pr = [4.2, 5.4], pupil = [0.6, 1.2], glints = [[1.9, -1.8, 1.7]], lid = null }) {
  const sclera = `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${BU.rim}" stroke-width="2.4"/>`;
  const px = x + pupil[0];
  const inner =
    sclera +
    `<ellipse cx="${f(px)}" cy="${f(EY + pupil[1])}" rx="${pr[0]}" ry="${pr[1]}" fill="${BU.rim}"/>` +
    glints.map(([gx, gy, r]) => `<circle cx="${f(px + gx)}" cy="${f(EY + pupil[1] + gy)}" r="${r}" fill="#ffffff"/>`).join("");
  if (!lid) return inner;
  // The lid: a line from the outer side (y a) to the inner (y b), 12 either side of the eye.
  const [a, b] = lid;
  const [la, lb] = side < 0 ? [b, a] : [a, b]; // left to right
  const at = (t) => la + (lb - la) * t; // t from 0 (x−12) to 1 (x+12)
  return (
    `<clipPath id="${id}"><path d="M${x - 12} ${la} L${x + 12} ${lb} L${x + 12} ${EY + 14} L${x - 12} ${EY + 14} Z"/></clipPath>` +
    `<g clip-path="url(#${id})">${inner}</g>` +
    line(`M${f(x - rx - 1.4)} ${f(at((12 - rx - 1.4) / 24))} L${f(x + rx + 1.4)} ${f(at((12 + rx + 1.4) / 24))}`, 3.6)
  );
}

export default function drawBull({ mirror, EXTRAS, stopSign, EYES, INK, dir, wrap }) {
  /** Candy's own eye art, in the bull's ink. */
  const ink = (s) => s.replaceAll(INK, BU.rim);
  const pair = (one) => one(L, "l", 1) + one(R, "r", -1);

  const EYE = {
    open: pair((x, s, side) => eye(x, `o${s}`, side, {})),
    blink: pair((x) => line(`M${x - 7.4} ${EY + 1} Q${x} ${EY + 6} ${x + 7.4} ${EY + 1}`, 3.4)),
    happy: pair((x) => line(`M${x - 7.2} ${EY + 3} Q${x} ${EY - 7.5} ${x + 7.2} ${EY + 3}`, 4)),
    wide: pair((x, s, side) => eye(x, `w${s}`, side, { rx: 9.2, ry: 10.4, pr: [3, 3.4], pupil: [0, 0.6], glints: [[1.3, -1.5, 1.2]] })),
    // Lids half down: steady, a bull eyeing the chart.
    narrow: pair((x, s, side) => eye(x, `n${s}`, side, { lid: [EY - 2.6, EY - 2.6], pupil: [0.6, 2.4] })),
    // Lids down to the middle: a charging bull.
    angry: pair((x, s, side) => eye(x, `a${s}`, side, { lid: [EY - 9, EY - 0.6], pupil: [1.4, 2] })),
    // Lids down to the outside, pupils up.
    worried: pair((x, s, side) => eye(x, `u${s}`, side, { lid: [EY - 1.6, EY - 8.6], pupil: [-0.4, 1.6], glints: [[1.7, -1.6, 1.5], [-1.6, 2.4, 0.9]] })),
    // Lids flat and lazy, looking aside: too cool to care.
    cool: pair((x, s, side) => eye(x, `c${s}`, side, { lid: [EY - 0.4, EY - 0.4], pupil: [2.4, 2.8], pr: [3.8, 4.8] })),
    sparkle: pair((x, s, side) => eye(x, `s${s}`, side, { rx: 7.8, ry: 9.6, pr: [5.2, 6.8], pupil: [0.4, 0.8], glints: [[2.1, -2.4, 2.4], [-2, 3, 1.3]] })),
    hearts: ink(EYES.hearts),
    stars: ink(EYES.stars),
    dots: ink(EYES.dots),
    // No layer: in the frame.
    closed: ink(EYES.closed),
    half: pair((x, s, side) => eye(x, `h${s}`, side, { lid: [EY + 1, EY + 1], pupil: [0.6, 3] })),
    smug: ink(EYES.smug),
    spiral: ink(EYES.spiral),
  };

  // Heavy brows: a bull's forehead.
  const BROWS = {
    none: "",
    worried: line(`M${L - 8} ${EY - 12} L${L + 7} ${EY - 17}`, 4.4) + line(`M${R + 8} ${EY - 12} L${R - 7} ${EY - 17}`, 4.4),
    stern: line(`M${L - 9} ${EY - 17.5} L${L + 7} ${EY - 11}`, 4.6) + line(`M${R + 9} ${EY - 17.5} L${R - 7} ${EY - 11}`, 4.6),
    raised: line(`M${L - 8} ${EY - 19} Q${L} ${EY - 24} ${L + 8} ${EY - 19}`, 4.2) + line(`M${R - 8} ${EY - 14.5} L${R + 8} ${EY - 14.5}`, 4.2),
    flat: line(`M${L - 8} ${EY - 15} L${L + 8} ${EY - 15}`, 4.2) + line(`M${R - 8} ${EY - 15} L${R + 8} ${EY - 15}`, 4.2),
  };

  // Low on the snout, under the ring (centre 64, between y 87 and 95): opened
  // wide (a link held over him), the mouth opens under the nostrils.
  const MOUTHS = {
    smile: line("M54.4 88.4 Q64 95.2 73.6 88.4", 3.4),
    small: line("M58.6 89.4 Q64 92.8 69.4 89.4", 3.2),
    grin:
      `<path d="M53.4 86.6 Q64 99.8 74.6 86.6 Z" fill="${BU.mouth}"/>` +
      `<path d="M57.8 91.2 Q64 88 70.2 91.2 Q64 94.4 57.8 91.2 Z" fill="${BU.tongue}"/>` +
      `<path d="M53.4 86.6 Q64 99.8 74.6 86.6 Z" fill="none" stroke="${BU.rim}" stroke-width="2.8" stroke-linejoin="round"/>`,
    flat: line("M56.6 90.4 L71.4 90.4", 3.4),
    short: line("M59.4 90.4 L68.6 90.4", 3.2),
    wavy: line("M53.6 90.6 Q57 88 60.4 90.6 T67.2 90.6 T74 90.6", 3),
    o: `<ellipse cx="64" cy="91.4" rx="4.4" ry="2.8" fill="${BU.mouth}" stroke="${BU.rim}" stroke-width="2.6"/>`,
    smallO: `<ellipse cx="64" cy="91" rx="2.8" ry="2.9" fill="${BU.mouth}" stroke="${BU.rim}" stroke-width="2.2"/>`,
    frown: line("M55.4 93.8 Q64 87.6 72.6 93.8", 3.4),
    smirk: line("M56 90.4 Q66 93.6 73.4 87.6", 3.4),
    // Teeth clenched, square: a bull's bite.
    grit:
      `<rect x="54.4" y="88" width="19.2" height="6" rx="2.6" fill="#ffffff" stroke="${BU.rim}" stroke-width="2.4"/>` +
      `<path d="M59.2 88 L59.2 94 M64 88 L64 94 M68.8 88 L68.8 94 M54.4 91 L73.6 91" stroke="${BU.rim}" stroke-width="1.3"/>`,
  };

  /** Steam snorted out of both nostrils, down and out. */
  const snort = () => {
    const one =
      `<path d="M80.4 86.6 L83.4 89.4 M83 82.4 L87 84.4" stroke="${BU.rim}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="M82 92.4 q-1.4 -5.6 4.4 -6.4 q1.6 -5.2 7.4 -3.4 q5.4 -1.6 6.6 3.6 q4.8 1.6 2.6 6.2 q-1 4.4 -6.2 3.6 q-3.4 3.4 -8 1 q-5.8 0.8 -6.8 -4.6 Z" fill="#f1f5f9" stroke="${BU.rim}" stroke-width="1.8" stroke-linejoin="round"/>` +
      `<path d="M88.4 88.6 Q91.6 87.6 93.6 89.6" fill="none" stroke="#cbd5e1" stroke-width="1.4" stroke-linecap="round"/>`;
    return one + mirror(one);
  };
  const OWN = {
    snort,
    // Red in the face: the cheeks themselves go red (see `flushed`), and the anger marks.
    flush: () => `<path d="M89 34.6 L95 30 M92.4 41 L99.4 39.4" stroke="${BU.rim}" stroke-width="2.6" stroke-linecap="round"/>`,
    // A tear rolling past the snout.
    tear: () =>
      `<path d="M${L - 5} ${EY + 9} C${L - 8} ${EY + 15} ${L - 8} ${EY + 18} ${L - 5} ${EY + 19} C${L - 2} ${EY + 18} ${L - 2} ${EY + 15} ${L - 5} ${EY + 9} Z" fill="#7dd3fc" stroke="${BU.rim}" stroke-width="1.5"/>`,
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: BU.limb });

  /** A frame of the bull; `eyes` drawn here only when they have no layer. */
  function bull({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.55, arms = [0, 0], extras = [], stop = false, pale = false, paw = 0 }) {
    const [top, bottom] = pale ? ["#c6dccb", "#7d9a86"] : [BU.top, BU.bottom];
    // As on the dinosaur: pink half-seen over green reads muddy, so rosy
    // cheeks get a little more of it and faint ones less; flushed, they go red.
    const flushed = extras.includes("flush");
    const blush = flushed ? "0.8" : (cheeks >= 0.5 ? Math.min(0.92, cheeks * 1.15) : cheeks * 0.75).toFixed(2);
    const cheek = flushed ? "#ef4444" : "#ff8fab";
    let sign = "";
    if (stop) {
      const [hx, hy] = rightHand(arms[1]).map((n) => +n.toFixed(1));
      sign = stopSign(+(hx - 8).toFixed(1), +(hy - 4).toFixed(1));
    }
    // Pawing the ground: the left hoof up (1), or down in a puff of dust (2).
    const feet = (paw === 1 ? foot(6) : foot()) + mirror(foot());
    const dusty = paw === 2 ? dust(26, 120, 1.25) + dust(57, 120.6, 1.05) : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="bb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BU.limb}"/><stop offset="1" stop-color="${BU.limbDeep}"/></linearGradient><linearGradient id="bh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BU.hornTop}"/><stop offset="1" stop-color="${BU.horn}"/></linearGradient><linearGradient id="bn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BU.snoutTop}"/><stop offset="1" stop-color="${BU.snoutBottom}"/></linearGradient><linearGradient id="bf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BU.hoofTop}"/><stop offset="1" stop-color="${BU.hoof}"/></linearGradient><clipPath id="bc"><rect x="28" y="24" width="72" height="82" rx="22"/></clipPath><clipPath id="bk"><path d="${HORN_D}"/></clipPath><clipPath id="bs"><rect x="40" y="48.6" width="48" height="49"/></clipPath></defs>
${HORN}${mirror(HORN)}${EAR}${mirror(EAR)}${TUFT}
${arm(arms[0])}${mirror(arm(arms[1]))}
${feet}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#bb)" stroke="${BU.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#bc)">
<ellipse cx="45" cy="34" rx="12" ry="5.5" fill="#ffffff" opacity="0.16" transform="rotate(-22 45 34)"/>
<ellipse cx="64" cy="114" rx="24" ry="14" fill="${BU.belly}" opacity="0.45"/>
</g>
<ellipse cx="39.6" cy="75" rx="5.6" ry="3.6" fill="${cheek}" opacity="${blush}"/><ellipse cx="88.4" cy="75" rx="5.6" ry="3.6" fill="${cheek}" opacity="${blush}"/>
<g clip-path="url(#bs)">
<ellipse cx="64" cy="82.8" rx="19" ry="13.2" fill="url(#bn)" stroke="${BU.rim}" stroke-width="3"/>
<path d="M56.6 73.4 Q60.4 71.4 65 71.4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
<ellipse cx="53.2" cy="76.6" rx="2.5" ry="3.1" fill="${BU.nostril}"/><ellipse cx="74.8" cy="76.6" rx="2.5" ry="3.1" fill="${BU.nostril}"/>
</g>
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}
<g clip-path="url(#bs)">
<circle cx="64" cy="82.6" r="3.5" fill="none" stroke="${BU.rim}" stroke-width="3.6"/>
<circle cx="64" cy="82.6" r="3.5" fill="none" stroke="${BU.ring}" stroke-width="1.8"/>
<path d="M60.9 81.4 Q61.3 79.8 62.8 79.3" fill="none" stroke="#fef9c3" stroke-width="1" stroke-linecap="round"/>
</g>
${dusty}${extras.map(extra).join("")}${sign}
</svg>
`;
  }

  // name → art, as Candy's own: every mood its face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.85 },
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.85, arms: [70, 70] },
    "celebrate-2.svg": { mouth: "grin", cheeks: 0.85, arms: [105, 105] },
    "worried.svg": { brows: "worried", mouth: "wavy", extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.2 },
    "sleepy.svg": { eyes: "closed", mouth: "smallO", cheeks: 0.35 },
    "alert.svg": { mouth: "smallO" },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", arms: [0, 95], stop: true },
    "confused.svg": { brows: "raised", mouth: "wavy", cheeks: 0.3 },
    "love.svg": { mouth: "smile", cheeks: 0.9 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 95] },
    "wave-2.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 130] },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.8 },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.4 },
    "nervous.svg": { brows: "worried", mouth: "grit", cheeks: 0.3, extras: ["sweat2"] },
    "curious.svg": { brows: "raised", mouth: "smallO" },
    "angry.svg": { brows: "stern", mouth: "grit", cheeks: 0, extras: ["flush", "snort"] },
    // Pawing the ground: hoof up, then down in a puff of dust.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, paw: 1 },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, paw: 2 },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.35 },
    "cool.svg": { mouth: "smirk", cheeks: 0.45 },
    "sick.svg": { eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, extras: ["sweat"], pale: true },
  };

  const LAYERS = ["open", "blink", "happy", "wide", "narrow", "angry", "worried", "cool", "sparkle", "hearts", "stars", "dots"];
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
    stop: { frames: ["stop.svg"], ...eyes("angry", "blink") },
    confused: { frames: ["confused.svg"], ...eyes("dots") },
    love: { frames: ["love.svg"], ...eyes("hearts") },
    wave: { frames: ["wave-1.svg", "wave-2.svg"], ...eyes("happy") },
    proud: { frames: ["proud.svg"] },
    sad: { frames: ["sad.svg"], ...eyes("worried", "blink") },
    bored: { frames: ["bored.svg"] },
    focused: { frames: ["focused.svg"], ...eyes("narrow", "blink") },
    nervous: { frames: ["nervous.svg"], ...eyes("wide") },
    curious: { frames: ["curious.svg"], ...eyes("open", "blink") },
    angry: { frames: ["angry.svg"], ...eyes("angry") },
    excited: { frames: ["excited-1.svg", "excited-2.svg"], fps: 4, ...eyes("sparkle") },
    relieved: { frames: ["relieved.svg"] },
    dizzy: { frames: ["dizzy.svg"] },
    cool: { frames: ["cool.svg"], ...eyes("cool", "blink") },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, art] of Object.entries(FRAMES)) files[name] = bull(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = bull({ eyes: "open" });
  // The mouth sits 8 lower than Candy's, on the snout: what he holds in it
  // (a pacifier, a rose) or wears under it (a bow tie) goes down as far.
  return { name: "Bull", frames: files, look: LOOK, mouthDrop: 8 };
}
