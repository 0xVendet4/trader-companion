// Floki: Candy as Floki, the viking shiba. An orange coat, a white muzzle and
// cheeks up to the eyes, black almond eyes with the fox's streaks at their
// corners, a little black nose over a "ω" smile, and the grey viking helmet
// with its ridge and band, two big orange horns sweeping up from its sides.
// Paws under him, a curled tail at his right side that wags when he is
// excited, cheering or waving; he pants when happy, barks when angry, snores
// a bubble asleep and goes sallow when sick.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/floki/. The
// rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is the
// body, in Candy's place (hats and face accessories sit as they do on him);
// the white of the muzzle is clipped to it, so it stays put as skin, while the
// eyes, their streaks, brows, cheeks, nose and mouth turn with the face. The
// helmet is clipped to a box of its own, as wide as a face part may be, so it
// turns with the face too; the nose has a box of its own, so it is read as
// face, not mouth. The horns, arms, feet and tail are behind him.

const FL = {
  top: "#ffb04a",
  bottom: "#f28a14",
  limb: "#f7a23a",
  limbDeep: "#d97b0d",
  rim: "#1a1410",
  ink: "#1a1410",
  white: "#fff8ee",
  whiteShade: "#f1e2cc",
  nose: "#1c1512",
  eye: "#1a1410",
  eyeWhite: "#ffffff",
  mouth: "#4a1420",
  tongue: "#fb7185",
  tongueEdge: "#be123c",
  blush: "#ff8fab",
  domeTop: "#aab1bb",
  domeBottom: "#6f7784",
  ridge: "#cfd5dd",
  band: "#8b929e",
  bandLine: "#b8bfc9",
  horn: "#ffa63a",
  hornLight: "#ffc06e",
  hornShade: "#e4780c",
};

/** The coat's colours by mood: top and bottom. */
const TINT = {
  normal: [FL.top, FL.bottom],
  // Sick: sallow.
  pale: ["#d8c89a", "#b39a5e"],
  // Dim, half asleep.
  dim: ["#e0953a", "#bd6d10"],
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.6, color = FL.ink) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ── Behind the body ──────────────────────────────────────────────────────────

/** The left horn: out of the helmet's side, sweeping out and up to a point; mirrored for the right. */
const HORN =
  `<path d="M42 46 C26 48 9 40 7.4 24 C6.6 15 8.4 7.6 12.6 3.4 C14.6 1.6 17 3.2 16 7.2 C13.6 21 24.6 30.6 42 30.4 Z" fill="url(#fh)" stroke="${FL.rim}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M42 46 C26 48 10.6 41 8.2 28 C13 36 26 41.4 42 40 Z" fill="${FL.hornShade}"/>` +
  `<path d="M11.4 24 Q10.4 14.6 13.4 9" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>`;

/** A paw under the body, three toes; mirrored for the right. */
const FOOT =
  `<ellipse cx="47" cy="108" rx="10" ry="5.6" fill="url(#fl)" stroke="${FL.rim}" stroke-width="2.6"/>` +
  `<path d="M43 108.4 L42.4 112.4 M47 109 L47 113 M51 108.4 L51.6 112.4" stroke="${FL.rim}" stroke-width="1.3" stroke-linecap="round" opacity="0.9"/>`;

/** The tail, curled up at his right side, white underneath; `wag` turns it about its root (98, 92). */
function tail(wag) {
  const d = "M98 92 C110 84 118 94 110 101 C103 106 99 99 104 96";
  const art =
    `<path d="${d}" fill="none" stroke="${FL.rim}" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${FL.limb}" stroke-width="3.8" stroke-linecap="round"/>` +
    `<path d="M109 100.6 C104.6 104.4 101 100 104.4 96.6" fill="none" stroke="${FL.white}" stroke-width="2" stroke-linecap="round"/>`;
  return wag ? `<g transform="rotate(${wag} 98 92)">${art}</g>` : art;
}

/** The left arm, hanging from the shoulder (38, 70), `deg` turned up; mirrored for the right. */
const ARM_D = "M40 68 C32 68 25 75 23 85 C22 91 24 96 28 96.6 C32 97 35 92 36.6 86 C38 80 39 74 41 70 Z";
function arm(deg) {
  const art =
    `<path d="${ARM_D}" fill="url(#fl)" stroke="${FL.rim}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M26.6 92 L25 95.4 M29.4 92.6 L29 96" stroke="${FL.rim}" stroke-width="1.4" stroke-linecap="round"/>`;
  return deg ? `<g transform="rotate(${deg} 38 70)">${art}</g>` : art;
}

