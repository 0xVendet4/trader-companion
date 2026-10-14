// Robot: Candy as a little tin robot. A boxy steel head with rivets and round
// bolts for ears, an antenna whose light shows the mood (green, amber, red,
// pink, dim), a blue-grey screen across the face where the eyes are LEDs, a
// speaker grille for a mouth whose LEDs make the shape of the expression,
// segmented arms with pincers and flat steel feet. The LEDs change colour with
// the mood too: cyan, amber when on edge, blue when sad, red when angry.
//
// Drawn for scripts/gen-placeholder-mascot.mjs (`npm run mascot`), which hands
// in its shared pieces and writes what this returns into costumes/robot/.
// The rig (src/mascot/rig.ts) reads it like every costume: the biggest rect is
// the head, the screen and the panel lines are clipped to it so they stay put
// as skin, the cheeks and the grille turn with the face, the eyes are layers.

const RB = {
  top: "#e3eaf3",
  bottom: "#7f91aa",
  rim: "#0e1522",
  steel: "#b4c1d2",
  steelDeep: "#5f708a",
  bolt: "#d5dde8",
  // A mid-tone screen, not a black one: dark shades and pixel shades stand out
  // on it down to ticker size, and the LEDs still glow.
  screenTop: "#7493bb",
  screenBottom: "#3d5b85",
  screen: "#060b16",
};

/** LED colours: `glow` lights the shape, `core` is its hot middle. */
const LED = {
  cyan: { glow: "#22d3ee", core: "#cffafe" },
  amber: { glow: "#f59e0b", core: "#fef3c7" },
  red: { glow: "#f43f5e", core: "#ffe4e6" },
  blue: { glow: "#7cb6ff", core: "#eff6ff" },
  pink: { glow: "#ec4899", core: "#fce7f3" },
  gold: { glow: "#facc15", core: "#fefce8" },
  dim: { glow: "#29b3d4", core: "#cffafe" },
};

/** The antenna's bulb, by mood. */
const BULB = {
  green: "#4ade80",
  amber: "#fbbf24",
  red: "#f43f5e",
  pink: "#f472b6",
  blue: "#60a5fa",
  dim: "#64748b",
};

const L = 50; // left eye x (where Candy's are: glasses and shades fit)
const R = 78; // right eye x
const EY = 60; // eye y

const f = (n) => +n.toFixed(2);

/** A lit rounded rect: a soft halo, the light, its hot core. */
function ledRect(x, y, w, h, rx, c) {
  const inset = Math.min(1.8, w / 4, h / 4);
  return (
    `<rect x="${f(x - 1.8)}" y="${f(y - 1.8)}" width="${f(w + 3.6)}" height="${f(h + 3.6)}" rx="${f(rx + 1.8)}" fill="${c.glow}" opacity="0.3"/>` +
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(rx)}" fill="${c.glow}"/>` +
    `<rect x="${f(x + inset)}" y="${f(y + inset)}" width="${f(w - 2 * inset)}" height="${f(h - 2 * inset)}" rx="${f(Math.max(0, rx - inset))}" fill="${c.core}" opacity="0.75"/>`
  );
}

/** A lit line: halo, light, core. */
function ledLine(d, c, w = 3) {
  return (
    `<path d="${d}" fill="none" stroke="${c.glow}" stroke-width="${f(w + 3.6)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>` +
    `<path d="${d}" fill="none" stroke="${c.glow}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${c.core}" stroke-width="${f(w * 0.4)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`
  );
}

/** A lit filled shape (a heart, a star, a slanted eye): halo, light, a glint. */
function ledShape(d, c, glint = null) {
  return (
    `<path d="${d}" fill="none" stroke="${c.glow}" stroke-width="3.6" stroke-linejoin="round" opacity="0.3"/>` +
    `<path d="${d}" fill="${c.glow}" stroke="${c.glow}" stroke-width="1.2" stroke-linejoin="round"/>` +
    (glint ? `<circle cx="${glint[0]}" cy="${glint[1]}" r="1.5" fill="${c.core}" opacity="0.9"/>` : "")
  );
}

