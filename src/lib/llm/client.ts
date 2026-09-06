// Single OpenAI-compatible HTTP client. Every provider in providers.ts is
// just data fed into this factory — same wire protocol, no provider-specific
// branching.
import type { ChatMessage, ChatOptions, LlmClient } from "./types";

export type OpenAiCompatibleConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export function createOpenAiCompatibleClient(cfg: OpenAiCompatibleConfig): LlmClient {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  async function request(messages: ChatMessage[], jsonMode: boolean, timeoutMs: number, temperature: number, maxTokens: number): Promise<string> {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new Error(`[llm:${cfg.name}] HTTP ${res.status}: ${snippet.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error(`[llm:${cfg.name}] empty completion`);
    return text;
  }

  return {
    name: cfg.name,
    async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
      const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const temperature = opts.temperature ?? 0.8;
      const maxTokens = opts.maxTokens ?? 300;
      const jsonMode = opts.jsonMode === true;
      try {
        return await request(messages, jsonMode, timeoutMs, temperature, maxTokens);
      } catch (e) {
        // Some providers reject response_format entirely — degrade to plain
        // text and let the caller's own JSON extraction handle it.
        if (jsonMode && e instanceof Error && /HTTP 400/.test(e.message)) {
          return await request(messages, false, timeoutMs, temperature, maxTokens);
        }
        throw e;
      }
    },
  };
}
