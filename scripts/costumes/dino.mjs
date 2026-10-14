// Dino: Candy as a little dinosaur. Bright green with a cream belly and a few
// darker spots, orange plates down the back that peek over the head, a tail
// that peeks out on the right (it wags in the hello, when excited and when
// celebrating), short arms with claws, clawed feet, big round eyes, a snout
// with two nostrils and little teeth in every mouth.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/dino/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the body, the belly and the spots are clipped to it so they stay put as
// skin, brows, nostrils and cheeks turn with the face, the mouth opens when it
// swallows, the eyes are layers.

const DN = {
  top: "#94dc63",
  bottom: "#3c9a3b",
  limb: "#62b84a",
  limbDeep: "#2f7d32",
  rim: "#0c2410",
  plateTop: "#fdba74",
  plate: "#f97316",
  plateLight: "#fed7aa",
  belly: "#f6efb4",
  bellyLine: "#d6c56a",
  mouth: "#4a1420",
  tongue: "#fb7185",
  brow: "#0c2410",
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.8, color = DN.rim) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A little tooth hanging from (x, y) (pointing up when `up`). */
const tooth = (x, y, w = 4.2, h = 4.4, up = false) =>
  `<path d="M${f(x - w / 2)} ${y} L${f(x + w / 2)} ${y} L${x} ${f(up ? y - h : y + h)} Z" fill="#ffffff" stroke="${DN.rim}" stroke-width="1" stroke-linejoin="round"/>`;

/** A back plate: a rounded spike standing on (cx, by), `rot` degrees from upright. */
function plate(cx, by, w, h, rot) {
  const d = `M${f(cx - w / 2)} ${by} C${f(cx - w / 2)} ${f(by - h * 0.55)} ${f(cx - 2.2)} ${f(by - h)} ${cx} ${f(by - h)} C${f(cx + 2.2)} ${f(by - h)} ${f(cx + w / 2)} ${f(by - h * 0.55)} ${f(cx + w / 2)} ${by} Z`;
  const art =
    `<path d="${d}" fill="url(#dp)" stroke="${DN.rim}" stroke-width="3.6" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M${f(cx - w * 0.16)} ${f(by - 2)} Q${f(cx - w * 0.14)} ${f(by - h * 0.62)} ${f(cx - 0.6)} ${f(by - h * 0.82)}" fill="none" stroke="${DN.plateLight}" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`;
  return rot ? `<g transform="rotate(${rot} ${cx} ${by})">${art}</g>` : art;
}

/** The plates over the head, the left half (the right one is its mirror image). */
const PLATES_LEFT = plate(45.5, 32, 17, 21, -27) + plate(33.4, 45, 14, 15, -60);
const PLATE_TOP = plate(64, 31, 19, 26, 0);

/** The tail, out from behind the body on the right; `up` wags it. */
function tail(up) {
  const art =
    plate(107, 92.4, 8, 8.5, -8) +
    plate(116.4, 88.6, 7, 7.5, -30) +
    `<path d="M93 89.6 C105 92.4 115 90.4 120.4 80.6 C122.4 76.6 127.6 77.4 126.6 82.6 C124.6 96.6 112 106 93 106 Z" fill="url(#dl)" stroke="${DN.rim}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>` +
    `<path d="M100 102.6 C110 101.6 118.6 96 123.4 86.4" fill="none" stroke="${DN.belly}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>`;
  return up ? `<g transform="rotate(-16 95 99)">${art}</g>` : art;
}

