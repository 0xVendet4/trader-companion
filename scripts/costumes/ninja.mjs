// Ninja: Candy in a midnight-blue hood and mask, only the eyes showing
// through a slit, a crimson headband whose ends trail behind, a sash to
// match, a sword's hilt over the shoulder, wrapped hands and split-toe boots.
//
// The mask has no mouth to show a mood with: the slit does it, the cloth
// over the eyes taking the shape a brow would (down to the middle when
// angry, up when worried, pushed up by a grin), with the eyes inside it and
// the folds of the mask where the mouth is. The headband's ends rest, flap
// in a cheer and hang when it's tired; a throwing star held up when proud,
// a wink and a glint with the ends in the wind when it's cool. The forearms
// are wrapped in light cloth and the sleeves and boots catch the light on
// their edge, so the limbs read on the island's black.
//
// Drawn by scripts/gen-placeholder-mascot.mjs, which hands over the shared
// parts (`kit`) and writes what this returns into public/mascot/<dir>. The
// body is Candy's rectangle (28, 24, 72 × 82), so hats and face accessories
// sit on it as they sit on Candy, and the eyes are where Candy's are.

const N = {
  top: "#465073",
  bottom: "#1a1f30",
  paleTop: "#6f7895",
  paleBottom: "#3a4157",
  rim: "#07080d",
  sleeve: "#363e5c",
  boot: "#2c3350",
  /** Light on the edge of a sleeve or a boot: they read on black. */
  sheen: "#6b7697",
  crease: "#0c0f1c",
  band: "#e11d48",
  bandDeep: "#9f1239",
  bandLight: "#fda4af",
  skin: "#f8d3ad",
  skinDeep: "#e3a97c",
  paleSkin: "#dfe9cf",
  paleSkinDeep: "#b2c99c",
  ink: "#1c1222",
  cloth: "#d5dbe6",
  clothDeep: "#9aa4b8",
  hilt: "#2c3147",
  steel: "#cbd5e1",
  gold: "#d4a72c",
};

const NL = 51; // left eye x (the right one is mirrored: 77)
const NY = 60.5; // eye y

/**
 * The slit in the mask, one piece across both eyes: `[tip y, top near the tip,
 * top near the middle]` for each side, the top and bottom at the middle,
 * `[bottom near the tip, bottom near the middle]` for each side.
 */
function slitPath({ l, r = l, tc, lb, rb = lb, bc }) {
  return (
    `M36.5 ${l[0]} C40 ${l[1]} 52 ${l[2]} 64 ${tc} C76 ${r[2]} 88 ${r[1]} 91.5 ${r[0]} ` +
    `C88 ${rb[0]} 76 ${rb[1]} 64 ${bc} C52 ${lb[1]} 40 ${lb[0]} 36.5 ${l[0]} Z`
  );
}

const SLITS = {
  open: { l: [60.5, 52, 50.5], tc: 52.5, lb: [69.5, 71], bc: 69.5 },
  // Pushed up from below by a grin.
  glee: { l: [60.5, 53.5, 52.5], tc: 54, lb: [66, 67.5], bc: 66.5 },
  wide: { l: [60.5, 49, 47], tc: 49.5, lb: [72, 74], bc: 72 },
  narrow: { l: [60.5, 55.5, 55], tc: 56, lb: [68, 69], bc: 68 },
  half: { l: [61, 57.5, 57.5], tc: 58, lb: [68.5, 69.5], bc: 68.5 },
  closed: { l: [61, 56, 56], tc: 56.5, lb: [67.5, 68.5], bc: 67.5 },
  // Down to the middle: a scowl.
  angry: { l: [57.5, 50.5, 54.5], tc: 60, lb: [69.5, 71], bc: 69 },
  // Up at the middle.
  worried: { l: [62, 57.5, 51.5], tc: 49, lb: [70, 71], bc: 69.5 },
  // One side wide, the other squinting.
  confused: { l: [59.5, 48.5, 47.5], r: [61, 56, 55.5], tc: 52.5, lb: [70, 71.5], bc: 69.5 },
  // One brow up.
  curious: { l: [59.5, 48.5, 47.5], r: [61, 54, 53], tc: 51, lb: [69.5, 71], bc: 69.5 },
  // A wink: the shut side drawn down, the open one level.
  smug: { l: [61, 57.5, 57], r: [60.5, 54, 53.5], tc: 55.5, lb: [68.5, 69.5], rb: [68.5, 70], bc: 68.5 },
};

