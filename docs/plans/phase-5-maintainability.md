# Phase 5 — Maintainability

Goal: **Keep the system understandable as it grows.**

Embedded into every phase, not a separate PR. Each phase lands with the cleanup that phase made possible.

## 5.1 Shared protocol types

**New file:** `src/lib/protocol.ts`

Single source of truth for the wire format. Both WS server and client import from here. TypeScript guarantees shape parity.

```ts
export type Point = { x: number; y: number };

export type Facing = "left" | "right" | "up" | "down";

export type PlayerState = {
  id: number;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  appearance: Record<string, unknown>;
  equipped: string[];
};

export type NpcState = {
  id: number;
  name: string;
  role: string;
  x: number;
  y: number;
  facing: Facing;
  appearance: string;
};

export type AnimalState = {
  id: number;
  species: string;
  name: string;
  x: number;
  y: number;
  facing: Facing;
  state: string;
  mood: string;
};

export type EnemyState = {
  id: number;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
};

export type GroundItemState = {
  id: number;
  itemKey: string;
  qty: number;
  x: number;
  y: number;
};

export type ResourceNodeState = {
  id: number;
  kind: string;
  x: number;
  y: number;
  qty: number;
};

export type BuildingState = {
  id: number;
  key: string;
  name: string;
  x: number;
  y: number;
  doorX: number;
  doorY: number;
  description?: string;
};

export type ChatMessage = {
  id: number;
  characterId: number;
  characterName: string;
  text: string;
  createdAt: number;
};

export type WorldEvent = {
  id: number;
  kind: string;
  text: string;
  subjectType?: string;
  subjectId?: number;
  x?: number;
  y?: number;
  createdAt: number;
};

export type Snapshot = {
  version: number;
  ts: number;
  players: PlayerState[];
  npcs: NpcState[];
  animals: AnimalState[];
  enemies: EnemyState[];
  groundItems: GroundItemState[];
  resourceNodes: ResourceNodeState[];
  buildings: BuildingState[];
  chat: ChatMessage[];
  events: WorldEvent[];
  you: PlayerState | null;
};

export type Delta = {
  version: number;
  ts: number;
  changes: {
    players?: PlayerState[];
    npcs?: NpcState[];
    animals?: AnimalState[];
    enemies?: EnemyState[];
    groundItems?: GroundItemState[];
    resourceNodes?: ResourceNodeState[];
    buildings?: BuildingState[];
    chat?: ChatMessage[];
    events?: WorldEvent[];
  };
};

export type WsMessage =
  | { type: "hello"; sessionId: string; lastVersion?: number }
  | { type: "snapshot"; data: Snapshot }
  | { type: "delta"; data: Delta }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "heartbeat"; x: number; y: number; facing: Facing };
```

The existing snapshot helper (`src/app/api/world/route.ts:13–64`) is refactored to produce `Snapshot`. The WS server produces `Snapshot`/`Delta`. The client (`WorldScene`) consumes both.

## 5.2 Transport-agnostic `src/lib/`

The boundary: anything in `src/lib/` should not import from `next/`, `phaser/`, or any transport-specific module.

**Currently transport-coupled in `src/lib/`:**
- None directly, but `sim.ts` reaches into the DB. That's fine — it's a server-side sim.

**After Phase 2:**
- `src/lib/snapshot.ts` — pure read; no HTTP, no WS, no Phaser. ✓
- `src/lib/sim.ts` — pure sim; reaches into DB. ✓
- `src/lib/movement.ts` — pure step. ✓
- `src/lib/chunkCollision.ts` — pure geometry. ✓
- `src/lib/world-stream.ts` — WS transport. Stays in `src/lib/` because it's a server-side process, but it's clearly named.
- `src/lib/world-tickd.ts` — sim process entry. ✓
- `src/lib/world-notify-relay.ts` — relay process. ✓

**Phaser glue:** stays in `src/game/`. Anything Phaser-specific in `src/lib/` gets moved out:
- The Phaser `TileSprite` types in `src/lib/worldTilemap.ts`? Rename to `src/game/worldTilemap.ts`. (Out of scope for this plan — pre-existing concern.)

## 5.3 Lint rule: ban new poll loops

**File:** `eslint.config.mjs` (or `eslint.config.js` depending on Next.js 16 convention)

```js
{
  files: ["src/game/**/*.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.object.name='window'][callee.property.name='setInterval']",
        message: "Use worldStream.ts subscription instead of polling. Justify in PR if absolutely needed.",
      },
    ],
  },
}
```

Or, if we want to allow it only in `worldStream.ts`:

```js
{
  files: ["src/game/**/*.ts", "!src/game/worldStream.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.object.name='window'][callee.property.name='setInterval']",
        message: "Polling is banned. Use the WS subscription.",
      },
    ],
  },
}
```

## 5.4 DB migration policy

