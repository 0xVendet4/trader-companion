// What the mascot does when poked. Pure: the island hands in the click streak,
// the mood and a random pick; this hands back the reaction. Lines are playful
// or state a number — never a tip to buy or sell.

import { formatPct } from "../core/format";
import type { SoundName } from "../core/sound";
import type { Quote, WatchToken } from "../core/state";
import type { MascotState, Motion } from "./mascot";

export interface Reaction {
  state: MascotState;
  motion: Motion;
  sound: SoundName;
  /** A short line in a speech bubble. */
  say: string;
  /** How long the reaction holds, ms. */
  ms: number;
  /**
   * "annoyed": ignore pokes for a moment. "costume": try on a random outfit.
   * "wink": flash the blink frame once.
   */
  special?: "annoyed" | "costume" | "wink";
}

/** Clicks closer together than this build a streak. */
export const STREAK_MS = 650;
/** After the annoyed reaction, pokes are ignored this long. */
export const ANNOYED_MS = 3000;
/** The streak that unlocks the secret costume change. */
export const SECRET_STREAK = 12;
/** How long the secret outfit stays on. */
export const COSTUME_MS = 4000;
/** A press held this long squeezes the mascot instead of poking it. */
export const HOLD_MS = 350;
/** A squeeze lets go on its own after this, in case the release is missed. */
export const MAX_SQUEEZE_MS = 4000;

/** Pressed and held. */
export const SQUEEZE: Reaction = { state: "shocked", motion: "squeeze", sound: "eep", say: "eep!", ms: MAX_SQUEEZE_MS };
/** Let go after a squeeze. */
export const RELEASE: Reaction = { state: "happy", motion: "spring", sound: "boing", say: "boing!", ms: 1200 };

/** Single pokes, rotated so the same one never comes twice in a row. */
export const POKES: Reaction[] = [
  { state: "happy", motion: "hop", sound: "boing", say: "boop!", ms: 1200 },
  { state: "love", motion: "squish", sound: "squeak", say: "hehe", ms: 1400 },
  { state: "wave", motion: "wiggle", sound: "greet", say: "gm!", ms: 1500 },
  { state: "shocked", motion: "jump", sound: "eep", say: "ah! you scared me", ms: 1300 },
  { state: "happy", motion: "flip", sound: "whee", say: "watching the charts 👀", ms: 1600 },
  { state: "love", motion: "hop", sound: "pop", say: "hydrate 💧", ms: 1500 },
  { state: "idle", motion: "squish", sound: "squeak", say: "😉", ms: 1200, special: "wink" },
  { state: "happy", motion: "squish", sound: "pop", say: "brb, counting candles", ms: 1700 },
  { state: "sleepy", motion: "droop", sound: "hover", say: "five more minutes…", ms: 1600 },
  { state: "confused", motion: "flip", sound: "blip", say: "hm?", ms: 1100 },
  { state: "celebrate", motion: "dance", sound: "whee", say: "♪ la la la ♪", ms: 1900 },
  { state: "shocked", motion: "sneeze", sound: "achoo", say: "achoo! 🤧", ms: 1200 },
  { state: "love", motion: "shrink", sound: "squeak", say: "s-stop it 😳", ms: 1500 },
  { state: "happy", motion: "backflip", sound: "tada", say: "ta-da!", ms: 1300 },
  { state: "confused", motion: "sway", sound: "hmm", say: "hmm… 🤔", ms: 1700 },
  { state: "wave", motion: "peek", sound: "pop", say: "peekaboo!", ms: 1500 },
];

export interface PokeContext {
  /** 1 for a lone click, 2 for the second in a quick streak, and so on. */
  streak: number;
  mood: MascotState;
  /** The index of the last single poke, to avoid repeating it. */
  lastPoke: number;
  /** A random number in [0, 1). */
  random: number;
  /** A one-line market fact to mention now and then ("BONK +12% today"). */
  fact?: { text: string; up: boolean } | null;
}

/** The streak a click at `now` makes, given the previous click. */
export function nextStreak(streak: number, lastClickAt: number, now: number): number {
  return now - lastClickAt <= STREAK_MS ? streak + 1 : 1;
}

/** The watchlist token that moved most over 24h, as a plain fact. */
export function topMoverFact(tokens: WatchToken[], quotes: Record<string, Quote>): { text: string; up: boolean } | null {
  let best: { t: WatchToken; pct: number } | null = null;
  for (const t of tokens) {
    const pct = quotes[t.key]?.change.h24;
    if (pct == null || !Number.isFinite(pct)) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) best = { t, pct };
  }
  if (!best || Math.abs(best.pct) < 1) return null;
  const symbol = best.t.symbol.length > 12 ? `${best.t.symbol.slice(0, 11)}…` : best.t.symbol;
  return { text: `${symbol} ${formatPct(best.pct)} today`, up: best.pct > 0 };
}

