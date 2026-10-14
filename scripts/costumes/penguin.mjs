// Penguin: Candy as a round little penguin. A dark slate-blue body (not
// black, so it shows on the island's black) with a white face in two round
// lobes over the eyes that runs down into a white belly, an orange beak that
// opens with the mood, orange webbed feet, flippers for arms and a tuft of
// feathers on top. It flaps when excited, shows off a fish when proud, chatters
// when nervous, blows a bubble asleep and goes pale when sick.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/penguin/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the body, in Candy's place (hats and face accessories sit as they do on
// him); the white face and belly are clipped to it, so they stay put as skin
// while the eyes, brows, cheeks and beak turn with the face. The upper beak is
// face, the lower beak is the mouth: when a link is held over him or he
// swallows one, the engine opens the beak under the upper one (paint.ts,
// beakOf and drawGape), so he keeps his beak. The white is marked
// data-melt="over": on a strong drop his wax runs down over it too.

const PG = {
  top: "#56658a",
  bottom: "#262e43",
  limb: "#5d6d94",
  limbDeep: "#2c3550",
  edge: "#a3b0d4",
  rim: "#0b0f1a",
  ink: "#141a2b",
  white: "#fbfcff",
  shade: "#c9d2e6",
  beakTop: "#fdba74",
  beak: "#f97316",
  beakLow: "#ea580c",
  beakLine: "#b8420c",
  mouth: "#4a1420",
  tongue: "#fb7185",
  blush: "#fb7f9f",
};

/** The body's and the face's colours by mood: body top, body bottom, the white. */
const TINT = {
  normal: [PG.top, PG.bottom, PG.white],
  // Sick: grey-green, the white gone a little green too.
  pale: ["#74817f", "#3e4846", "#eef4e4"],
  // Dim, half asleep.
  dim: ["#4c5878", "#232a3c", "#eef1f8"],
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.6, color = PG.ink) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ── The body ─────────────────────────────────────────────────────────────────

/** The white: two round lobes over the eyes, a point between them, down into the belly. Clipped to the body. */
const MASK =
  "M64 50.4 C60.6 44.6 55 41.4 49.4 41.4 C39 41.4 31.2 49.6 31.2 59.8 C31.2 67.4 33 73.4 35.4 77.6 " +
  "C31.8 85 31.4 95.4 34.6 108 L93.4 108 C96.6 95.4 96.2 85 92.6 77.6 C95 73.4 96.8 67.4 96.8 59.8 " +
  "C96.8 49.6 89 41.4 78.6 41.4 C73 41.4 67.4 44.6 64 50.4 Z";

/** A tuft of feathers on top of the head, behind it. */
const TUFT =
  `<path d="M58.4 28 C56.4 22.4 57.6 17.4 61.8 14.2 C61.4 18.8 62.6 22.8 65.4 26.6 Z" fill="url(#pl)" stroke="${PG.rim}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"/>` +
  `<path d="M62.6 27.6 C62.8 20.6 66.4 15.8 72.6 13.8 C69.6 18 69 22.4 70.2 27.6 Z" fill="url(#pl)" stroke="${PG.rim}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"/>`;

/** A flipper hanging from under the body (pivot 36, 69.5), `deg` turned up. */
const FLIPPER_D = "M38 62 C30 62.4 22.4 70 19 82 C17.2 88.6 16.8 94.4 19.6 95.6 C22.4 96.6 25.8 92.6 28.4 88 C31.2 83 34.4 79 38 77 Z";
function flipper(deg) {
  const art =
    `<path d="${FLIPPER_D}" fill="url(#pl)" stroke="${PG.rim}" stroke-width="4.4" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M30.4 66.4 Q23 73 20.6 86.4" fill="none" stroke="${PG.edge}" stroke-width="1.7" stroke-linecap="round" opacity="0.7"/>`;
  return deg ? `<g transform="rotate(${deg} 36 69.5)">${art}</g>` : art;
}

