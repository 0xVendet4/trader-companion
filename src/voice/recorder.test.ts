import { describe, expect, it } from "vitest";
import { SilenceGate, encodeWav, errorCode, extFor, levelDb, pickMime } from "./recorder";

const gate = () => new SilenceGate({ silenceDb: -40, silenceMs: 1200, leadMs: 6000, maxMs: 60_000 });

describe("SilenceGate", () => {
  it("ends after a pause once something was said", () => {
    const g = gate();
    expect(g.push(-20, 150)).toBe(false);
    expect(g.push(-20, 150)).toBe(false);
    for (let i = 0; i < 7; i++) expect(g.push(-60, 150)).toBe(false); // 1050 ms quiet
    expect(g.push(-60, 150)).toBe(true); // 1200 ms
    expect(g.spoke).toBe(true);
  });

  it("a word in the pause starts the pause over", () => {
    const g = gate();
    g.push(-20, 150);
    for (let i = 0; i < 7; i++) g.push(-60, 150);
    g.push(-25, 150);
    for (let i = 0; i < 7; i++) expect(g.push(-60, 150)).toBe(false);
    expect(g.push(-60, 150)).toBe(true);
  });

  it("gives up when nothing is said, without calling it speech", () => {
    const g = gate();
    for (let i = 0; i < 39; i++) expect(g.push(-70, 150)).toBe(false); // 5850 ms
    expect(g.push(-70, 150)).toBe(true); // 6000 ms
    expect(g.spoke).toBe(false);
  });

  it("stops at the cap while someone keeps talking", () => {
    const g = new SilenceGate({ silenceDb: -40, silenceMs: 1200, leadMs: 6000, maxMs: 3000 });
    for (let i = 0; i < 19; i++) expect(g.push(-10, 150)).toBe(false);
    expect(g.push(-10, 150)).toBe(true);
    expect(g.spoke).toBe(true);
  });
});

describe("levelDb", () => {
  it("reads digital silence as -100 and a full-scale square as 0", () => {
    expect(levelDb(new Float32Array(64))).toBe(-100);
    expect(levelDb(new Float32Array(64).fill(1))).toBeCloseTo(0, 5);
    expect(levelDb(new Float32Array(64).fill(0.01))).toBeCloseTo(-40, 5);
  });
});

describe("formats", () => {
  it("picks the first container the webview records, WAV when none", () => {
    expect(pickMime((m) => m === "audio/mp4")).toBe("audio/mp4");
    expect(pickMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickMime(() => false)).toBe("");
  });

  it("names the file by its container", () => {
    expect(extFor("audio/webm;codecs=opus")).toBe("webm");
    expect(extFor("audio/mp4")).toBe("mp4");
    expect(extFor("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extFor("audio/wav")).toBe("wav");
    expect(extFor("")).toBe("webm");
  });

  it("maps getUserMedia's errors", () => {
    expect(errorCode({ name: "NotAllowedError" })).toBe("permission-denied");
    expect(errorCode({ name: "NotFoundError" })).toBe("no-microphone");
    expect(errorCode({ name: "OverconstrainedError" })).toBe("no-microphone");
    expect(errorCode({ name: "NotReadableError" })).toBe("busy");
    expect(errorCode(new Error("x"))).toBe("failed");
    expect(errorCode(null)).toBe("failed");
  });
});

describe("encodeWav", () => {
  it("writes a 16-bit mono WAV brought down to 16 kHz", async () => {
    const chunks = [new Float32Array(4800).fill(0.5), new Float32Array(4800).fill(-0.5)];
    const blob = encodeWav(chunks, 48_000);
    expect(blob.type).toBe("audio/wav");
    const v = new DataView(await blob.arrayBuffer());
    const ascii = (at: number, n: number) => String.fromCharCode(...new Uint8Array(v.buffer, at, n));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(v.getUint32(40, true)).toBe(3200 * 2); // 9600 samples / 3
    expect(blob.size).toBe(44 + 3200 * 2);
    expect(v.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(v.getInt16(44 + 1600 * 2, true)).toBe(-0x4000);
  });

  it("keeps a rate under 16 kHz as it is", () => {
    const blob = encodeWav([new Float32Array(100)], 8000);
    expect(blob.size).toBe(44 + 200);
  });
});
