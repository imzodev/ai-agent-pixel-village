# Phase 2 — Push, Don't Poll

Goal: **1k → 5k concurrent players.** Structural unlock.

This phase replaces the 1 Hz polling loop with WebSocket push. After this phase, the per-player cost on the server drops from "1 HTTP request per second" to "events delivered only when state actually changes."

## 2.1 Sim worker extraction

**New file:** `src/lib/world-tickd.ts`

Standalone Node process. Runs `tickWorld` every 1 s on its own pool. Replaces request-driven ticking.

```ts
import { tickWorld } from "./sim";
import { pool } from "@/db";
import { sql } from "drizzle-orm";

const TICK_INTERVAL_MS = 1000;
let running = true;

async function tryAcquireAdvisoryLock(): Promise<boolean> {
  const result = await pool.query("SELECT pg_try_advisory_lock(42) AS locked");
  return result.rows[0]?.locked === true;
}

async function notifyChange(kind: string, id: number, chunkX: number, chunkY: number) {
  await pool.query("SELECT pg_notify('world_change', $1)", [
    JSON.stringify({ kind, id, chunkX, chunkY }),
  ]);
}

async function main() {
  if (!(await tryAcquireAdvisoryLock())) {
    console.error("another tickd holds the advisory lock; exiting");
    process.exit(1);
  }

  process.on("SIGTERM", () => { running = false; });
  process.on("SIGINT", () => { running = false; });

  while (running) {
    const start = Date.now();
    try {
      await tickWorld();
    } catch (err) {
      console.error("tick failed", err);
    }
    const elapsed = Date.now() - start;
    await sleep(Math.max(0, TICK_INTERVAL_MS - elapsed));
  }

  await pool.query("SELECT pg_advisory_unlock(42)");
  await pool.end();
  process.exit(0);
}

main();
```

**Advisory lock (`pg_try_advisory_lock(42)`):** ensures only one tickd runs per primary. Other instances back off and exit cleanly.

**NOTIFY integration:** sim paths need to emit `world_change` events. Add to `src/lib/sim.ts`:

```ts
// In tickAnimals, after the UPDATE
await db.update(animals).set({ ... }).where(eq(animals.id, a.id));
await db.execute(sql`SELECT pg_notify('world_change', ${JSON.stringify({
  kind: "animal", id: a.id, chunkX: Math.floor(a.x / 384), chunkY: Math.floor(a.y / 240)
})})`);
```

Apply to:
- `tickAnimals` (line 199–208): every animal update
- `tickNpcs` (line 188): every NPC update (skip `kind === "remote"`)
- `tickEnemies` (line 228): every enemy update + new spawns
- `tickResources` (line 211): every resource respawn
- `tickWeather` (line 196): on weather change

**NOTIFY payload limit:** 8 KB. Keep payloads tiny — IDs and chunk coords only. Full state stays in DB.

**Crash recovery:** the advisory lock is auto-released on connection death. Restart is safe.

## 2.2 WS server

**New file:** `src/lib/world-stream.ts`

Standalone Node process. Listens on `WS_PORT` (default 3001). Separate from Next.js.

**Wire protocol** (defined in `src/lib/protocol.ts`, Phase 5):

```ts
type WsMessage =
  | { type: "hello"; sessionId: string }
  | { type: "snapshot"; data: Snapshot }
  | { type: "delta"; data: Delta }
  | { type: "ping" }
  | { type: "pong" };
```

**Per-connection state:**
```ts
type Connection = {
  ws: WebSocket;
  playerId: number;
  homeChunk: { cx: number; cy: number };
  lastVersion: number;
  outboundBuffer: number;       // bytes queued
  isSlow: boolean;
  subscribedAt: number;
};
```

**Connect flow:**
1. Client sends `HELLO {sessionId}` over WS
2. Server validates session via `sessions` table (shared Postgres connection, read-only)
3. Server looks up `characterId`, last-known `homeChunk`
4. Server sets presence in Redis: `SET player:{id} {chunkId} EX 30`
5. Server sends initial `snapshot` from `src/lib/snapshot.ts:getSnapshot`
6. Server adds connection to a `Map<playerId, Connection>` for delta routing