/** Where the right paw ends up when the arm turns `deg` up. */
function rightTip(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [26 - 38, 95 - 70];
  return [128 - (38 + dx * Math.cos(a) - dy * Math.sin(a)), 70 + dx * Math.sin(a) + dy * Math.cos(a)];
}

// ── On the head ──────────────────────────────────────────────────────────────

/**
 * The viking helmet: a grey dome with a lighter ridge down its middle and a
 * band along its brim. Clipped to a box as wide as a face part may be
 * (rig.ts), so it turns with the face; the horns, behind the body, stay.
 */
const HELMET =
  `<g clip-path="url(#fcap)">` +
  `<path d="M36 37 C36 9.6 92 9.6 92 37 Z" fill="url(#fd)" stroke="${FL.rim}" stroke-width="3" stroke-linejoin="round"/>` +
  `<path d="M60.6 37 L61.4 13.4 Q64 10.4 66.6 13.4 L67.4 37 Z" fill="${FL.ridge}" stroke="${FL.rim}" stroke-width="1.8" stroke-linejoin="round"/>` +
  `<path d="M46.4 27 Q49.6 19.4 56 16.4" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>` +
  `<rect x="36" y="33.4" width="56" height="8.4" rx="2.6" fill="${FL.band}" stroke="${FL.rim}" stroke-width="2.6"/>` +
  `<path d="M39 36 L89 36" fill="none" stroke="${FL.bandLine}" stroke-width="1.6" stroke-linecap="round"/>` +
  `</g>`;

// ── The face ─────────────────────────────────────────────────────────────────

const pair = (one) => one(L) + one(R);

function heartD(cx, cy, s) {
  return `M${cx} ${f(cy + 6 * s)} C${f(cx - 10 * s)} ${f(cy - s)} ${f(cx - 6 * s)} ${f(cy - 9 * s)} ${cx} ${f(cy - 4 * s)} C${f(cx + 6 * s)} ${f(cy - 9 * s)} ${f(cx + 10 * s)} ${f(cy - s)} ${cx} ${f(cy + 6 * s)} Z`;
}

/** A black almond eye with a big glint up right and a little one down left. */
const almond = (x, rx = 6, ry = 7.4) =>
  `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="${FL.eye}"/>` +
  `<circle cx="${f(x + rx * 0.34)}" cy="${f(EY - ry * 0.38)}" r="${f(rx * 0.36)}" fill="${FL.eyeWhite}"/>` +
  `<circle cx="${f(x - rx * 0.3)}" cy="${f(EY + ry * 0.4)}" r="${f(rx * 0.17)}" fill="${FL.eyeWhite}"/>`;

/** The fox's streaks at the outer corner of each eye, sweeping out and down; on the face, not the eye layer, so they stay through a blink. */
const STREAKS =
  line(`M${L - 6.4} ${EY - 2.4} Q${L - 11.6} ${EY + 0.6} ${L - 12.6} ${EY + 8}`, 2.4) +
  line(`M${L - 5.2} ${EY + 5.4} Q${L - 9.4} ${EY + 8.6} ${L - 10.4} ${EY + 14}`, 2.2) +
  line(`M${R + 6.4} ${EY - 2.4} Q${R + 11.6} ${EY + 0.6} ${R + 12.6} ${EY + 8}`, 2.4) +
  line(`M${R + 5.2} ${EY + 5.4} Q${R + 9.4} ${EY + 8.6} ${R + 10.4} ${EY + 14}`, 2.2);

/** The white of the muzzle and cheeks, up to the eyes with a tuft at each side, orange left down the bridge to the nose. Skin: clipped to the body. */
const WHITE =
  `<g clip-path="url(#fc)" data-melt="over">` +
  `<path d="M26 72 Q29.6 61 36 58.2 Q42.4 55.8 47.6 63.4 Q55.4 69.6 64 78.4 Q72.6 69.6 80.4 63.4 Q85.6 55.8 92 58.2 Q98.4 61 102 72 L102 108 L26 108 Z" fill="${FL.white}"/>` +
  `<path d="M26 100 Q64 112 102 100 L102 108 L26 108 Z" fill="${FL.whiteShade}" opacity="0.7"/>` +
  `</g>`;

