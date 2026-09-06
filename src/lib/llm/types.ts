// LLM chat abstraction. One provider-agnostic contract shared by every
// OpenAI-compatible backend (OpenAI, DeepSeek, MiniMax — all speak the same
// /chat/completions protocol). Never put provider names, keys, or URLs here.

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatOptions = {
  /** Force strict-JSON output (response_format: json_object where supported). */
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type ChatResult = {
  text: string;
  /** Which provider served the request — useful for logging/cost tracking. */
  provider: string;
};

export type LlmClient = {
  name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
};
