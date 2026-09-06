// Provider registry + selection. Providers are pure data; adding a new one
// is a 4-line entry here, nothing else.
//
// Selection:
//   1. LLM_PROVIDER (explicit choice), if set and configured
//   2. otherwise the first entry with an API key, in REGISTRY_ORDER
//   3. LLM_FALLBACK (comma-separated names) = failover chain tried on error
//
// Every provider speaks OpenAI's /chat/completions protocol — only the
// baseUrl, key and default model differ.
import { createOpenAiCompatibleClient } from "./client";
import type { LlmClient } from "./types";

type ProviderDef = {
  keyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  defaultBaseUrl: string;
  defaultModel: string;
  timeoutMs: number;
};

const PROVIDERS: Record<string, ProviderDef> = {
  minimax: {
    keyEnv: "MINIMAX_API_KEY",
    baseUrlEnv: "MINIMAX_BASE_URL",
    modelEnv: "MINIMAX_MODEL",
    defaultBaseUrl: "https://api.minimax.io/v1",
    defaultModel: "MiniMax-M3",
    timeoutMs: 15_000,
  },
  openai: {
    keyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    modelEnv: "OPENAI_MODEL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    timeoutMs: 15_000,
  },
  deepseek: {
    keyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    modelEnv: "DEEPSEEK_MODEL",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    timeoutMs: 15_000,
  },
};

const REGISTRY_ORDER = ["minimax", "openai", "deepseek"] as const;

const clientCache = new Map<string, LlmClient>();

function buildClient(name: string): LlmClient | null {
  if (clientCache.has(name)) return clientCache.get(name)!;
  const def = PROVIDERS[name];
  if (!def) return null;
  const apiKey = process.env[def.keyEnv];
  if (!apiKey) return null;
  const client = createOpenAiCompatibleClient({
    name,
    baseUrl: process.env[def.baseUrlEnv] || def.defaultBaseUrl,
    apiKey,
    model: process.env[def.modelEnv] || def.defaultModel,
    timeoutMs: def.timeoutMs,
  });
  clientCache.set(name, client);
  return client;
}

// Explicit LLM_PROVIDER wins; otherwise the first configured key, registry
// order. LLM_FALLBACK="deepseek,openai" chains after the primary on error.
function providerChain(): LlmClient[] {
  const requested = process.env.LLM_PROVIDER?.trim();
  const fallbacks = (process.env.LLM_FALLBACK ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const names = [
    ...(requested ? [requested] : []),
    ...REGISTRY_ORDER.filter((n) => n !== requested),
    ...fallbacks.filter((n) => n !== requested && !REGISTRY_ORDER.includes(n as (typeof REGISTRY_ORDER)[number])),
  ];
  const chain: LlmClient[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const client = buildClient(name);
    if (client) chain.push(client);
    if (requested && chain.length > 0 && !fallbacks.length) break;
  }
  return chain;
}

/** The active LLM client, or null when nothing is configured. */
export function getActiveProvider(): LlmClient | null {
  return providerChain()[0] ?? null;
}

/** Chat with failover: try each configured provider in order. */
export async function chatWithFallback(
  messages: import("./types").ChatMessage[],
  opts: import("./types").ChatOptions = {},
): Promise<{ text: string; provider: string } | null> {
  for (const client of providerChain()) {
    try {
      const text = await client.chat(messages, opts);
      return { text, provider: client.name };
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
  }
  return null;
}