/** A short arm from the shoulder (32, 71), turned `deg` up; three claws. */
const HAND = [18, 84];
function arm(deg) {
  const [hx, hy] = HAND;
  const claws = [hx - 3, hx, hx + 3].map((x) => `<path d="M${f(x - 1.5)} ${f(hy + 3.4)} L${f(x + 1.5)} ${f(hy + 3.4)} L${x} ${f(hy + 7.4)} Z" fill="#ffffff" stroke="${DN.rim}" stroke-width="1" stroke-linejoin="round"/>`).join("");
  const art =
    `<path d="M32 71 L19.4 82.6" stroke="${DN.rim}" stroke-width="10.4" stroke-linecap="round"/>` +
    `<path d="M32 71 L19.4 82.6" stroke="${DN.limb}" stroke-width="5.8" stroke-linecap="round"/>` +
    `<g transform="rotate(47.1 ${hx} ${hy})">${claws}<circle cx="${hx}" cy="${hy}" r="5" fill="${DN.limb}" stroke="${DN.rim}" stroke-width="2.2"/></g>`;
  return deg ? `<g transform="rotate(${deg} 32 71)">${art}</g>` : art;
}

/** Where the hand ends up when the right arm turns `deg` up (for the stop sign). */
function rightHand(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [HAND[0] - 32, HAND[1] - 71];
  return [128 - (32 + dx * Math.cos(a) - dy * Math.sin(a)), 71 + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** A clawed green foot. */
const FOOT =
  `<path d="M42 100 L42 108" stroke="${DN.rim}" stroke-width="8" stroke-linecap="round"/>` +
  `<path d="M42 100 L42 108" stroke="${DN.limb}" stroke-width="4.4" stroke-linecap="round"/>` +
  `<rect x="31.5" y="106.4" width="23.4" height="11.6" rx="5.8" fill="url(#dl)" stroke="${DN.rim}" stroke-width="2.6"/>` +
  [36.4, 43.2, 50]
    .map((x) => `<path d="M${f(x - 2.2)} 116.6 Q${x} 121.4 ${f(x + 2.2)} 116.6 Z" fill="#ffffff" stroke="${DN.rim}" stroke-width="1.2" stroke-linejoin="round"/>`)
    .join("");

// ── The face ─────────────────────────────────────────────────────────────────

/** One eye: white, a pupil and a glint; `cut` (a y) keeps only what is below a lid there. */
function eye(x, id, { rx = 7.4, ry = 9.4, pr = [4.4, 5.8], pupil = [0.6, 1.2], glints = [[2, -1.8, 1.8]], cut = null, lid = null }) {
  const sclera = `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${DN.rim}" stroke-width="2.4"/>`;
  const inner =
    sclera +
    `<ellipse cx="${f(x + pupil[0])}" cy="${f(EY + pupil[1])}" rx="${pr[0]}" ry="${pr[1]}" fill="${DN.rim}"/>` +
    glints.map(([gx, gy, r]) => `<circle cx="${f(x + pupil[0] + gx)}" cy="${f(EY + pupil[1] + gy)}" r="${r}" fill="#ffffff"/>`).join("");
  if (cut == null) return inner;
  // The lid: a line through (x−9, a) and (x+9, b); only what is under it shows.
  const [a, b] = lid ?? [cut, cut];
  return (
    `<clipPath id="${id}"><path d="M${x - 12} ${a} L${x + 12} ${b} L${x + 12} ${EY + 14} L${x - 12} ${EY + 14} Z"/></clipPath>` +
    `<g clip-path="url(#${id})">${inner}</g>` +
    line(`M${f(x - rx - 1)} ${f(a + ((b - a) * (12 - rx - 1)) / 24)} L${f(x + rx + 1)} ${f(a + ((b - a) * (12 + rx + 1)) / 24)}`, 3.2)
  );
}

export default function drawDino({ mirror, EXTRAS, stopSign, EYES, INK, dir, wrap }) {
  /** Candy's own eye art, in the dino's ink. */
  const ink = (s) => s.replaceAll(INK, DN.rim);
  const pair = (one) => one(L, "l") + one(R, "r");

  const EYE = {
    open: pair((x, s) => eye(x, `o${s}`, {})),
    blink: pair((x) => line(`M${x - 7.6} ${EY + 1} Q${x} ${EY + 6} ${x + 7.6} ${EY + 1}`, 3.4)),
    happy: pair((x) => line(`M${x - 7.2} ${EY + 3} Q${x} ${EY - 7.5} ${x + 7.2} ${EY + 3}`, 4)),
    wide: pair((x, s) => eye(x, `w${s}`, { rx: 9.4, ry: 10.6, pr: [3.2, 3.6], pupil: [0, 0.6], glints: [[1.4, -1.6, 1.3]] })),
    // Lids half down: steady.
    narrow: pair((x, s) => eye(x, `n${s}`, { cut: EY - 2, pupil: [0.6, 2.4] })),
    sparkle: pair((x, s) => eye(x, `s${s}`, { rx: 8, ry: 10, pr: [5.4, 7], pupil: [0.4, 0.8], glints: [[2.2, -2.4, 2.4], [-2, 3, 1.3]] })),
    hearts: ink(EYES.hearts),
    stars: ink(EYES.stars),
    dots: ink(EYES.dots),
    // No layer: in the frame.
    closed: ink(EYES.closed),
    half: pair((x, s) => eye(x, `h${s}`, { cut: EY + 1, pupil: [0.6, 3] })),
    smug: ink(EYES.smug),
    spiral: ink(EYES.spiral),
  };

  // Brow ridges, a little higher than Candy's: the eyes are taller.
  const BROWS = {
    none: "",
    worried: line(`M${L - 8} ${EY - 12} L${L + 7} ${EY - 17}`) + line(`M${R + 8} ${EY - 12} L${R - 7} ${EY - 17}`),
    stern: line(`M${L - 9} ${EY - 17} L${L + 7} ${EY - 11}`) + line(`M${R + 9} ${EY - 17} L${R - 7} ${EY - 11}`),
    raised: line(`M${L - 8} ${EY - 19} Q${L} ${EY - 24} ${L + 8} ${EY - 19}`) + line(`M${R - 8} ${EY - 14.5} L${R + 8} ${EY - 14.5}`),
    flat: line(`M${L - 8} ${EY - 15} L${L + 8} ${EY - 15}`) + line(`M${R - 8} ${EY - 15} L${R + 8} ${EY - 15}`),
  };

  const MOUTHS = {
    smile: tooth(58, 83.4, 4.4, 5.2) + tooth(70, 83.4, 4.4, 5.2) + line("M52.5 79 Q64 89 75.5 79"),
    small: tooth(61.6, 81.6, 3.4, 4) + line("M59 79 Q64 83 69 79", 3.4),
    grin:
      `<path d="M51 77 Q64 96 77 77 Z" fill="${DN.mouth}"/>` +
      `<path d="M56.5 87.6 Q64 83 71.5 87.6 Q64 92 56.5 87.6 Z" fill="${DN.tongue}"/>` +
      [55, 59.8, 64.6, 69.4, 73.8].map((x) => tooth(+(x - 0.6).toFixed(1), 77, 3.6, 3.6)).join("") +
      `<path d="M51 77 Q64 96 77 77 Z" fill="none" stroke="${DN.rim}" stroke-width="2.6" stroke-linejoin="round"/>`,
    flat: tooth(61, 82.2, 4.2, 5) + line("M56 81 L72 81"),
    short: tooth(62.4, 82.2, 3.6, 4.4) + line("M59 81 L69 81", 3.5),
    wavy: tooth(61, 83.2, 4.2, 5) + tooth(69, 83.2, 4.2, 5) + line("M53 82 Q57 78 61 82 T69 82 T77 82", 3.5),
    o:
      `<ellipse cx="64" cy="82" rx="6" ry="7.5" fill="${DN.mouth}"/>` +
      tooth(61.4, 75.6, 2.8, 3.2) +
      tooth(66.6, 75.6, 2.8, 3.2) +
      `<ellipse cx="64" cy="82" rx="6" ry="7.5" fill="none" stroke="${DN.rim}" stroke-width="2.4"/>`,
    smallO: `<ellipse cx="64" cy="81" rx="3.6" ry="4.3" fill="${DN.mouth}" stroke="${DN.rim}" stroke-width="2.2"/>`,
    frown: tooth(58.5, 83.1, 4.2, 5) + tooth(69.5, 83.1, 4.2, 5) + line("M54 85 Q64 76 74 85"),
    smirk: tooth(62.6, 82.4, 4.2, 5) + line("M56 80 Q66 84 74 76"),
    // Teeth clenched: two rows that lock.
    grit:
      `<rect x="53" y="76" width="22" height="10" rx="4" fill="#ffffff" stroke="${DN.rim}" stroke-width="2.6"/>` +
      `<path d="M53.6 81 L56.6 77.4 L59.6 84.6 L62.6 77.4 L65.6 84.6 L68.6 77.4 L71.6 84.6 L74.4 81" fill="none" stroke="${DN.rim}" stroke-width="1.6" stroke-linejoin="round"/>`,
    // A roar: wide open, teeth top and bottom.
    roar:
      `<path d="M50.6 77.6 Q64 73.6 77.4 77.6 Q75 93 64 93 Q53 93 50.6 77.6 Z" fill="${DN.mouth}"/>` +
      `<path d="M57 89.4 Q64 85.4 71 89.4 Q64 93 57 89.4 Z" fill="${DN.tongue}"/>` +
      [54.6, 59.6, 64, 68.4, 73.4].map((x, i) => tooth(x, i === 2 ? 75.4 : i % 4 === 0 ? 77 : 75.9, 3.6, 3.8)).join("") +
      tooth(56.6, 90.4, 3.2, 3.4, true) +
      tooth(71.4, 90.4, 3.2, 3.4, true) +
      `<path d="M50.6 77.6 Q64 73.6 77.4 77.6 Q75 93 64 93 Q53 93 50.6 77.6 Z" fill="none" stroke="${DN.rim}" stroke-width="2.6" stroke-linejoin="round"/>`,
  };

  const OWN = {
    // Red in the face: the cheeks themselves go red (see `flushed`), and the anger marks.
    flush: () => `<path d="M92 34 L98 29 M95 41 L102 39 M89 28 L91 21" stroke="${DN.rim}" stroke-width="2.6" stroke-linecap="round"/>`,
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: DN.limb });

  /** A frame of the dino; `eyes` drawn here only when they have no layer. */
  function dino({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.55, arms = [0, 0], wag = false, extras = [], stop = false, pale = false }) {
    const [top, bottom] = pale ? ["#c3d6aa", "#7a9a6c"] : [DN.top, DN.bottom];
    // Pink half-seen over green reads muddy: rosy cheeks get a little more of
    // it, faint ones less. Flushed, the cheeks go red (brighter than Candy's
    // flush, which reads brown on green); still the one pair of cheeks, so a
    // blush on top lands on them.
    const flushed = extras.includes("flush");
    const blush = flushed ? "0.8" : (cheeks >= 0.5 ? Math.min(0.92, cheeks * 1.15) : cheeks * 0.75).toFixed(2);
    const cheek = flushed ? "#ef4444" : "#ff8fab";
    let sign = "";
    if (stop) {
      // Short arms: the sign is on a stick.
      const [hx, hy] = rightHand(arms[1]).map((n) => +n.toFixed(1));
      const [sx, sy] = [+(hx + 1).toFixed(1), +(hy - 19).toFixed(1)];
      sign =
        `<path d="M${hx} ${hy + 2} L${sx} ${sy}" stroke="${DN.rim}" stroke-width="4.6" stroke-linecap="round"/>` +
        `<path d="M${hx} ${hy + 2} L${sx} ${sy}" stroke="#a16207" stroke-width="2" stroke-linecap="round"/>` +
        stopSign(sx, sy, 13.5);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="db" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="dl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DN.limb}"/><stop offset="1" stop-color="${DN.limbDeep}"/></linearGradient><linearGradient id="dp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${DN.plateTop}"/><stop offset="1" stop-color="${DN.plate}"/></linearGradient><clipPath id="dc"><rect x="28" y="24" width="72" height="82" rx="22"/></clipPath></defs>
${PLATE_TOP}${PLATES_LEFT}${mirror(PLATES_LEFT)}
${tail(wag)}
${arm(arms[0])}${mirror(arm(arms[1]))}
${FOOT}${mirror(FOOT)}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#db)" stroke="${DN.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#dc)">
<circle cx="37" cy="37" r="3.2" fill="${DN.limbDeep}" opacity="0.4"/><circle cx="43.6" cy="31.4" r="1.8" fill="${DN.limbDeep}" opacity="0.4"/><circle cx="91.4" cy="41" r="2.7" fill="${DN.limbDeep}" opacity="0.4"/><circle cx="86" cy="33.4" r="1.6" fill="${DN.limbDeep}" opacity="0.4"/><circle cx="33.6" cy="88" r="2.2" fill="${DN.limbDeep}" opacity="0.4"/><circle cx="94.6" cy="84" r="2.6" fill="${DN.limbDeep}" opacity="0.4"/>
<ellipse cx="64" cy="111" rx="26" ry="19" fill="${DN.belly}" stroke="${DN.bellyLine}" stroke-width="1.6"/>
<path d="M45 100.4 Q64 95.6 83 100.4 M43 105.6 Q64 100.8 85 105.6" fill="none" stroke="${DN.bellyLine}" stroke-width="1.5" stroke-linecap="round"/>
</g>
<ellipse cx="41" cy="76" rx="7" ry="4.5" fill="${cheek}" opacity="${blush}"/><ellipse cx="87" cy="76" rx="7" ry="4.5" fill="${cheek}" opacity="${blush}"/>
<ellipse cx="59.6" cy="70.6" rx="1.5" ry="1.7" fill="${DN.rim}" opacity="0.75"/><ellipse cx="68.4" cy="70.6" rx="1.5" ry="1.7" fill="${DN.rim}" opacity="0.75"/>
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}
${extras.map(extra).join("")}${sign}
</svg>
`;
  }

  // name → art, as Candy's own: every mood its face; `eyes` only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.85 },
    "celebrate-1.svg": { mouth: "grin", cheeks: 0.85, arms: [55, 55] },
    "celebrate-2.svg": { mouth: "grin", cheeks: 0.85, arms: [88, 88], wag: true },
    "worried.svg": { brows: "worried", mouth: "wavy", extras: ["sweat"] },
    "shocked.svg": { brows: "worried", mouth: "o" },
    "sleepy.svg": { eyes: "closed", mouth: "smallO", cheeks: 0.35 },
    "alert.svg": { mouth: "smallO" },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", arms: [0, 80], stop: true },
    "confused.svg": { mouth: "wavy", cheeks: 0.3 },
    "love.svg": { mouth: "smile", cheeks: 0.9 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 62] },
    "wave-2.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 96], wag: true },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.8 },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.3, extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.4 },
    "nervous.svg": { brows: "worried", mouth: "grit", cheeks: 0.3, extras: ["sweat2"] },
    "curious.svg": { brows: "raised", mouth: "smallO" },
    "angry.svg": { brows: "stern", mouth: "roar", cheeks: 0, extras: ["flush"] },
    // The tail wags, down and up.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9 },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, wag: true },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.35 },
    "cool.svg": { brows: "raised", mouth: "smirk", cheeks: 0.45 },
    "sick.svg": { eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, extras: ["sweat"], pale: true },
  };

  const LAYERS = ["open", "blink", "happy", "wide", "narrow", "sparkle", "hearts", "stars", "dots"];
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
    confused: { frames: ["confused.svg"], ...eyes("dots") },
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
    cool: { frames: ["cool.svg"], ...eyes("narrow", "blink") },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, art] of Object.entries(FRAMES)) files[name] = dino(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = dino({ eyes: "open" });
  return { name: "Dinosaur", frames: files, look: LOOK };
}