function starD(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(" L")} Z`;
}
const heartD = (cx, cy, s) =>
  `M${cx} ${f(cy + 6 * s)} C${f(cx - 10 * s)} ${f(cy - s)} ${f(cx - 6 * s)} ${f(cy - 9 * s)} ${cx} ${f(cy - 4 * s)} C${f(cx + 6 * s)} ${f(cy - 9 * s)} ${f(cx + 10 * s)} ${f(cy - s)} ${cx} ${f(cy + 6 * s)} Z`;

/** Both eyes from one recipe, `x` the eye's centre. */
const both = (one) => one(L, "l") + one(R, "r");

/** The LED eyes, each in a colour. Slanted ones are drawn for the left eye and mirrored. */
function eyeArt(mirror) {
  const slanted = (left) => left + mirror(left);
  return {
    open: (c) => both((x) => ledRect(x - 4.5, EY - 7, 9, 14, 4, c)),
    blink: (c) => both((x) => ledRect(x - 6, EY + 0.8, 12, 2.6, 1.3, c)),
    happy: (c) => both((x) => ledLine(`M${x - 6} ${EY + 3} Q${x} ${EY - 7} ${x + 6} ${EY + 3}`, c, 3.2)),
    // Round and startled: a lens with its iris.
    wide: (c) =>
      both(
        (x) =>
          `<circle cx="${x}" cy="${EY}" r="9.2" fill="${c.glow}" opacity="0.3"/>` +
          `<circle cx="${x}" cy="${EY}" r="7.4" fill="none" stroke="${c.glow}" stroke-width="3"/>` +
          `<circle cx="${x}" cy="${EY}" r="7.4" fill="none" stroke="${c.core}" stroke-width="1" opacity="0.7"/>` +
          `<circle cx="${x}" cy="${EY}" r="2.6" fill="${c.core}"/>`,
      ),
    narrow: (c) => both((x) => ledRect(x - 5.5, EY - 1.5, 11, 5, 2.5, c)),
    // Top edge sloping down to the outside.
    worried: (c) => slanted(ledShape(`M${L - 4.5} ${EY - 2.5} L${L + 4.5} ${EY - 7} L${L + 4.5} ${EY + 6} L${L - 4.5} ${EY + 6} Z`, c, [L + 1.6, EY - 2.6])),
    // Top edge sloping down to the middle: a scowl.
    angry: (c) => slanted(ledShape(`M${L - 5} ${EY - 7} L${L + 5} ${EY - 2} L${L + 5} ${EY + 5.5} L${L - 5} ${EY + 5.5} Z`, c, [L - 1.6, EY - 2.8])),
    hearts: (c) => both((x) => ledShape(heartD(x, EY + 1, 1.12), c, [x - 3.6, EY - 3])),
    stars: (c) => both((x) => ledShape(starD(x, EY, 9.6), c)),
    dots: (c) => both((x) => ledRect(x - 2.6, EY - 2.6, 5.2, 5.2, 1.2, c)),
    // Big and bright: two glints each.
    sparkle: (c) =>
      both(
        (x) =>
          ledRect(x - 5.2, EY - 8, 10.4, 16, 4.6, c) +
          `<rect x="${x - 3.2}" y="${EY - 6}" width="2.6" height="3.6" rx="1.2" fill="#ffffff"/><circle cx="${x + 2.2}" cy="${EY + 4}" r="1.2" fill="#ffffff"/>`,
      ),
    // One eye zooms in, like a camera: "what's that?"
    curious: (c) =>
      ledRect(L - 4.5, EY - 7, 9, 14, 4, c) +
      `<circle cx="${R}" cy="${EY}" r="9.6" fill="${c.glow}" opacity="0.3"/>` +
      `<circle cx="${R}" cy="${EY}" r="7.8" fill="none" stroke="${c.glow}" stroke-width="2.8"/>` +
      `<circle cx="${R}" cy="${EY}" r="3.6" fill="${c.glow}"/><circle cx="${R}" cy="${EY}" r="1.8" fill="${c.core}"/>`,
    // A wink: one eye a bar, the other a happy arc.
    cool: (c) => ledRect(L - 5.5, EY - 1.5, 11, 5, 2.5, c) + ledLine(`M${R - 6} ${EY + 3} Q${R} ${EY - 6} ${R + 6} ${EY + 3}`, c, 3.2),
    // The ones below have no layer: drawn in the frame.
    closed: (c) => both((x) => ledLine(`M${x - 6} ${EY} Q${x} ${EY + 5} ${x + 6} ${EY}`, c, 2.8)),
    half: (c) => both((x) => ledRect(x - 5, EY + 1, 10, 5.5, 2.4, c) + `<path d="M${x - 7} ${EY} L${x + 7} ${EY}" stroke="${c.glow}" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>`),
    smug: (c) => both((x) => ledLine(`M${x - 6.5} ${EY + 2.5} Q${x} ${EY - 3} ${x + 6.5} ${EY + 2.5}`, c, 3.4)),
    spiral: (c) => both((x) => ledLine(`M${x} ${EY} m-1 0 a1.5 1.5 0 1 1 3 0 a3.5 3.5 0 1 1 -7 0 a5.5 5.5 0 1 1 11 0`, c, 2)),
    // Out of order.
    cross: (c) => both((x) => ledLine(`M${x - 4.5} ${EY - 4.5} L${x + 4.5} ${EY + 4.5} M${x + 4.5} ${EY - 4.5} L${x - 4.5} ${EY + 4.5}`, c, 2.8)),
  };
}

/** The grille's LEDs, in the panel at (64, 85). `eq`: bars like a music meter (a frame of two). */
const MOUTHS = {
  none: () => "",
  smile: (c) => ledLine("M57.5 83.4 Q64 89 70.5 83.4", c, 2.6),
  grin: (c) => ledShape("M56.5 82.2 L71.5 82.2 Q70.8 89.6 64 89.6 Q57.2 89.6 56.5 82.2 Z", c),
  flat: (c) => ledLine("M58 85 L70 85", c, 2.6),
  short: (c) => ledLine("M60.5 85 L67.5 85", c, 2.6),
  wavy: (c) => ledLine("M56 85 Q58 82.4 60 85 T64 85 T68 85 T72 85", c, 2.2),
  o: (c) => ledLine("M64 81.4 a3.4 3.6 0 1 1 0 7.2 a3.4 3.6 0 1 1 0 -7.2 Z", c, 2.2),
  smallO: (c) => ledLine("M64 83 a2 2.1 0 1 1 0 4.2 a2 2.1 0 1 1 0 -4.2 Z", c, 2),
  frown: (c) => ledLine("M57.5 88 Q64 82 70.5 88", c, 2.6),
  smirk: (c) => ledLine("M58 86.2 Q66 88 70.6 82.6", c, 2.6),
  // Static: teeth clenched.
  grit: (c) => ledLine("M55.6 85 L58 82.6 L60.4 87.4 L62.8 82.6 L65.2 87.4 L67.6 82.6 L70 87.4 L72.4 85", c, 1.8),
  eq: (c, k = 0) => {
    const hs = k ? [5, 3, 8, 4.5, 6.5] : [3, 6.5, 4, 8, 3.5];
    return [56.4, 60.2, 64, 67.8, 71.6].map((x, i) => ledRect(x - 1.25, 85 - hs[i] / 2, 2.5, hs[i], 1.1, c)).join("");
  },
};

/** An arm hanging from the shoulder (31, 70), turned `deg` up: ribbed steel, a pincer hand. */
function arm(deg) {
  const ribs = [0.28, 0.48, 0.68]
    .map((t) => {
      const x = 31 + (19.5 - 31) * t;
      const y = 70 + (91 - 70) * t;
      // Across the arm: perpendicular to (−11.5, 21).
      return `M${f(x - 3.4)} ${f(y - 1.86)} L${f(x + 3.4)} ${f(y + 1.86)}`;
    })
    .join(" ");
  const art =
    `<path d="M31 70 L19.5 91" stroke="${RB.rim}" stroke-width="10.5" stroke-linecap="round"/>` +
    `<path d="M31 70 L19.5 91" stroke="${RB.steel}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="${ribs}" stroke="${RB.steelDeep}" stroke-width="1.5" stroke-linecap="round"/>` +
    // The pincer, opening along the arm.
    `<g transform="rotate(28.7 19.5 91)">` +
    `<path d="M15.6 92.6 Q13.2 99.2 17.4 102.6 M23.4 92.6 Q25.8 99.2 21.6 102.6" fill="none" stroke="${RB.rim}" stroke-width="5.4" stroke-linecap="round"/>` +
    `<path d="M15.6 92.6 Q13.2 99.2 17.4 102.6 M23.4 92.6 Q25.8 99.2 21.6 102.6" fill="none" stroke="${RB.steel}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="19.5" cy="91.6" r="4.4" fill="${RB.steelDeep}" stroke="${RB.rim}" stroke-width="2.2"/>` +
    `<circle cx="19.5" cy="91.6" r="1.4" fill="${RB.bolt}"/>` +
    `</g>`;
  return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
}

