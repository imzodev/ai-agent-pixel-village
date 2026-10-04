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

## NPC keys and trades

Seeded NPCs live in `src/lib/npcDefs.ts` (pure data; `seed.ts` syncs the
`npcs` table to it). A key is `<place>_<name>` (`village_marigold`,
`hollowmere_bjorn`, `coralwick_milo`) and **never names a job**. Jobs are
`trades` (`["baker"]`, `["tinker", "smith"]`), and recipes (`Recipe.trade`)
and shop rules key off trades, so any number of NPCs can share one.
Shop stock (`SHOP_STOCK`/`TRADES`) stays per NPC, since each shop has its own goods.

Renaming a key: add `old: "new"` to `LEGACY_NPC_KEYS` (`src/lib/npcKeys.ts`).
On boot, `renameLegacyNpcKeys` moves the row, the Folk page entries and
"talk to" daily quests. Never reuse an old key as a new one.

## Database

Schema changes go through `npm run db:push` (drizzle-kit, from
`src/db/schema.ts`). If it ever asks to **truncate** a table, answer No:
that's drift, usually a constraint whose name differs from drizzle's
`<table>_<col>_unique`. Fix the name instead (`scripts/fix-db-drift.sql`,
which renamed `lots_key_key`).

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

## Navigation (NPC routes, places, trips)

NPCs travel between places with `src/lib/nav/`, like a maps app. Moves stay
four-directional (see Movement); routes are made fluent by penalising turns,
so they come out as long straight legs.

- **Plan** with `worldRouter.plan(fromTile, toTile)` (`walkGrid.ts`): hierarchical
  A* (`route.ts`) over blocks = game chunks (24×15). Short trips search tiles
  directly; long ones search block *entrances*, then fill in tiles and
  straighten the result. Roads and bridges cost less (6 vs 10), so routes keep
  to them. Walkability is the exact step check (`isWalkableAt`), so routes
  never disagree with movement. Never call the old 80-tile `planPath` for trips.
- **Caches**: block grids and block graphs live in memory and on disk under
  `.cache/nav/<mapVersion>/` (rebuilt automatically when the terrain changes).
  In memory they're refreshed after 5 minutes, so felled/regrown trees are
  picked up; a trip also re-checks its next segment and re-plans if blocked.
- **Places** (`places.ts`): building doors, towns, regions and provinces. An NPC
  only routes to places it knows (`npc_known_places`): its home surroundings
  from the start, others discovered by walking within 12 tiles, or told.
- **Trips** (`trips.ts`, `npc_trips`): a stored route walked as chained moves
  written by tickd, each starting on a beat boundary (so the beat broadcast
  carries it) and never before the previous one ends; `SEG_BEATS` = 4 beats
  per segment. NPCs on a trip are skipped by the random wander; once a trip
  has arrived the NPC lingers there (its wander is leashed to the
  destination, not its home) until it's sent somewhere else.
- **Admin endpoints** (see "Admin endpoints" below):
  `GET /api/nav/route?from=tx,ty&to=tx,ty`, `POST /api/nav/trip { npcKey, place, learn? }`,
  `GET /api/nav/places?npcKey=…`. `scripts/route-preview.ts` draws a route on the map.

## NPC minds (Jev)

NPCs listed in `MIND_NPCS` (default `village_marigold`; e.g.
`village_marigold,hollowmere_bjorn`) have a mind (`src/lib/mind/`): real stock
and a purse (`npc_minds`), memories, and regard for players (`npc_regard`).
Every `MIND_INTERVAL_MS` tickd calls `thinkMinds`.

- **Profiles** (`profiles.ts`): what a kind of NPC makes (`crafts`), sells
  off its shelf, buys on errands (`supplies`), asks players for (`asks`) and
  gifts. `BAKER` (Marigold) and `SMITH` (Bjorn). A new kind = a profile + its key
  in `PROFILE_OF` + `MIND_NPCS`; shelf items also need a `SHOP_STOCK` entry.
  A key in `MIND_NPCS` without a profile is ignored.
- **Decide**: `feasibleActions` (`profile.ts`, shared) lists only what the NPC
  can do *right now* (make a batch, go to a supplier, ask the village, gift a
  friend, go home…). Jev (`jev.ts`, `TYPESAFE_API_KEY`) picks one from the plain-words
  `stateText` and scores mood and urgency. If there's no key, an error, a timeout or
  confidence < 0.35, `scriptedPick` decides. Never let Jev invent an action:
  add it to `feasibleActions` and carry it out in `act()`.
- **Carry out**: the engine does it (batches on the bread table, trips,
  missions keyed `req_<npcKey>_<ms>`). The LLM only writes the line it says.
- **Stock and purse** change only through `adjustStock` (one guarded UPDATE),
  never read-modify-write: shop sales (`shelfSale`), sales to the NPC
  (`npcBuys`) and tickd can run at once.
- **Regard** is counters, not Jev: helping raises it, free loaves
  past `FREEBIE_GRACE` lower it. Tiers feed the talk prompt, gifts and a 20% discount.
- Admin: `GET /api/mind?npcKey=…` (state, last decision with probabilities),
  `POST /api/mind { npcKey, stock?, purse?, think? }`.

## Admin endpoints

Anything that lets someone steer the world (send NPCs on trips, inspect or
change an NPC's mind, plan routes) must check `isAdmin(req)` from
`src/lib/adminAuth.ts` and return `notFound()` otherwise. Requests carry
`x-admin-token: <ADMIN_TOKEN>`. With `ADMIN_TOKEN` unset (or under 24
characters) these endpoints don't exist, in development too. Never gate them
on `NODE_ENV` alone.