/** Where the right flipper's tip ends up when it turns `deg` up. */
function rightTip(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [19 - 36, 93 - 69.5];
  return [128 - (36 + dx * Math.cos(a) - dy * Math.sin(a)), 69.5 + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** An orange webbed foot under the body, three toes. */
const FOOT =
  `<path d="M38.4 104 C38.4 100 42 98.4 47 98.4 C52 98.4 55.6 100 55.6 104 L57.4 112.6 C57.8 115.4 55.2 116.6 53.4 114.6 C52.2 117.4 49 117.6 47.6 115.2 C46.2 117.6 43 117.4 41.8 114.6 C39.8 116.6 37 115.4 37.6 112.6 Z" fill="url(#pf)" stroke="${PG.rim}" stroke-width="2.6" stroke-linejoin="round"/>` +
  `<path d="M43.4 107.6 L42.6 113 M51.2 107.6 L52 113" stroke="${PG.beakLine}" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>`;

/**
 * A fish held crosswise in the beak: its head out to the left, its tail to the
 * right, the beak closed on its middle. All of it within the mouth's reach
 * (rig.ts: the mouth is what sits low on the body's middle), so an open beak
 * drops it whole instead of leaving its tail in the air.
 */
const FISH =
  `<path d="M73.4 75.2 L83.8 68.6 Q81.4 75.2 83.8 81.8 Z" fill="#60a5fa" stroke="${PG.rim}" stroke-width="2" stroke-linejoin="round"/>` +
  `<path d="M46.4 75.2 C51 68.8 65 68.2 74.8 75.2 C65 82.2 51 81.6 46.4 75.2 Z" fill="#93c5fd" stroke="${PG.rim}" stroke-width="2.2" stroke-linejoin="round"/>` +
  `<path d="M55.6 71.2 Q53.6 75.2 55.6 79.2" fill="none" stroke="#3b82f6" stroke-width="1.4" stroke-linecap="round"/>` +
  `<path d="M68.8 73.2 L71.8 75.2 L68.8 77.2" fill="none" stroke="#3b82f6" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>` +
  `<circle cx="51.6" cy="73.6" r="1.6" fill="${PG.rim}"/><circle cx="51.2" cy="73.2" r="0.55" fill="#ffffff"/>`;

// ── The face ─────────────────────────────────────────────────────────────────

const pair = (one) => one(L) + one(R);

function heartD(cx, cy, s) {
  return `M${cx} ${f(cy + 6 * s)} C${f(cx - 10 * s)} ${f(cy - s)} ${f(cx - 6 * s)} ${f(cy - 9 * s)} ${cx} ${f(cy - 4 * s)} C${f(cx + 6 * s)} ${f(cy - 9 * s)} ${f(cx + 10 * s)} ${f(cy - s)} ${cx} ${f(cy + 6 * s)} Z`;
}

/** Round shiny eyes: a glint up right, a little one down left. */
const shiny = (x, rx = 6.6, ry = 8.4) =>
  `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="${PG.ink}"/>` +
  `<circle cx="${f(x + rx * 0.3)}" cy="${f(EY - ry * 0.4)}" r="${f(rx * 0.4)}" fill="#ffffff"/>` +
  `<circle cx="${f(x - rx * 0.36)}" cy="${f(EY + ry * 0.42)}" r="${f(rx * 0.19)}" fill="#ffffff"/>`;

/** The upper beak: always there, on the face. */
const UPPER =
  `<path d="M57.6 66.6 Q64 62.6 70.4 66.6 Q68.8 72.6 64 76 Q59.2 72.6 57.6 66.6 Z" fill="url(#pk)" stroke="${PG.rim}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<ellipse cx="61.2" cy="66.4" rx="2.2" ry="1.1" fill="#ffffff" opacity="0.75"/>`;

/**
 * The lower beak, `drop` below closed, `w` wide, turned `tilt` degrees; with
 * the mouth open (`drop` > 0) dark inside, and the tongue when `tongue`.
 */
function lower({ drop = 0, w = 10.4, tilt = 0, tongue = false, zig = false, held = "" }) {
  const top = 73.4 + drop;
  const x0 = 64 - w / 2;
  const x1 = 64 + w / 2;
  const jaw = zig
    ? `M${f(x0)} ${f(top)} L${f(x0 + w * 0.2)} ${f(top - 1.6)} L${f(x0 + w * 0.4)} ${f(top + 0.4)} L${f(x0 + w * 0.6)} ${f(top - 1.6)} L${f(x0 + w * 0.8)} ${f(top + 0.4)} L${f(x1)} ${f(top - 1.4)} Q${f(x1 - 1.2)} ${f(top + 5.4)} 64 ${f(top + 6)} Q${f(x0 + 1.2)} ${f(top + 5.4)} ${f(x0)} ${f(top)} Z`
    : `M${f(x0)} ${f(top)} Q64 ${f(top + 2)} ${f(x1)} ${f(top)} Q${f(x1 - 1.4)} ${f(top + 5.8)} 64 ${f(top + 6.4)} Q${f(x0 + 1.4)} ${f(top + 5.8)} ${f(x0)} ${f(top)} Z`;
  let art = "";
  if (drop > 0) {
    // The inside, from under the upper beak down to the lower one.
    const ow = Math.max(w, 11.6);
    const inside = `M${f(64 - ow / 2)} 69.6 Q64 72 ${f(64 + ow / 2)} 69.6 L${f(x1 - 0.6)} ${f(top + 2)} Q64 ${f(top + 3.6)} ${f(x0 + 0.6)} ${f(top + 2)} Z`;
    art += `<path d="${inside}" fill="${PG.mouth}" stroke="${PG.rim}" stroke-width="2.2" stroke-linejoin="round"/>`;
    if (tongue) art += `<path d="M${f(64 - ow * 0.32)} ${f(top + 1.4)} Q64 ${f(top - 3)} ${f(64 + ow * 0.32)} ${f(top + 1.4)} Z" fill="${PG.tongue}"/>`;
  }
  art +=
    held +
    `<path d="${jaw}" fill="${PG.beakLow}" stroke="${PG.rim}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M${f(x0 + 2.4)} ${f(top + 1.8)} Q64 ${f(top + 3.2)} ${f(x1 - 2.4)} ${f(top + 1.8)}" fill="none" stroke="${PG.beakTop}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>`;
  return tilt ? `<g transform="rotate(${tilt} 64 ${f(top)})">${art}</g>` : art;
}

export default function drawPenguin({ mirror, EXTRAS, stopSign, star, INK, dir, wrap }) {
  const EYE = {
    open: pair((x) => shiny(x)),
    blink: pair((x) => line(`M${x - 6.8} ${EY + 1.5} Q${x} ${EY + 6} ${x + 6.8} ${EY + 1.5}`, 3.4)),
    happy: pair((x) => line(`M${x - 6.8} ${EY + 3.2} Q${x} ${EY - 6.8} ${x + 6.8} ${EY + 3.2}`, 4)),
    wide: pair(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="9.4" fill="#ffffff" stroke="${PG.ink}" stroke-width="3"/>` +
        `<circle cx="${x}" cy="${EY + 0.8}" r="4" fill="${PG.ink}"/><circle cx="${x + 1.5}" cy="${EY - 0.8}" r="1.4" fill="#ffffff"/>`,
    ),
    // Lids half down: steady.
    narrow: pair(
      (x) =>
        `<path d="M${x - 6.8} ${EY - 1.4} L${x + 6.8} ${EY - 1.4} Q${x + 6.6} ${EY + 7} ${x} ${EY + 7} Q${x - 6.6} ${EY + 7} ${x - 6.8} ${EY - 1.4} Z" fill="${PG.ink}"/>` +
        `<circle cx="${x + 2.4}" cy="${EY + 1.4}" r="1.8" fill="#ffffff"/>` +
        line(`M${x - 8} ${EY - 1.8} L${x + 8} ${EY - 1.8}`, 3),
    ),
    sparkle: pair(
      (x) =>
        shiny(x, 7.6, 9.6) +
        `<path d="M${x - 3.2} ${EY - 6.4} l0.9 2.3 2.3 0.9 -2.3 0.9 -0.9 2.3 -0.9 -2.3 -2.3 -0.9 2.3 -0.9 Z" fill="#ffffff"/>`,
    ),
    hearts: pair((x) => `<path d="${heartD(x, EY + 1, 1.08)}" fill="#fb7185" stroke="${PG.ink}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${x - 3.2}" cy="${EY - 2.4}" r="1.5" fill="#ffffff" opacity="0.85"/>`),
    stars: (star(L, EY, 9.6) + star(R, EY, 9.6)).replaceAll(INK, PG.ink),
    dots: pair((x) => `<circle cx="${x}" cy="${EY}" r="4.4" fill="${PG.ink}"/>`),
    // A wink: the left eye open, the right one shut in a happy arc.
    wink: shiny(L) + line(`M${R - 6.8} ${EY + 3.2} Q${R} ${EY - 6.8} ${R + 6.8} ${EY + 3.2}`, 4),
    // No layer: in the frame.
    closed: pair((x) => line(`M${x - 6.8} ${EY - 0.5} Q${x} ${EY + 6} ${x + 6.8} ${EY - 0.5}`, 3.6)),
    half: pair(
      (x) =>
        `<path d="M${x - 6.8} ${EY + 0.6} A6.8 7.4 0 0 0 ${x + 6.8} ${EY + 0.6} Z" fill="${PG.ink}"/><circle cx="${x + 2.2}" cy="${EY + 3.2}" r="1.5" fill="#ffffff"/>` +
        line(`M${x - 8.4} ${EY + 0.6} L${x + 8.4} ${EY + 0.6}`, 3),
    ),
    smug: pair((x) => line(`M${x - 7.6} ${EY + 2.5} Q${x} ${EY - 4} ${x + 7.6} ${EY + 2.5}`, 4.2)),
    spiral: pair((x) => line(`M${x} ${EY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0 a7 7 0 1 1 -14 0`, 2.5)),
  };

  // Candy's brows, inside the white lobes.
  const BROWS = {
    none: "",
    worried: line(`M${L - 7} ${EY - 10} L${L + 7} ${EY - 15}`) + line(`M${R + 7} ${EY - 10} L${R - 7} ${EY - 15}`),
    stern: line(`M${L - 8} ${EY - 14.5} L${L + 7} ${EY - 9}`) + line(`M${R + 8} ${EY - 14.5} L${R - 7} ${EY - 9}`),
    raised: line(`M${L - 7} ${EY - 15} Q${L} ${EY - 19.5} ${L + 7} ${EY - 15}`) + line(`M${R - 7} ${EY - 12.5} L${R + 7} ${EY - 12.5}`),
    flat: line(`M${L - 7} ${EY - 13} L${L + 7} ${EY - 13}`) + line(`M${R - 7} ${EY - 13} L${R + 7} ${EY - 13}`),
  };

  /** Little curls at the corners of the beak: up for a smile, down for a frown. */
  const corners = (up) =>
    up
      ? line("M55.4 72.4 Q56 74.6 58.2 75", 2.2) + line("M72.6 72.4 Q72 74.6 69.8 75", 2.2)
      : line("M55.4 77.2 Q56 75 58.4 74.4", 2.2) + line("M72.6 77.2 Q72 75 69.6 74.4", 2.2);
  const MOUTHS = {
    smile: lower({}) + corners(true),
    small: lower({ w: 9 }),
    grin: lower({ drop: 8.4, w: 13.2, tongue: true }),
    o: lower({ drop: 9.4, w: 9.6 }),
    smallO: lower({ drop: 4, w: 8.6 }),
    flat: lower({ w: 11.4 }),
    short: lower({ w: 8.4 }),
    wavy: lower({ w: 10.4, tilt: -9 }),
    frown: lower({ w: 10.4 }) + corners(false),
    smirk: lower({ drop: 2.6, w: 10.4, tilt: 12 }),
    // Chattering: the beak a crack open, its edge a zigzag.
    chatter: lower({ drop: 3.4, w: 11.6, zig: true }),
    // A squawk: wide open.
    squawk: lower({ drop: 10.4, w: 14.4, tongue: true }),
    // A fish in the beak.
    fish: lower({ drop: 2.4, w: 10.4, held: FISH }),
    // Asleep: a bubble out of the beak.
    bubble:
      lower({ w: 9 }) +
      `<circle cx="73.4" cy="81.6" r="5" fill="#bfdbfe" fill-opacity="0.75" stroke="#60a5fa" stroke-width="1.5"/><circle cx="71.6" cy="79.8" r="1.4" fill="#ffffff"/>`,
  };

  const drop = (d) => `<path d="${d}" fill="#7dd3fc" stroke="${PG.rim}" stroke-width="2"/>`;
  const OWN = {
    // Beside the head, clear of the body's outline (x 25.5 to 102.5): nothing covers them.
    sweat: () => drop("M109 26 C105.4 32.6 103.8 36.4 104.6 39.4 C105.6 43 111.4 43.6 113.2 40 C114.4 37.4 112.8 33.4 109 26 Z"),
    sweat2: () =>
      drop("M109 26 C105.4 32.6 103.8 36.4 104.6 39.4 C105.6 43 111.4 43.6 113.2 40 C114.4 37.4 112.8 33.4 109 26 Z") +
      drop("M18.6 32 C15.6 37 14.6 40 16.6 42 C18.6 44 21.6 43 21.6 40 C21.6 38 20.6 36 18.6 32 Z"),
    tear: () => `<path d="M44.4 69 C41.4 75 41.4 78 44.4 79 C47.4 78 47.4 75 44.4 69 Z" fill="#7dd3fc" stroke="${PG.ink}" stroke-width="1.6"/>`,
    // Anger marks off the top of the head, red so they show on the dark body and the island's black.
    flush: () => line("M99 27 L105.5 22.5 M102 33.5 L109.5 31.5 M96.5 21.5 L98.5 14.5", 2.8, "#ef4444"),
    // Brrr: a shiver down both sides.
    shiver: () => {
      const one = line("M13.4 50 Q10.2 55 13.4 60 Q16.6 65 13.4 70", 2.4, "#bfdbfe") + line("M7.6 54 Q5.4 58 7.6 62", 2.2, "#bfdbfe");
      return one + mirror(one);
    },
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: PG.limb });

  /** A frame of the penguin; `eyes` drawn here only when they have no layer. */
  function penguin({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.55, arms = [0, 0], tint = "normal", extras = [], stop = false }) {
    const [top, bottom, white] = TINT[tint];
    const flushed = extras.includes("flush");
    const blush = flushed ? 0.75 : cheeks;
    const cheek = flushed ? "#ef4444" : PG.blush;
    let sign = "";
    if (stop) {
      const [tx, ty] = rightTip(arms[1]).map((n) => +n.toFixed(1));
      sign = stopSign(+(tx + 2).toFixed(1), +(ty + 1).toFixed(1));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="pb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PG.limb}"/><stop offset="1" stop-color="${PG.limbDeep}"/></linearGradient><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PG.beakTop}"/><stop offset="1" stop-color="${PG.beak}"/></linearGradient><linearGradient id="pk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PG.beakTop}"/><stop offset="1" stop-color="${PG.beak}"/></linearGradient><clipPath id="pc"><rect x="28" y="24" width="72" height="82" rx="28" ry="30"/></clipPath></defs>
${TUFT}
${flipper(arms[0])}${mirror(flipper(arms[1]))}
${FOOT}${mirror(FOOT)}
<rect x="28" y="24" width="72" height="82" rx="28" ry="30" fill="url(#pb)" stroke="${PG.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#pc)" data-melt="over">
<ellipse cx="47" cy="33" rx="11" ry="5" transform="rotate(-24 47 33)" fill="#ffffff" opacity="0.16"/>
<path d="${MASK}" fill="${white}"/>
<ellipse cx="64" cy="110" rx="34" ry="12" fill="${PG.shade}" opacity="0.5"/>
</g>
<ellipse cx="41.6" cy="72.6" rx="6.4" ry="4" fill="${cheek}" opacity="${blush}"/><ellipse cx="86.4" cy="72.6" rx="6.4" ry="4" fill="${cheek}" opacity="${blush}"/>
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}${UPPER}
${extras.map(extra).join("")}${sign}
</svg>
`;
  }

  // name → art, every mood its own face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.8 },
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.8, arms: [70, 70] },
    "celebrate-2.svg": { mouth: "squawk", cheeks: 0.8, arms: [106, 106] },
    "worried.svg": { brows: "worried", mouth: "wavy", cheeks: 0.35, extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.25, arms: [28, 28] },
    "sleepy.svg": { eyes: "closed", mouth: "bubble", cheeks: 0.35, tint: "dim" },
    "alert.svg": { mouth: "smallO", cheeks: 0.4 },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, tint: "dim", extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", cheeks: 0.4, arms: [0, 95], stop: true },
    "confused.svg": { mouth: "wavy", cheeks: 0.35 },
    "love.svg": { mouth: "smile", cheeks: 0.95 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 78] },
    "wave-2.svg": { mouth: "grin", cheeks: 0.8, arms: [0, 114] },
    // Proud of the catch: a fish in the beak.
    "proud.svg": { eyes: "smug", mouth: "fish", cheeks: 0.75 },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.35 },
    "nervous.svg": { brows: "worried", mouth: "chatter", cheeks: 0.3, extras: ["sweat2", "shiver"] },
    "curious.svg": { brows: "raised", mouth: "smallO", cheeks: 0.5 },
    "angry.svg": { brows: "stern", mouth: "squawk", extras: ["flush"] },
    // Flapping: two frames.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, arms: [30, 30] },
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
  for (const [name, art] of Object.entries(FRAMES)) files[name] = penguin(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = penguin({ eyes: "open" });
  return { name: "Penguin", frames: files, look: LOOK };
}
