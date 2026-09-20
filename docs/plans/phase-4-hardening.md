# Phase 4 — Hardening

Goal: **5k under burst and failure conditions.**

Sustained load isn't enough — we need to handle spikes, slow clients, replica lag, partial outages, and observability for everything.

## 4.1 WS sharding by chunk region

A single Node WS process caps out around **10k connections** on the event loop. At 5k we want headroom and burst tolerance, so multiple WS processes behind a sticky LB.

**Shard assignment:**

Each WS process declares which chunk regions it owns via env:

```
WS_SHARD_REGIONS=0-9,-9-0   # x: 0..9, y: -9..0
WS_SHARD_REGIONS=10-19,0-9  # x: 10..19, y: 0..9
# etc.
```

**Routing:** the LB (HAProxy, Caddy, or a small Node LB) routes incoming connections based on cookie-stamped shard ID assigned at login:

```ts
// In Next.js /api/auth/login:
const shard = pickShard(character.homeX, character.homeY);
res.setHeader("Set-Cookie", `shard=${shard}; HttpOnly; SameSite=Lax`);
```

The LB then routes on `Cookie: shard=...`.

**Cross-shard events:** rare but real (chat, world events that span regions). Relayed via Redis pub/sub channels `shard:{from}→{to}`. WS processes SUBSCRIBE to channels for shards they care about.

**Implementation:**

```ts
// In world-stream.ts:
const myRegions = parseRegions(process.env.WS_SHARD_REGIONS);
const relevantChannels = computeCrossShardChannels(myRegions);

await redis.subscribe(...relevantChannels, (msg) => handleCrossShardEvent(msg));
```

## 4.2 NOTIFY coalescing

**File:** `src/lib/world-notify-relay.ts`

The relay coalesces per `(kind, id)` within 100 ms windows:

```ts
const coalesceBuffer = new Map<string, { payload: string; timer: NodeJS.Timeout }>();
const COALESCE_WINDOW_MS = 100;

client.on("notification", (msg) => {
  if (msg.channel !== "world_change") return;
  const event = JSON.parse(msg.payload!);
  const key = `${event.kind}:${event.id}`;
  const existing = coalesceBuffer.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    coalesceBuffer.delete(key);
    await redis.publish("world_changes", JSON.stringify({
      ...event,
      version: await redis.incr("world:version"),
    }));
  }, COALESCE_WINDOW_MS);

  coalesceBuffer.set(key, { payload: msg.payload!, timer });
});
```

Prevents a fox raid (which writes per-state-transition) from flooding the channel.

## 4.3 Slow client eviction

Already introduced in Phase 2.5. In Phase 4 we make it more aggressive and observable:

- Track per-connection `outboundBuffer` bytes and `slowDurationMs`
- WS server `/api/metrics` (4.5) exposes `ws_slow_connections`, `ws_evictions_total`
- Add metric tags: shard, reason

```ts
ws.on("close", (code, reason) => {
  metrics.increment("ws_close", { code: String(code), reason: reason.toString() });
  if (code === 1008) metrics.increment("ws_evictions_total");
});
```

## 4.4 Reconnect storm protection

When the WS server restarts (deploy, crash), all clients reconnect at once. Need to avoid thundering herd.

**Client-side jitter** (already in Phase 2.4):
```ts
const delay = Math.min(8000, 250 * 2 ** this.reconnectAttempts) + Math.random() * 250;
```

**Server-side rate limit:** LB rejects new connections per IP at >5/sec. Connection queue with bounded wait time.

**Health endpoint:** `/api/health` reports shard capacity. Clients poll before reconnecting:

```ts
async function shouldReconnect(): Promise<boolean> {
  const health = await fetch("/api/health").then(r => r.json()).catch(() => null);
  return health?.ws?.accepting ?? true;
}
```

## 4.5 Observability

**New file:** `src/app/api/metrics/route.ts`

Prometheus-format metrics:

```
# Request rate
http_requests_total{path,method,status}

# DB pool stats
db_pool_acquire_seconds{quantile}
db_pool_active_connections
db_pool_idle_connections
db_pool_waiting_requests

# Cache
snapshot_cache_hits_total
snapshot_cache_misses_total
snapshot_cache_evictions_total

# WS
ws_connections{shard}
ws_slow_connections{shard}
ws_evictions_total{shard,reason}
ws_send_buffer_bytes{shard,quantile}

# Sim worker
sim_tick_duration_seconds{quantile}
sim_tick_failures_total
sim_entity_updates_total{kind}

# NOTIFY/Redis
notify_publish_lag_seconds{quantile}
redis_pubsub_publish_lag_seconds{quantile}
```