/** The reaction to a poke, plus the index of the single poke used (or -1). */
export function pokeReaction(ctx: PokeContext): { reaction: Reaction; poke: number } {
  // A streak escalates, whatever the mood.
  switch (ctx.streak) {
    case 2:
      return { reaction: { state: "wave", motion: "wiggle", sound: "greet", say: "hi hi!", ms: 1300 }, poke: -1 };
    case 3:
      return { reaction: { state: "celebrate", motion: "spin", sound: "whee", say: "wheee!", ms: 1300 }, poke: -1 };
    case 5:
      return { reaction: { state: "dizzy", motion: "dizzy", sound: "dizzy", say: "@_@", ms: 2200 }, poke: -1 };
    case 8:
      return {
        reaction: { state: "angry", motion: "shake", sound: "grumble", say: "ok ok, that's enough 😤", ms: ANNOYED_MS, special: "annoyed" },
        poke: -1,
      };
    case SECRET_STREAK:
      return {
        reaction: { state: "celebrate", motion: "spin", sound: "alertUp", say: "new fit! ✨", ms: COSTUME_MS, special: "costume" },
        poke: -1,
      };
  }
  if (ctx.streak > 3) {
    // Between the milestones: keep giggling, a little more fed up each time.
    const fed = ctx.streak > 5;
    return { reaction: { state: fed ? "worried" : "happy", motion: "wiggle", sound: "blip", say: fed ? "hey…" : "hehe", ms: 900 }, poke: -1 };
  }

  // A lone click: the mood speaks first.
  switch (ctx.mood) {
    case "sleepy":
      return { reaction: { state: "shocked", motion: "jump", sound: "eep", say: "huh? I'm up!", ms: 1500 }, poke: -1 };
    case "stop":
      return { reaction: { state: "stop", motion: "wiggle", sound: "blip", say: "rules are rules 🛑", ms: 1600 }, poke: -1 };
    case "tired":
      return { reaction: { state: "tired", motion: "squish", sound: "hover", say: "easy… breathe first 🧘", ms: 1600 }, poke: -1 };
    case "worried":
      return { reaction: { state: "worried", motion: "wiggle", sound: "hover", say: "deep breaths…", ms: 1500 }, poke: -1 };
    case "celebrate":
      return { reaction: { state: "celebrate", motion: "hop", sound: "alertUp", say: "🎉", ms: 1500 }, poke: -1 };
    case "sick":
      return { reaction: { state: "sick", motion: "wiggle", sound: "hover", say: "ugh, rough hour 🤢", ms: 1600 }, poke: -1 };
    case "excited":
      return { reaction: { state: "excited", motion: "hop", sound: "whee", say: "so much going on!", ms: 1500 }, poke: -1 };
    case "dizzy":
      return { reaction: { state: "dizzy", motion: "flip", sound: "dizzy", say: "whoa, too much moving", ms: 1600 }, poke: -1 };
    case "bored":
      return { reaction: { state: "happy", motion: "hop", sound: "pop", say: "oh hi! finally, company", ms: 1600 }, poke: -1 };
    case "nervous":
      return { reaction: { state: "nervous", motion: "shake", sound: "eep", say: "eek, scary out there 😬", ms: 1600 }, poke: -1 };
    case "focused":
      return { reaction: { state: "focused", motion: "wiggle", sound: "blip", say: "shh, watching 👀", ms: 1400 }, poke: -1 };
    case "happy":
      // A green watchlist: celebrate about half the time.
      if (ctx.random < 0.5) return { reaction: { state: "celebrate", motion: "hop", sound: "alertUp", say: "green day! 🎉", ms: 1500 }, poke: -1 };
      break;
  }

  // Now and then, a fact from the watchlist.
  if (ctx.fact && ctx.random < 0.75 && ctx.random >= 0.5) {
    return {
      reaction: { state: ctx.fact.up ? "happy" : "worried", motion: "hop", sound: "pop", say: ctx.fact.text, ms: 2000 },
      poke: -1,
    };
  }

  // Otherwise a random single poke, never the same twice in a row.
  let i = Math.floor(ctx.random * POKES.length) % POKES.length;
  if (i === ctx.lastPoke) i = (i + 1) % POKES.length;
  return { reaction: POKES[i], poke: i };
}
