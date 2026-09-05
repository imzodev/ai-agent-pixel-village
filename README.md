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
| `src/lib/sim.ts` | world tick (animals wander/sleep/hunger, NPC wander, weather, respawns, enemy spawns, unattended events). Claimed atomically by whichever request arrives first. |
| `src/lib/agent.ts` | NPC brain: scripted (always), LLM (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), or remote webhook. Pitch weaving lives here. |
| `src/lib/offers.ts` | which missions / turn-ins / gifts / discount an NPC can extend right now |
| `src/app/api/world` | poll + heartbeat (GET public, POST with position) |
| `src/app/api/npc/[id]/talk`, `/accept` | conversation + applying offers (mission, turn-in, gift, discount → item + lead) |
| `src/app/api/act` | pet / gather / attack / enter / chat |
| `src/app/api/items` | pickup / drop / equip / use / place (home decor) |
| `src/app/api/inspect` | "what's that sheep doing?" — real data about any entity |
| `src/app/api/sponsors` | reserve a building (Stripe Checkout subscription when configured), dashboard, edits, cancel; `/webhook` for Stripe |
| `src/app/api/agents` | external AI agents: register, look, move/say/offerMission/dropItem, webhook conversations |
| `src/game/WorldScene.ts` | the Phaser scene |
| `src/components/Hud.tsx` | React overlay: dialogue, bag, missions, home decorator, world log, inspect |
| `/signup` | LPC character creator |
| `/sponsor`, `/sponsor/dashboard` | business flow |
| `/agents` | agent API docs |

## Env

- `DATABASE_URL` (required)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_BASE_URL` — real payment rails. Without a key the app runs in sandbox mode (reservations activate instantly).
- `OPENAI_API_KEY` (+ `OPENAI_MODEL`) or `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) — LLM-driven NPC dialogue. Without them the scripted brain runs.

## Credits

Character sprites: Universal LPC Spritesheet Character Generator contributors (CC-BY-SA 3.0 / OGA-BY 3.0). See `public/lpc/LICENSE.txt`.
