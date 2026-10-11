// The demo's audio: a short, light house groove (or a lo-fi or a trap loop) synthesised here (nothing to
// license), the app's own sounds where the island played them
// (src/core/sound.ts), and a few effects for the camera, the cursor and the
// big moments. Rendered offline into the recording (scripts/record-demo.mjs),
// or played live when a visitor presses play. The recorder can also lay a
// music file of your own under it, or no music at all.

import { scheduleSound, type SoundName } from "../core/sound";

export type FxName = "whoosh" | "tick" | "key" | "riser" | "impact" | "sparkle" | "shutter" | "drop" | "rise" | "pop";

/** Something to hear `at` seconds into the video. */
export interface Cue {
  at: number;
  sound?: SoundName;
  fx?: FxName;
}

const BPM = 112;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const EIGHTH = BEAT / 2;
/** Late off-beats, for a little bounce. */
const SWING = 0.014;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Fmaj7 – G6 – Em7 – Am7, a bar each, and the hook over them: a marimba line
 * of eighths (null: a rest).
 */
const BARS: { root: number; chord: number[]; hook: (number | null)[] }[] = [
  { root: 41, chord: [57, 60, 64, 65], hook: [76, null, 74, 72, null, 69, 72, null] },
  { root: 43, chord: [59, 62, 64, 67], hook: [74, null, 71, 74, null, 76, 74, null] },
  { root: 40, chord: [55, 59, 62, 64], hook: [71, null, 67, 71, null, 74, 71, null] },
  { root: 45, chord: [57, 60, 64, 67], hook: [72, null, 76, 79, null, 76, 72, 71] },
];

/** Where the chord stabs fall, in eighths of the bar: 3 + 3 + 2. */
const STABS = [0, 3, 6];

