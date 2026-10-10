import { describe, expect, it } from "vitest";
import { Music, coverFor, formatTime, islandDances, musicPosition, volumeLevel, withPlaying, type NowPlaying } from "./music";

const np = (over: Partial<NowPlaying> = {}): NowPlaying => ({
  app: "Spotify",
  title: "Night Drive",
  artist: "Lo-fi Market",
  album: "Charts",
  duration: 200,
  position: 10,
  positionAt: 1_000,
  playing: true,
  shuffle: false,
  repeat: null,
  volume: null,
  canSeek: true,
  canNext: true,
  canPrevious: true,
  artKey: "k",
  ...over,
});

describe("the music card", () => {
  it("runs the clock on while playing, and stops at the end", () => {
    expect(musicPosition(np(), 6_000)).toBe(15);
    expect(musicPosition(np({ playing: false }), 6_000)).toBe(10);
    expect(musicPosition(np({ duration: 12 }), 60_000)).toBe(12);
    expect(musicPosition(np({ duration: 0 }), 60_000)).toBe(69);
  });

  it("freezes the clock where it is on pause", () => {
    const paused = withPlaying(np(), false, 6_000);
    expect(paused).toMatchObject({ playing: false, position: 15, positionAt: 6_000 });
    expect(withPlaying(paused, false, 9_000)).toBe(paused);
  });

  it("writes times and volume the usual way", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65.9)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(NaN)).toBe("0:00");
    expect([0, 0.2, 0.5, 0.9].map(volumeLevel)).toEqual([0, 1, 2, 3]);
  });

  it("shows the cover only for the track it belongs to", () => {
    Music.art = { key: "k", url: "data:image/png;base64,AA==" };
    expect(coverFor(np())).toBe("data:image/png;base64,AA==");
    expect(coverFor(np({ artKey: "other" }))).toBeNull();
    expect(coverFor(null)).toBeNull();
    Music.art = null;
  });

  it("dances in the ticker, or open on the music card only", () => {
    expect(islandDances({ playing: true, mode: "compact", view: "watchlist" })).toBe(true);
    expect(islandDances({ playing: true, mode: "expanded", view: "watchlist" })).toBe(true);
    expect(islandDances({ playing: true, mode: "expanded", view: "event" })).toBe(false);
    expect(islandDances({ playing: true, mode: "expanded", view: "music" })).toBe(true);
    expect(islandDances({ playing: false, mode: "compact", view: "music" })).toBe(false);
    expect(islandDances({ playing: true, mode: "hidden", view: "music" })).toBe(false);
  });
});
