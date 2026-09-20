# Contributing

## Ground rules

The full project rules live in [AGENTS.md](./AGENTS.md). Highlights:

- **Never commit without an explicit instruction.** Phrases like "before you commit", "then commit", or "once you're done" are NOT permission — the user will tell you when.
- **Types live in shared type modules**, never in files that contain logic. If you introduce an interface or `type` alias, put it in `src/types/<area>.ts` (or extend `src/lib/protocol.ts` for wire shapes). Logic files import them.
- **Server-only code must not be imported into the browser bundle.** Anything under `src/lib/` that runs Phaser or browser code stays on the server. UI / Phaser glue goes in `src/game/`.
- **`src/lib/` stays transport-agnostic.** No `phaser/` imports (verified). The one deliberate exception is `src/lib/auth.ts`, which uses `next/headers` `cookies()` for session handling — cookie access is inherently a Next.js request concern. Keep new `next/` imports out of `src/lib/` unless there is no reasonable alternative.

## DB query checklist

PRs that touch a database read must satisfy:

1. Every new `SELECT` with a `WHERE` clause on a hot table must reference an existing index. Run `EXPLAIN ANALYZE` against a production-sized dataset before merging.
2. If no index exists, the PR must include a Drizzle migration that adds one. Hot tables:
   - `characters`
   - `inventory`
   - `world_chat`
   - `ground_items`
   - `npcs`
   - `animals`
   - `enemies`
   - `resource_nodes`
3. If you're adding a route handler that reads/writes through the ORM, route reads through `withReadDb()` (snapshot/list) and writes through `withWriteDb()` (writes/heartbeats). Writes never go through the replica.
4. New routes that touch the chunk collision registry, the snapshot cache, or the world-change pub/sub should clear or invalidate existing cached state on the same release.

## Proximity / chunk coordination

If you change anything in `src/lib/chunkCollision.ts` or `src/lib/snapshot.ts` (bbox math, cache key, cache TTLs), update the related bounds in `src/lib/world-stream.ts` (proximity filter in `onWorldChange`) and `src/lib/world-tickd.ts` (view refresh cadence). The bbox's pixel radius (`PROXIMITY_RADIUS_PX`) is the source of truth and is documented at the top of `src/lib/snapshot.ts`.

## Tests

Unit tests live alongside the source as `src/**/*.test.ts` and run with:

```
pnpm test          # single run
pnpm test:watch    # watch mode
```

Only **pure** helpers are unit-tested today (movement stepping, chunk
collision, shard parsing) because they need no DB, Redis or Phaser scene.
DB- and network-backed modules (`snapshot.ts`, `sim.ts`, `world-stream.ts`)
are covered by integration/load tests, which are not set up yet. When you
add one of those, mock the dependencies at the module boundary
(`withReadDb`, `redis`) rather than spinning up real infrastructure.

## Phase 4 hardening knobs

Environment variables that change runtime behaviour — add new ones to `.env.example` with the default and a one-line description. Reference the relevant file/comment rather than duplicating the explanation here.