/** The same noise every time, so two renders sound the same. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 0x2f6b9a1;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 0x80000000 - 1;
  }
  return buf;
}

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext, dest: AudioNode, t: number, dur: number): AudioBufferSourceNode {
  let buf = noises.get(ctx);
  if (!buf) {
    buf = noiseBuffer(ctx);
    noises.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(dest);
  src.start(t, (t * 7.31) % 0.9);
  src.stop(t + dur + 0.05);
  return src;
}

/** A gain node with an attack/decay envelope, for one hit. */
function env(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function filter(ctx: BaseAudioContext, dest: AudioNode, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(dest);
  return f;
}

function tone(ctx: BaseAudioContext, dest: AudioNode, type: OscillatorType, f: number, t: number, dur: number, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

// ── Music ────────────────────────────────────────────────────────────────────

function kick(ctx: BaseAudioContext, dest: AudioNode, t: number) {
  const o = tone(ctx, env(ctx, dest, t, 0.85, 0.002, 0.26), "sine", 160, t, 0.3);
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
  // The beater's click.
  noise(ctx, filter(ctx, env(ctx, dest, t, 0.12, 0.001, 0.008), "highpass", 3000), t, 0.02);
}

/** Three quick bursts and a tail, like hands. */
function clap(ctx: BaseAudioContext, dest: AudioNode, t: number) {
  const bp = filter(ctx, dest, "bandpass", 1400, 1.1);
  for (const [i, d] of [0, 0.011, 0.022].entries()) noise(ctx, env(ctx, bp, t + d, i === 2 ? 0.36 : 0.22, 0.001, i === 2 ? 0.13 : 0.01), t + d, 0.16);
}

function hat(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, decay: number) {
  noise(ctx, filter(ctx, env(ctx, dest, t, peak, 0.001, decay), "highpass", 8500), t, decay + 0.03);
}

/** A short, filtered bass note on the off-beat. */
function bass(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number) {
  const lp = filter(ctx, env(ctx, dest, t, 0.26, 0.004, 0.17), "lowpass", 1600, 4);
  lp.frequency.setValueAtTime(1600, t);
  lp.frequency.exponentialRampToValueAtTime(260, t + 0.12);
  tone(ctx, lp, "sawtooth", hz(midi), t, 0.2);
  tone(ctx, env(ctx, dest, t, 0.22, 0.004, 0.18), "sine", hz(midi), t, 0.2);
}

/** A chord stab: bright for an instant, then the filter closes on it. */
function stab(ctx: BaseAudioContext, dest: AudioNode, notes: number[], t: number) {
  const lp = filter(ctx, env(ctx, dest, t, 0.05, 0.003, 0.2), "lowpass", 3800, 1.5);
  lp.frequency.setValueAtTime(3800, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
  for (const n of notes) {
    tone(ctx, lp, "sawtooth", hz(n), t, 0.24, -9);
    tone(ctx, lp, "square", hz(n), t, 0.24, 9);
  }
}

/** A marimba-ish note: a sine with a woody overtone, quick to fade. */
function marimba(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number) {
  tone(ctx, env(ctx, dest, t, 0.11, 0.003, 0.32), "sine", hz(midi), t, 0.38);
  tone(ctx, env(ctx, dest, t, 0.03, 0.002, 0.07), "sine", hz(midi) * 4, t, 0.1);
}

/** An echo, three-eighths later, darker each time. */
function echo(ctx: BaseAudioContext, dest: AudioNode): AudioNode {
  const input = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = EIGHTH * 3;
  const back = ctx.createGain();
  back.gain.value = 0.28;
  const dark = filter(ctx, back, "lowpass", 2500);
  input.connect(dest);
  input.connect(delay);
  delay.connect(dark);
  back.connect(delay);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delay.connect(wet);
  wet.connect(dest);
  return input;
}

/**
 * The groove from `start` to `end` (seconds). Stabs and hats first; kick,
 * clap and bass from the second bar; the hook from the third. For the last
 * `outro` seconds the drums step out, and the whole fades over the last one
 * and a half. Everything but the drums ducks a little on each kick.
 */
export function scheduleMusic(ctx: BaseAudioContext, dest: AudioNode, start: number, end: number, outro = 4.5) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(0.9, start + 0.3);
  out.gain.setValueAtTime(0.9, Math.max(start + 0.3, end - 1.6));
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(dest);
  const pump = ctx.createGain();
  pump.connect(out);
  const hook = echo(ctx, pump);
  const drumsUntil = end - outro;

  for (let bar = 0; start + bar * BAR < end; bar++) {
    const t = start + bar * BAR;
    const b = BARS[bar % BARS.length];
    const drums = bar >= 1 && t < drumsUntil;
    for (let i = 0; i < 8; i++) {
      const at = t + i * EIGHTH + (i % 2 ? SWING : 0);
      if (at >= end) break;
      if (STABS.includes(i)) stab(ctx, pump, b.chord, at);
      const note = b.hook[i];
      if (bar >= 2 && note != null) marimba(ctx, hook, note, at);
      if (at < drumsUntil) {
        // Closed hats on every sixteenth, open ones on the off-beats.
        hat(ctx, out, at, i % 2 ? 0.035 : 0.05, 0.03);
        hat(ctx, out, at + EIGHTH / 2 + SWING, 0.022, 0.025);
        if (i % 2) hat(ctx, out, at, 0.04, 0.12);
      }
      if (!drums) continue;
      if (i % 2 === 0) {
        kick(ctx, out, at);
        // The duck: down on the kick, back over a beat.
        pump.gain.setValueAtTime(0.55, at);
        pump.gain.linearRampToValueAtTime(1, at + BEAT * 0.8);
      } else {
        bass(ctx, pump, b.root + (i === 5 ? 12 : 0), at);
      }
      if (i === 2 || i === 6) clap(ctx, out, at);
    }
  }
}

/** The same "random" numbers every time: two renders sound the same. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A fade in, and a fade out over the last second and a half. */
function musicOut(ctx: BaseAudioContext, dest: AudioNode, start: number, end: number, level: number): GainNode {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(level, start + 0.6);
  out.gain.setValueAtTime(level, Math.max(start + 0.6, end - 1.6));
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(dest);
  return out;
}

// ── Lo-fi: a slow, warm loop of electric piano, a lazy beat and vinyl ────────

const LOFI_BEAT = 60 / 78;
const LOFI_BAR = 4 * LOFI_BEAT;
const LOFI_16 = LOFI_BEAT / 4;
/** Late off-beat sixteenths: the lazy swing. */
const LOFI_SWING = LOFI_16 * 0.22;

/** Fmaj9 – Em7 – Dm9 – Cmaj9, a bar each, and a few notes of melody over them (eighths, null: a rest). */
const LOFI_BARS: { root: number; chord: number[]; tune: (number | null)[] }[] = [
  { root: 41, chord: [57, 60, 64, 67], tune: [72, null, null, 74, 76, null, null, null] },
  { root: 40, chord: [55, 59, 62, 64], tune: [null, null, 74, null, 71, null, 69, null] },
  { root: 38, chord: [53, 57, 60, 64], tune: [69, null, 72, null, null, 74, null, null] },
  { root: 36, chord: [52, 55, 59, 62], tune: [76, null, 74, 72, null, null, null, null] },
];

/** An electric piano chord, strummed a little, warm and wobbling. */
function keys(ctx: BaseAudioContext, dest: AudioNode, wow: AudioNode, notes: number[], t: number, dur: number, rand: () => number) {
  notes.forEach((n, i) => {
    const at = t + i * 0.022;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.018, at + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(dest);
    const detune = (rand() - 0.5) * 10;
    const a = tone(ctx, g, "sine", hz(n), at, dur, detune);
    const b = tone(ctx, env(ctx, g, at, 0.35, 0.005, 0.25), "triangle", hz(n) * 2, at, 0.3, detune);
    wow.connect(a.detune);
    wow.connect(b.detune);
  });
}

function lofiKick(ctx: BaseAudioContext, dest: AudioNode, t: number) {
  const o = tone(ctx, env(ctx, dest, t, 0.75, 0.003, 0.32), "sine", 92, t, 0.36);
  o.frequency.setValueAtTime(92, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
}

function lofiSnare(ctx: BaseAudioContext, dest: AudioNode, t: number, peak = 0.2) {
  noise(ctx, filter(ctx, env(ctx, dest, t, peak, 0.002, 0.17), "bandpass", 1700, 0.8), t, 0.2);
  tone(ctx, env(ctx, dest, t, peak * 0.4, 0.002, 0.07), "triangle", 190, t, 0.1);
}

/** A soft bell for the melody. */
function bell(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number, peak = 0.045) {
  tone(ctx, env(ctx, dest, t, peak, 0.004, 0.9), "sine", hz(midi), t, 1);
  tone(ctx, env(ctx, dest, t, peak * 0.25, 0.003, 0.3), "sine", hz(midi) * 3, t, 0.35);
}

/** Vinyl: a faint hiss, and crackles here and there. */
function vinyl(ctx: BaseAudioContext, dest: AudioNode, start: number, end: number, rand: () => number) {
  const hiss = ctx.createGain();
  hiss.gain.value = 0.006;
  hiss.connect(dest);
  noise(ctx, filter(ctx, filter(ctx, hiss, "lowpass", 6000), "highpass", 1500), start, end - start);
  for (let t = start; t < end; t += 0.04 + rand() * 0.25) {
    noise(ctx, filter(ctx, env(ctx, dest, t, 0.01 + rand() * 0.05, 0.0005, 0.004), "highpass", 2500), t, 0.01);
  }
}

/**
 * The lo-fi loop from `start` to `end`: keys from the start, the beat and the
 * bass from the second bar, the melody from the fifth. The beat steps out for
 * the last `outro` seconds. The whole sits behind a low-pass, like a tape.
 */
export function scheduleLofi(ctx: BaseAudioContext, dest: AudioNode, start: number, end: number, outro = 4.5) {
  const rand = seeded(0x10f1);
  const out = musicOut(ctx, dest, start, end, 0.7);
  const tapeOut = filter(ctx, out, "lowpass", 5200);
  // The tape's wow: the keys' pitch drifts a few cents, slowly.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.55;
  const wow = ctx.createGain();
  wow.gain.value = 7;
  lfo.connect(wow);
  lfo.start(start);
  lfo.stop(end + 0.1);
  const room = echo(ctx, tapeOut);
  vinyl(ctx, out, start, end, rand);
  const beatUntil = end - outro;

  for (let bar = 0; start + bar * LOFI_BAR < end; bar++) {
    const t = start + bar * LOFI_BAR;
    const b = LOFI_BARS[bar % LOFI_BARS.length];
    keys(ctx, room, wow, b.chord, t, LOFI_BAR * 0.95, rand);
    // A softer push on the "and" of three.
    keys(ctx, room, wow, b.chord.slice(1), t + LOFI_BEAT * 2.5 + LOFI_SWING, LOFI_BEAT * 1.4, rand);
    if (bar >= 4) b.tune.forEach((n, i) => n != null && bell(ctx, room, n, t + i * LOFI_BEAT * 0.5 + (i % 2 ? LOFI_SWING : 0)));
    if (bar < 1 || t >= beatUntil) continue;
    for (let s = 0; s < 16; s++) {
      const at = t + s * LOFI_16 + (s % 2 ? LOFI_SWING : 0);
      if (at >= beatUntil) break;
      if (s === 0 || s === 10 || (bar % 2 === 1 && s === 7)) lofiKick(ctx, tapeOut, at);
      if (s === 4 || s === 12) lofiSnare(ctx, tapeOut, at + 0.018);
      if (s % 2 === 0) hat(ctx, tapeOut, at, s % 4 === 2 ? 0.03 : 0.018, 0.035);
      else if (rand() < 0.3) hat(ctx, tapeOut, at, 0.01, 0.025);
    }
    // The bass: a round sub on the one and on the "and" of three.
    for (const [s, len] of [
      [0, 2.5],
      [10, 1.2],
    ] as const) {
      const at = t + s * LOFI_16;
      const lp = filter(ctx, env(ctx, tapeOut, at, 0.32, 0.01, LOFI_BEAT * len), "lowpass", 300);
      tone(ctx, lp, "sine", hz(b.root), at, LOFI_BEAT * len + 0.1);
      tone(ctx, lp, "triangle", hz(b.root), at, LOFI_BEAT * len + 0.1);
    }
  }
}

// ── Trap: an 808, rolling hats and a dark bell, unhurried ────────────────────

const TRAP_BEAT = 60 / 140;
const TRAP_BAR = 4 * TRAP_BEAT;
const TRAP_16 = TRAP_BEAT / 4;

/** Am – F – C – G: the 808's notes, the pad's chord and the bell's line (sixteenths). */
const TRAP_BARS: { root: number; chord: number[]; bell: (number | null)[] }[] = [
  { root: 33, chord: [57, 60, 64], bell: [81, null, null, 79, null, 76, null, null, 81, null, null, 79, null, 74, 76, null] },
  { root: 29, chord: [53, 57, 60], bell: [77, null, null, 76, null, 72, null, null, 77, null, 76, null, 72, null, null, null] },
  { root: 36, chord: [55, 60, 64], bell: [76, null, null, 79, null, 76, null, null, 74, null, null, 72, null, 74, 76, null] },
  { root: 31, chord: [55, 59, 62], bell: [74, null, null, 71, null, 74, null, null, 79, null, null, 76, null, 74, null, null] },
];

/** Soft clipping, for the 808's growl. */
function drive(ctx: BaseAudioContext, dest: AudioNode, amount: number): WaveShaperNode {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  const ws = ctx.createWaveShaper();
  ws.curve = curve;
  ws.connect(dest);
  return ws;
}

/** An 808: a punchy click into a long, sliding sub. */
function eightOhEight(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number, dur: number, from?: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.25, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(drive(ctx, dest, 2.2));
  const o = tone(ctx, g, "sine", hz(from ?? midi + 2), t, dur);
  o.frequency.setValueAtTime(hz(from ?? midi + 2), t);
  o.frequency.exponentialRampToValueAtTime(hz(midi), t + (from != null ? 0.12 : 0.04));
  // The kick on top of it.
  const k = tone(ctx, env(ctx, dest, t, 0.5, 0.002, 0.07), "sine", 170, t, 0.09);
  k.frequency.exponentialRampToValueAtTime(60, t + 0.06);
  noise(ctx, filter(ctx, env(ctx, dest, t, 0.08, 0.001, 0.006), "highpass", 4000), t, 0.015);
}

/** A thin, held pad: the chord, very low in the mix. */
function pad(ctx: BaseAudioContext, dest: AudioNode, notes: number[], t: number, dur: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.012, t + 0.4);
  g.gain.setValueAtTime(0.012, t + dur - 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = filter(ctx, g, "lowpass", 900);
  g.connect(dest);
  for (const n of notes) {
    tone(ctx, lp, "sawtooth", hz(n), t, dur, -7);
    tone(ctx, lp, "sawtooth", hz(n), t, dur, 7);
  }
}

/**
 * The trap loop from `start` to `end`: the bell and the pad from the start,
 * the hats from the second bar, the 808 and the clap from the third. Hats roll
 * at the end of every other bar. The drums step out for the last `outro` seconds.
 */
export function scheduleTrap(ctx: BaseAudioContext, dest: AudioNode, start: number, end: number, outro = 4.5) {
  const rand = seeded(0x7a9);
  const out = musicOut(ctx, dest, start, end, 0.32);
  const room = echo(ctx, out);
  const drumsUntil = end - outro;
  for (let bar = 0; start + bar * TRAP_BAR < end; bar++) {
    const t = start + bar * TRAP_BAR;
    const b = TRAP_BARS[bar % TRAP_BARS.length];
    pad(ctx, out, b.chord, t, TRAP_BAR);
    b.bell.forEach((n, i) => n != null && bell(ctx, room, n, t + i * TRAP_16, 0.035));
    if (bar < 1 || t >= drumsUntil) continue;
    const roll = bar % 2 === 1;
    for (let s = 0; s < 16; s++) {
      const at = t + s * TRAP_16;
      if (at >= drumsUntil) break;
      // Hats on every sixteenth; a roll of triplets over the last beat of every other bar.
      if (roll && s >= 12) {
        for (let k = 0; k < 3; k++) hat(ctx, out, at + (k * TRAP_16) / 3, 0.02 + k * 0.004, 0.02);
      } else hat(ctx, out, at, s % 4 === 0 ? 0.035 : 0.02, 0.03);
      if (bar < 2) continue;
      if (s === 8) {
        clap(ctx, out, at);
        lofiSnare(ctx, out, at, 0.1);
      }
      const hits = bar % 2 === 0 ? [0, 6, 10] : [0, 3, 11, 14];
      const i = hits.indexOf(s);
      if (i >= 0) {
        const next = hits[i + 1] ?? 16;
        // The last hit of a bar slides up an octave now and then.
        const slide = i === hits.length - 1 && rand() < 0.4;
        eightOhEight(ctx, out, b.root + (slide ? 12 : 0), at, (next - s) * TRAP_16 + 0.05, slide ? b.root : undefined);
      }
    }
  }
}

// ── Effects ──────────────────────────────────────────────────────────────────

/** One effect at `t`. */
export function scheduleFx(ctx: BaseAudioContext, dest: AudioNode, name: FxName, t: number) {
  switch (name) {
    case "whoosh": {
      // Air past the camera: noise through a band sweeping up, then away.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.16);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      g.connect(dest);
      const bp = filter(ctx, g, "bandpass", 300, 1.2);
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(2600, t + 0.4);
      noise(ctx, bp, t, 0.55);
      break;
    }
    case "tick": {
      tone(ctx, env(ctx, dest, t, 0.1, 0.001, 0.03), "sine", 2400, t, 0.04);
      noise(ctx, filter(ctx, env(ctx, dest, t, 0.07, 0.001, 0.015), "highpass", 5000), t, 0.03);
      break;
    }
    case "key": {
      noise(ctx, filter(ctx, env(ctx, dest, t, 0.08, 0.001, 0.025), "bandpass", 3200, 1.5), t, 0.04);
      break;
    }
    case "riser": {
      // Tension before the pump: noise rising, a tone gliding up.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      g.connect(dest);
      const hp = filter(ctx, g, "highpass", 200);
      hp.frequency.setValueAtTime(200, t);
      hp.frequency.exponentialRampToValueAtTime(6000, t + 1.2);
      noise(ctx, hp, t, 1.3);
      const o = tone(ctx, env(ctx, dest, t, 0.04, 1.0, 0.2), "sine", 300, t, 1.25);
      o.frequency.exponentialRampToValueAtTime(900, t + 1.2);
      break;
    }
    case "impact": {
      const o = tone(ctx, env(ctx, dest, t, 0.6, 0.002, 0.55), "sine", 110, t, 0.6);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
      noise(ctx, filter(ctx, env(ctx, dest, t, 0.2, 0.002, 0.3), "lowpass", 1200), t, 0.35);
      break;
    }
    case "sparkle": {
      [2093, 2637, 3136, 4186].forEach((f, i) => tone(ctx, env(ctx, dest, t + i * 0.06, 0.045, 0.003, 0.25), "sine", f, t + i * 0.06, 0.3));
      break;
    }
    case "shutter": {
      noise(ctx, filter(ctx, env(ctx, dest, t, 0.2, 0.001, 0.04), "bandpass", 2500), t, 0.06);
      noise(ctx, filter(ctx, env(ctx, dest, t + 0.07, 0.15, 0.001, 0.05), "bandpass", 1800), t + 0.07, 0.07);
      break;
    }
    case "drop": {
      const o = tone(ctx, env(ctx, dest, t, 0.14, 0.005, 0.3), "triangle", 660, t, 0.32);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.3);
      break;
    }
    case "rise": {
      const o = tone(ctx, env(ctx, dest, t, 0.14, 0.005, 0.3), "triangle", 180, t, 0.32);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.28);
      break;
    }
    case "pop": {
      const o = tone(ctx, env(ctx, dest, t, 0.12, 0.002, 0.09), "sine", 520, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(1100, t + 0.06);
      break;
    }
  }
}

/** The bus everything plays through: a gentle compressor so nothing clips. */
export function masterBus(ctx: BaseAudioContext): { music: GainNode; sfx: GainNode } {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = 0.5;
  music.connect(comp);
  const sfx = ctx.createGain();
  sfx.gain.value = 1;
  sfx.connect(comp);
  return { music, sfx };
}

/** How loud the app's own sounds sit in the mix (the app plays them at 0.12). */
const APP_SOUND_GAIN = 0.2;

/**
 * The music under the video: one of the loops made here (the house `"groove"`,
 * `"lofi"`, `"trap"`), none, or a file of your own (its bytes), faded in and out.
 */
export type Music = "groove" | "lofi" | "trap" | "none" | ArrayBuffer;

/** The whole soundtrack, `duration` seconds long, the music starting at `musicAt`. */
export async function renderSoundtrack(cues: Cue[], musicAt: number, duration: number, sampleRate = 48_000, music: Music = "groove"): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const bus = masterBus(ctx);
  const app = ctx.createGain();
  app.gain.value = APP_SOUND_GAIN;
  app.connect(bus.sfx);
  const from = Math.max(0, musicAt);
  if (music === "groove") scheduleMusic(ctx, bus.music, from, duration);
  else if (music === "lofi") scheduleLofi(ctx, bus.music, from, duration);
  else if (music === "trap") scheduleTrap(ctx, bus.music, from, duration);
  else if (music !== "none") {
    const src = ctx.createBufferSource();
    src.buffer = await ctx.decodeAudioData(music);
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0.0001, from);
    fade.gain.exponentialRampToValueAtTime(1, from + 0.4);
    fade.gain.setValueAtTime(1, Math.max(from + 0.4, duration - 2));
    fade.gain.exponentialRampToValueAtTime(0.0001, duration);
    src.connect(fade);
    // A track is mastered loud already: under the effects, not over them.
    fade.connect(bus.music);
    bus.music.gain.value = 0.8;
    src.start(from);
  }
  for (const c of cues) {
    if (c.at < 0 || c.at > duration) continue;
    if (c.sound) scheduleSound(ctx, app, c.sound, c.at);
    if (c.fx) scheduleFx(ctx, bus.sfx, c.fx, c.at);
  }
  return ctx.startRendering();
}

/** Live playback for a visitor: the groove now, and effects as they come. */
export function liveAudio(duration: number): { fx(name: FxName): void } {
  const ctx = new AudioContext();
  const { music, sfx } = masterBus(ctx);
  scheduleMusic(ctx, music, ctx.currentTime + 0.05, ctx.currentTime + duration);
  return { fx: (name) => scheduleFx(ctx, sfx, name, ctx.currentTime + 0.01) };
}