**Implementation:** `prom-client` (Node Prometheus client). Single registry per process. Each route handler / worker emits its own metrics.

**Structured logs:** `pino` with `requestId`, `playerId`, `chunkId`, `shard` context.

```ts
import pino from "pino";
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "ai-village" },
});
```

**Error tracking:** Sentry SDK in each process. `Sentry.init({ dsn: process.env.SENTRY_DSN })`.

## 4.6 Graceful shutdown

**WS process** on SIGTERM:
```ts
process.on("SIGTERM", async () => {
  log.info("graceful shutdown starting");
  wss.close(); // stop accepting new connections
  await sleep(30_000); // wait for drains
  for (const conn of connections.values()) {
    conn.ws.close(1001, "server shutting down");
  }
  await redis.quit();
  process.exit(0);
});
```

**Sim worker** on SIGTERM:
```ts
process.on("SIGTERM", async () => {
  running = false;
  await inFlightTick;
  await pool.query("SELECT pg_advisory_unlock(42)");
  await pool.end();
  process.exit(0);
});
```

**NOTIFY relay** on SIGTERM:
```ts
process.on("SIGTERM", async () => {
  await client.query("UNLISTEN world_change");
  await client.end();
  process.exit(0);
});
```

**LB health checks:** `/api/health` returns 200 unless shutdown initiated. LB drains connections before stopping the process.

## 4.7 LB and process supervisor

**Local dev:** `concurrently` is fine.

**Production:** process manager per host:
- `systemd` units per process
- Or `pm2` with ecosystem file:
  ```js
  // ecosystem.config.js
  module.exports = {
    apps: [
      { name: "ai-village-next", script: "next start" },
      { name: "ai-village-tickd", script: "tsx src/lib/world-tickd.ts" },
      { name: "ai-village-ws-0", script: "tsx src/lib/world-stream.ts", env: { WS_SHARD_REGIONS: "0-9,-9-0", WS_PORT: 3001 } },
      { name: "ai-village-ws-1", script: "tsx src/lib/world-stream.ts", env: { WS_SHARD_REGIONS: "10-19,0-9", WS_PORT: 3002 } },
      { name: "ai-village-relay", script: "tsx src/lib/world-notify-relay.ts" },
    ],
  };
  ```

- Or containerized: one container per process, orchestrator handles restart

**LB choice:**
- **Caddy** for small setups: simple config, automatic HTTPS
- **HAProxy** for larger: better metrics, sticky sessions
- **Cloudflare** for the public edge (TLS, DDoS, geo)

## Deliverable checklist

- [ ] WS shard routing + `WS_SHARD_REGIONS` env
- [ ] LB sticky session by `shard` cookie
- [ ] Cross-shard pub/sub channels
- [ ] NOTIFY coalescing (100 ms window)
- [ ] Slow-client eviction metrics
- [ ] Reconnect jitter (client)
- [ ] LB connection rate limit
- [ ] `/api/health` endpoint
- [ ] `/api/metrics` Prometheus endpoint
- [ ] `pino` structured logs
- [ ] Sentry integration
- [ ] Graceful shutdown handlers (all 4 process types)
- [ ] Procfile / `ecosystem.config.js` / systemd units

## Verification

- [ ] Two WS shards; clients split across them via cookie
- [ ] Cross-shard event (rare) reaches all shards
- [ ] NOTIFY flood test: 1k entity updates in 1 s → ≤ 100 redis publishes
- [ ] Slow client evicted after 2 s of >64 KB buffer
- [ ] Metrics endpoint scrapeable; Grafana dashboards render
- [ ] `kill -SIGTERM` to WS: existing connections drain, no new accepts, exits in ≤30 s
- [ ] `kill -SIGKILL` to sim: advisory lock auto-released, another tickd takes over
- [ ] Reconnect storm: 5k clients reconnect simultaneously; LB doesn't fall over

## Phase 4 stop criterion

If we hit 5k sustained without sharding (single WS process), skip Phase 4 entirely. The sharding is there for headroom and bursts.