# Risks & Tradeoffs

## Upstash-specific risks

### HTTP latency for hot loops
Upstash REST API has ~5–10 ms per GET/SET roundtrip. Fine for snapshot cache reads (low frequency), but bad for per-event pub/sub hot loops.

**Mitigation:** use Redis pub/sub only for fan-out between processes (low frequency), not per-message state. State stays in DB.

### Free tier limits
Upstash free tier: 10k commands/day, 256 MB storage. At 5k players polling at 1 Hz with no caching, you'd blow past this in minutes.

**Mitigation:** Phase 1's snapshot cache (250 ms TTL) reduces per-player reads from 1 Hz to 4 Hz cache hits. Sustained 5k needs paid tier.

### Pub/Sub connection limits
Upstash pub/sub connections are billed per connection per hour. Multiple WS processes × persistent subscriptions add up.

**Mitigation:** prefer single relay process per primary; WS processes use cross-shard channels only for rare cross-region events.

## Postgres-specific risks

### NOTIFY payload limit
8 KB per NOTIFY message. Full state would never fit.

**Mitigation:** payloads carry only `{kind, id, chunkX, chunkY}`. Full state is fetched from snapshot cache or DB on receipt.

### Advisory locks through PgBouncer
PgBouncer transaction-mode pooling breaks LISTEN/NOTIFY and advisory locks.

**Mitigation:** sim worker and NOTIFY relay connect directly to the primary, bypassing PgBouncer. Document in `src/lib/db.ts`.

### Read replica lag
Typically 100–500 ms. Snapshot reads may be slightly stale.

**Mitigation:** 250 ms snapshot cache masks most of it. Documented staleness budget: ≤ 750 ms worst case. Acceptable for pixel village.

### Materialized view refresh blocking
`REFRESH MATERIALIZED VIEW` (without CONCURRENTLY) takes an exclusive lock and blocks reads.

**Mitigation:** always use `CONCURRENTLY`. Requires unique index on the view.

## WebSocket-specific risks

### Next.js 16.2.6 doesn't natively support WebSocket route handlers
The App Router doesn't ship with WS upgrades.

**Mitigation:** run WS as a separate Node process (`src/lib/world-stream.ts`), not inside Next.js. Standard pattern.

### Cookie-based sticky sessions
LB sticky by cookie requires the cookie to be set on login and respected by all routes.

**Mitigation:** set `shard` cookie on `/api/auth/login` (or equivalent). LB matches `Cookie: shard=...`.

### WebSocket in dev vs production
Dev runs all four processes via `concurrently`. Production runs them behind a process supervisor (systemd, pm2, or containers).

**Mitigation:** clear scripts in `package.json` (`dev`, `dev:next`, `dev:tickd`, `dev:ws`, `dev:relay`). Production config in `ecosystem.config.js` or equivalent.

### Reconnect storms
All clients reconnect simultaneously after WS restart. Without jitter, the LB sees a thundering herd.

**Mitigation:** client-side exponential jitter (Phase 2.4). Server-side connection rate limiting (Phase 4.4).

## Architectural risks

### Phase ordering assumptions
Phase 2 assumes Phase 1.4 (snapshot cache) and Phase 1.8 (Redis) are done. Phase 3 assumes Phase 2 is done. Etc.

**Mitigation:** each phase is shippable independently. Stop at any phase if the capacity target is met.

### Cross-shard complexity
Phase 4 sharding by chunk region means cross-region events need special handling.

**Mitigation:** rare events use Redis pub/sub channels `shard:{from}→{to}`. Most events stay within a shard.

### Snapshot staleness budget vs gameplay
Players may see other players up to 750 ms late. For movement, this is fine. For chat, may feel laggy.

**Mitigation:** chat pushes are immediate (Phase 2.4 client subscribes to `player:{id}` channel). Snapshot delivers history; deltas deliver now.

## Tradeoffs explicitly accepted

| Decision | Tradeoff | Why we accept it |
|---|---|---|
| WS over SSE | More infra complexity | Lower latency, bidirectional, better for game state |
| Standalone processes | Operational complexity (4 processes) | Each has independent scaling; can't share pool with Next.js |
| Snapshot cache TTL=250ms | Up to 250ms staleness | Acceptable for pixel village; 5× capacity improvement |
| Polling fallback during rollout | Two code paths for state delivery | De-risks Phase 2; can remove poll path once WS is proven |
| Proximity filter (±1 chunk) | Players can't see beyond their chunk | Matches Phaser rendering scope anyway |
| In-memory LRU on chunk registry | Cold chunks re-parsed | 75 MB cap vs unbounded growth; cheap to re-parse |
| Standalone NOTIFY relay | Extra process | Decouples Postgres from WS; one place to coalesce |
| Snapshot version counter | Client must track lastVersion | Enables reconnect-with-deltas; eliminates resends |
| Per-player relevance cache | 30s TTL means stale relevance during fast travel | Player relevance only changes when they cross chunk boundaries (~3s); 30s TTL is fine |

## Risks we're explicitly NOT mitigating (yet)

- **Cross-region replication.** Single-region is fine to 5k. Multi-region adds 6 months of work.
- **Federated sim across multiple primaries.** Out of scope.
- **Custom binary protocol.** JSON is fine at this scale.
- **Real-time multiplayer precise sync.** Server-authoritative, not peer-to-peer.
- **Mobile optimization.** Out of scope.
- **CDN for static assets.** Existing setup is fine; revisit if egress becomes an issue.

## Failure modes and recovery

| Failure | Impact | Recovery |
|---|---|---|
| Upstash Redis unreachable | Snapshot cache misses; presence untrackable; pub/sub silent | In-memory fallback (Phase 1.8); degrade gracefully; alert via Sentry |
| Postgres primary down | Writes fail; reads from replica stale | Failover to replica as new primary; client refreshes |
| Replica down | Snapshot reads fall back to primary | Slowdown but functional; alert |
| Sim worker down | World doesn't update | Advisory lock auto-released; another instance takes over |
| WS server down | Push delivery fails | Clients reconnect via LB; state recoverable from snapshot on reconnect |
| NOTIFY relay down | No events forwarded | Restart; WS clients see no deltas until restart; snapshots continue to work |
| LB down | No traffic | LB is the entry point; restore from any backup |
| Next.js down | Auth/login/save fail | Restart; WS clients already authenticated continue |

## When to revisit the plan

Triggers that mean we need a new plan:

- 5k → 10k+ concurrent (Phase 4 sharding is the ceiling for current design)
- Latency budget tightens to <100ms (consider edge compute, Co-located Redis)
- Postgres primary becomes the bottleneck (consider sharding by chunk)
- New product features require richer state (consider CRDTs for collaboration)
- Hosting provider changes (revisit process topology)