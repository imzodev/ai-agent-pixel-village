// Single OpenAI-compatible HTTP client. Every provider in providers.ts is
// just data fed into this factory — same wire protocol, no provider-specific
// branching.
import type { ChatMessage, ChatOptions, LlmClient, OpenAiCompatibleConfig } from "./types";

export type { OpenAiCompatibleConfig } from "./types";

const DEFAULT_TIMEOUT_MS = 15_000;

// Reasoning models may still put their thinking in the reply text
// (<think>…</think>); drop it, including an opener left unclosed when the
// reply was cut off mid-thought.
const THINK_BLOCK = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
const THINK_ORPHAN = /<think\b[^>]*>[\s\S]*$/i;
export const stripThinking = (text: string) => text.replace(THINK_BLOCK, "").replace(THINK_ORPHAN, "").trim();

export function createOpenAiCompatibleClient(cfg: OpenAiCompatibleConfig): LlmClient {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  function buildBody(messages: ChatMessage[], jsonMode: boolean, temperature: number, maxTokens: number, stream: boolean): Record<string, unknown> {
    // Thinking tokens count toward max_tokens: while the model thinks, give
    // it room so the answer isn't cut off (or never reached).
    const thinks = cfg.thinking !== "disabled";
    const body: Record<string, unknown> = {
      ...cfg.extraBody,
      model: cfg.model,
      messages,
      temperature,
      max_tokens: maxTokens + (thinks ? cfg.thinkingHeadroom ?? 0 : 0),
    };
    if (cfg.thinking) body.thinking = { type: cfg.thinking };
    if (cfg.reasoningEffort) body.reasoning_effort = cfg.reasoningEffort;
    if (jsonMode) body.response_format = { type: "json_object" };
    if (stream) body.stream = true;
    return body;
  }

  async function post(body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
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
    return res;
  }

  async function request(messages: ChatMessage[], jsonMode: boolean, timeoutMs: number, temperature: number, maxTokens: number): Promise<string> {
    const res = await post(buildBody(messages, jsonMode, temperature, maxTokens, false), timeoutMs);
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    const text = typeof raw === "string" ? stripThinking(raw) : "";
    if (!text) throw new Error(`[llm:${cfg.name}] empty completion (finish_reason: ${data?.choices?.[0]?.finish_reason ?? "?"})`);
    return text;
  }

  /**
   * Streamed request: reads the server-sent events (`data: {...}` lines,
   * `data: [DONE]`) and hands on the visible text as it grows. Anything
   * inside a still-open <think> is held back (stripThinking drops it).
   */
  async function streamRequest(messages: ChatMessage[], jsonMode: boolean, timeoutMs: number, temperature: number, maxTokens: number, onDelta: (piece: string) => void): Promise<string> {
    const res = await post(buildBody(messages, jsonMode, temperature, maxTokens, true), timeoutMs);
    if (!res.body) throw new Error(`[llm:${cfg.name}] no stream body`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let raw = "", shown = "", pending = "", finish = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const data = line.startsWith("data:") ? line.slice(5).trim() : "";
        if (!data || data === "[DONE]") continue;
        let chunk: { choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[] };
        try { chunk = JSON.parse(data); } catch { continue; }
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) finish = choice.finish_reason;
        const piece = choice?.delta?.content;
        if (typeof piece !== "string" || !piece) continue;
        raw += piece;
        const visible = stripThinking(raw);
        if (visible.length > shown.length && visible.startsWith(shown)) {
          onDelta(visible.slice(shown.length));
          shown = visible;
        }
      }
    }
    const text = stripThinking(raw);
    if (!text) throw new Error(`[llm:${cfg.name}] empty completion (finish_reason: ${finish || "?"})`);
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
    async chatStream(messages: ChatMessage[], opts: ChatOptions, onDelta: (piece: string) => void): Promise<string> {
      const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const temperature = opts.temperature ?? 0.8;
      const maxTokens = opts.maxTokens ?? 300;
      const jsonMode = opts.jsonMode === true;
      try {
        return await streamRequest(messages, jsonMode, timeoutMs, temperature, maxTokens, onDelta);
      } catch (e) {
        // As in chat(): a provider that refuses response_format gets plain text.
        // (A 400 arrives before any text, so nothing was handed on yet.)
        if (jsonMode && e instanceof Error && /HTTP 400/.test(e.message)) {
          return await streamRequest(messages, false, timeoutMs, temperature, maxTokens, onDelta);
        }
        throw e;
      }
    },
  };
}