/** A short steel leg on a flat foot with a dark sole. */
const FOOT =
  `<path d="M42 100 L42 109" stroke="${RB.rim}" stroke-width="7.5" stroke-linecap="round"/>` +
  `<path d="M42 100 L42 109" stroke="${RB.steelDeep}" stroke-width="4" stroke-linecap="round"/>` +
  `<path d="M39.6 103.4 L44.4 103.4 M39.6 106.4 L44.4 106.4" stroke="${RB.steel}" stroke-width="1.2" stroke-linecap="round"/>` +
  `<rect x="31.5" y="114.4" width="22" height="4.8" rx="2" fill="${RB.rim}"/>` +
  `<rect x="32" y="107.6" width="21" height="8.6" rx="3" fill="${RB.steel}" stroke="${RB.rim}" stroke-width="2.4"/>` +
  `<path d="M34.6 110.6 L41 110.6" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>`;

/** A round ear with a hex bolt in it, on the left side. */
const EAR = (() => {
  const hex = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    hex.push(`${f(22.6 + Math.cos(a) * 3.4)},${f(61 + Math.sin(a) * 3.4)}`);
  }
  return (
    `<circle cx="25.5" cy="61" r="8.6" fill="${RB.steel}" stroke="${RB.rim}" stroke-width="4" paint-order="stroke"/>` +
    `<circle cx="25.5" cy="61" r="5.6" fill="none" stroke="${RB.steelDeep}" stroke-width="1.4"/>` +
    `<polygon points="${hex.join(" ")}" fill="${RB.bolt}" stroke="${RB.rim}" stroke-width="1.4" stroke-linejoin="round"/>`
  );
})();

