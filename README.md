# thegrove

A persistent pixel-art village where humans and AI agents share one world. Sponsored agents are
friendly NPCs **and** brand ambassadors in the same breath: they hand out missions and items, mention
the sponsor's offer the way a shopkeeper naturally would, and turn accepted pitches into discount-code
items for the player and leads for the business.

## Stack

- **Next.js (App Router) + PostgreSQL via Drizzle** — auth, world state, simulation, agent HTTP API, Stripe.
- **Phaser 3** in the browser — tilemap-style ground, sprites, camera (zoom/pan/follow), input, weather, day/night.
- **Universal LPC Spritesheet** layers (`public/lpc/*`) composited + recolored live in the browser for every human and agent.
- Buildings, trees, animals, enemies, props: procedurally drawn pixel art (`src/game/textures.ts`) in one soft palette.

## Layout

| Path | What |
|---|---|
| `src/db/schema.ts` | users, characters, buildings, sponsors, npcs (agents), animals, items, inventory, missions, leads, conversations, world state/events, resource nodes, enemies |
| `src/lib/worldmap.ts` | shared geometry (buildings, trees, pond, collision, game clock) used by server **and** client |
| `src/lib/seed.ts` | idempotent world seed: 8 buildings, 7 NPCs (1 sponsored demo: the bakery), 17 animals, missions, nodes |
| `src/lib/sim.ts` | world tick (animals wander/sleep/hunger, NPC wander, weather, respawns, enemy spawns, unattended events). Emits `world_change` pub/sub events on every entity update. |
| `src/lib/world-tickd.ts` | standalone sim worker — runs `tickWorld` at 1 Hz, advisory-locked to a single primary |
| `src/lib/world-stream.ts` | WebSocket server (`/ws`) — cookie auth, proximity-filtered snapshot fan-out, slow-client backpressure |
| `src/lib/protocol.ts` | wire protocol (`WsClientMessage`, `WsServerMessage`, `WorldSnapshot`) shared by server + client |
| `src/lib/agent.ts` | NPC brain: scripted (always), LLM (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), or remote webhook. Pitch weaving lives here. |
| `src/lib/offers.ts` | which missions / turn-ins / gifts / discount an NPC can extend right now |
| `src/server.ts` | custom Node server — boots Next.js + WS on the same port so the browser sends the session cookie on WS upgrade |
| `src/app/api/world` | HTTP fallback for clients without WS (GET public, POST with position) |
| `src/app/api/health` | DB ping + Upstash status, shard config, draining state; returns 503 if degraded or draining |

| `src/app/api/npc/[id]/talk`, `/accept` | conversation + applying offers (mission, turn-in, gift, discount → item + lead) |
| `src/app/api/act` | pet / gather / attack / enter / chat |
| `src/app/api/items` | pickup / drop / equip / use / place (home decor) |
| `src/app/api/inspect` | "what's that sheep doing?" — real data about any entity |
| `src/app/api/sponsors` | reserve a building (Stripe Checkout subscription when configured), dashboard, edits, cancel; `/webhook` for Stripe |
| `src/app/api/agents` | external AI agents: register, look, move/say/offerMission/dropItem, webhook conversations |
| `src/game/WorldScene.ts` | the Phaser scene |
| `src/game/worldStream.ts` | browser WS client with jittered reconnect |
| `src/components/Hud.tsx` | React overlay: dialogue, bag, missions, home decorator, world log, inspect |
| `/signup` | LPC character creator |
| `/sponsor`, `/sponsor/dashboard` | business flow |
| `/agents` | agent API docs |

## Process topology

```
┌────────────────┐  ┌────────────────┐
│  src/server.ts │  │ world-tickd.ts │
│  Next.js + WS  │  │   sim worker   │
│  on :3000      │  │   1 Hz tick    │
│  /ws upgrade   │  │  view refresh  │
└───────┬────────┘  └───────┬────────┘
        │                    │
        │ reads              │ writes
        ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│ Read replica     │  │ Postgres primary │
│ (optional)       │◄─│ online_players   │
│                  │  │ materialized view│
└──────────────────┘  └──────────────────┘
        ▲
        │ presence + snapshot cache
┌───────┴────────┐
│ Upstash Redis  │
└────────────────┘
```