export default function ninja({ EXTRAS, mirror, stopSign, star, heart, turned, wrap, dir }) {
  const line = (d, w, color = N.ink, extra = "") =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const both = (left) => left + mirror(left);

  // ── The eyes (the left one; the right is its mirror image) ──────────────────
  const EYE = {
    open: `<ellipse cx="${NL}" cy="${NY}" rx="5" ry="6.2" fill="${N.ink}"/><circle cx="${NL + 1.8}" cy="${NY - 2.8}" r="1.8" fill="#fff"/>`,
    blink: line(`M${NL - 5.5} ${NY + 1} Q${NL} ${NY + 3.6} ${NL + 5.5} ${NY + 1}`, 3),
    happy: line(`M${NL - 5.5} ${NY + 3} Q${NL} ${NY - 4.4} ${NL + 5.5} ${NY + 3}`, 3.2),
    closed: line(`M${NL - 5.5} ${NY - 1} Q${NL} ${NY + 4.4} ${NL + 5.5} ${NY - 1}`, 3),
    half: `<path d="M${NL - 5.4} ${NY + 0.5} A5.4 5.6 0 0 0 ${NL + 5.4} ${NY + 0.5} Z" fill="${N.ink}"/>` + line(`M${NL - 6.6} ${NY + 0.5} L${NL + 6.6} ${NY + 0.5}`, 2.6),
    smug: line(`M${NL - 6} ${NY + 1.6} Q${NL} ${NY - 2.6} ${NL + 6} ${NY + 1.6}`, 3.2),
    narrow: `<ellipse cx="${NL}" cy="${NY + 1}" rx="5.4" ry="4" fill="${N.ink}"/><circle cx="${NL + 1.8}" cy="${NY - 0.4}" r="1.4" fill="#fff"/>`,
    // Narrowed, a red glint in them.
    glare: `<ellipse cx="${NL}" cy="${NY + 1}" rx="5.4" ry="4" fill="${N.ink}"/><circle cx="${NL + 1}" cy="${NY + 1}" r="2" fill="#ef4444"/><circle cx="${NL + 1.6}" cy="${NY + 0.2}" r="0.8" fill="#fff"/>`,
    wideWhite: `<circle cx="${NL}" cy="${NY}" r="7" fill="#ffffff" stroke="${N.ink}" stroke-width="2.4"/>`,
    widePupil: `<circle cx="${NL}" cy="${NY + 0.6}" r="3" fill="${N.ink}"/>`,
    sparkle: `<ellipse cx="${NL}" cy="${NY}" rx="5.8" ry="7" fill="${N.ink}"/><circle cx="${NL + 2}" cy="${NY - 3}" r="2.1" fill="#fff"/><circle cx="${NL - 1.8}" cy="${NY + 2.8}" r="1.1" fill="#fff"/>`,
    stars: star(NL, NY, 7.4),
    hearts: heart(NL, NY, 0.8),
    dots: `<circle cx="${NL}" cy="${NY}" r="3.2" fill="${N.ink}"/>`,
    spiral: line(`M${NL} ${NY} m-1 0 a1.2 1.2 0 1 1 2.4 0 a2.8 2.8 0 1 1 -5.6 0 a4.4 4.4 0 1 1 8.8 0 a5.8 5.8 0 1 1 -11.6 0`, 2.2),
    // Shut in a smug arch: the winking eye.
    wink: line(`M${NL - 6} ${NY + 1.8} Q${NL} ${NY - 3.4} ${NL + 6} ${NY + 1.8}`, 3.4),
    // Narrowed, with a glint of light at its outer corner (the open eye of the wink).
    glint:
      `<ellipse cx="${NL}" cy="${NY + 1}" rx="5.4" ry="4.2" fill="${N.ink}"/><circle cx="${NL + 1.8}" cy="${NY - 0.4}" r="1.4" fill="#fff"/>` +
      `<path d="M${NL - 7.6} ${NY - 7.4} Q${NL - 7.6} ${NY - 4.6} ${NL - 4.8} ${NY - 4.6} Q${NL - 7.6} ${NY - 4.6} ${NL - 7.6} ${NY - 1.8} Q${NL - 7.6} ${NY - 4.6} ${NL - 10.4} ${NY - 4.6} Q${NL - 7.6} ${NY - 4.6} ${NL - 7.6} ${NY - 7.4} Z" fill="#ffffff" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round"/>`,
  };
  /** The wink: the left eye shut, the right one open with a glint (its mirror image). */
  const WINK = EYE.wink + mirror(EYE.glint);
  /** In the eyes layer (they look around); the rest stay in the frame. */
  const LAYERED = { open: "open", narrow: "narrow", glare: "glare", sparkle: "sparkle", happy: "happy", wide: "widePupil", stars: "stars", hearts: "hearts", dots: "dots", wink: "wink" };

  /** Folds of the mask where the mouth is: a mood shows through the cloth. */
  const crease = (d, w = 2.4) => line(d, w, N.crease);
  const MOUTHS = {
    none: "",
    smile: crease("M56 80.5 Q64 85.5 72 80.5"),
    smirk: crease("M57 82.5 Q66 85 72.5 79"),
    frown: crease("M56.5 85 Q64 79.5 71.5 85"),
    flat: crease("M58 82.5 L70 82.5"),
    wavy: crease("M54 82.5 Q57.5 80 61 82.5 T68 82.5 T75 82.5", 2.2),
    grit: crease("M55 83 L58.5 80.8 L62 83 L65.5 80.8 L69 83 L72.5 80.8", 2.2),
    o: `<ellipse cx="64" cy="82.5" rx="4" ry="4.8" fill="${N.crease}" opacity="0.8"/>`,
    smallO: `<ellipse cx="64" cy="82" rx="2.6" ry="3.2" fill="${N.crease}" opacity="0.8"/>`,
  };

  // ── Behind the body ─────────────────────────────────────────────────────────
  /** A sword's hilt over the left shoulder: a wrapped grip, a gold guard, a steel cap. */
  const HILT = (() => {
    const [gx, gy] = [31, 28];
    const [px, py] = [14, 6];
    const at = (k) => [gx + (px - gx) * k, gy + (py - gy) * k].map((n) => +n.toFixed(2));
    const diamonds = [0.3, 0.5, 0.7]
      .map((k) => {
        const [x, y] = at(k);
        return `<rect x="${x - 1.6}" y="${y - 1.6}" width="3.2" height="3.2" fill="${N.clothDeep}" transform="rotate(${(-37.7).toFixed(1)} ${x} ${y})"/>`;
      })
      .join("");
    return (
      `<path d="M${gx} ${gy} L${px} ${py}" stroke="${N.rim}" stroke-width="8.6" stroke-linecap="round"/>` +
      `<path d="M${gx} ${gy} L${px} ${py}" stroke="${N.hilt}" stroke-width="5.4" stroke-linecap="round"/>` +
      diamonds +
      `<circle cx="${px}" cy="${py}" r="3" fill="${N.steel}" stroke="${N.rim}" stroke-width="1.6"/>` +
      `<ellipse cx="${gx}" cy="${gy}" rx="6.6" ry="2.6" fill="${N.gold}" stroke="${N.rim}" stroke-width="1.8" transform="rotate(-37.7 ${gx} ${gy})"/>`
    );
  })();

  /** The headband's two ends, from the knot behind the head: at rest, flapping, hanging. */
  const TAILS = {
    rest: [
      "M95 33 C104 29 110 31 120 26 C121 30 121.5 33 121 36 C112 38 106 39 96 42 Z",
      "M96 38 C104 42 108 48 112 58 C109.5 59.8 107 60.6 104.6 61 C103 52 100 47 95 44 Z",
    ],
    flap: [
      "M95 33 C104 27 112 24 122 17 C123.6 21 124 24.4 123.4 27.8 C114 33 106 37.6 96 42 Z",
      "M96 38 C106 39 114 41 123 47 C121.6 50 119.6 52.4 117.4 54 C110 48 103 46 95 44 Z",
    ],
    hang: [
      "M96 33 C104 38 108 48 109 62 C106.4 62.8 104 63 101.6 62.6 C101 52 99 45 95 42 Z",
      "M97 40 C103 48 106 58 105 72 C102.6 72.4 100.4 72 98.4 71.2 C99.4 60 98 50 95 44 Z",
    ],
  };
  const tails = (pose) =>
    TAILS[pose].map((d) => `<path d="${d}" fill="url(#nt)" stroke="${N.rim}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/>`).join("");

  /**
   * An arm in a dark sleeve, turned `deg` up: light along the sleeve's outer
   * edge, the forearm wrapped in light cloth, a wrapped hand.
   */
  function arm(deg) {
    const art =
      `<path d="M31 70 L19.5 91" stroke="${N.rim}" stroke-width="11" stroke-linecap="round"/>` +
      `<path d="M31 70 L19.5 91" stroke="${N.sleeve}" stroke-width="6.4" stroke-linecap="round"/>` +
      `<path d="M28.1 71.1 L23.5 79.5" stroke="${N.sheen}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M24.7 81.6 L20.9 88.5" stroke="${N.cloth}" stroke-width="6.2"/>` +
      `<path d="M20.6 82.6 L26.7 84.3 M19.2 85.1 L25.3 86.8" stroke="${N.clothDeep}" stroke-width="1.1" stroke-linecap="round"/>` +
      `<circle cx="18.6" cy="93.2" r="5.6" fill="url(#nh)" stroke="${N.rim}" stroke-width="2.4"/>` +
      `<path d="M14.6 91.4 L22.4 93.2 M14.4 94.8 L21.8 96.4" stroke="${N.clothDeep}" stroke-width="1.1" stroke-linecap="round"/>`;
    return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
  }

  /** A split-toe boot, light on its top edge, a wrap at the ankle. */
  const BOOT =
    `<path d="M42 100 L42 108" stroke="${N.rim}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M42 100 L42 108" stroke="${N.sleeve}" stroke-width="4.4" stroke-linecap="round"/>` +
    `<rect x="31.5" y="114.6" width="24" height="4.6" rx="2.3" fill="${N.rim}"/>` +
    `<path d="M32.4 115.4 Q32 107.6 42.4 106.8 Q52.6 106.6 55 112.2 L55.4 115.4 Z" fill="${N.boot}" stroke="${N.rim}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M34.4 111.4 Q35.2 108.8 42.4 108.4 Q49.8 108.4 52.6 111" fill="none" stroke="${N.sheen}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<path d="M49.6 109.6 L50.4 115.2" stroke="${N.rim}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<ellipse cx="42" cy="106.4" rx="5.8" ry="1.9" fill="${N.cloth}" stroke="${N.rim}" stroke-width="1.2"/>`;

  // ── On the body, clipped to it: they stay put when the face turns ───────────
  const CLOTH =
    `<ellipse cx="44" cy="34" rx="13" ry="6" fill="#ffffff" opacity="0.1" transform="rotate(-22 44 34)"/>` +
    // The headband across the forehead.
    `<path d="M22 32.5 Q64 24.5 106 32.5 L106 43.5 Q64 35.5 22 43.5 Z" fill="url(#nt)" stroke="${N.rim}" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M24 35.4 Q64 27.4 104 35.4" fill="none" stroke="${N.bandLight}" stroke-width="1.3" opacity="0.65"/>` +
    // The jacket's collar, crossed, and the sash.
    `<path d="M53 90 L64 100.5 L75 90" fill="none" stroke="${N.crease}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M55.6 90.4 L64 98.4" fill="none" stroke="#6b7697" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>` +
    `<path d="M20 97 Q64 104 108 97 L108 112 L20 112 Z" fill="url(#nt)" stroke="${N.rim}" stroke-width="2" stroke-linejoin="round"/>`;

  // ── Extras ──────────────────────────────────────────────────────────────────
  /** Drops of sweat beside the hood, clear of its edge and outline (x 25.5 to 102.5): nothing covers them. */
  const SWEAT = `<path d="M18 40 C14 47 12 51 15 55 C18 58 23 56 23 52 C23 49 21 46 18 40 Z" fill="#7dd3fc" stroke="${N.rim}" stroke-width="2"/>`;
  const SWEAT_RIGHT = `<path d="M108.5 63 C105.5 68 104.5 71 106.5 73 C108.5 75 111.5 74 111.5 71 C111.5 69 110.5 67 108.5 63 Z" fill="#7dd3fc" stroke="${N.rim}" stroke-width="2"/>`;
  const TEAR = `<path d="M47 66.5 C44 72.5 44 75.5 47 76.5 C50 75.5 50 72.5 47 66.5 Z" fill="#7dd3fc" stroke="${N.rim}" stroke-width="1.5"/>`;
  const cheeks = (k, color = "#fb7185") =>
    k > 0 ? `<ellipse cx="44" cy="75.5" rx="6.5" ry="3.8" fill="${color}" opacity="${k}"/><ellipse cx="84" cy="75.5" rx="6.5" ry="3.8" fill="${color}" opacity="${k}"/>` : "";

  /** A throwing star held up in the right hand. */
  function shuriken(deg) {
    const [x0, y0] = turned(18.6, 93.2, deg);
    const [cx, cy] = [+(128 - x0).toFixed(1), +(y0 - 14).toFixed(1)];
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? 11 : 3.8;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    return (
      `<polygon points="${pts.join(" ")}" fill="${N.steel}" stroke="${N.rim}" stroke-width="2" stroke-linejoin="round"/>` +
      `<circle cx="${cx}" cy="${cy}" r="2.2" fill="${N.rim}"/>` +
      `<path d="M${cx - 3.2} ${cy - 5.6} L${cx - 1} ${cy - 2.6}" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>`
    );
  }

  /** One frame; eyes with a layer are left to it (only the whites of wide eyes stay). */
  function frame(o, eyesApart = true) {
    const { slit = "open", eyes = null, mouth = "none", arms = [0, 0], tail = "rest", blush = 0, pale = false } = o;
    const [top, bottom] = pale ? [N.paleTop, N.paleBottom] : [N.top, N.bottom];
    const [skin, skinDeep] = pale ? [N.paleSkin, N.paleSkinDeep] : [N.skin, N.skinDeep];
    const eyeArt = !eyes
      ? ""
      : eyes === "wide"
        ? both(EYE.wideWhite) + (eyesApart ? "" : both(EYE.widePupil))
        : eyesApart && LAYERED[eyes]
          ? ""
          : eyes === "wink"
            ? WINK
            : both(EYE[eyes]);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="nb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="nt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${N.band}"/><stop offset="1" stop-color="${N.bandDeep}"/></linearGradient><linearGradient id="ns" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${skinDeep}"/></linearGradient><linearGradient id="nh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${N.cloth}"/><stop offset="1" stop-color="${N.clothDeep}"/></linearGradient><clipPath id="nc"><rect x="28" y="24" width="72" height="82" rx="22"/></clipPath></defs>
${HILT}
${tails(tail)}
${arm(arms[0])}${mirror(arm(arms[1]))}
${BOOT}${mirror(BOOT)}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#nb)" stroke="${N.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#nc)">${CLOTH}</g>
<path d="${slitPath(SLITS[slit])}" fill="url(#ns)" stroke="${N.rim}" stroke-width="2.4" stroke-linejoin="round"/>
${cheeks(blush)}${o.flush ? cheeks(0.6, "#ef4444") : ""}${eyeArt}${MOUTHS[mouth]}${o.tear ? TEAR : ""}
${o.sweat ? SWEAT : ""}${o.sweat === 2 ? SWEAT_RIGHT : ""}${o.puff ? EXTRAS.puff() : ""}${o.shuriken ? shuriken(arms[1]) : ""}${o.stop ? stopSign(110, 52) : ""}
</svg>
`;
  }

  const FRAMES = {
    "idle.svg": { eyes: "open", mouth: "smile" },
    "happy.svg": { slit: "glee", eyes: "happy", mouth: "smile", blush: 0.5 },
    "celebrate-1.svg": { slit: "wide", eyes: "stars", mouth: "smile", arms: [70, 70], tail: "flap", blush: 0.5 },
    "celebrate-2.svg": { slit: "wide", eyes: "stars", mouth: "smile", arms: [105, 105], tail: "rest", blush: 0.5 },
    "worried.svg": { slit: "worried", eyes: "open", mouth: "wavy", sweat: 1 },
    "shocked.svg": { slit: "wide", eyes: "wide", mouth: "o" },
    "sleepy.svg": { slit: "closed", eyes: "closed", mouth: "smallO", tail: "hang" },
    "alert.svg": { slit: "wide", eyes: "wide", mouth: "smallO" },
    "tired.svg": { slit: "half", eyes: "half", mouth: "flat", sweat: 1, tail: "hang" },
    "stop.svg": { slit: "angry", eyes: "open", mouth: "flat", arms: [0, 95], stop: true },
    "confused.svg": { slit: "confused", eyes: "dots", mouth: "wavy" },
    "love.svg": { eyes: "hearts", mouth: "smile", blush: 0.9 },
    "wave-1.svg": { slit: "glee", eyes: "happy", mouth: "smile", arms: [0, 95], tail: "flap", blush: 0.5 },
    "wave-2.svg": { slit: "glee", eyes: "happy", mouth: "smile", arms: [0, 130], tail: "rest", blush: 0.5 },
    "proud.svg": { slit: "half", eyes: "smug", mouth: "smirk", arms: [0, 60], shuriken: true, blush: 0.4 },
    "sad.svg": { slit: "worried", eyes: "open", mouth: "frown", tear: true, tail: "hang" },
    "bored.svg": { slit: "half", eyes: "half", mouth: "flat", tail: "hang" },
    "focused.svg": { slit: "narrow", eyes: "narrow", mouth: "flat" },
    "nervous.svg": { slit: "wide", eyes: "wide", mouth: "grit", sweat: 2 },
    "curious.svg": { slit: "curious", eyes: "open", mouth: "smallO" },
    "angry.svg": { slit: "angry", eyes: "glare", mouth: "frown", flush: true },
    "excited.svg": { slit: "wide", eyes: "sparkle", mouth: "smile", arms: [40, 40], tail: "flap", blush: 0.6 },
    "relieved.svg": { slit: "closed", eyes: "closed", mouth: "smile", puff: true },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", tail: "hang" },
    // A wink and a glint, the headband's ends in the wind (focused is level, narrow and still).
    "cool.svg": { slit: "smug", eyes: "wink", mouth: "smirk", tail: "flap" },
    "sick.svg": { slit: "closed", eyes: "closed", mouth: "wavy", sweat: 1, tail: "hang", pale: true },
  };

  const EYE_FILES = {
    open: both(EYE.open),
    blink: both(EYE.blink),
    happy: both(EYE.happy),
    wide: both(EYE.widePupil),
    narrow: both(EYE.narrow),
    glare: both(EYE.glare),
    sparkle: both(EYE.sparkle),
    stars: both(EYE.stars),
    hearts: both(EYE.hearts),
    dots: both(EYE.dots),
    wink: WINK,
  };
  const eyes = (name, blink) => ({ eyes: `${dir}eyes-${name}.svg`, ...(blink ? { eyesBlink: `${dir}eyes-${blink}.svg` } : {}) });

  const look = {
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
    focused: { frames: ["focused.svg"], ...eyes("narrow") },
    nervous: { frames: ["nervous.svg"], ...eyes("wide") },
    curious: { frames: ["curious.svg"], ...eyes("open", "blink") },
    angry: { frames: ["angry.svg"], ...eyes("glare") },
    excited: { frames: ["excited.svg"], ...eyes("sparkle") },
    relieved: { frames: ["relieved.svg"] },
    dizzy: { frames: ["dizzy.svg"] },
    cool: { frames: ["cool.svg"], ...eyes("wink") },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, o] of Object.entries(FRAMES)) files[name] = frame(o);
  for (const [name, art] of Object.entries(EYE_FILES)) files[`eyes-${name}.svg`] = wrap(art);
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = frame(FRAMES["idle.svg"], false);
  return { name: "Ninja", frames: files, look };
}
