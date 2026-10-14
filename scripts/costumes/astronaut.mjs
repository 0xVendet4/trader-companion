// Astronaut: Candy in a space suit. A white helmet and suit in one, a round
// visor with Candy's own face behind the glass (green; red on a loss, pale
// when tired or sick), a ring around the visor, an antenna whose light goes
// with the mood, a chest panel with three buttons and a mission patch, white
// sleeves with grey gloves, and moon boots.
//
// Every mood has its own face, Candy's whole range behind the glass, and a
// few of its own: the gold sun visor pulled down when it's cool, the glass
// fogging up with a sigh of relief, Candy's flag held up when it's proud,
// stars circling the helmet when it's dizzy, a heart for a light in love.
//
// Drawn by scripts/gen-placeholder-mascot.mjs, which hands over the shared
// parts (`kit`) and writes what this returns into public/mascot/<dir>. The
// body is Candy's rectangle (28, 24, 72 × 82), so hats and face accessories
// sit on it as they sit on Candy.

const A = {
  suit: "#ffffff",
  suitDeep: "#cbd5e1",
  sleeve: "#eef2f7",
  shade: "#aeb9c8",
  rim: "#141b2b",
  ring: "#e6ebf1",
  glove: "#c3ccd8",
  gloveDeep: "#8d99ab",
  cuff: "#60a5fa",
  sole: "#4b5567",
  gold: "#fde68a",
  goldDeep: "#d97706",
};

/** Candy's face behind the glass, in its mood's colours (as on Candy: red on a loss). */
const FACE = {
  green: ["#86efac", "#16a34a"],
  red: ["#fca5a5", "#dc2626"],
  sleepy: ["#bbf7d0", "#5f8f73"],
};

/** The antenna's light: calm, all good, something's up, switched off. */
const LIGHT = { idle: "#fbbf24", on: "#4ade80", warn: "#ef4444", off: "#64748b" };

/** Candy's face art (drawn about eyes at y 60) shrunk into the visor: eyes at 51.4 and 76.6, y 58. */
const FACE_T = "translate(64 58) scale(0.9) translate(-64 -60)";

/** The visor's glass; its ring is the same outline stroked wide. */
const glass = (attrs) => `<rect x="40" y="37" width="48" height="47" rx="18" ${attrs}/>`;

