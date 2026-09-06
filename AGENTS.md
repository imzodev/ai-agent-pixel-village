# thegrove - agent notes

## LLM providers (NPC dialogue)

`src/lib/llm/` provides a single OpenAI-compatible contract shared by all
providers. Adding a provider is a one-line entry in `providers.ts`.

| Provider | Env key | Default base URL | Default model |
| --- | --- | --- | --- |
| minimax | `MINIMAX_API_KEY` | `https://api.minimax.io/v1` | `MiniMax-M3` |
| openai  | `OPENAI_API_KEY`  | `https://api.openai.com/v1` | `gpt-4o-mini` |
| deepseek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com` | `deepseek-chat` |

Per-provider overrides: `<KEY>_BASE_URL`, `<KEY>_MODEL`.

Selection:
- `LLM_PROVIDER=<name>` forces the active provider.
- Otherwise the first registry entry with an API key wins (registry order:
  minimax, openai, deepseek).
- `LLM_FALLBACK=deepseek,openai` adds a failover chain tried on error.

Without any key, NPCs fall back to the scripted brain (`scriptedReply`).
No application code change needed to add providers — config only.
