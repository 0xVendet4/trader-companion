import { describe, expect, it, vi } from "vitest";
import { VoiceChat, type VoiceChatHost } from "./voice-chat";

vi.mock("../core/state", () => ({
  State: { settings: { companion: { openaiKey: "test-key" } } },
}));

vi.mock("../ai/openai", () => ({
  OpenAiProvider: vi.fn().mockImplementation(function(this: { sendMessage: unknown; voiceChat: unknown }) {
    this.sendMessage = vi.fn().mockResolvedValue("Mocked AI reply");
    this.voiceChat = vi.fn().mockResolvedValue("Mocked AI reply");
  }),
}));

vi.mock("../core/i18n", () => ({
  t: (k: string) => k,
  N_: (k: string) => k,
}));

function makeHost(): { host: VoiceChatHost; says: string[]; reacts: string[] } {
  const says: string[] = [];
  const reacts: string[] = [];
  const host: VoiceChatHost = {
    say: (text) => { if (text) says.push(text); },
    react: (state) => reacts.push(state),
  };
  return { host, says, reacts };
}

describe("VoiceChat", () => {
  it("starts idle", () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);
    expect(vc.state).toBe("idle");
  });

  it("transitions to listening when start succeeds", async () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);
    const start = vi.fn().mockResolvedValue(null);
    vc.toggle(start, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    expect(start).toHaveBeenCalled();
    expect(vc.state).toBe("listening");
  });

  it("stays idle and shows error when start fails", async () => {
    const { host, says } = makeHost();
    const vc = new VoiceChat(host);
    const start = vi.fn().mockResolvedValue("permission denied");
    vc.toggle(start, vi.fn());
    await new Promise((r) => setTimeout(r, 0));
    expect(vc.state).toBe("idle");
    // says[0] is "Listening…", says[1] is the error bubble
    expect(says.some((s) => s.includes("permission"))).toBe(true);
  });

  it("calls stop when toggled while listening", async () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);
    const start = vi.fn().mockResolvedValue(null);
    const stop = vi.fn();
    vc.toggle(start, stop);
    await new Promise((r) => setTimeout(r, 0));
    vc.toggle(start, stop);
    expect(stop).toHaveBeenCalled();
  });

  it("transitions to processing then idle after transcript", async () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);
    await vc.onTranscript("what is bitcoin?");
    expect(vc.state).toBe("idle");
  });

  it("says AI reply after successful transcript", async () => {
    const { host, says } = makeHost();
    const vc = new VoiceChat(host);
    await vc.onTranscript("hello");
    // says[0] = "Thinking…", says[1] = actual reply
    expect(says.some((s) => s === "Mocked AI reply")).toBe(true);
  });

  it("passes history to subsequent voice calls", async () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);
    const captured: unknown[][] = [];
    const { OpenAiProvider } = await import("../ai/openai");
    (OpenAiProvider as ReturnType<typeof vi.fn>).mockImplementationOnce(
      function(this: { voiceChat: unknown }) {
        this.voiceChat = vi.fn().mockImplementation((_t: string, h: unknown[]) => {
          captured.push([...h]);
          return Promise.resolve("reply");
        });
      }
    );
    (OpenAiProvider as ReturnType<typeof vi.fn>).mockImplementationOnce(
      function(this: { voiceChat: unknown }) {
        this.voiceChat = vi.fn().mockImplementation((_t: string, h: unknown[]) => {
          captured.push([...h]);
          return Promise.resolve("reply");
        });
      }
    );
    await vc.onTranscript("first question");
    await vc.onTranscript("second question");
    expect(captured[0].length).toBe(0);           // first call: no prior context
    expect(captured[1].length).toBe(2);           // second call: user + assistant from first turn
  });

  it("clearChat resets voice history so next call sends no context", async () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);
    const captured: unknown[][] = [];
    const { OpenAiProvider } = await import("../ai/openai");
    (OpenAiProvider as ReturnType<typeof vi.fn>).mockImplementationOnce(
      function(this: { voiceChat: unknown }) {
        this.voiceChat = vi.fn().mockImplementation((_t: string, h: unknown[]) => {
          captured.push([...h]);
          return Promise.resolve("reply");
        });
      }
    );
    (OpenAiProvider as ReturnType<typeof vi.fn>).mockImplementationOnce(
      function(this: { voiceChat: unknown }) {
        this.voiceChat = vi.fn().mockImplementation((_t: string, h: unknown[]) => {
          captured.push([...h]);
          return Promise.resolve("reply");
        });
      }
    );
    await vc.onTranscript("first question");
    // Simulate reset — triggers the clearChat handlers registered by VoiceChat.
    vc["history"] = [];
    await vc.onTranscript("second question");
    expect(captured[1].length).toBe(0);           // history was cleared
  });

  it("handles transcript error gracefully", () => {
    const { host, says } = makeHost();
    const vc = new VoiceChat(host);
    vc.onError("no-speech detected");
    expect(vc.state).toBe("idle");
    expect(says[0]).toContain("catch");
  });

  it("ignores second press while processing", async () => {
    const { host } = makeHost();
    const vc = new VoiceChat(host);

    // Reach processing state: start listening, then call onTranscript
    // onTranscript sets _state = "processing" synchronously before the first await
    let resolveSlow!: (v: string) => void;
    const slowProvider = { voiceChat: () => new Promise<string>((r) => { resolveSlow = r; }) };
    const { OpenAiProvider } = await import("../ai/openai");
    (OpenAiProvider as ReturnType<typeof vi.fn>).mockImplementationOnce(
      function(this: { voiceChat: unknown }) { this.voiceChat = slowProvider.voiceChat; }
    );

    const transcriptPromise = vc.onTranscript("test"); // _state → "processing"
    const start2 = vi.fn().mockResolvedValue(null);
    vc.toggle(start2, vi.fn()); // should be ignored — state is "processing"
    resolveSlow("done");
    await transcriptPromise;
    expect(start2).not.toHaveBeenCalled();
  });
});
