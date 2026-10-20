// Pug: Candy as a little black pug, a rainbow propeller beanie on his head and
// a rainbow swirl lollipop in his paw. A dark warm grey body (black would sink
// into the island's black), a black muzzle with a wide nose and the tongue
// out, big glossy eyes, wrinkles on the forehead, floppy ears, a curly tail
// and paws under him. The propeller spins when he is excited, cheering or
// waving; the lollipop goes up when he is proud or cheering; he pants when
// happy, barks when angry, snores a bubble asleep and goes grey-green when
// sick.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/pug/. The
// rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is the
// body, in Candy's place (hats and face accessories sit as they do on him);
// the sheen on his coat is clipped to it, so it stays put as skin, while the
// eyes, brows, cheeks, muzzle and mouth turn with the face. The beanie and the
// muzzle are each clipped to a box of their own, as wide as a face part may
// be, so they turn with the face too, propeller and all. The ears, arms, feet
// and tail are behind him; the lollipop, its stick and the paw holding it are
// in front, beside him.

const PU = {
  top: "#5f545b",
  bottom: "#2b2428",
  limb: "#6b5f67",
  limbDeep: "#3b3238",
  ear: "#3a3036",
  earDeep: "#1c1619",
  sheen: "#8a7d85",
  rim: "#0a0708",
  // Line art on a dark face: light, like chalk.
  ink: "#c4b8bf",
  muzzleTop: "#3a3036",
  muzzleBottom: "#1a1416",
  nose: "#0b0809",
  noseEdge: "#4b4146",
  eyeWhite: "#fbfaf8",
  iris: "#4a2a1a",
  pupil: "#140b08",
  mouth: "#3d0f1b",
  tongue: "#fb7185",
  tongueEdge: "#be123c",
  blush: "#f27d9b",
  brim: "#f8f1e7",
  stick: "#f1f5f9",
};
/** The rainbow: the beanie's panels and the lollipop's swirl. */
const RAINBOW = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];

/** The body's and the muzzle's colours by mood: body top and bottom, muzzle top and bottom. */
const TINT = {
  normal: [PU.top, PU.bottom, PU.muzzleTop, PU.muzzleBottom],
  // Sick: grey-green all over.
  pale: ["#6f7a74", "#39423e", "#44504a", "#222a26"],
  // Dim, half asleep.
  dim: ["#4e454a", "#221c1f", "#2f282c", "#151012"],
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.6, color = PU.ink) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ── Behind the body ──────────────────────────────────────────────────────────

/** A floppy ear hanging from the head's left corner, folded over; mirrored for the right. */
const EAR =
  `<path d="M38 27 C25 24 12 36 14 56 C15.6 67 27 68 32 59 C35 52 33 40 38 33 Z" fill="url(#ge)" stroke="${PU.rim}" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M28 36 C22 43 21 52 24 59" fill="none" stroke="${PU.sheen}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>`;

/** A paw under the body, three toes; mirrored for the right. */
const FOOT =
  `<ellipse cx="47" cy="108" rx="10" ry="5.6" fill="url(#gl)" stroke="${PU.rim}" stroke-width="2.6"/>` +
  `<path d="M43 108.4 L42.4 112.4 M47 109 L47 113 M51 108.4 L51.6 112.4" stroke="${PU.rim}" stroke-width="1.3" stroke-linecap="round" opacity="0.9"/>`;

/** The tail, curled up at his right side. */
const TAIL =
  `<path d="M98 92 C110 85 116 96 107 101 C101 104 99 98 104 96" fill="none" stroke="${PU.rim}" stroke-width="6.4" stroke-linecap="round"/>` +
  `<path d="M98 92 C110 85 116 96 107 101 C101 104 99 98 104 96" fill="none" stroke="${PU.limb}" stroke-width="3.2" stroke-linecap="round"/>`;

/** The right arm (drawn on the left, mirrored), hanging from the shoulder (38, 70), `deg` turned up. */
const ARM_D = "M40 68 C32 68 25 75 23 85 C22 91 24 96 28 96.6 C32 97 35 92 36.6 86 C38 80 39 74 41 70 Z";
function arm(deg) {
  const art =
    `<path d="${ARM_D}" fill="url(#gl)" stroke="${PU.rim}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M26.6 92 L25 95.4 M29.4 92.6 L29 96" stroke="${PU.rim}" stroke-width="1.4" stroke-linecap="round"/>`;
  return deg ? `<g transform="rotate(${deg} 38 70)">${art}</g>` : art;
}

