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
| `src/app/api/health` | DB ping + Upstash status; returns 503 if degraded |
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

## Credits

Character sprites: Universal LPC Spritesheet Character Generator contributors (CC-BY-SA 3.0 / OGA-BY 3.0). See `public/lpc/LICENSE.txt`.
