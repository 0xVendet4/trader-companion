// What plays on the PC, as the app reports it (src-tauri/src/music.rs), and the
// pure rules the music card and Candy's dance follow. Adapted from Coucou's
// Spotify pill (MIT, © Louis Raillé); here any player the system knows about.

import type { IslandMode, IslandViewName } from "./state";

export interface NowPlaying {
  /** The app playing it ("Spotify", "Chrome"…). */
  app: string;
  title: string;
  artist: string;
  album: string;
  /** Seconds; 0 when the player doesn't say. */
  duration: number;
  /** Seconds at `positionAt` (Unix ms); while playing it runs on from there. */
  position: number;
  positionAt: number;
  playing: boolean;
  /** null: the player has no such switch. */
  shuffle: boolean | null;
  repeat: boolean | null;
  /** 0–1; null where it can't be read (Windows). */
  volume: number | null;
  canSeek: boolean;
  canNext: boolean;
  canPrevious: boolean;
  /** Names the cover sent apart: see Music.art. */
  artKey: string;
}

/** The cover of the track that has one, as the app sent it: a data URL. */
export const Music = {
  art: null as { key: string; url: string } | null,
};

/** The cover to show, once it has arrived for this track. */
export function coverFor(np: NowPlaying | null): string | null {
  return np && Music.art && Music.art.key === np.artKey ? Music.art.url : null;
}

/** Where the track is now: run on from its last report while it plays, never past the end. */
export function musicPosition(np: NowPlaying, nowMs: number): number {
  const ran = np.playing ? Math.max(0, (nowMs - np.positionAt) / 1000) : 0;
  const p = np.position + ran;
  return np.duration > 0 ? Math.min(p, np.duration) : p;
}

/** The clock frozen or restarted where it is now: what a play/pause click shows at once. */
export function withPlaying(np: NowPlaying, playing: boolean, nowMs: number): NowPlaying {
  if (np.playing === playing) return np;
  return { ...np, position: musicPosition(np, nowMs), positionAt: nowMs, playing };
}

/** m:ss, or h:mm:ss past an hour. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** The volume icon: 0 = muted, then one, two or three waves. */
export function volumeLevel(volume: number): 0 | 1 | 2 | 3 {
  if (volume <= 0) return 0;
  if (volume < 0.34) return 1;
  if (volume < 0.67) return 2;
  return 3;
}

/**
 * Whether the island's Candy dances: whenever music plays and the island is
 * on screen, folded or open on any tab (the user wanted more than Coucou's
 * "open only on the music card"). An event card and the launch greeting keep
 * him still: they have their own moves to show.
 */
export function islandDances(o: { playing: boolean; mode: IslandMode; view: IslandViewName }): boolean {
  if (!o.playing || o.mode === "hidden") return false;
  return o.mode === "compact" || (o.view !== "event" && o.view !== "greeting");
}
