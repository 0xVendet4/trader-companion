// Bear: Candy as the market's bear, a cuddly one. Warm brown-red fur, round
// ears with pink insides, a pale muzzle with a button nose and a little "ω"
// of a mouth, shiny button eyes, a lighter belly, padded paws with small
// claws. Cute, never scary: angry, it pouts; sad, its eyes go watery; excited,
// it paws the air one arm then the other.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/bear/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the body, Candy's own (so hats and face accessories sit where they do on
// him); the belly and the shine are clipped to it, so they stay put as skin;
// the muzzle, the nose and the line under it are clipped to a box around the
// face, so they turn with it as one piece (and are not taken for the mouth,
// which hides while he swallows: the box is under 49 tall and its middle no
// lower than y 73.2, or the rig reads it as skin or as mouth); the eyes are
// layers. The mouth sits low on the muzzle: opened wide (a link held over
// him), it opens under the nose, which stays in sight (rig.test.ts).

const BR = {
  top: "#dd8a68",
  bottom: "#933628",
  limb: "#b8563f",
  limbDeep: "#7c2b1e",
  rim: "#1e0906",
  ear: "#f6a98f",
  muzzleTop: "#fde8d3",
  muzzleBottom: "#f0c6a3",
  nose: "#3a1410",
  belly: "#f6c4a2",
  pad: "#f7c9ad",
  claw: "#fff7ed",
  mouth: "#5a1a1a",
  tongue: "#fb7185",
  eye: "#1e0906",
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);
const line = (d, w = 3.4, color = BR.rim) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** A round ear on the top corner of the head, pink inside. */
const EAR =
  `<circle cx="33.4" cy="30.6" r="11.6" fill="url(#rl)" stroke="${BR.rim}" stroke-width="4.6" paint-order="stroke"/>` +
  `<circle cx="34.8" cy="32" r="6.4" fill="${BR.ear}"/>` +
  `<path d="M26.4 27 Q28 22.6 32.6 21.6" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/>`;

/**
 * Small white claws over a paw's edge: each [x, y, turn] starts at (x, y),
 * just inside the outline, and points down (turned `turn` degrees), its tip
 * out past the outline.
 */
const claws = (at, len) =>
  at
    .map(([x, y, turn]) => {
      const claw = `<path d="M${f(x - 1.4)} ${y} Q${x} ${f(y + len * 1.35)} ${f(x + 1.4)} ${y} Z" fill="${BR.claw}" stroke="${BR.rim}" stroke-width="0.9" stroke-linejoin="round"/>`;
      return turn ? `<g transform="rotate(${turn} ${x} ${y})">${claw}</g>` : claw;
    })
    .join("");

/** A paw at the end of the arm, pointing down from (19.5, 91): the paw, its pad, three claws. */
const PAW =
  `<circle cx="19.5" cy="92.4" r="6.2" fill="url(#rl)" stroke="${BR.rim}" stroke-width="2.4"/>` +
  `<ellipse cx="19.5" cy="93.4" rx="3.3" ry="2.7" fill="${BR.pad}"/>` +
  claws([[16.3, 96.6, 24], [19.5, 97.4, 0], [22.7, 96.6, -24]], 3.6);