**Per NOTIFY message:**
1. NOTIFY relay (2.3) receives `world_change` and PUBLISHes to Redis channel `world_changes`
2. WS process SUBSCRIBEs to `world_changes` on startup
3. For each message, parse `{kind, id, chunkX, chunkY}`
4. For each connection whose `homeChunk` is within ±1 of `(chunkX, chunkY)`, queue a delta
5. Deltas are coalesced per-connection: don't send more than 1 every 100 ms

**Delta fetch:**
```ts
async function buildDelta(version: number): Promise<Delta> {
  const changes: Partial<Snapshot> = {};
  // Pull changed entities by ID from Redis cache (Phase 3) or DB
  // ...
  return { version, changes };
}
```

**Auth:** WS validates the same session cookie as Next.js. Reject unauthenticated connects (close code 4401).

**Implementation:**

```ts
import { WebSocketServer } from "ws";
import { validateSession } from "./auth";
import { getSnapshot } from "./snapshot";
import { redis } from "./redis";
import { tickd } from "./protocol";

const wss = new WebSocketServer({ port: Number(process.env.WS_PORT ?? 3001) });
const connections = new Map<number, Connection>();

wss.on("connection", async (ws, req) => {
  const cookie = parseCookie(req.headers.cookie);
  const session = await validateSession(cookie.sessionId);
  if (!session) {
    ws.close(4401, "unauthenticated");
    return;
  }

  const snapshot = await getSnapshot(session.character.x, session.character.y);
  ws.send(JSON.stringify({ type: "snapshot", data: snapshot }));

  ws.on("message", (raw) => handleMessage(ws, session, raw));
  ws.on("close", () => cleanupConnection(session.character.id));
});

async function handleMessage(ws: WebSocket, session: Session, raw: Buffer) {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
    return;
  }
  if (msg.type === "hello") {
    // Initial connection metadata; sessionId validated server-side already
    const conn = connections.get(session.character.id)!;
    conn.lastVersion = msg.lastVersion ?? 0;
  }
}
```

## 2.3 NOTIFY → Redis pub/sub relay

**New file:** `src/lib/world-notify-relay.ts`

Decouples Postgres from WS processes. Single small process:

```ts
import { Client } from "pg";
import { redis } from "./redis";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("LISTEN world_change");

  client.on("notification", async (msg) => {
    if (msg.channel !== "world_change" || !msg.payload) return;
    try {
      const event = JSON.parse(msg.payload);
      // Coalesce: only publish if last publish for same (kind, id) >100ms ago
      await redis.publish("world_changes", msg.payload);
    } catch (err) {
      console.error("invalid NOTIFY payload", msg.payload, err);
    }
  });

  process.on("SIGTERM", async () => {
    await client.query("UNLISTEN world_change");
    await client.end();
    process.exit(0);
  });
}

main();
```

**Why a relay:** WS processes don't need LISTEN credentials; Redis pub/sub is the lingua franca. Also gives us one place to coalesce bursts.

## 2.4 Client refactor

**New file:** `src/game/worldStream.ts`

Thin WS client wrapping auto-reconnect + heartbeat:

```ts
export class WorldStream {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private handlers: Map<string, (data: unknown) => void> = new Map();

  constructor(
    private url: string,
    private sessionId: string,
  ) {}

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.ws?.send(JSON.stringify({ type: "hello", sessionId: this.sessionId, lastVersion: this.lastVersion }));
    };
    this.ws.onmessage = (e) => this.dispatch(JSON.parse(e.data));
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    const delay = Math.min(8000, 250 * 2 ** this.reconnectAttempts) + Math.random() * 250;
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  private dispatch(msg: WsMessage) {
    const handler = this.handlers.get(msg.type);
    if (handler) handler(msg);
  }

  on(type: string, handler: (data: unknown) => void) {
    this.handlers.set(type, handler);
  }

  close() {
    this.ws?.close();
  }

  private lastVersion = 0;
}
```

**Replace the poll loop:**