/** Where the right paw ends up when the arm turns `deg` up. */
function rightTip(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [26 - 38, 95 - 70];
  return [128 - (38 + dx * Math.cos(a) - dy * Math.sin(a)), 70 + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** The left arm, out to the side holding the lollipop; behind the body. Lifted `lift` degrees about the shoulder (40, 76). */
const HOLD_D = "M40 70 C33 66 26 66 21 70 C17 73 17 79 21 82 C25 85 32 84 40 82 Z";
const lifted = (lift, art) => (lift ? `<g transform="rotate(${lift} 40 76)">${art}</g>` : art);
const holdArm = (lift) => lifted(lift, `<path d="${HOLD_D}" fill="url(#gl)" stroke="${PU.rim}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>`);

// ── In front, beside him ─────────────────────────────────────────────────────

/** A rainbow swirl lollipop: a white disc with six bands spiralling out of its middle. */
function lollipop(cx, cy, r) {
  const w = 1.5; // a band's width
  const pitch = RAINBOW.length * w; // how far out the swirl goes each turn
  let art = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="${PU.rim}" stroke-width="2.4"/>`;
  RAINBOW.forEach((color, k) => {
    const pts = [];
    for (let t = 0; ; t += 0.22) {
      const rr = (pitch * t) / (2 * Math.PI) + k * w;
      if (rr > r - 1.4) break;
      pts.push(`${f(cx + rr * Math.cos(t))} ${f(cy + rr * Math.sin(t))}`);
    }
    art += `<path d="M${pts.join(" L")}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  });
  art += `<ellipse cx="${f(cx - r * 0.36)}" cy="${f(cy - r * 0.42)}" rx="${f(r * 0.26)}" ry="${f(r * 0.14)}" transform="rotate(-38 ${f(cx - r * 0.36)} ${f(cy - r * 0.42)})" fill="#ffffff" opacity="0.8"/>`;
  return art;
}

/** The lollipop on its stick, and the paw closed on the stick; lifted with the arm. */
function held(lift) {
  const art =
    `<path d="M20.4 75 L16.4 60" stroke="${PU.rim}" stroke-width="4.2" stroke-linecap="round"/>` +
    `<path d="M20.4 75 L16.4 60" stroke="${PU.stick}" stroke-width="2.2" stroke-linecap="round"/>` +
    lollipop(15, 49, 11) +
    `<circle cx="21" cy="76" r="5.6" fill="url(#gl)" stroke="${PU.rim}" stroke-width="2.4"/>` +
    `<path d="M18.2 73.2 Q19.4 75.4 18.4 78 M22.4 72.6 Q23.6 75.2 22.6 77.8" fill="none" stroke="${PU.rim}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>`;
  return lifted(lift, art);
}

// ── On the head ──────────────────────────────────────────────────────────────

/**
 * The rainbow propeller beanie: a dome of six panels, a cream brim and a
 * propeller on a stem, its blades turned `spin` degrees. Clipped to a box as
 * wide as a face part may be (rig.ts), so it turns with the face.
 */
function beanie(spin) {
  const xs = [36, 45.33, 54.67, 64, 73.33, 82.67, 92];
  const edge = (x) => `Q${f((64 + x) / 2 - (64 - x) * 0.28)} 19 ${x} 33`;
  const back = (x) => `Q${f((64 + x) / 2 - (64 - x) * 0.28)} 19 64 14.6`;
  let panels = "";
  for (let i = 0; i < 6; i++) {
    panels += `<path d="M64 14.6 ${edge(xs[i])} L${xs[i + 1]} 33 ${back(xs[i + 1])} Z" fill="${RAINBOW[i]}"/>`;
  }
  const blades =
    `<rect x="49.8" y="7" width="13.6" height="4.4" rx="2.2" fill="#ef4444" stroke="${PU.rim}" stroke-width="1.5"/>` +
    `<rect x="64.6" y="7" width="13.6" height="4.4" rx="2.2" fill="#3b82f6" stroke="${PU.rim}" stroke-width="1.5"/>`;
  return (
    `<g clip-path="url(#gcap)">` +
    `<rect x="62.6" y="9.2" width="2.8" height="6.4" fill="#e5e7eb" stroke="${PU.rim}" stroke-width="1.3"/>` +
    (spin ? `<g transform="rotate(${spin} 64 9.2)">${blades}</g>` : blades) +
    `<circle cx="64" cy="9.2" r="2.5" fill="#fde047" stroke="${PU.rim}" stroke-width="1.3"/>` +
    `<path d="M36 33 C36 11 92 11 92 33 Z" fill="${RAINBOW[0]}"/>` +
    panels +
    `<path d="M36 33 C36 11 92 11 92 33" fill="none" stroke="${PU.rim}" stroke-width="2.8" stroke-linejoin="round"/>` +
    `<rect x="36.2" y="31" width="55.6" height="7.4" rx="3.7" fill="${PU.brim}" stroke="${PU.rim}" stroke-width="2.4"/>` +
    `</g>`
  );
}

// ── The face ─────────────────────────────────────────────────────────────────

const pair = (one) => one(L) + one(R);

function heartD(cx, cy, s) {
  return `M${cx} ${f(cy + 6 * s)} C${f(cx - 10 * s)} ${f(cy - s)} ${f(cx - 6 * s)} ${f(cy - 9 * s)} ${cx} ${f(cy - 4 * s)} C${f(cx + 6 * s)} ${f(cy - 9 * s)} ${f(cx + 10 * s)} ${f(cy - s)} ${cx} ${f(cy + 6 * s)} Z`;
}

/** Big glossy eyes: the white, a brown iris, the pupil, a glint up right and a little one down left. */
const glossy = (x, rx = 7.2, ry = 8) =>
  `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="${PU.eyeWhite}" stroke="${PU.rim}" stroke-width="1.6"/>` +
  `<ellipse cx="${x}" cy="${f(EY + 0.6)}" rx="${f(rx * 0.78)}" ry="${f(ry * 0.8)}" fill="${PU.iris}"/>` +
  `<ellipse cx="${x}" cy="${f(EY + 1)}" rx="${f(rx * 0.5)}" ry="${f(ry * 0.54)}" fill="${PU.pupil}"/>` +
  `<circle cx="${f(x + rx * 0.32)}" cy="${f(EY - ry * 0.36)}" r="${f(rx * 0.34)}" fill="#ffffff"/>` +
  `<circle cx="${f(x - rx * 0.3)}" cy="${f(EY + ry * 0.4)}" r="${f(rx * 0.16)}" fill="#ffffff"/>`;

/** The muzzle: a dark mask, the wide nose with its nostrils, the line down to the lip. Clipped to a box of its own. */
const MUZZLE = (top, bottom) =>
  `<g clip-path="url(#gmz)">` +
  `<ellipse cx="64" cy="80" rx="16" ry="12.6" fill="url(#gm)"/>` +
  `<path d="M56.6 69.6 Q64 65.2 71.4 69.6 Q72.6 75.4 67.6 78.6 L64 80.2 L60.4 78.6 Q55.4 75.4 56.6 69.6 Z" fill="${PU.nose}" stroke="${PU.noseEdge}" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<path d="M59.6 71.4 Q60.6 73.6 59.8 75.2 M68.4 71.4 Q67.4 73.6 68.2 75.2" fill="none" stroke="${PU.noseEdge}" stroke-width="1.6" stroke-linecap="round"/>` +
  `<ellipse cx="60.4" cy="69.4" rx="2.4" ry="1.1" fill="#ffffff" opacity="0.55"/>` +
  `<path d="M64 80.2 L64 85.4" fill="none" stroke="${PU.ink}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>` +
  `</g>`;

/** The tongue out, a little, under a closed mouth. */
const BLEP = `<path d="M61.2 88.4 Q64 95.6 66.8 88.4 Z" fill="${PU.tongue}" stroke="${PU.tongueEdge}" stroke-width="1.2" stroke-linejoin="round"/>`;

export default function drawPug({ mirror, EXTRAS, stopSign, star, INK, dir, wrap }) {
  const EYE = {
    open: pair((x) => glossy(x)),
    blink: pair((x) => line(`M${x - 7} ${EY + 1.5} Q${x} ${EY + 6.4} ${x + 7} ${EY + 1.5}`, 3.4)),
    happy: pair((x) => line(`M${x - 7} ${EY + 3.2} Q${x} ${EY - 6.8} ${x + 7} ${EY + 3.2}`, 4)),
    wide: pair(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="9.4" fill="${PU.eyeWhite}" stroke="${PU.rim}" stroke-width="1.8"/>` +
        `<circle cx="${x}" cy="${EY + 0.8}" r="4.6" fill="${PU.iris}"/><circle cx="${x}" cy="${EY + 1}" r="2.8" fill="${PU.pupil}"/><circle cx="${x + 1.8}" cy="${EY - 1.2}" r="1.5" fill="#ffffff"/>`,
    ),
    // Lids half down: steady.
    narrow: pair(
      (x) =>
        `<path d="M${x - 7.2} ${EY - 1.2} L${x + 7.2} ${EY - 1.2} Q${x + 7} ${EY + 7.8} ${x} ${EY + 7.8} Q${x - 7} ${EY + 7.8} ${x - 7.2} ${EY - 1.2} Z" fill="${PU.eyeWhite}"/>` +
        `<ellipse cx="${x}" cy="${EY + 2.6}" rx="4" ry="4.2" fill="${PU.iris}"/><ellipse cx="${x}" cy="${EY + 2.8}" rx="2.4" ry="2.6" fill="${PU.pupil}"/><circle cx="${x + 2}" cy="${EY + 1}" r="1.3" fill="#ffffff"/>` +
        line(`M${x - 8.2} ${EY - 1.6} L${x + 8.2} ${EY - 1.6}`, 3),
    ),
    sparkle: pair(
      (x) =>
        glossy(x, 7.8, 8.8) +
        `<path d="M${x - 3.4} ${EY - 6.6} l0.9 2.3 2.3 0.9 -2.3 0.9 -0.9 2.3 -0.9 -2.3 -2.3 -0.9 2.3 -0.9 Z" fill="#ffffff"/>`,
    ),
    hearts: pair((x) => `<path d="${heartD(x, EY + 1, 1.08)}" fill="#fb7185" stroke="${PU.pupil}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${x - 3.2}" cy="${EY - 2.4}" r="1.5" fill="#ffffff" opacity="0.85"/>`),
    stars: (star(L, EY, 9.6) + star(R, EY, 9.6)).replaceAll(INK, PU.pupil),
    // Lost: the whites with a tiny pupil in each.
    dots: pair((x) => `<ellipse cx="${x}" cy="${EY}" rx="7.2" ry="8" fill="${PU.eyeWhite}" stroke="${PU.rim}" stroke-width="1.6"/><circle cx="${x}" cy="${EY + 1}" r="2.6" fill="${PU.pupil}"/>`),
    // A wink: the left eye open, the right one shut in a happy arc.
    wink: glossy(L) + line(`M${R - 7} ${EY + 3.2} Q${R} ${EY - 6.8} ${R + 7} ${EY + 3.2}`, 4),
    // No layer: in the frame.
    closed: pair((x) => line(`M${x - 7} ${EY - 0.5} Q${x} ${EY + 6.2} ${x + 7} ${EY - 0.5}`, 3.6)),
    half: pair(
      (x) =>
        `<path d="M${x - 7.2} ${EY + 0.8} A7.2 7.8 0 0 0 ${x + 7.2} ${EY + 0.8} Z" fill="${PU.eyeWhite}"/>` +
        `<ellipse cx="${x}" cy="${EY + 3.6}" rx="3.6" ry="3.8" fill="${PU.iris}"/><ellipse cx="${x}" cy="${EY + 3.8}" rx="2.1" ry="2.3" fill="${PU.pupil}"/><circle cx="${x + 1.8}" cy="${EY + 2.4}" r="1.1" fill="#ffffff"/>` +
        line(`M${x - 8.4} ${EY + 0.8} L${x + 8.4} ${EY + 0.8}`, 3),
    ),
    smug: pair((x) => line(`M${x - 7.6} ${EY + 2.5} Q${x} ${EY - 4} ${x + 7.6} ${EY + 2.5}`, 4.2)),
    spiral: pair((x) => line(`M${x} ${EY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7 7 0 1 1 -14 0`, 2.5)),
  };

  // The forehead: a pug's wrinkles at rest, Candy's brows for the moods.
  const BROWS = {
    none: line("M52 45.6 Q64 41.4 76 45.6", 2.2) + line("M55 51.2 Q64 48 73 51.2", 2.2),
    worried: line(`M${L - 7} ${EY - 10} L${L + 7} ${EY - 15}`) + line(`M${R + 7} ${EY - 10} L${R - 7} ${EY - 15}`),
    stern: line(`M${L - 8} ${EY - 14.5} L${L + 7} ${EY - 9}`) + line(`M${R + 8} ${EY - 14.5} L${R - 7} ${EY - 9}`),
    raised: line(`M${L - 7} ${EY - 15} Q${L} ${EY - 19.5} ${L + 7} ${EY - 15}`) + line(`M${R - 7} ${EY - 12.5} L${R + 7} ${EY - 12.5}`),
    flat: line(`M${L - 7} ${EY - 13} L${L + 7} ${EY - 13}`) + line(`M${R - 7} ${EY - 13} L${R + 7} ${EY - 13}`),
  };

  const lip = (d, w = 2.8) => line(d, w, PU.ink);
  /** An open mouth: dark inside, the tongue in it. */
  const open = (d, tongue) =>
    `<path d="${d}" fill="${PU.mouth}" stroke="${PU.ink}" stroke-width="2.4" stroke-linejoin="round"/>` + (tongue ? `<path d="${tongue}" fill="${PU.tongue}"/>` : "");
  const MOUTHS = {
    // The little "ω", the tongue out under it.
    smile: lip("M56 86 Q60 91 64 86.6 Q68 91 72 86") + BLEP,
    small: lip("M59.6 87 Q62 89.6 64 87 Q66 89.6 68.4 87", 2.6),
    // Panting: wide open, the tongue lolling.
    grin: open("M54.4 85.4 Q64 101 73.6 85.4 Q64 88.4 54.4 85.4 Z", "M58.6 90 Q64 87.4 69.4 90 Q64 97.8 58.6 90 Z"),
    o: `<ellipse cx="64" cy="90" rx="3.9" ry="4.1" fill="${PU.mouth}" stroke="${PU.ink}" stroke-width="2.4"/>`,
    smallO: `<ellipse cx="64" cy="89.6" rx="2.6" ry="2.9" fill="${PU.mouth}" stroke="${PU.ink}" stroke-width="2.2"/>`,
    flat: lip("M57.6 88.6 L70.4 88.6"),
    short: lip("M60 88.4 L68 88.4", 2.6),
    wavy: lip("M55.4 89 Q58.6 86.4 61.8 89 T68.2 89 T74.6 89", 2.6),
    frown: lip("M57 92 Q60.5 87 64 87 Q67.5 87 71 92"),
    smirk: lip("M57.6 88 Q65 91.6 71.6 86"),
    // Chattering teeth.
    chatter: lip("M56 87 L58.4 85.2 L60.8 87.4 L63.2 85.2 L65.6 87.4 L68 85.2 L70.4 87.4 L72.4 85.6", 2.4) + lip("M57.2 90.2 L70.8 90.2", 2.2),
    // A bark: wide open, two little teeth.
    bark:
      open("M54 85 Q64 103 74 85 Q64 89 54 85 Z", "M59 93 Q64 90.6 69 93 Q64 99 59 93 Z") +
      `<path d="M57.6 86.6 L59.4 90.4 L61.2 86.8 Z M66.8 86.8 L68.6 90.4 L70.4 86.6 Z" fill="#ffffff"/>`,
    // Asleep: a bubble out of the nose.
    bubble:
      lip("M59.6 88 Q62 90.4 64 88 Q66 90.4 68.4 88", 2.6) +
      `<circle cx="75" cy="84.6" r="5" fill="#bfdbfe" fill-opacity="0.75" stroke="#60a5fa" stroke-width="1.5"/><circle cx="73.2" cy="82.8" r="1.4" fill="#ffffff"/>`,
  };

  const drop = (d) => `<path d="${d}" fill="#7dd3fc" stroke="${PU.rim}" stroke-width="2"/>`;
  const OWN = {
    // Beside the head on the right, clear of the body's outline (x 25.5 to 102.5) and of the lollipop on the left.
    sweat: () => drop("M109 26 C105.4 32.6 103.8 36.4 104.6 39.4 C105.6 43 111.4 43.6 113.2 40 C114.4 37.4 112.8 33.4 109 26 Z"),
    sweat2: () =>
      drop("M109 26 C105.4 32.6 103.8 36.4 104.6 39.4 C105.6 43 111.4 43.6 113.2 40 C114.4 37.4 112.8 33.4 109 26 Z") +
      drop("M118 48 C115 53 114 56 116 58 C118 60 121 59 121 56 C121 54 120 52 118 48 Z"),
    tear: () => `<path d="M44.4 70 C41.4 76 41.4 79 44.4 80 C47.4 79 47.4 76 44.4 70 Z" fill="#7dd3fc" stroke="${PU.rim}" stroke-width="1.6"/>`,
    // Anger marks off the top of the head, red so they show on the dark body and the island's black.
    flush: () => line("M99 27 L105.5 22.5 M102 33.5 L109.5 31.5 M96.5 21.5 L98.5 14.5", 2.8, "#ef4444"),
    // Brrr: a shiver down his right side (the lollipop takes the left).
    shiver: () => mirror(line("M13.4 50 Q10.2 55 13.4 60 Q16.6 65 13.4 70", 2.4, "#bfdbfe") + line("M7.6 54 Q5.4 58 7.6 62", 2.2, "#bfdbfe")),
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: PU.limb });

  /**
   * A frame of the pug; `eyes` drawn here only when they have no layer.
   * `arms`: how far the lollipop goes up, how far the right arm turns up;
   * `spin`: the propeller's blades turned.
   */
  function pug({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.5, arms = [0, 0], spin = 0, tint = "normal", extras = [], stop = false }) {
    const [top, bottom, mzTop, mzBottom] = TINT[tint];
    const flushed = extras.includes("flush");
    const blush = flushed ? 0.75 : cheeks;
    const cheek = flushed ? "#ef4444" : PU.blush;
    let sign = "";
    if (stop) {
      const [tx, ty] = rightTip(arms[1]).map((n) => +n.toFixed(1));
      sign = stopSign(+(tx - 2).toFixed(1), +(ty + 1).toFixed(1));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PU.limb}"/><stop offset="1" stop-color="${PU.limbDeep}"/></linearGradient><linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PU.ear}"/><stop offset="1" stop-color="${PU.earDeep}"/></linearGradient><linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mzTop}"/><stop offset="1" stop-color="${mzBottom}"/></linearGradient><clipPath id="gc"><rect x="28" y="24" width="72" height="82" rx="27" ry="29"/></clipPath><clipPath id="gcap"><rect x="35.5" y="0" width="57" height="48.4"/></clipPath><clipPath id="gmz"><rect x="44" y="50" width="40" height="46"/></clipPath></defs>
${EAR}${mirror(EAR)}
${TAIL}
${holdArm(arms[0])}${mirror(arm(arms[1]))}
${FOOT}${mirror(FOOT)}
<rect x="28" y="24" width="72" height="82" rx="27" ry="29" fill="url(#gb)" stroke="${PU.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#gc)" data-melt="over">
<ellipse cx="47" cy="34" rx="12" ry="5.5" transform="rotate(-24 47 34)" fill="#ffffff" opacity="0.1"/>
<ellipse cx="64" cy="108" rx="28" ry="12" fill="${PU.sheen}" opacity="0.22"/>
</g>
<ellipse cx="41.6" cy="72.6" rx="6.4" ry="4" fill="${cheek}" opacity="${blush}"/><ellipse cx="86.4" cy="72.6" rx="6.4" ry="4" fill="${cheek}" opacity="${blush}"/>
${MUZZLE(mzTop, mzBottom)}
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}
${beanie(spin)}
${held(arms[0])}
${extras.map(extra).join("")}${sign}
</svg>
`;
  }

  // name → art, every mood its own face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.8 },
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.8, arms: [18, 70], spin: 30 },
    "celebrate-2.svg": { mouth: "bark", cheeks: 0.8, arms: [18, 106] },
    "worried.svg": { brows: "worried", mouth: "wavy", cheeks: 0.35, extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.25, arms: [0, 28] },
    "sleepy.svg": { eyes: "closed", mouth: "bubble", cheeks: 0.35, tint: "dim" },
    "alert.svg": { mouth: "smallO", cheeks: 0.4 },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, tint: "dim", extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", cheeks: 0.4, arms: [0, 95], stop: true },
    "confused.svg": { mouth: "wavy", cheeks: 0.35 },
    "love.svg": { mouth: "smile", cheeks: 0.95 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 78], spin: 30 },
    "wave-2.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 114] },
    // Proud of the lollipop: held up high.
    "proud.svg": { eyes: "smug", mouth: "smile", cheeks: 0.75, arms: [18, 0] },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.35 },
    "nervous.svg": { brows: "worried", mouth: "chatter", cheeks: 0.3, extras: ["sweat2", "shiver"] },
    "curious.svg": { brows: "raised", mouth: "smallO", cheeks: 0.5 },
    "angry.svg": { brows: "stern", mouth: "bark", extras: ["flush"] },
    // Bouncing, the propeller spinning: two frames.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, arms: [0, 30], spin: 30 },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, arms: [0, 62] },
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
  for (const [name, art] of Object.entries(FRAMES)) files[name] = pug(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = pug({ eyes: "open" });
  // His mouth sits lower than Candy's: what is held in it goes down with it (mascot.json → mouthDrop).
  return { name: "Pug", frames: files, look: LOOK, mouthDrop: 7 };
}
