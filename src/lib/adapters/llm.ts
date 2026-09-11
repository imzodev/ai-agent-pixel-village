// LLM adapter. Wraps the existing `chatWithFallback` factory behind the
// LLMPort. Falls back to a scripted no-op reply when no provider is configured.

import { chatWithFallback, getActiveProvider } from "@/lib/llm";
import type { LLMPort } from "@/types/ports";

export class LlmAdapter implements LLMPort {
  async chat(input: { system: string; user: string; jsonMode?: boolean; temperature?: number }): Promise<{ text: string; provider: string }> {
    const fallback = getActiveProvider();
    if (!fallback) {
      return { text: "...", provider: "scripted" };
    }
    const res = await chatWithFallback(
      [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      { jsonMode: input.jsonMode, temperature: input.temperature },
    );
    if (!res) return { text: "...", provider: "scripted" };
    return res;
  }
}