/** The nose, a little black triangle with a glint, and the line down to the lip. Clipped to a box of its own, read as face. */
const NOSE =
  `<g clip-path="url(#fnz)">` +
  `<path d="M58.2 76.4 Q64 73.2 69.8 76.4 Q69 82.2 64 84.6 Q59 82.2 58.2 76.4 Z" fill="${FL.nose}" stroke="${FL.nose}" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<ellipse cx="61.4" cy="76.6" rx="1.9" ry="0.9" fill="#ffffff" opacity="0.55"/>` +
  `<path d="M64 84.6 L64 87.6" fill="none" stroke="${FL.ink}" stroke-width="2" stroke-linecap="round"/>` +
  `</g>`;

export default function drawFloki({ mirror, EXTRAS, stopSign, star, INK, dir, wrap }) {
  const EYE = {
    open: pair((x) => almond(x)),
    blink: pair((x) => line(`M${x - 6.4} ${EY + 1.2} Q${x} ${EY + 6} ${x + 6.4} ${EY + 1.2}`, 3.4)),
    happy: pair((x) => line(`M${x - 6.6} ${EY + 3} Q${x} ${EY - 6.6} ${x + 6.6} ${EY + 3}`, 4)),
    wide: pair(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="8.4" fill="${FL.eye}"/>` +
        `<circle cx="${x + 2.6}" cy="${EY - 3}" r="2.8" fill="${FL.eyeWhite}"/><circle cx="${x - 2.2}" cy="${EY + 3.2}" r="1.3" fill="${FL.eyeWhite}"/>`,
    ),
    // Lids half down: steady.
    narrow: pair(
      (x) =>
        `<path d="M${x - 6.2} ${EY - 1} L${x + 6.2} ${EY - 1} Q${x + 6} ${EY + 7.4} ${x} ${EY + 7.4} Q${x - 6} ${EY + 7.4} ${x - 6.2} ${EY - 1} Z" fill="${FL.eye}"/>` +
        `<circle cx="${x + 2}" cy="${EY + 1.6}" r="1.7" fill="${FL.eyeWhite}"/>` +
        line(`M${x - 7.4} ${EY - 1.4} L${x + 7.4} ${EY - 1.4}`, 3),
    ),
    sparkle: pair(
      (x) =>
        almond(x, 6.6, 8.2) +
        `<path d="M${x - 2.8} ${EY - 5.6} l0.9 2.3 2.3 0.9 -2.3 0.9 -0.9 2.3 -0.9 -2.3 -2.3 -0.9 2.3 -0.9 Z" fill="${FL.eyeWhite}"/>`,
    ),
    hearts: pair((x) => `<path d="${heartD(x, EY + 1, 1.08)}" fill="#fb7185" stroke="${FL.eye}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${x - 3.2}" cy="${EY - 2.4}" r="1.5" fill="#ffffff" opacity="0.85"/>`),
    stars: (star(L, EY, 9.6) + star(R, EY, 9.6)).replaceAll(INK, FL.eye),
    // Lost: two little dots.
    dots: pair((x) => `<circle cx="${x}" cy="${EY + 0.6}" r="2.8" fill="${FL.eye}"/>`),
    // A wink: the left eye open, the right one shut in a happy arc.
    wink: almond(L) + line(`M${R - 6.6} ${EY + 3} Q${R} ${EY - 6.6} ${R + 6.6} ${EY + 3}`, 4),
    // No layer: in the frame.
    closed: pair((x) => line(`M${x - 6.4} ${EY - 0.6} Q${x} ${EY + 5.8} ${x + 6.4} ${EY - 0.6}`, 3.6)),
    half: pair(
      (x) =>
        `<path d="M${x - 6} ${EY + 1} A6 7 0 0 0 ${x + 6} ${EY + 1} Z" fill="${FL.eye}"/>` +
        `<circle cx="${x + 1.8}" cy="${EY + 3}" r="1.4" fill="${FL.eyeWhite}"/>` +
        line(`M${x - 7.2} ${EY + 1} L${x + 7.2} ${EY + 1}`, 3),
    ),
    smug: pair((x) => line(`M${x - 7} ${EY + 2.5} Q${x} ${EY - 4} ${x + 7} ${EY + 2.5}`, 4.2)),
    spiral: pair((x) => line(`M${x} ${EY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7 7 0 1 1 -14 0`, 2.5)),
  };

  // Candy's brows, for the moods; none at rest.
  const BROWS = {
    none: "",
    worried: line(`M${L - 7} ${EY - 10} L${L + 7} ${EY - 15}`) + line(`M${R + 7} ${EY - 10} L${R - 7} ${EY - 15}`),
    stern: line(`M${L - 8} ${EY - 14.5} L${L + 7} ${EY - 9}`) + line(`M${R + 8} ${EY - 14.5} L${R - 7} ${EY - 9}`),
    raised: line(`M${L - 7} ${EY - 15} Q${L} ${EY - 19.5} ${L + 7} ${EY - 15}`) + line(`M${R - 7} ${EY - 12.5} L${R + 7} ${EY - 12.5}`),
    flat: line(`M${L - 7} ${EY - 13} L${L + 7} ${EY - 13}`) + line(`M${R - 7} ${EY - 13} L${R + 7} ${EY - 13}`),
  };

  const lip = (d, w = 2.8) => line(d, w, FL.ink);
  /** An open mouth: dark inside, the tongue in it. */
  const open = (d, tongue) =>
    `<path d="${d}" fill="${FL.mouth}" stroke="${FL.ink}" stroke-width="2.4" stroke-linejoin="round"/>` + (tongue ? `<path d="${tongue}" fill="${FL.tongue}"/>` : "");
  const MOUTHS = {
    // The "ω" smile.
    smile: lip("M55 88 Q59.5 93.8 64 89 Q68.5 93.8 73 88"),
    small: lip("M59.6 88.6 Q62 91.2 64 88.6 Q66 91.2 68.4 88.6", 2.6),
    // Panting: wide open, the tongue lolling.
    grin: open("M54.4 87 Q64 102 73.6 87 Q64 90 54.4 87 Z", "M58.6 91.4 Q64 88.8 69.4 91.4 Q64 99 58.6 91.4 Z"),
    o: `<ellipse cx="64" cy="91" rx="3.9" ry="4.1" fill="${FL.mouth}" stroke="${FL.ink}" stroke-width="2.4"/>`,
    smallO: `<ellipse cx="64" cy="90.6" rx="2.6" ry="2.9" fill="${FL.mouth}" stroke="${FL.ink}" stroke-width="2.2"/>`,
    flat: lip("M57.6 89.6 L70.4 89.6"),
    short: lip("M60 89.4 L68 89.4", 2.6),
    wavy: lip("M55.4 90 Q58.6 87.4 61.8 90 T68.2 90 T74.6 90", 2.6),
    frown: lip("M57 93 Q60.5 88 64 88 Q67.5 88 71 93"),
    smirk: lip("M57.6 89 Q65 92.6 71.6 87"),
    // Chattering teeth.
    chatter: lip("M56 88 L58.4 86.2 L60.8 88.4 L63.2 86.2 L65.6 88.4 L68 86.2 L70.4 88.4 L72.4 86.6", 2.4) + lip("M57.2 91.2 L70.8 91.2", 2.2),
    // A bark: wide open, two little teeth.
    bark:
      open("M54 86.6 Q64 104 74 86.6 Q64 90.6 54 86.6 Z", "M59 94.4 Q64 92 69 94.4 Q64 100.4 59 94.4 Z") +
      `<path d="M57.6 88.2 L59.4 92 L61.2 88.4 Z M66.8 88.4 L68.6 92 L70.4 88.2 Z" fill="#ffffff"/>`,
    // Asleep: a bubble out of the nose.
    bubble:
      lip("M59.6 89.2 Q62 91.6 64 89.2 Q66 91.6 68.4 89.2", 2.6) +
      `<circle cx="75" cy="84.6" r="5" fill="#bfdbfe" fill-opacity="0.75" stroke="#60a5fa" stroke-width="1.5"/><circle cx="73.2" cy="82.8" r="1.4" fill="#ffffff"/>`,
  };

  const drop = (d) => `<path d="${d}" fill="#7dd3fc" stroke="${FL.rim}" stroke-width="2"/>`;
  const OWN = {
    // Beside the body on the right, under the horn (which reaches y 46 at the body's edge) and clear of the outline (x 102.5).
    sweat: () => drop("M109 50 C105.4 56.6 103.8 60.4 104.6 63.4 C105.6 67 111.4 67.6 113.2 64 C114.4 61.4 112.8 57.4 109 50 Z"),
    sweat2: () =>
      drop("M109 50 C105.4 56.6 103.8 60.4 104.6 63.4 C105.6 67 111.4 67.6 113.2 64 C114.4 61.4 112.8 57.4 109 50 Z") +
      drop("M118 72 C115 77 114 80 116 82 C118 84 121 83 121 80 C121 78 120 76 118 72 Z"),
    tear: () => `<path d="M44.4 72 C41.4 78 41.4 81 44.4 82 C47.4 81 47.4 78 44.4 72 Z" fill="#7dd3fc" stroke="${FL.rim}" stroke-width="1.6"/>`,
    // Anger marks beside the head on the right, under the horn, red.
    flush: () => line("M104 50 L110.5 46.5 M106 57 L113 55.5 M103.5 63.5 L110.5 64", 2.8, "#ef4444"),
    // Brrr: a shiver down his left side, under the horn.
    shiver: () => line("M13.4 56 Q10.2 61 13.4 66 Q16.6 71 13.4 76", 2.4, "#bfdbfe") + line("M7.6 60 Q5.4 64 7.6 68", 2.2, "#bfdbfe"),
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: FL.limb });

  /**
   * A frame of Floki; `eyes` drawn here only when they have no layer.
   * `arms`: how far each arm turns up; `wag`: the tail turned.
   */
  function floki({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.5, arms = [0, 0], wag = 0, tint = "normal", extras = [], stop = false }) {
    const [top, bottom] = TINT[tint];
    const flushed = extras.includes("flush");
    const blush = flushed ? 0.75 : cheeks;
    const cheek = flushed ? "#ef4444" : FL.blush;
    let sign = "";
    if (stop) {
      const [tx, ty] = rightTip(arms[1]).map((n) => +n.toFixed(1));
      sign = stopSign(+(tx - 2).toFixed(1), +(ty + 1).toFixed(1));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="fb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FL.limb}"/><stop offset="1" stop-color="${FL.limbDeep}"/></linearGradient><linearGradient id="fh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${FL.hornLight}"/><stop offset="1" stop-color="${FL.horn}"/></linearGradient><linearGradient id="fd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FL.domeTop}"/><stop offset="1" stop-color="${FL.domeBottom}"/></linearGradient><clipPath id="fc"><rect x="28" y="24" width="72" height="82" rx="27" ry="29"/></clipPath><clipPath id="fcap"><rect x="35.5" y="0" width="57" height="48.4"/></clipPath><clipPath id="fnz"><rect x="44" y="50" width="40" height="46"/></clipPath></defs>
${HORN}${mirror(HORN)}
${tail(wag)}
${arm(arms[0])}${mirror(arm(arms[1]))}
${FOOT}${mirror(FOOT)}
<rect x="28" y="24" width="72" height="82" rx="27" ry="29" fill="url(#fb)" stroke="${FL.rim}" stroke-width="5" paint-order="stroke"/>
${WHITE}
<g clip-path="url(#fc)" data-melt="over">
<ellipse cx="47" cy="34" rx="12" ry="5.5" transform="rotate(-24 47 34)" fill="#ffffff" opacity="0.16"/>
</g>
<ellipse cx="41.6" cy="74.6" rx="6.4" ry="4" fill="${cheek}" opacity="${blush}"/><ellipse cx="86.4" cy="74.6" rx="6.4" ry="4" fill="${cheek}" opacity="${blush}"/>
${STREAKS}
${NOSE}
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}
${HELMET}
${extras.map(extra).join("")}${sign}
</svg>
`;
  }

  // name → art, every mood its own face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.8 },
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.8, arms: [70, 70], wag: -18 },
    "celebrate-2.svg": { mouth: "bark", cheeks: 0.8, arms: [106, 106] },
    "worried.svg": { brows: "worried", mouth: "wavy", cheeks: 0.35, extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.25, arms: [28, 28] },
    "sleepy.svg": { eyes: "closed", mouth: "bubble", cheeks: 0.35, tint: "dim" },
    "alert.svg": { mouth: "smallO", cheeks: 0.4 },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, tint: "dim", extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", cheeks: 0.4, arms: [0, 95], stop: true },
    "confused.svg": { mouth: "wavy", cheeks: 0.35 },
    "love.svg": { mouth: "smile", cheeks: 0.95 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 78], wag: -18 },
    "wave-2.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 114] },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.75, arms: [12, 12] },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.35 },
    "nervous.svg": { brows: "worried", mouth: "chatter", cheeks: 0.3, extras: ["sweat2", "shiver"] },
    "curious.svg": { brows: "raised", mouth: "smallO", cheeks: 0.5 },
    "angry.svg": { brows: "stern", mouth: "bark", extras: ["flush"] },
    // Bouncing, the tail wagging: two frames.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, arms: [30, 30], wag: -18 },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, arms: [62, 62] },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.35 },
    "cool.svg": { mouth: "smirk", cheeks: 0.55 },
    "sick.svg": { eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, tint: "pale", extras: ["sweat"] },
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
  for (const [name, art] of Object.entries(FRAMES)) files[name] = floki(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = floki({ eyes: "open" });
  // His mouth sits lower than Candy's: what is held in it goes down with it (mascot.json → mouthDrop).
  return { name: "Floki", frames: files, look: LOOK, mouthDrop: 7 };
}
