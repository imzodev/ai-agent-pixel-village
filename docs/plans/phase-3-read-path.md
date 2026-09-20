# Phase 3 — Read Path Optimization

Goal: **5k sustained without DB pressure.**

After Phase 2, snapshot reads dominate. We move snapshot reads to a Postgres read replica, materialize the hot "online players" view, and push presence fully into Redis.

## 3.1 Postgres read replica

**New file:** `src/db/replica.ts`

Identical Drizzle setup pointed at `DATABASE_REPLICA_URL`.

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const replicaPool = new Pool({
  connectionString: process.env.DATABASE_REPLICA_URL ?? process.env.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "ai-village-replica",
});

export const readDb = drizzle(replicaPool, { schema });
```

**New file:** `src/lib/db.ts`

Helpers that pick the right DB:

```ts
import { db as writeDb } from "@/db";
import { readDb } from "@/db/replica";

export function withReadDb() {
  return readDb;
}

export function withWriteDb() {
  return writeDb;
}
```

**PgBouncer caveat:** NOTIFY and advisory locks don't work through PgBouncer transaction mode. The sim worker (`world-tickd.ts`) and NOTIFY relay (`world-notify-relay.ts`) connect directly to the primary, bypassing any pooler. Add a comment in `src/lib/db.ts` documenting it.

**Snapshot reads use replica:** `src/lib/snapshot.ts` switches from `db` to `readDb`:

```ts
export async function getSnapshot(playerX: number, playerY: number) {
  const { cx, cy } = chunkAtWorldPx(playerX, playerY);
  const key = `snap:${cx}:${cy}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const db = withReadDb();
  const snapshot = await buildSnapshot(playerX, playerY, db);
  await redis.set(key, JSON.stringify(snapshot), { ex: 1 });
  return snapshot;
}
```

**Writes still hit primary:** sim worker, heartbeats, player actions, agent spawns — all use `writeDb`.

**Replica lag:** typically 100–500 ms. Acceptable for a pixel village; the 250 ms snapshot cache masks most of it.

## 3.2 Materialized "online players" view

**Migration:** `src/db/migrations/xxxx_online_players_view.sql`

```sql
CREATE MATERIALIZED VIEW online_players AS
SELECT id, name, x, y, home_x, home_y, facing, appearance, last_seen_at
FROM characters
WHERE last_seen_at > now() - INTERVAL '45 seconds';

CREATE UNIQUE INDEX online_players_pk ON online_players (id);
CREATE INDEX online_players_chunk ON online_players (x, y);
```

**Refresh:** every 5 s via pg_cron or NOTIFY-driven trigger.

```sql
-- Trigger approach (simpler, depends on activity)
CREATE OR REPLACE FUNCTION refresh_online_players() RETURNS trigger AS $$
BEGIN
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    -- Refresh concurrently to avoid blocking reads
    -- (caller wraps in CONCURRENTLY)
    NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Actually simpler: a scheduled refresh:

```sql
-- pg_cron (if available)
SELECT cron.schedule('refresh-online-players', '*/5 * * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY online_players');
```

If pg_cron isn't available, the sim worker fires a NOTIFY every 5 s; the relay listens and runs `REFRESH MATERIALIZED VIEW CONCURRENTLY online_players` from the primary.

**Reads:** snapshot module queries `online_players` instead of `characters`:
```ts
const players = await readDb.select().from(onlinePlayers)
  .where(gte(onlinePlayers.lastSeenAt, since));
```

## 3.3 Per-player relevance cache

**Redis key:** `relevance:{playerId}` → JSON array of chunk IDs within ±1 of the player's home chunk.

```ts
async function getRelevance(playerId: number, homeX: number, homeY: number): Promise<string[]> {
  const key = `relevance:${playerId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const chunks: string[] = [];
  const { cx, cy } = chunkAtWorldPx(homeX, homeY);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      chunks.push(`${cx + dx},${cy + dy}`);
    }
  }
  await redis.set(key, JSON.stringify(chunks), { ex: 30 });
  return chunks;
}
```

Used by WS process to avoid recomputing proximity on every NOTIFY:

```ts
// In world-stream.ts, on receiving world_change:
const event = JSON.parse(payload);
const conn = connections.get(event.playerId);
if (!conn) return;
const relevant = await getRelevance(event.playerId, conn.homeX, conn.homeY);
if (relevant.includes(`${event.chunkX},${event.chunkY}`)) {
  queueDelta(conn, event);
}
```

Refreshed on heartbeat (every 5–10 s per player).

## 3.4 Presence in Redis

**Replace** DB-based "is online" check with Redis presence.

```ts
// On heartbeat:
await redis.set(`player:${playerId}`, JSON.stringify({
  x, y, facing, chunkId: `${cx},${cy}`
}), { ex: 30 });

// On snapshot "online players":
const keys = await redis.keys("player:*");
const online = await Promise.all(keys.map(async (k) => {
  const v = await redis.get(k);
  return v ? JSON.parse(v) : null;
})).then(arr => arr.filter(Boolean));
```

**TTL of 30 s** matches the heartbeat cadence. A player is "online" iff their key exists.

**Removes DB pressure entirely** for "who's online" — the materialized view is a backup / fallback for when Redis is unavailable.

## 3.5 Snapshot version counter

**Redis key:** `world:version` (integer).

Incremented by the NOTIFY relay when forwarding a message:

```ts
// In world-notify-relay.ts:
async function onNotification(msg) {
  const version = await redis.incr("world:version");
  const event = { version, ...JSON.parse(msg.payload) };
  await redis.publish("world_changes", JSON.stringify(event));
}
```

**Coalescing:** many NOTIFYs within a window produce one incremented version, but only the latest events are forwarded (the relay holds a per-(kind, id) coalescing buffer with 100 ms timeout).

**Client tracks `lastVersion`:** on reconnect, client sends `lastVersion`. Server sends deltas since.

**Snapshot includes version:**
```ts
type Snapshot = { version: number; /* ... */ };
type Delta = { version: number; changes: Partial<Snapshot> };
```

## Deliverable checklist

- [ ] `src/db/replica.ts` — replica Drizzle setup
- [ ] `src/lib/db.ts` — `withReadDb()` / `withWriteDb()` helpers
- [ ] `online_players` materialized view + refresh trigger/cron
- [ ] `relevance:*` and `player:*` Redis keys in heartbeat path
- [ ] `world:version` counter incremented by relay
- [ ] Snapshot module returns versioned payloads
- [ ] `src/lib/snapshot.ts` reads from `readDb`
- [ ] Sim worker + NOTIFY relay bypass PgBouncer (if used)

## Verification

- [ ] Replica lag <500 ms under load
- [ ] Materialized view refresh doesn't block reads
- [ ] Snapshot reads come from replica (verify via Postgres logs)
- [ ] Presence reads from Redis (no `characters` queries for online check)
- [ ] Version counter increments monotonically
- [ ] Client reconnect with `lastVersion` only receives deltas since
- [ ] Kill replica; reads fall back to primary with degradation warning