The WS server pushes a fresh snapshot to each client every
`WS_REFRESH_MS` (default 5 s). Reads go through the replica when
`DATABASE_REPLICA_URL` is set; writes always hit the primary. The sim
worker refreshes the `online_players` materialized view every
`ONLINE_PLAYERS_REFRESH_MS` (default 5 s), and the snapshot reads online
players from that view (falling back to a direct `characters` query if
the view is unavailable).

Run locally:
```
pnpm run dev:server   # Next.js + WS on :3000
pnpm run dev:tickd    # sim worker
```
Or both at once: `pnpm run dev` (uses `concurrently`).

## Env

- `DATABASE_URL` (required) — Postgres on `127.0.0.1:5432`, db `app_db`, user/pass `postgres`/`postgres`.
  - If port 5432 is free: `docker compose up -d`, then `pnpm db:push`.
  - If port 5432 is already taken by another local Postgres, just `CREATE DATABASE app_db;` on it (or run `docker compose up -d` after remapping the host port in `docker-compose.yml`).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (recommended) — snapshot cache, presence mirror, and the `world:version` counter. Without these the app falls back to an in-process memory cache and still works in single-process dev mode.
- `DATABASE_REPLICA_URL` (optional) — Postgres read replica for snapshot/list reads. Unset means reads go to the primary. Also `DATABASE_REPLICA_POOL_MAX`.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_BASE_URL` — real payment rails. Without a key the app runs in sandbox mode (reservations activate instantly).
- `OPENAI_API_KEY` (+ `OPENAI_MODEL`) or `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) — LLM-driven NPC dialogue. Without them the scripted brain runs.

### Phase 4 hardening tunables

- `WS_REFRESH_MS` (default 5000) — how often the WS server pushes a fresh snapshot to every connected client.
- `WS_MAX_UPGRADES_PER_IP` (default 10) + `WS_IP_WINDOW_MS` (default 10000) — reconnect-storm protection. Upgrades over the limit per window return `429`.
- `SLOW_CLIENT_THRESHOLD_BYTES` (default 262144) + `SLOW_CLIENT_HOLD_MS` (default 2000) — a connection whose OS send buffer stays over the threshold for the hold window is closed with `1008 slow consumer`.
- `LOG_LEVEL` (default `info`) — pino log verbosity.
- `SERVICE_NAME` / `WS_SHARD_ID` — labels attached to every Prometheus metric and log line. Set per shard.

### Observability

- `/api/metrics` returns Prometheus text (`text/plain; version=0.0.4`) with the metrics listed in `src/lib/metrics.ts`: ws connection counts/evictions, snapshot cache hit/miss, sim tick duration/failure, db pool gauges, plus default Node/process collectors. Scrape with your usual Prometheus setup.
- `/api/health` includes `ws.shard`, `ws.shardCount`, `ws.region`, `ws.connections`, `ws.draining`, `ws.accepting`. Returns `503` once the process enters graceful shutdown so the LB drains the instance.
- Logs are JSON via pino (`src/lib/logger.ts`), stamped with `service` and `shard`.

### Process supervision

Single-process deployments:

```
pnpm run dev:server   # Next.js + WS on :3000
pnpm run dev:tickd    # sim worker
```

Or with pm2:

```
pm2 start ecosystem.config.js
```

Multi-shard WS deployments (optional — see `docs/plans/phase-4-hardening.md` stop criterion):

- `WS_SHARD_ID` and `WS_SHARD_REGIONS` on each shard process, e.g. `WS_SHARD_REGIONS="0-9,-9-0;10-19,0-9"` for two non-overlapping bands.
- The login route picks a shard from the user's home chunk and sets a `shard` cookie; an LB (Caddyfile.example, or your own) routes `/ws` upgrades by that cookie.
- `ecosystem.config.js` has commented-out shards.

### Sentry (optional)

Sentry capture is not wired (no `@sentry/nextjs` dependency to keep the bundle light). To enable: install `@sentry/nextjs` and `@sentry/node`, set `SENTRY_DSN` in the env, and initialize in `src/server.ts` / `src/lib/world-tickd.ts` before any other imports.

## Credits

Character sprites: Universal LPC Spritesheet Character Generator contributors (CC-BY-SA 3.0 / OGA-BY 3.0). See `public/lpc/LICENSE.txt`.
