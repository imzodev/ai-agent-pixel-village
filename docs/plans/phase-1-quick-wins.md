# Phase 1 — Quick Wins

Goal: **150 → ~1k concurrent players** with zero architectural rework.

Pure infra changes. Backward compatible. Can be deployed in a single PR (split into logical commits).

## 1.1 Connection pool

**File:** `src/db/index.ts:14–22`

Add pool sizing to prevent starvation:

```ts
export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 50,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "ai-village",
  });
```

Notes:
- `max: 50` allows ~3× the default headroom
- If PgBouncer is later introduced in transaction mode, drop `max` to `10` and rely on the external pooler
- `application_name` surfaces in `pg_stat_activity` for debugging

## 1.2 Missing indexes

**File:** `src/db/schema.ts` (additions)

Run `npm run db:generate` then `npm run db:push` after schema updates.

| Table | Index | Reason |
|---|---|---|
| `characters` | `last_seen_at` (DESC) | `route.ts:17–18` per-poll SELECT |
| `world_chat` | `created_at` (DESC) | `route.ts:26` per-poll SELECT |
| `ground_items` | `(item_key, x, y)` | fox-raid radius query (`sim.ts:108–112`) |
| `ground_items` | `item_key` | chicken egg-count query (`sim.ts:150–153`) |
| `resource_nodes` | `respawn_at` (partial, WHERE NOT NULL) | `sim.ts:208–212` |
| `sponsors` | `status` (partial, WHERE = 'active') | `route.ts:22` |

These turn sequential scans (which scale with row count) into index lookups.

## 1.3 Throttle `lastSeenAt` writes

**File:** `src/app/api/world/route.ts:75, 91–95`

Currently: 5,000 UPDATEs/sec on `characters` from per-poll writes.

Change:
- Track last write time in Redis: `SET player:{id}:ping 1 EX 10`
- Only UPDATE Postgres if the Redis key is missing
- Cuts DB writes from 5,000/s to ~500/s at scale

```ts
const lastPingKey = `player:${playerId}:ping`;
const recentlyPinged = await redis.exists(lastPingKey);
if (!recentlyPinged) {
  await db.update(characters).set({ lastSeenAt: now }).where(eq(characters.id, playerId));
  await redis.set(lastPingKey, "1", { ex: 10 });
}
```

## 1.4 Snapshot TTL cache

**New file:** `src/lib/snapshot.ts`

Caches proximity-filtered snapshots in Redis with 250 ms TTL. Many players in the same chunk share one cached snapshot.

**Design:**
- Key: `snap:{cx}:{cy}` — player's chunk
- Value: serialized snapshot JSON for entities within ±1 chunk
- TTL: 250 ms
- Invalidation: in Phase 2, the NOTIFY relay invalidates per-chunk cache keys when entity state changes

**API:**

```ts
export async function getSnapshot(
  playerX: number,
  playerY: number,
  opts?: { tx?: typeof db },
): Promise<Snapshot>;
```

