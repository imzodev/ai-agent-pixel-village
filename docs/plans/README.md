# Scaling Plan: 5,000 Concurrent Players

Status: **draft, awaiting approval**
Stack: Upstash Redis + Postgres (read replica) + custom WS server + standalone sim worker

## Why this plan

Current architecture saturates at roughly **150–800 concurrent players**:
- Default `pg.Pool` `max = 10` (see `src/db/index.ts:14–22`)
- 1 Hz polling per player (`src/game/WorldScene.ts:228`)
- No indexes on hot queries (`characters.last_seen_at`, `world_chat.created_at`)
- Snapshot returns every entity globally (`src/app/api/world/route.ts:16–28`)
- 5,000 UPDATEs/sec on `characters.last_seen_at` from heartbeat writes

5,000 concurrent players requires a structural rework. The plan is ordered so each phase is independently shippable and gives measurable capacity improvement.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Phaser)                         │
│   WebSocket → ws://world-stream                                 │
│   HTTP POST  → /api/world/heartbeat (batched position deltas)  │
└──────────────────┬──────────────────────────┬───────────────────┘
                   │                          │
                   ▼                          ▼
       ┌──────────────────────┐   ┌──────────────────────────┐
       │  WS Process (x N)    │   │  Next.js (HTTP routes)   │
       │  world-stream.ts     │   │  /api/world/heartbeat    │
       │  per-shard region    │   │  /api/chunks/*           │
       │  proximity filter    │   │  /api/agents, etc.       │
       │  Redis SUBSCRIBE     │   │                          │
       └──────────┬───────────┘   └────────────┬─────────────┘
                  │ Redis Pub/Sub              │ pg.Pool (max 50)
                  ▼                            ▼
       ┌──────────────────────┐   ┌──────────────────────────┐
       │  Upstash Redis       │   │  Postgres Primary        │
       │  - presence (TTL)    │   │  writes                  │
       │  - snapshot cache    │◄──│  sim tick                │
       │  - pub/sub channels  │   │  LISTEN/NOTIFY           │
       └──────────────────────┘   └──────────┬───────────────┘
                                             │ logical replica
                                             ▼
                                  ┌──────────────────────────┐
                                  │  Postgres Read Replica   │
                                  │  snapshot reads          │
                                  └──────────────────────────┘
                  ▲
                  │ Redis Pub/Sub
       ┌──────────┴───────────┐
       │  Sim Worker          │
       │  world-tickd.ts      │
       │  1 Hz world tick     │
       │  PUBLISH on changes  │
       └──────────────────────┘
                  ▲
                  │ LISTEN world_change
       ┌──────────┴───────────┐
       │  NOTIFY Relay        │
       │  world-notify-relay  │
       │  Postgres → Redis    │
       └──────────────────────┘
```

## Phases

| Phase | Goal | Concurrent capacity | Effort |
|---|---|---|---|
| 1 — Quick wins | Fix pool + indexes + proximity snapshot + cache | 150 → ~1k | ~1 day |
| 2 — Push, don't poll | Replace 1 Hz polls with WS push | 1k → 5k | ~1 day |
| 3 — Read path | Read replica + materialized view + presence in Redis | 5k sustained | ~1 day |
| 4 — Hardening | WS sharding, observability, backpressure | 5k under burst | ~1 day |
| 5 — Maintainability | Protocol types, transport boundaries, lint rules | — | embedded |

Each phase is shippable independently. Stop at any phase if the capacity target is met.

## File index

- [phase-1-quick-wins.md](./phase-1-quick-wins.md) — pool, indexes, snapshot cache, proximity filter, LRU
- [phase-2-push.md](./phase-2-push.md) — sim worker, WS server, NOTIFY relay, client refactor
- [phase-3-read-path.md](./phase-3-read-path.md) — read replica, materialized view, Redis presence
- [phase-4-hardening.md](./phase-4-hardening.md) — WS sharding, observability, backpressure, graceful shutdown
- [phase-5-maintainability.md](./phase-5-maintainability.md) — protocol types, transport boundaries, lint rules, DB migration policy
- [risks.md](./risks.md) — risks, tradeoffs, mitigations
- [decisions.md](./decisions.md) — open questions for the team

## Implementation order

1. Phase 1.1 + 1.2 (pool + indexes) — single PR, DB migration
2. Phase 1.4 + 1.5 (proximity snapshot) — biggest single win
3. Phase 1.3 (lastSeenAt throttle) — small but impactful
4. Phase 1.6 + 1.7 (LRU + dedup) — quick
5. Phase 1.8 (Upstash Redis) — prerequisite for Phase 2
6. Phase 2.1 + 2.3 (sim worker + relay)
7. Phase 2.2 + 2.4 + 2.5 + 2.6 (WS server + client refactor)
8. Phase 3 — read replica, materialized view
9. Phase 4 — sharding, observability
10. Phase 5 — cleanup, polish, docs

## Upstash note

Upstash Redis HTTP API is the right fit because:
- No connection pool needed
- TTL/EXPIRE for presence (cheap)
- Pub/Sub for fan-out between sim worker and WS processes
- Per-key caching for proximity-filtered snapshots
- Edge-compatible if we ever want to push more to the edge

State of the world at5k players polling:
- ~5 RPS for snapshot reads (cached,250 ms TTL)
- ~500 RPS for presence heartbeats (Redis only, throttled to 10 s)
- ~100 RPS for chunk loads (cached client-side)
- ~5–50 RPS for NOTIFY/PUBLISH between sim and WS (event-driven, not polled)

This is well within Upstash's HTTP rate limits even on the free tier for low traffic; sustained5k needs a paid tier.