Add to `CONTRIBUTING.md` (or create if it doesn't exist):

> **DB query checklist for PRs:**
> 1. Every new `SELECT` with a `WHERE` clause on a hot table must reference an existing index.
> 2. If no index exists, the PR must include a Drizzle migration that adds one.
> 3. Hot tables: `characters`, `inventory`, `world_chat`, `ground_items`, `npcs`, `animals`, `enemies`, `resource_nodes`.
> 4. Run `EXPLAIN ANALYZE` on the new query against a production-sized dataset before merging.

## 5.5 Documentation

**Update `README.md`:**

Add a "Running locally" section:

```markdown
## Running locally

This project runs four processes:

1. **Next.js** (HTTP routes) — `npm run dev:next`
2. **Sim worker** (1 Hz world tick) — `npm run dev:tickd`
3. **WS server** (push to clients) — `npm run dev:ws`
4. **NOTIFY relay** (Postgres → Redis pub/sub) — `npm run dev:relay`

Or all together: `npm run dev`.

### Environment

See `.env.example` for required variables.

Required:
- `DATABASE_URL` — Postgres connection string
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Upstash Redis

Optional:
- `DATABASE_REPLICA_URL` — read replica (falls back to primary if unset)
- `WS_PORT` — WS server port (default 3001)
- `NEXT_PUBLIC_WS_URL` — WS URL for the client

### Architecture

See `docs/plans/README.md` for the full plan.
```

Add a "Production" section:

```markdown
## Production

Four processes per host:

- Next.js (HTTP)
- Sim worker (single instance per primary, advisory-lock-guarded)
- WS server (1+ shards)
- NOTIFY relay (single instance)

LB sticky session by `shard` cookie for WS routes.
```

## 5.6 Monitoring runbook

**File:** `docs/RUNBOOK.md`

Operations guide:

```markdown
# Runbook

## High p99 latency on `/api/world`

1. Check `db_pool_waiting_requests` metric — pool exhausted?
2. Check snapshot cache hit rate — if low, TTL may be too short
3. Check replica lag — `pg_stat_replication` on primary
4. Check WS server connection counts — too many slow clients?

## WS evictions spiking

1. Check `ws_send_buffer_bytes` histogram — clients are slow
2. Check client-side network metrics — CDN issue?
3. Increase eviction threshold temporarily; investigate root cause

## Snapshot staleness

1. Check NOTIFY/Redis publish lag metric
2. Check `pg_stat_activity` for blocked queries on the primary
3. Check material view refresh — is `online_players` refreshing?

## Sim worker not running

1. Check advisory lock — `SELECT * FROM pg_locks WHERE lockid = 42`
2. If held by another instance, force-release: `SELECT pg_advisory_unlock(42)`
3. Restart the worker
```

## 5.7 TypeScript hygiene

**Refactor candidate:** `src/lib/worldTilemap.ts` currently mixes Tiled JSON parsing with Phaser Tilemap instantiation. Move Phaser-specific code to `src/game/worldTilemap.ts`. Pre-existing; out of immediate scope.

**Strict TypeScript:** keep `strict: true` in `tsconfig.json`. Add `"noUncheckedIndexedAccess": true` to catch `arr[i]` returning `undefined`.

## 5.8 Test coverage

After Phase 5 lands:

- **Unit tests:**
  - `src/lib/movement.ts` — `stepTowardWalkable` axis-separated cases
  - `src/lib/snapshot.ts` — proximity filter, cache hit/miss
  - `src/lib/chunkCollision.ts` — LRU eviction

- **Integration tests:**
  - WS connect → snapshot → delta sequence
  - NOTIFY → relay → Redis publish end-to-end
  - Reconnect storm protection (jittered reconnect)

- **Load tests:**
  - k6 script for `/api/world` HTTP path (1k RPS sustained)
  - k6 WS script for WS path (5k connections, 10 events/s each)

Test files live alongside source as `*.test.ts` or in `tests/`. Pick one convention and document it.

## Deliverable checklist

- [ ] `src/lib/protocol.ts` types
- [ ] Snapshot refactored to produce `Snapshot` type
- [ ] WS server uses `WsMessage` types
- [ ] Client `worldStream.ts` uses `WsMessage` types
- [ ] ESLint rule banning `setInterval` in `src/game/`
- [ ] DB migration policy in `CONTRIBUTING.md`
- [ ] README updates (local dev + production)
- [ ] `docs/RUNBOOK.md`
- [ ] `noUncheckedIndexedAccess: true` in `tsconfig.json`
- [ ] Unit tests for hot helpers
- [ ] Integration tests for WS flow
- [ ] Load test scripts

## Phase 5 stop criterion

If the project doesn't have a testing infrastructure already, basic unit tests for `stepTowardWalkable` and `getSnapshot` are enough. Full integration and load tests are nice-to-haves.