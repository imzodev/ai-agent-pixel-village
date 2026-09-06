// Public LLM facade. Everything in the app talks to these two functions —
// never to a provider directly.
export type { ChatMessage, ChatOptions, ChatResult, LlmClient } from "./types";
export { getActiveProvider, chatWithFallback } from "./providers";