In `src/game/WorldScene.ts:228`:
```ts
// BEFORE
this.pollTimer = window.setInterval(() => void this.poll(), 1000);

// AFTER
this.stream = new WorldStream(process.env.NEXT_PUBLIC_WS_URL!, sessionId);
this.stream.on("snapshot", (data) => this.hydrate(data));
this.stream.on("delta", (data) => this.applyDelta(data));
this.stream.connect();
```

## 2.5 Backpressure

In `src/lib/world-stream.ts`:

```ts
const MAX_BUFFER = 64 * 1024;       // 64 KB
const SLOW_THRESHOLD = 2_000;       // 2s

wss.on("connection", (ws) => {
  const conn: Connection = {
    ws,
    outboundBuffer: 0,
    isSlow: false,
    // ...
  };

  const originalSend = ws.send.bind(ws);
  ws.send = (data, opts, cb) => {
    if (conn.isSlow) return; // drop frame
    const bytes = data.length ?? 0;
    conn.outboundBuffer += bytes;
    if (conn.outboundBuffer > MAX_BUFFER) {
      conn.isSlow = true;
      setTimeout(() => ws.close(1008, "slow consumer"), SLOW_THRESHOLD);
      return;
    }
    originalSend(data, opts, () => {
      conn.outboundBuffer -= bytes;
    });
  };
});
```

Client reconnect is jittered (2.4): `delay = min(8s, 250ms * 2^attempt) + random`.

## 2.6 Auth on WS

Session validation reuses `src/lib/auth.ts`:

```ts
async function validateSession(sessionId: string): Promise<Session | null> {
  const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session[0]) return null;
  if (session[0].expiresAt < new Date()) return null;
  const char = await db.select().from(characters).where(eq(characters.id, session[0].characterId)).limit(1);
  if (!char[0]) return null;
  return { session: session[0], character: char[0] };
}
```

Cookie parsing: extract `sessionId` from `Cookie` header.

## Local dev setup

Add to `package.json`:
```json
{
  "scripts": {
    "dev": "concurrently -k -n next,tickd,ws,relay -c blue,green,yellow,magenta \"npm:dev:*\"",
    "dev:next": "next dev",
    "dev:tickd": "tsx watch src/lib/world-tickd.ts",
    "dev:ws": "tsx watch src/lib/world-stream.ts",
    "dev:relay": "tsx watch src/lib/world-notify-relay.ts"
  }
}
```

Add `concurrently` to `devDependencies`.

Add to `.env.example`:
```
WS_PORT=3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## Deliverable checklist

- [ ] `src/lib/world-tickd.ts` — standalone sim worker, advisory-lock-guarded
- [ ] `src/lib/world-stream.ts` — standalone WS server
- [ ] `src/lib/world-notify-relay.ts` — NOTIFY → Redis pub/sub bridge
- [ ] `src/lib/sim.ts` emits NOTIFYs on entity changes
- [ ] `src/lib/redis.ts` gains pub/sub helpers
- [ ] `src/lib/snapshot.ts` gains `getDelta(version)` helper
- [ ] `src/game/worldStream.ts` — client WS client with reconnect
- [ ] `src/game/WorldScene.ts:228` — poll loop removed
- [ ] `src/app/api/world/route.ts` — heartbeat-only POST, no longer drives sim
- [ ] Procfile / package.json scripts for all four processes

## Verification

- [ ] All four processes start cleanly via `npm run dev`
- [ ] WS client connects, receives initial snapshot, applies deltas
- [ ] Reconnect after server restart works (jittered)
- [ ] Postgres NOTIFY fires on entity update; WS push arrives within 250 ms
- [ ] Slow client evicted after 2 s of >64 KB buffer
- [ ] Two tickd instances: only one acquires advisory lock; other logs and exits
- [ ] Stress test (k6 WS): 5k connections sustained on a single WS process

## Backward compatibility

Phase 2 ships alongside the existing poll path:
- New WS path is opt-in (env flag `WS_ENABLED`)
- Old `/api/world` POST continues to work
- Gradual rollout by feature flag
- Once WS is proven at production scale, remove the poll path

This de-risks Phase 2 — a buggy WS rollout doesn't take down the game.