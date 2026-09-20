# Decisions & Open Questions

Items awaiting team/owner decisions before/during implementation.

## Architecture decisions (assumed)

| Decision | Choice | Rationale |
|---|---|---|
| Push transport | WebSocket | Lower latency than SSE; bidirectional; better for game state |
| Sim tick rate | 1 Hz | Matches current cadence; no need to change |
| Snapshot TTL | 250 ms | 5× capacity improvement; acceptable staleness |
| Proximity filter | ±1 chunk | Matches Phaser render scope |
| Chunk registry cap | 2,000 chunks | ~75 MB worst case; covers active area |
| NOTIFY coalescing | 100 ms window | Cuts fox-raid floods ~10× |
| WS shard unit | Chunk region (env-configurable) | Operator picks granularity |
| Auth | Session cookie reused from Next.js | Single source of truth |

## Open for confirmation

### 1. Phase 1 first, or jump to Phase 2?

**Recommendation:** Phase 1 first. No architectural risk, gets to ~1k players. Phase 2 requires WS client refactor and process topology changes.

**Alternative:** Start Phase 2 alongside Phase 1 if 5k is urgent.

### 2. Upstash Redis tier?

**Recommendation:** Start on free tier for Phase 1 development; upgrade to paid before Phase 2 rollout (free tier limits hit at moderate load).

**Need to confirm:** budget for Upstash paid tier.

### 3. Hosting for the WS process?

Vercel can't run long-lived WS servers. Options:

| Option | Effort | Notes |
|---|---|---|
| Fly.io | Low | Multi-region, persistent processes, supports WS natively |
| Railway | Low | Simple, persistent processes |
| Existing VM | Lowest | Same host as Next.js, separate process |
| Containerized (Docker + ECS/Cloud Run) | Medium | Production-grade but more setup |

**Need to confirm:** where this app currently runs and whether new process types are supported.

### 4. Postgres provider?

For read replica + NOTIFY behavior:

| Provider | Read replica | NOTIFY | Notes |
|---|---|---|---|
| Neon | Branches work as replicas | ✓ | HTTP-friendly, fits Vercel well |
| Supabase | ✓ | ✓ | Good DX, good observability |
| RDS | Classic | ✓ | More setup |
| Self-hosted | Manual | ✓ | Full control, more ops |

**Need to confirm:** current provider.

### 5. Backward compatibility during rollout?

**Recommendation:** WS path opt-in via env flag (`WS_ENABLED`). Old poll path stays as fallback. Gradual rollout by player cohort. Remove poll path once WS is proven.

**Need to confirm:** acceptable to ship both code paths during transition.

### 6. Chat and NPC dialogue in scope?

Chat grows with player count. Same scaling problem as snapshot.

**Recommendation:** Push chat through WS as part of Phase 2 (one less thing in HTTP). NPC dialogue can stay HTTP for now (low traffic).

**Need to confirm:** chat is in scope for this plan.

### 7. Anything to drop or deprioritize?

**Considered for dropping:**
- Phase 4 WS sharding (premature if single WS process handles 5k)
- Phase 4 observability (can be added later)
- Materialized view (Phase 3.2) — could skip if Redis presence is reliable

**Need to confirm:** minimum viable plan.

### 8. Process supervisor preference?

| Option | Best for |
|---|---|
| systemd | VMs, full control |
| pm2 | VMs, simple |
| Docker + Compose | Multi-host, containerized |
| Kubernetes | Large-scale, multi-tenant |
| Fly.io machines | Fly.io deployment |
| Vercel + Fly.io hybrid | Vercel for Next.js, Fly.io for WS |

**Need to confirm:** where each process type will run and how they'll be supervised.

### 9. Observability stack?

| Option | Cost | Notes |
|---|---|---|
| Sentry + custom `/api/metrics` | Free tier available | Cheap, good enough |
| Datadog | $$$ | Best APM, expensive |
| Grafana Cloud | $$ | Self-hosted metrics + dashboards |
| New Relic | $$$ | Full APM |

**Need to confirm:** observability budget.

### 10. Testing infrastructure?

| Option | Notes |
|---|---|
| Vitest | Fast, ESM-native, fits Next.js |
| Jest | Standard, more setup |
| None | Manual smoke tests only |

**Need to confirm:** testing framework preference (or none).

## Implementation order (proposed)

1. Phase 1.1 + 1.2 (pool + indexes) — single PR, DB migration
2. Phase 1.5 + 1.4 (proximity snapshot)
3. Phase 1.3 (lastSeenAt throttle)
4. Phase 1.6 + 1.7 (LRU + dedup)
5. Phase 1.8 (Upstash Redis)
6. Phase 2.1 + 2.3 (sim worker + relay)
7. Phase 2.2 + 2.4 + 2.5 + 2.6 (WS server + client refactor)
8. Phase 3 (read replica, materialized view)
9. Phase 4 (sharding, observability)
10. Phase 5 (cleanup, polish, docs)

Confirm or reorder.

## Confirmation checklist

Before I start implementation:

- [ ] Phase 1 first confirmed
- [ ] Upstash tier decision
- [ ] Hosting decision for WS process
- [ ] Postgres provider confirmed
- [ ] Backward compatibility approach confirmed
- [ ] Chat in/out of scope confirmed
- [ ] Dropped/deprioritized items confirmed
- [ ] Process supervisor decision
- [ ] Observability stack decision
- [ ] Testing framework decision
- [ ] Implementation order confirmed

Once confirmed, I'll start with Phase 1.1 + 1.2 (pool config + indexes) as the smallest safe change.