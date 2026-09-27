# thegrove - agent notes

## NEVER commit unless explicitly told

**Do not run `git commit` (or `git add` followed by commit, amend, push,
or create a PR) unless the user explicitly asks for it in that message.**
A phrase like "before you commit", "once you're done", or "then commit"
is NOT permission to commit now — it means the user will tell you when.
When in doubt, stop after making the changes and wait. If you already
committed by mistake, say so; do not touch history further.

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

## Movement (NPCs, animals, enemies)

Movement is deterministic and beat-synced. **Never stream or tick
positions for these entities.**

- A move is data: `{ path: GridPoint[], startAt, speed }` (`src/types/motion.ts`).
  The position at any instant is `positionAt(move, t)` (`src/lib/motion.ts`),
  and the server, the WS server and every client compute it the same way.
- Row `x`/`y` hold the move's **destination** (the resting spot). For
  "where is it right now" (range checks and the like), use `rowPositionAt(row, Date.now())`.
- Beats are epoch-aligned `WORLD_TICK_MS` (5 s) slots. tickd wakes on
  each boundary. Entities due on beat k (`isDue`, staggered per id) get a
  move that starts on beat k+1. The WS server reads that beat's moves at
  boundary + `BROADCAST_OFFSET_MS` and sends one small `moves` message per
  spatial bucket, so clients hold every move before it starts.
- Wander steps are one cardinal direction, an exact whole number of tiles
  (NPCs `NPC_MOVE_MIN_TILES..NPC_MOVE_MAX_TILES`, others
  `MOVE_MIN_TILES..MOVE_MAX_TILES`), never through blocked tiles, and
  inside a leash (`pickWanderMove`). NPC leash radius is at least
  `NPC_LEASH_TILES` (= max step) even if `wander_radius` is smaller. Goal walks (fox raid, remote agents)
  use A* → `compressToLegs` (`planGoalMove`).
- Persist moves with `buildMoveWrite` + `writeMoves` (one batched UPDATE
  per table). A new move must not start before the current one ends.

| Env | Default | Meaning |
| --- | --- | --- |
| `NPC_MOVE_INTERVAL_MS` | 10000 | how often each NPC steps (rounded up to whole beats) |
| `NPC_MOVE_MIN_TILES` / `NPC_MOVE_MAX_TILES` | 1 / 10 | NPC step length range (animals/enemies: 1–4) |
| `ANIMAL_MOVE_INTERVAL_MS` | 10000 | same for animals |
| `ENEMY_MOVE_INTERVAL_MS` | 10000 | same for enemies |
| `WS_RESYNC_MS` | 30000 | full-snapshot safety resync per client |

tickd refuses to start if a `MOVE_MAX_TILES` walk can't finish within an interval.
