export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiProvider {
  sendMessage(messages: ChatMessage[]): Promise<string>;
  summarize(text: string): Promise<string>;
}

export type AiErrorKind = "invalid-key" | "rate-limit" | "network" | "generic";

export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}
