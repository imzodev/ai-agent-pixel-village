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

/** One provider in the registry (providers.ts): where its settings live. */
export type ProviderDef = {
  keyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  /** Optional: `<KEY>_THINKING` → `thinking: { type }` (e.g. "disabled"). */
  thinkingEnv: string;
  /** Optional: `<KEY>_REASONING_EFFORT` → `reasoning_effort` (e.g. "low"). */
  effortEnv: string;
  defaultBaseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  /** Fixed extra request fields this provider understands. */
  extraBody?: Record<string, unknown>;
  /** Tokens added to max_tokens while the model thinks (thinking counts toward it). */
  thinkingHeadroom?: number;
};

/** A configured OpenAI-compatible client (client.ts). */
export type OpenAiCompatibleConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** `thinking.type` to send, if any ("disabled" turns thinking off where supported). */
  thinking?: string;
  /** `reasoning_effort` to send, if any. */
  reasoningEffort?: string;
  extraBody?: Record<string, unknown>;
  thinkingHeadroom?: number;
};

export type LlmClient = {
  name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
};
