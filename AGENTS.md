# thegrove - agent notes

## Types live in shared type files

**Interfaces and type aliases MUST be declared in shared type modules, never
in files that contain logic (functions, classes, side effects).** A file
that declares logic must import its types, not define them.

- Put shared types under `src/types/*.ts` (e.g. `src/types/world.ts`,
  `src/types/snapshot.ts`, `src/types/websocket.ts`). These files contain
  **types only** — no runtime code.
- `src/lib/protocol.ts` is also a shared type file (wire protocol). It may
  import and re-export types from `src/types/`.
- One canonical declaration per concept. If two files need the same shape,
  move it to `src/types/` and import it in both — do not duplicate. (This
  is how the three duplicate `Facing` unions and the duplicated
  `Selection` were collapsed.)
- A logic file may re-export a type for convenience
  (`export type { X } from "@/types/..."`), but the declaration itself
  must live in the shared file.
- Small private shapes are not exempt. If it is a `type`/`interface`, it
  belongs in `src/types/`.

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