/** An arm from the shoulder (31, 70), turned `deg` up: brown fur, a padded paw. */
function arm(deg) {
  const art =
    `<path d="M31 70 L20 89.6" stroke="${BR.rim}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M31 70 L20 89.6" stroke="${BR.limb}" stroke-width="6.4" stroke-linecap="round"/>` +
    `<g transform="rotate(29.3 19.5 92.4)">${PAW}</g>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}

/** Where the right paw ends up when its arm turns `deg` up. */
function rightHand(deg) {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [19.5 - 31, 95 - 70];
  return [128 - (31 + dx * Math.cos(a) - dy * Math.sin(a)), 70 + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** A short leg on a round padded foot, three claws out at the front. */
const FOOT =
  `<path d="M42 100 L42 107" stroke="${BR.rim}" stroke-width="8.4" stroke-linecap="round"/>` +
  `<path d="M42 100 L42 107" stroke="${BR.limb}" stroke-width="4.8" stroke-linecap="round"/>` +
  `<ellipse cx="42.4" cy="112.2" rx="11.4" ry="6.6" fill="url(#rl)" stroke="${BR.rim}" stroke-width="2.6"/>` +
  `<path d="M35.4 110 Q38.6 107.6 43 107.8" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.35"/>` +
  claws([[37.2, 116.6, 16], [42.4, 117.4, 0], [47.6, 116.6, -16]], 3.6);

/**
 * A shiny button eye at x: `rx`/`ry` its size, `glint` and `small` its two
 * highlights ([dx, dy, r] from its centre; `small` null for none), `watery`
 * a pool of tears in its lower half (sad); `lid` a y the lid comes down to
 * (only what is under it shows), clipped by `id`.
 */
function button(x, { rx = 6.4, ry = 7.6, glint = [2, -2.6, 2.4], small = [-2.2, 2.6, 1.1], watery = false, lid = null, id = "" }) {
  const art =
    `<ellipse cx="${x}" cy="${EY}" rx="${rx}" ry="${ry}" fill="${BR.eye}"/>` +
    (watery ? `<path d="M${f(x - rx + 1.4)} ${f(EY + 2.4)} Q${x} ${f(EY + ry + 1.6)} ${f(x + rx - 1.4)} ${f(EY + 2.4)} Q${x} ${f(EY + ry - 2.4)} ${f(x - rx + 1.4)} ${f(EY + 2.4)} Z" fill="#7dd3fc" opacity="0.9"/>` : "") +
    `<circle cx="${f(x + glint[0])}" cy="${f(EY + glint[1])}" r="${glint[2]}" fill="#ffffff"/>` +
    (small ? `<circle cx="${f(x + small[0])}" cy="${f(EY + small[1])}" r="${small[2]}" fill="#ffffff" opacity="0.9"/>` : "");
  if (lid == null) return art;
  // Lids down to a line at y `lid`: only what is under it shows.
  return (
    `<clipPath id="${id}"><rect x="${x - 10}" y="${lid}" width="20" height="${EY + 12 - lid}"/></clipPath>` +
    `<g clip-path="url(#${id})">${art}</g>` +
    line(`M${f(x - rx - 1.2)} ${lid} L${f(x + rx + 1.2)} ${lid}`, 3)
  );
}

export default function drawBear({ EXTRAS, stopSign, EYES, INK, dir, wrap }) {
  /** Candy's own eye art, in the bear's ink. */
  const ink = (s) => s.replaceAll(INK, BR.rim);
  const pair = (one) => one(L, "l") + one(R, "r");

  const EYE = {
    open: pair((x) => button(x, {})),
    blink: pair((x) => line(`M${x - 6.6} ${EY + 1} Q${x} ${EY + 5.6} ${x + 6.6} ${EY + 1}`, 3.2)),
    happy: pair((x) => line(`M${x - 6.8} ${EY + 3} Q${x} ${EY - 6.6} ${x + 6.8} ${EY + 3}`, 3.8)),
    // Round and startled: a white rim, a small pupil.
    wide: pair(
      (x) =>
        `<circle cx="${x}" cy="${EY}" r="9.6" fill="#ffffff" stroke="${BR.rim}" stroke-width="2.6"/>` +
        `<circle cx="${x}" cy="${EY + 0.8}" r="4.4" fill="${BR.eye}"/><circle cx="${x + 1.5}" cy="${EY - 0.8}" r="1.5" fill="#ffffff"/>`,
    ),
    // Lids half down: paying attention.
    narrow: pair((x, s) => button(x, { lid: EY - 1.6, id: `n${s}`, glint: [1.8, 0.6, 1.9], small: null })),
    // Big and shiny.
    sparkle: pair((x) => button(x, { rx: 7.4, ry: 8.8, glint: [2.2, -3, 2.9], small: [-2.4, 3, 1.5] })),
    // Watery: about to cry.
    teary: pair((x) => button(x, { watery: true, glint: [1.8, -2.8, 2.6] })),
    // A wink: one button eye, the other shut in a smile.
    wink: button(L, {}) + line(`M${R - 6.8} ${EY + 3} Q${R} ${EY - 6.6} ${R + 6.8} ${EY + 3}`, 3.8),
    hearts: ink(EYES.hearts),
    stars: ink(EYES.stars),
    dots: ink(EYES.dots),
    // No layer: in the frame.
    closed: ink(EYES.closed),
    half: pair((x, s) => button(x, { lid: EY + 0.6, id: `h${s}`, glint: [1.8, 3, 1.6], small: null })),
    smug: ink(EYES.smug),
    spiral: ink(EYES.spiral),
  };

  // Soft little brows.
  const BROWS = {
    none: "",
    worried: line(`M${L - 7} ${EY - 11} Q${L} ${EY - 13} ${L + 6} ${EY - 16}`) + line(`M${R + 7} ${EY - 11} Q${R} ${EY - 13} ${R - 6} ${EY - 16}`),
    stern: line(`M${L - 7} ${EY - 16} Q${L} ${EY - 14} ${L + 6} ${EY - 10.6}`, 3.8) + line(`M${R + 7} ${EY - 16} Q${R} ${EY - 14} ${R - 6} ${EY - 10.6}`, 3.8),
    raised: line(`M${L - 7} ${EY - 17} Q${L} ${EY - 22} ${L + 7} ${EY - 17}`) + line(`M${R - 7} ${EY - 13} Q${R} ${EY - 14.4} ${R + 7} ${EY - 13}`),
    flat: line(`M${L - 6.6} ${EY - 13.6} L${L + 6.6} ${EY - 13.6}`) + line(`M${R - 6.6} ${EY - 13.6} L${R + 6.6} ${EY - 13.6}`),
  };

  // Low on the muzzle, under the line down from the nose (drawn with the muzzle).
  const MOUTHS = {
    // The little "ω".
    smile: line("M56.6 88.4 Q60.3 93.4 64 89 Q67.7 93.4 71.4 88.4", 2.8),
    small: line("M59.6 89.4 Q61.8 91.8 64 89 Q66.2 91.8 68.4 89.4", 2.6),
    grin:
      `<path d="M55.6 87.4 Q64 101 72.4 87.4 Q64 89.8 55.6 87.4 Z" fill="${BR.mouth}"/>` +
      `<path d="M59 92.2 Q64 89.6 69 92.2 Q64 96 59 92.2 Z" fill="${BR.tongue}"/>` +
      `<path d="M55.6 87.4 Q64 101 72.4 87.4 Q64 89.8 55.6 87.4 Z" fill="none" stroke="${BR.rim}" stroke-width="2.6" stroke-linejoin="round"/>`,
    flat: line("M57.6 90.6 L70.4 90.6", 2.8),
    short: line("M60 90.4 L68 90.4", 2.6),
    wavy: line("M55.4 91 Q58.6 88.4 61.8 91 T68.2 91 T74.6 91", 2.6),
    o: `<ellipse cx="64" cy="91.8" rx="3.8" ry="3.6" fill="${BR.mouth}" stroke="${BR.rim}" stroke-width="2.4"/>`,
    smallO: `<ellipse cx="64" cy="91.6" rx="2.6" ry="2.9" fill="${BR.mouth}" stroke="${BR.rim}" stroke-width="2.2"/>`,
    frown: line("M57 94 Q60.5 89 64 89 Q67.5 89 71 94", 2.8),
    smirk: line("M57.6 90 Q65 93.6 71.6 88", 2.8),
    // A pout: lips pushed out, more cross than fierce.
    pout: `<path d="M58.4 93.4 Q64 87.6 69.6 93.4 Q64 91.6 58.4 93.4 Z" fill="${BR.mouth}" stroke="${BR.rim}" stroke-width="2.4" stroke-linejoin="round"/>`,
    // Teeth clenched, small.
    grit:
      `<rect x="57" y="89.4" width="14" height="5.6" rx="2.4" fill="#ffffff" stroke="${BR.rim}" stroke-width="2.2"/>` +
      `<path d="M60.5 89.4 L60.5 95 M64 89.4 L64 95 M67.5 89.4 L67.5 95 M57 92.2 L71 92.2" stroke="${BR.rim}" stroke-width="1.1"/>`,
  };
  // Where the line down from the nose stops: at the "ω"'s middle, or a little above a mouth it would run into.
  const PHILTRUM = { grin: 88, flat: 86.6, short: 86.4, o: 85, smallO: 85, smirk: 88, pout: 88, grit: 86 };

  const OWN = {
    // Red in the face: the cheeks go red (see `flushed`), a cross mark on the forehead.
    flush: () =>
      `<path d="M85.4 33.6 Q88.6 36.8 85.4 40 M95.8 33.6 Q92.6 36.8 95.8 40 M87.4 31.6 Q90.6 34.8 93.8 31.6 M87.4 42 Q90.6 38.8 93.8 42" fill="none" stroke="#ef4444" stroke-width="2.6" stroke-linecap="round"/>`,
    tear: () =>
      `<path d="M${L - 5} ${EY + 8} C${L - 8} ${EY + 14} ${L - 8} ${EY + 17} ${L - 5} ${EY + 18} C${L - 2} ${EY + 17} ${L - 2} ${EY + 14} ${L - 5} ${EY + 8} Z" fill="#7dd3fc" stroke="${BR.rim}" stroke-width="1.5"/>`,
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: BR.limb });

  /** A frame of the bear; `eyes` drawn here only when they have no layer. */
  function bear({ eyes = null, brows = "none", mouth = "smile", cheeks = 0.6, arms = [0, 0], extras = [], stop = false, pale = false }) {
    const lip = PHILTRUM[mouth] ?? 89;
    const [top, bottom] = pale ? ["#d9c2b4", "#8f7466"] : [BR.top, BR.bottom];
    const flushed = extras.includes("flush");
    const blush = flushed ? "0.85" : Math.min(0.95, cheeks).toFixed(2);
    const cheek = flushed ? "#ef4444" : "#ff8fab";
    let sign = "";
    if (stop) {
      const [hx, hy] = rightHand(arms[1]).map((n) => +n.toFixed(1));
      sign = stopSign(+(hx - 8).toFixed(1), +(hy - 4).toFixed(1));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="rl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BR.limb}"/><stop offset="1" stop-color="${BR.limbDeep}"/></linearGradient><linearGradient id="rm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BR.muzzleTop}"/><stop offset="1" stop-color="${BR.muzzleBottom}"/></linearGradient><clipPath id="rc"><rect x="28" y="24" width="72" height="82" rx="22"/></clipPath><clipPath id="rs"><rect x="44" y="48.6" width="40" height="49"/></clipPath></defs>
${EAR}<g transform="translate(128 0) scale(-1 1)">${EAR}</g>
${arm(arms[0])}<g transform="translate(128 0) scale(-1 1)">${arm(arms[1])}</g>
${FOOT}<g transform="translate(128 0) scale(-1 1)">${FOOT}</g>
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#rb)" stroke="${BR.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#rc)">
<ellipse cx="45" cy="34" rx="12" ry="5.5" fill="#ffffff" opacity="0.14" transform="rotate(-22 45 34)"/>
<ellipse cx="64" cy="113" rx="21" ry="15" fill="${BR.belly}" opacity="0.75"/>
</g>
<ellipse cx="39" cy="75" rx="6" ry="3.8" fill="${cheek}" opacity="${blush}"/><ellipse cx="89" cy="75" rx="6" ry="3.8" fill="${cheek}" opacity="${blush}"/>
<g clip-path="url(#rs)">
<ellipse cx="64" cy="83.4" rx="17" ry="12.8" fill="url(#rm)" stroke="${BR.rim}" stroke-width="2.6"/>
<path d="M64 79 L64 ${lip}" fill="none" stroke="${BR.rim}" stroke-width="2.6" stroke-linecap="round"/>
<path d="M58 73 Q64 69.8 70 73 Q70.8 76 67.2 77.8 L64 79.2 L60.8 77.8 Q57.2 76 58 73 Z" fill="${BR.nose}" stroke="${BR.rim}" stroke-width="1.4" stroke-linejoin="round"/>
<ellipse cx="61.8" cy="73.2" rx="2.2" ry="1.2" fill="#ffffff" opacity="0.75"/>
</g>
${BROWS[brows]}${eyes ? EYE[eyes] : ""}${MOUTHS[mouth]}
${extras.map(extra).join("")}${sign}
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
    "shocked.svg": { brows: "worried", mouth: "o", cheeks: 0.25 },
    "sleepy.svg": { eyes: "closed", mouth: "smallO", cheeks: 0.4 },
    "alert.svg": { mouth: "smallO" },
    "tired.svg": { eyes: "half", mouth: "flat", cheeks: 0.3, extras: ["sweat"] },
    "stop.svg": { brows: "stern", mouth: "flat", arms: [0, 95], stop: true },
    "confused.svg": { brows: "raised", mouth: "wavy", cheeks: 0.35 },
    "love.svg": { mouth: "smile", cheeks: 0.95 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 95] },
    "wave-2.svg": { mouth: "grin", cheeks: 0.85, arms: [0, 130] },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.8 },
    "sad.svg": { brows: "worried", mouth: "frown", cheeks: 0.35, extras: ["tear"] },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.3 },
    "focused.svg": { brows: "stern", mouth: "short", cheeks: 0.45 },
    "nervous.svg": { brows: "worried", mouth: "grit", cheeks: 0.35, extras: ["sweat2"] },
    "curious.svg": { brows: "raised", mouth: "smallO" },
    "angry.svg": { brows: "stern", mouth: "pout", extras: ["flush"] },
    // Pawing the air, one arm then the other.
    "excited-1.svg": { mouth: "grin", cheeks: 0.9, arms: [82, 28] },
    "excited-2.svg": { mouth: "grin", cheeks: 0.9, arms: [28, 82] },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.55, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.4 },
    "cool.svg": { brows: "raised", mouth: "smirk", cheeks: 0.5 },
    "sick.svg": { eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, extras: ["sweat"], pale: true },
  };

  const LAYERS = ["open", "blink", "happy", "wide", "narrow", "sparkle", "teary", "wink", "hearts", "stars", "dots"];
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
    stop: { frames: ["stop.svg"], ...eyes("narrow", "blink") },
    confused: { frames: ["confused.svg"], ...eyes("dots") },
    love: { frames: ["love.svg"], ...eyes("hearts") },
    wave: { frames: ["wave-1.svg", "wave-2.svg"], ...eyes("happy") },
    proud: { frames: ["proud.svg"] },
    sad: { frames: ["sad.svg"], ...eyes("teary", "blink") },
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
  for (const [name, art] of Object.entries(FRAMES)) files[name] = bear(art);
  for (const name of LAYERS) files[`eyes-${name}.svg`] = wrap(EYE[name]);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = bear({ eyes: "open" });
  // The mouth sits 9 lower than Candy's, on the snout: what he holds in it
  // (a pacifier, a rose) or wears under it (a bow tie) goes down as far.
  return { name: "Bear", frames: files, look: LOOK, mouthDrop: 9 };
}