export default function astronaut({ EYES, EYE_LAYERS, BROWS, MOUTHS, INK, mirror, stopSign, star, heart, turned, wrap, dir }) {
  const inFace = (s) => (s ? `<g transform="${FACE_T}">${s}</g>` : "");
  const line = (d, w, color, extra = "") =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;

  // Candy's mouths, but an "o" that stays inside the glass.
  const mouths = { ...MOUTHS, o: `<ellipse cx="64" cy="80.5" rx="5.5" ry="6" fill="${INK}"/>`, none: "" };

  /** An arm hanging from the side, turned `deg` up: a white sleeve, a blue cuff, a grey glove. */
  function arm(deg) {
    const art =
      `<path d="M31 70 L19.5 91" stroke="${A.rim}" stroke-width="11.5" stroke-linecap="round"/>` +
      `<path d="M31 70 L19.5 91" stroke="${A.sleeve}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M28.6 75.6 L24.4 83.4" stroke="${A.shade}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<ellipse cx="21.6" cy="87.2" rx="5.4" ry="2.6" fill="${A.cuff}" stroke="${A.rim}" stroke-width="1.4" transform="rotate(28.7 21.6 87.2)"/>` +
      `<circle cx="18.4" cy="93.4" r="6" fill="url(#ag)" stroke="${A.rim}" stroke-width="2.4"/>` +
      `<path d="M15.4 92 Q18.4 90.2 21.4 92" fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>`;
    return deg ? `<g transform="rotate(${deg} 31 70)">${art}</g>` : art;
  }

  /** A moon boot: a white leg, a chunky white boot with a grey band and a dark sole. */
  const BOOT =
    `<path d="M42 100 L42 108" stroke="${A.rim}" stroke-width="8.5" stroke-linecap="round"/>` +
    `<path d="M42 100 L42 108" stroke="${A.sleeve}" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="30.6" y="114.2" width="25.8" height="5.2" rx="2.6" fill="${A.sole}" stroke="${A.rim}" stroke-width="1.6"/>` +
    `<path d="M31.8 115.2 Q31.4 106.2 42.4 105.4 Q53.6 105.2 56 111.8 L56.4 115.2 Z" fill="url(#ab)" stroke="${A.rim}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M33.4 111 Q44 108.8 55 111.2" fill="none" stroke="${A.shade}" stroke-width="1.8" stroke-linecap="round"/>`;

  /** The antenna, out of the helmet's top right, its light in the mood's colour (a heart in love). */
  function antenna(light) {
    const tip =
      light === "heart"
        ? heart(89, 8.5, 0.62)
        : `<circle cx="89" cy="8" r="4" fill="${LIGHT[light]}" stroke="${A.rim}" stroke-width="2.2"/>` +
          (light === "off" ? "" : `<circle cx="87.6" cy="6.6" r="1.2" fill="#ffffff" opacity="0.85"/>`);
    return (
      `<path d="M84 28 L88.4 11" stroke="${A.rim}" stroke-width="5.2" stroke-linecap="round"/>` +
      `<path d="M84 28 L88.4 11" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>` +
      tip
    );
  }

  /** The chest: a panel with three buttons, a mission patch (a white star on blue). Clipped to the body: it stays put. */
  const CHEST =
    `<rect x="54.5" y="92.5" width="19" height="9" rx="2.6" fill="#e2e8f0" stroke="${A.rim}" stroke-width="1.8"/>` +
    `<circle cx="59" cy="97" r="1.8" fill="#ef4444"/><circle cx="64" cy="97" r="1.8" fill="#facc15"/><circle cx="69" cy="97" r="1.8" fill="#3b82f6"/>` +
    `<rect x="80.5" y="90" width="11" height="8" rx="1.8" fill="#2563eb" stroke="${A.rim}" stroke-width="1.6"/>` +
    starShape(86, 94, 2.7, "#ffffff") +
    // Seams down the sides of the helmet.
    line("M33.6 46 Q31.6 68 34.4 92", 1.6, A.shade) +
    line("M94.4 46 Q96.4 68 93.6 92", 1.6, A.shade);

  /** Glass on the visor: a crescent of light in its top left corner, a glint in the other. */
  const SHEEN =
    `<path d="M42.8 60 C42.6 47 48.4 40 61 39.6 L64 39.7 C52.6 41.6 46.6 48 45.8 60 Z" fill="#ffffff" opacity="0.55"/>` +
    `<ellipse cx="82.6" cy="44.4" rx="1.8" ry="3.4" fill="#ffffff" opacity="0.6" transform="rotate(-38 82.6 44.4)"/>`;

  /** The gold sun visor, pulled down over the eyes, the sky in it. */
  const SUN_VISOR =
    `<path d="M40 63 V55 Q40 37 58 37 H70 Q88 37 88 55 V63 Q64 67.5 40 63 Z" fill="url(#ad)" stroke="${A.rim}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M45 57 Q46 44 58 41.6" fill="none" stroke="#fffbeb" stroke-width="2.6" stroke-linecap="round" opacity="0.85"/>` +
    starShape(78, 48, 2.6, "#fffbeb", 0.9) +
    `<circle cx="70" cy="56" r="1.3" fill="#fffbeb" opacity="0.8"/>`;

  /** Breath fogging the glass, at the corner of the mouth. */
  const FOG =
    `<ellipse cx="81" cy="76" rx="6" ry="4.2" fill="#ffffff" opacity="0.5"/>` +
    `<circle cx="84.6" cy="70.4" r="2.4" fill="#ffffff" opacity="0.45"/>`;

  /**
   * A drop of sweat beside the helmet, two when it is really sweating. Clear
   * of the helmet's edge and its outline (x 25.5 to 102.5), as the anger marks
   * are: the rig keeps it in front, and nothing of the suit covers it.
   */
  const SWEAT = `<path d="M110 26 C106.4 32.6 104.8 36.4 105.6 39.4 C106.6 43 112.4 43.6 114.2 40 C115.4 37.4 113.8 33.4 110 26 Z" fill="#7dd3fc" stroke="${A.rim}" stroke-width="2"/>`;
  const SWEAT_LEFT = `<path d="M19 30 C16 35 15 38 17 40 C19 42 22 41 22 38 C22 36 21 34 19 30 Z" fill="#7dd3fc" stroke="${A.rim}" stroke-width="2"/>`;
  /** Inside the face: a tear down the left cheek; red cheeks. */
  const TEAR = `<path d="M46 69 C43 75 43 78 46 79 C49 78 49 75 46 69 Z" fill="#7dd3fc" stroke="${INK}" stroke-width="1.5"/>`;
  const FLUSH = `<ellipse cx="45" cy="74" rx="7" ry="4.6" fill="#ef4444" opacity="0.5"/><ellipse cx="83" cy="74" rx="7" ry="4.6" fill="#ef4444" opacity="0.5"/>`;
  /** Anger marks off the helmet's top, red so they show on white and on the island's black. */
  const STEAM = line("M98 29 L104.5 24.5 M101 35.5 L108.5 33.5 M95.5 23.5 L97.5 16.5", 2.8, "#ef4444");

  /** Little stars circling the helmet, on a tilted ring. */
  const ORBIT =
    `<ellipse cx="64" cy="22" rx="44" ry="9" fill="none" stroke="#fde68a" stroke-width="1.6" opacity="0.55" transform="rotate(-8 64 22)"/>` +
    starShape(22.6, 28.6, 6.4, "#fde047", 1, A.rim) +
    starShape(62, 11.6, 5, "#fde047", 1, A.rim) +
    starShape(106, 16.2, 6.4, "#fde047", 1, A.rim);

  /** Candy's flag (a white candle on green) on a pole, held up in the right hand. */
  function flag(deg) {
    const [x0, y0] = turned(18.4, 93.4, deg);
    const x = +(128 - x0).toFixed(1);
    const y = +y0.toFixed(1);
    const top = +(y - 36).toFixed(1);
    return (
      `<path d="M${x} ${y + 3} L${x} ${top}" stroke="${A.rim}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M${x} ${y + 3} L${x} ${top}" stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="M${x - 1} ${top + 1} L${x - 17} ${top + 2.2} Q${x - 15.6} ${top + 6.6} ${x - 17} ${top + 11} L${x - 1} ${top + 11.4} Z" fill="#22c55e" stroke="${A.rim}" stroke-width="2" stroke-linejoin="round"/>` +
      `<rect x="${x - 10.6}" y="${top + 4.6}" width="3.6" height="5.4" rx="1" fill="#ffffff"/>` +
      `<path d="M${x - 8.8} ${top + 4.6} L${x - 8.8} ${top + 2.6}" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>`
    );
  }

  /**
   * One frame. `eyes` is left to the eyes layer when it has one (only the
   * whites of wide eyes stay in the frame), as on Candy.
   */
  function frame(o, eyesApart = true) {
    const { face = "green", eyes = null, brows = "none", mouth = "none", cheeks = 0.55, arms = [0, 0], light = "idle" } = o;
    const [top, bottom] = FACE[face];
    const eyeArt = !eyes ? "" : eyesApart && EYE_LAYERS[eyes] ? EYE_LAYERS[eyes].face : EYES[eyes];
    const cheekArt =
      cheeks > 0 ? `<ellipse cx="45" cy="74" rx="6" ry="4" fill="#f9a8d4" opacity="${cheeks}"/><ellipse cx="83" cy="74" rx="6" ry="4" fill="#f9a8d4" opacity="${cheeks}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="256" height="256">
<defs><linearGradient id="as" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.suit}"/><stop offset="1" stop-color="${A.suitDeep}"/></linearGradient><linearGradient id="af" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.glove}"/><stop offset="1" stop-color="${A.gloveDeep}"/></linearGradient><linearGradient id="ab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${A.suitDeep}"/></linearGradient><linearGradient id="ad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.gold}"/><stop offset="1" stop-color="${A.goldDeep}"/></linearGradient><clipPath id="ac"><rect x="28" y="24" width="72" height="82" rx="22"/></clipPath></defs>
${antenna(light)}
${arm(arms[0])}${mirror(arm(arms[1]))}
${BOOT}${mirror(BOOT)}
<rect x="28" y="24" width="72" height="82" rx="22" fill="url(#as)" stroke="${A.rim}" stroke-width="5" paint-order="stroke"/>
<g clip-path="url(#ac)">${CHEST}</g>
${glass(`fill="none" stroke="${A.rim}" stroke-width="10.5"`)}${glass(`fill="none" stroke="${A.ring}" stroke-width="6.4"`)}${glass(`fill="url(#af)" stroke="${A.rim}" stroke-width="2.4"`)}
${inFace(cheekArt + BROWS[brows] + eyeArt + mouths[mouth] + (o.tear ? TEAR : "") + (o.flush ? FLUSH : ""))}
${o.fog ? FOG : ""}${SHEEN}${o.sunVisor ? SUN_VISOR : ""}
${o.sweat ? SWEAT : ""}${o.sweat === 2 ? SWEAT_LEFT : ""}${o.flush ? STEAM : ""}${o.orbit ? ORBIT : ""}${o.flag ? flag(arms[1]) : ""}${o.stop ? stopSign(110, 52) : ""}
</svg>
`;
  }

  // Candy's faces (see FRAMES in the generator), in the helmet.
  const FRAMES = {
    "idle.svg": { eyes: "open", mouth: "smile" },
    "happy.svg": { eyes: "happy", mouth: "grin", cheeks: 0.85, light: "on" },
    "celebrate-1.svg": { eyes: "stars", mouth: "grin", cheeks: 0.85, arms: [70, 70], light: "on" },
    "celebrate-2.svg": { eyes: "stars", mouth: "grin", cheeks: 0.85, arms: [105, 105], light: "on" },
    "worried.svg": { face: "red", eyes: "open", brows: "worried", mouth: "wavy", sweat: 1, light: "warn" },
    "shocked.svg": { face: "red", eyes: "wide", brows: "worried", mouth: "o", light: "warn" },
    "sleepy.svg": { face: "sleepy", eyes: "closed", mouth: "smallO", cheeks: 0.35, light: "off" },
    "alert.svg": { eyes: "wide", mouth: "smallO", light: "warn" },
    "tired.svg": { face: "sleepy", eyes: "half", mouth: "flat", cheeks: 0.3, sweat: 1, light: "off" },
    "stop.svg": { face: "red", eyes: "open", brows: "stern", mouth: "flat", arms: [0, 95], stop: true, light: "warn" },
    "confused.svg": { eyes: "dots", mouth: "wavy", cheeks: 0.3 },
    "love.svg": { eyes: "hearts", mouth: "smile", cheeks: 0.9, light: "heart" },
    "wave-1.svg": { eyes: "happy", mouth: "grin", cheeks: 0.85, arms: [0, 95], light: "on" },
    "wave-2.svg": { eyes: "happy", mouth: "grin", cheeks: 0.85, arms: [0, 130], light: "on" },
    "proud.svg": { eyes: "smug", mouth: "smirk", cheeks: 0.8, arms: [0, 60], flag: true, light: "on" },
    "sad.svg": { face: "red", eyes: "open", brows: "worried", mouth: "frown", cheeks: 0.3, tear: true, light: "warn" },
    "bored.svg": { eyes: "half", brows: "flat", mouth: "short", cheeks: 0.25 },
    "focused.svg": { eyes: "narrow", brows: "stern", mouth: "short", cheeks: 0.4 },
    "nervous.svg": { eyes: "wide", brows: "worried", mouth: "grit", cheeks: 0.3, sweat: 2, light: "warn" },
    "curious.svg": { eyes: "open", brows: "raised", mouth: "smallO" },
    "angry.svg": { eyes: "narrow", brows: "stern", mouth: "frown", cheeks: 0, flush: true, light: "warn" },
    "excited.svg": { eyes: "sparkle", mouth: "grin", cheeks: 0.9, arms: [40, 40], light: "on" },
    "relieved.svg": { eyes: "closed", brows: "flat", mouth: "small", cheeks: 0.5, fog: true, light: "on" },
    "dizzy.svg": { eyes: "spiral", mouth: "wavy", cheeks: 0.35, orbit: true, light: "off" },
    "cool.svg": { mouth: "smirk", cheeks: 0.45, sunVisor: true, light: "on" },
    "sick.svg": { face: "sleepy", eyes: "closed", brows: "worried", mouth: "wavy", cheeks: 0, sweat: 1, fog: true, light: "off" },
  };

  /** The eyes layers: Candy's eyes, in the helmet. */
  const EYE_FILES = {
    open: EYE_LAYERS.open.look,
    blink: EYES.blink,
    happy: EYE_LAYERS.happy.look,
    wide: EYE_LAYERS.wide.look,
    narrow: EYE_LAYERS.narrow.look,
    sparkle: EYE_LAYERS.sparkle.look,
    stars: EYE_LAYERS.stars.look,
    hearts: EYE_LAYERS.hearts.look,
    dots: EYE_LAYERS.dots.look,
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
    angry: { frames: ["angry.svg"], ...eyes("narrow") },
    excited: { frames: ["excited.svg"], ...eyes("sparkle") },
    relieved: { frames: ["relieved.svg"] },
    dizzy: { frames: ["dizzy.svg"] },
    // The sun visor is down: no eyes to see.
    cool: { frames: ["cool.svg"] },
    sick: { frames: ["sick.svg"] },
  };

  const files = {};
  for (const [name, o] of Object.entries(FRAMES)) files[name] = frame(o);
  for (const [name, art] of Object.entries(EYE_FILES)) files[`eyes-${name}.svg`] = wrap(inFace(art));
  // A still with its eyes in, for previews outside the app.
  files["still.svg"] = frame(FRAMES["idle.svg"], false);
  return { name: "Astronaut", frames: files, look };
}

/** A five-pointed star; an outline only when given one. */
function starShape(cx, cy, r, fill, opacity = 1, outline = null) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  const stroke = outline ? ` stroke="${outline}" stroke-width="1.6" stroke-linejoin="round"` : "";
  return `<polygon points="${pts.join(" ")}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}${stroke}/>`;
}