/** A rivet: a steel dot with a glint. */
const rivet = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="2.3" fill="${RB.steel}" stroke="${RB.steelDeep}" stroke-width="1.1"/><circle cx="${x - 0.7}" cy="${y - 0.7}" r="0.8" fill="#ffffff" opacity="0.8"/>`;

/** The chest: three status lights, or a battery running low (`bars` of `color`). */
function chest(kind) {
  if (kind === "lights") {
    return [
      [57, "#f43f5e"],
      [64, "#fbbf24"],
      [71, "#4ade80"],
    ]
      .map(([x, c]) => `<circle cx="${x}" cy="99" r="2.1" fill="${c}" stroke="${RB.rim}" stroke-width="1.1"/>`)
      .join("");
  }
  const [bars, c] = kind === "battery-low" ? [1, "#f43f5e"] : [2, "#fbbf24"];
  let out =
    `<rect x="56.2" y="95.6" width="14" height="7.4" rx="1.6" fill="${RB.screen}" stroke="${RB.rim}" stroke-width="1.6"/>` +
    `<rect x="70.6" y="97.6" width="2.2" height="3.4" rx="0.8" fill="${RB.rim}"/>`;
  for (let i = 0; i < bars; i++) out += `<rect x="${57.8 + i * 3.6}" y="97.2" width="2.8" height="4.2" rx="0.6" fill="${c}"/>`;
  return out;
}

export default function drawRobot({ mirror, EXTRAS, stopSign, dir, wrap }) {
  const EYE = eyeArt(mirror);

  // Robot extras, beside the shared ones (sweat, a puff…).
  const OWN = {
    // A drop of oil down the cheek, under the screen.
    tear: () =>
      `<path d="M45 77 C42 83 42 86 45 87 C48 86 48 83 45 77 Z" fill="#7dd3fc" stroke="${RB.rim}" stroke-width="1.5"/>`,
    // Steam out of the ears.
    steam: () =>
      [
        [15, 44],
        [113, 44],
      ]
        .map(
          ([x, y]) =>
            `<path d="M${x - 6} ${y + 4} q-1 -6 4 -6 q1 -5 6 -3 q5 -1 5 4 q4 2 1 5 q-2 3 -6 1 q-4 3 -7 0 q-4 1 -3 -1 Z" fill="#f1f5f9" stroke="${RB.rim}" stroke-width="1.6" stroke-linejoin="round" opacity="0.92"/>`,
        )
        .join("") +
      `<path d="M92 30 L98 25 M95 36 L102 34" stroke="${RB.rim}" stroke-width="2.4" stroke-linecap="round"/>`,
    // Sparks off the antenna.
    zap: () =>
      `<path d="M50 4 L54.5 9 L51 10 L55.5 15" fill="none" stroke="#fde047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M78 4 L73.5 9 L77 10 L72.5 15" fill="none" stroke="#fde047" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  const extra = (e) => (OWN[e] ?? EXTRAS[e])({ bottom: RB.steel });

  /** A frame of the robot; `eyes` drawn here only when they have no layer. */
  function robot({ eyes = null, led = "cyan", mouth = "smile", eq = 0, light = "green", cheeks = 0.35, arms = [0, 0], extras = [], stop = false, pale = false, chestKind = "lights" }) {
    const c = LED[led];
    const [top, bottom] = pale ? ["#d6dccd", "#8a9886"] : [RB.top, RB.bottom];
    const bulb = BULB[light];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="rs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${RB.screenTop}"/><stop offset="1" stop-color="${RB.screenBottom}"/></linearGradient><clipPath id="rc"><rect x="28" y="24" width="72" height="82" rx="12"/></clipPath></defs>
<path d="M64 26 L64 10" stroke="${RB.rim}" stroke-width="6.5" stroke-linecap="round"/><path d="M64 26 L64 10" stroke="${RB.steelDeep}" stroke-width="3" stroke-linecap="round"/>
<rect x="56" y="18" width="16" height="9" rx="3" fill="${RB.steel}" stroke="${RB.rim}" stroke-width="3" paint-order="stroke"/>
<circle cx="64" cy="8" r="9.6" fill="${bulb}" opacity="${light === "dim" ? 0 : 0.3}"/><circle cx="64" cy="8" r="6.4" fill="${bulb}" stroke="${RB.rim}" stroke-width="2.8"/><circle cx="61.8" cy="5.8" r="1.9" fill="#ffffff" opacity="0.85"/>
${EAR}${mirror(EAR)}
${arm(arms[0])}${mirror(arm(arms[1]))}
${FOOT}${mirror(FOOT)}
<rect x="28" y="24" width="72" height="82" rx="12" fill="url(#rb)" stroke="${RB.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#rc)">
<rect x="28" y="24" width="72" height="14" fill="#ffffff" opacity="0.2"/>
<path d="M28 39 L100 39 M28 94 L100 94" stroke="${RB.steelDeep}" stroke-width="1.6" opacity="0.7"/>
${rivet(35, 31.5)}${rivet(93, 31.5)}${rivet(35, 100)}${rivet(93, 100)}
<rect x="31" y="44" width="66" height="31" rx="9" fill="url(#rs)" stroke="${RB.rim}" stroke-width="3"/>
<path d="M37 47.6 L49 47.6 L41.4 56 L35.6 56 Z" fill="#ffffff" opacity="0.14"/>
${chest(chestKind)}
</g>
<ellipse cx="42" cy="84" rx="4.8" ry="2.5" fill="#fb7185" opacity="${cheeks}"/><ellipse cx="86" cy="84" rx="4.8" ry="2.5" fill="#fb7185" opacity="${cheeks}"/>
${eyes ? EYE[eyes](c) : ""}
<rect x="51" y="79.4" width="26" height="11.2" rx="4" fill="${RB.screen}" stroke="${RB.rim}" stroke-width="2.4"/>
${MOUTHS[mouth](c, eq)}
${extras.map(extra).join("")}${stop ? stopSign(110, 52) : ""}
</svg>
`;
  }

  // name → art. Every mood its own face; `eyes` here only for those with no layer.
  const FRAMES = {
    "idle.svg": {},
    "happy.svg": { mouth: "grin", cheeks: 0.7 },
    "celebrate-1.svg": { led: "gold", mouth: "eq", cheeks: 0.7, arms: [70, 70] },
    "celebrate-2.svg": { led: "gold", mouth: "eq", eq: 1, cheeks: 0.7, arms: [105, 105] },
    "worried.svg": { led: "amber", mouth: "wavy", light: "red", cheeks: 0.2, extras: ["sweat"] },
    "shocked.svg": { mouth: "o", light: "red", cheeks: 0.15, extras: ["zap"] },
    "sleepy.svg": { eyes: "closed", led: "dim", mouth: "smallO", light: "dim", cheeks: 0.25 },
    "alert.svg": { led: "amber", mouth: "smallO", light: "amber", cheeks: 0.2 },
    "tired.svg": { eyes: "half", led: "dim", mouth: "flat", light: "amber", cheeks: 0.15, extras: ["sweat"], chestKind: "battery" },
    "stop.svg": { led: "red", mouth: "flat", light: "red", cheeks: 0.15, arms: [0, 95], stop: true },
    "confused.svg": { mouth: "wavy", light: "amber", cheeks: 0.25 },
    "love.svg": { led: "pink", mouth: "smile", light: "pink", cheeks: 0.9 },
    "wave-1.svg": { mouth: "grin", cheeks: 0.7, arms: [0, 95] },
    "wave-2.svg": { mouth: "grin", cheeks: 0.7, arms: [0, 130] },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.6 },
    "sad.svg": { led: "blue", mouth: "frown", light: "blue", cheeks: 0.15, extras: ["tear"] },
    "bored.svg": { eyes: "half", mouth: "short", light: "dim", cheeks: 0.15 },
    "focused.svg": { mouth: "short", cheeks: 0.25 },
    "nervous.svg": { led: "amber", mouth: "grit", light: "amber", cheeks: 0.2, extras: ["sweat2"] },
    "curious.svg": { mouth: "smallO", light: "amber", cheeks: 0.35 },
    "angry.svg": { led: "red", mouth: "grit", light: "red", cheeks: 0.6, extras: ["steam"] },
    "excited.svg": { mouth: "eq", eq: 1, cheeks: 0.8 },
    "relieved.svg": { eyes: "closed", mouth: "smile", cheeks: 0.45, extras: ["sweat", "puff"] },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", light: "amber", cheeks: 0.25 },
    "cool.svg": { mouth: "smirk", cheeks: 0.4 },
    "sick.svg": { eyes: "cross", led: "dim", mouth: "wavy", light: "red", cheeks: 0, extras: ["sweat"], pale: true, chestKind: "battery-low" },
  };

  // The eyes layers: their own colour each.
  const EYES = {
    open: EYE.open(LED.cyan),
    blink: EYE.blink(LED.cyan),
    happy: EYE.happy(LED.cyan),
    wide: EYE.wide(LED.cyan),
    alert: EYE.wide(LED.amber),
    narrow: EYE.narrow(LED.cyan),
    worried: EYE.worried(LED.amber),
    sad: EYE.worried(LED.blue),
    angry: EYE.angry(LED.red),
    hearts: EYE.hearts(LED.pink),
    stars: EYE.stars(LED.gold),
    dots: EYE.dots(LED.cyan),
    sparkle: EYE.sparkle(LED.cyan),
    curious: EYE.curious(LED.cyan),
    cool: EYE.cool(LED.cyan),
  };
  const eyes = (name, blink) => ({ eyes: `${dir}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${dir}eyes-${blink}.svg` } : {}) });
  const LOOK = {
    idle: { frames: ["idle.svg"], ...eyes("open", "blink") },
    happy: { frames: ["happy.svg"], ...eyes("happy") },
    celebrate: { frames: ["celebrate-1.svg", "celebrate-2.svg"], ...eyes("stars") },
    worried: { frames: ["worried.svg"], ...eyes("worried") },
    shocked: { frames: ["shocked.svg"], ...eyes("wide") },
    sleepy: { frames: ["sleepy.svg"] },
    alert: { frames: ["alert.svg"], ...eyes("alert") },
    tired: { frames: ["tired.svg"] },
    stop: { frames: ["stop.svg"], ...eyes("angry") },
    confused: { frames: ["confused.svg"], ...eyes("dots", "blink") },
    love: { frames: ["love.svg"], ...eyes("hearts") },
    wave: { frames: ["wave-1.svg", "wave-2.svg"], ...eyes("happy") },
    proud: { frames: ["proud.svg"] },
    sad: { frames: ["sad.svg"], ...eyes("sad") },
    bored: { frames: ["bored.svg"] },
    focused: { frames: ["focused.svg"], ...eyes("narrow", "blink") },
    nervous: { frames: ["nervous.svg"], ...eyes("alert") },
    curious: { frames: ["curious.svg"], ...eyes("curious", "blink") },
    angry: { frames: ["angry.svg"], ...eyes("angry") },
    excited: { frames: ["excited.svg"], ...eyes("sparkle") },
    relieved: { frames: ["relieved.svg"] },
    dizzy: { frames: ["dizzy.svg"] },
    cool: { frames: ["cool.svg"], ...eyes("cool", "blink") },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, art] of Object.entries(FRAMES)) files[name] = robot(art);
  for (const [name, art] of Object.entries(EYES)) files[`eyes-${name}.svg`] = wrap(art);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = robot({ eyes: "open" });
  return { name: "Robot", frames: files, look: LOOK };
}
