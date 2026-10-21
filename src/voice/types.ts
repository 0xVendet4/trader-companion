export type VoiceState = "idle" | "listening" | "processing";

export interface VoiceTranscriber {
  readonly state: VoiceState;
  start(): Promise<string | null>;
  stop(): void;
}