**Implementation:**
```ts
export async function getSnapshot(playerX: number, playerY: number) {
  const { cx, cy } = chunkAtWorldPx(playerX, playerY);
  const key = `snap:${cx}:${cy}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const snapshot = await buildSnapshot(playerX, playerY);
  await redis.set(key, JSON.stringify(snapshot), { ex: 1 }); // 1s ceiling; we re-validate via TTL
  return snapshot;
}
```

**Why per-chunk key, not per-player:** 1k players in 50 chunks = 50 cached snapshots, not 1k. Hits scale with spatial density, not player count.

## 1.5 Proximity filter

**New file:** `src/lib/snapshot.ts` (same module as 1.4)

Replace global SELECTs at `route.ts:16–28` with chunk-range queries:

```ts
async function getNearbyEntities(playerX: number, playerY: number, radius = 1) {
  const cx = Math.floor(playerX / 384);
  const cy = Math.floor(playerY / 240);
  const xMin = (cx - radius) * 384;
  const xMax = (cx + radius + 1) * 384;
  const yMin = (cy - radius) * 240;
  const yMax = (cy + radius + 1) * 240;

  return {
    npcs: await db.select().from(npcs).where(
      and(gte(npcs.x, xMin), lt(npcs.x, xMax), gte(npcs.y, yMin), lt(npcs.y, yMax), eq(npcs.active, true))
    ),
    animals: await db.select().from(animals).where(
      and(gte(animals.x, xMin), lt(animals.x, xMax), gte(animals.y, yMin), lt(animals.y, yMax))
    ),
    // ...
  };
}
```

**Players are global** (chat needs them; activity feed needs them). Use a 45 s `last_seen_at > since` filter — small row count at any time, indexed in 1.2.

**Chat and worldEvents are global but time-bounded** (12 s and 10 rows respectively) — unaffected by proximity. Just indexed in 1.2.

## 1.6 LRU chunk collision registry

**File:** `src/lib/chunkCollision.ts:49`

Replace unbounded `Map` with size-bounded LRU. Capacity: 2,000 chunks (~75 MB worst case).

```ts
class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private capacity: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    else if (this.map.size >= this.capacity) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(k, v);
  }
}
```

The stamped registry (`chunkCollision.ts:53`) stays unbounded but small — one entry per building footprint, never grows beyond building manifest size.

## 1.7 De-dup cold-chunk loads

**File:** `src/lib/chunkCollisionServer.ts:32–44`

Mirror the client's `inFlightLoads` map:

```ts
const inFlightChunkLoads = new Map<string, Promise<void>>();
```

In `ensureChunkAt`:
```ts
if (chunkRegistered(cx, cy) || seen.has(key)) continue;
seen.add(key);
let pending = inFlightChunkLoads.get(key);
if (!pending) {
  pending = loadChunkJson(cx, cy).then((json) => registerChunk(cx, cy, json));
  inFlightChunkLoads.set(key, pending);
  pending.finally(() => inFlightChunkLoads.delete(key));
}
jobs.push(pending);
```

Avoids duplicate `fs.readFile` + `JSON.parse` per cold chunk under burst.

## 1.8 Upstash Redis client

**New file:** `src/lib/redis.ts`

```ts
import { Redis } from "@upstash/redis";

let cached: Redis | null = null;
let memoryFallback = new Map<string, { value: string; expiresAt: number }>();

export const redis = process.env.UPSTASH_REDIS_REST_URL
  ? (cached ??= new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }))
  : makeMemoryFallback();

function makeMemoryFallback() {
  return {
    async get(k: string) {
      const entry = memoryFallback.get(k);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        memoryFallback.delete(k);
        return null;
      }
      return entry.value;
    },
    async set(k: string, v: string, opts?: { ex?: number }) {
      memoryFallback.set(k, { value: v, expiresAt: Date.now() + (opts?.ex ?? 60) * 1000 });
      return "OK";
    },
    async exists(k: string) {
      return (await this.get(k)) !== null ? 1 : 0;
    },
    // ... etc
  } as unknown as Redis;
}
```

**Why Upstash HTTP and not ioredis:**
- No connection pool, no TCP state
- Works in any environment (serverless, edge, VM)
- Single GET/SET roundtrips are sub-10 ms
- Pub/Sub via separate connection (Phase 2)

Add to `.env.example`:
```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

In-memory fallback keeps local dev working without Redis.

## Deliverable checklist

- [ ] `src/db/index.ts` pool config
- [ ] `src/db/schema.ts` indexes; migration generated and pushed
- [ ] `src/lib/redis.ts` singleton with memory fallback
- [ ] `src/lib/snapshot.ts` with TTL cache + proximity filter
- [ ] `src/app/api/world/route.ts:13–64` uses snapshot helper, throttles `lastSeenAt`
- [ ] `src/lib/chunkCollision.ts` LRU registry
- [ ] `src/lib/chunkCollisionServer.ts` in-flight dedup
- [ ] `.env.example` updated

## Verification

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean for new files
- [ ] Local smoke test: visit `/api/world` twice; second call should hit cache
- [ ] Postgres `EXPLAIN ANALYZE` on the new proximity queries uses indexes
- [ ] Stress test (k6 or autocannon): `/api/world` should sustain 50+ RPS on a single Node process before Phase 1.5 changes