// Single source of truth for tunables. Logic files (sim, wander, world
// loop, WS server, client scene) import from here; do not hardcode these
// values anywhere else.
//
// Distinction: this file holds *tunables* (cadence, movement bounds,
// gameplay speeds). It does NOT hold intrinsic domain constants like
// `CHUNK_TILE_PX` or `FOOT_CORNERS` — those live with the module that
// owns the contract they belong to (see `src/lib/chunkCollision.ts`).

import type { IntervalConfig } from "@/types/motion";

/**
 * The world BEAT. Beats are epoch-aligned: beat k starts at
 * `k * WORLD_TICK_MS` of `Date.now()`, so the sim worker and every WS
 * process agree on beat boundaries without talking to each other.
 *
 * On every beat the sim worker runs `tickWorld()` and schedules the
 * moves of the entities that are due; those moves START on the next
 * beat. The WS server broadcasts them `BROADCAST_OFFSET_MS` after the
 * beat, so every client learns about a move ~4.5 s before it starts
 * and every client starts it at the same instant.
 */
export const WORLD_TICK_MS = 5_000;

/**
 * Delay after a beat boundary before the WS server broadcasts that
 * beat's moves. Must comfortably exceed the sim tick's duration so the
 * broadcast reads committed rows.
 */
export const BROADCAST_OFFSET_MS = 1_000;

/**
 * Full-snapshot safety resync per connection. Moves are delivered as
 * small per-beat deltas; the full snapshot only needs to catch
 * everything else (chat, items, spawns) and heal any missed delta.
 * Env: WS_RESYNC_MS.
 */
export const WS_RESYNC_MS = Math.max(
  WORLD_TICK_MS,
  Number(process.env.WS_RESYNC_MS ?? 30_000) || 30_000,
);

/**
 * Parse an env-provided movement interval. Invalid / non-positive
 * values fall back to `fallback`; values that aren't a whole number of
 * beats are rounded UP to the next beat (moves can only start on a
 * beat). Exported for tests.
 */
export function parseMoveInterval(raw: string | undefined, fallback: number): IntervalConfig {
  if (raw === undefined || raw.trim() === "") return { ms: fallback, warning: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { ms: fallback, warning: `invalid value "${raw}", using ${fallback} ms` };
  }
  const beats = Math.max(1, Math.ceil(n / WORLD_TICK_MS));
  const ms = beats * WORLD_TICK_MS;
  return {
    ms,
    warning: ms === n ? null : `${n} ms is not a multiple of the ${WORLD_TICK_MS} ms beat; rounded up to ${ms} ms`,
  };
}

const npcInterval = parseMoveInterval(process.env.NPC_MOVE_INTERVAL_MS, 10_000);
const animalInterval = parseMoveInterval(process.env.ANIMAL_MOVE_INTERVAL_MS, 10_000);
const enemyInterval = parseMoveInterval(process.env.ENEMY_MOVE_INTERVAL_MS, 10_000);

/**
 * How often each NPC takes a wander step. THE knob for NPC movement.
 * Env: NPC_MOVE_INTERVAL_MS (default 10000; rounded up to a whole beat).
 * Each NPC is staggered onto its own beat inside this interval.
 */
export const NPC_MOVE_INTERVAL_MS = npcInterval.ms;
/** Same knob for animals. Env: ANIMAL_MOVE_INTERVAL_MS. */
export const ANIMAL_MOVE_INTERVAL_MS = animalInterval.ms;
/** Same knob for enemies. Env: ENEMY_MOVE_INTERVAL_MS. */
export const ENEMY_MOVE_INTERVAL_MS = enemyInterval.ms;

/** Warnings from parsing the env intervals; logged once by tickd. */
export const MOVE_INTERVAL_WARNINGS: readonly string[] = [
  npcInterval.warning && `NPC_MOVE_INTERVAL_MS: ${npcInterval.warning}`,
  animalInterval.warning && `ANIMAL_MOVE_INTERVAL_MS: ${animalInterval.warning}`,
  enemyInterval.warning && `ENEMY_MOVE_INTERVAL_MS: ${enemyInterval.warning}`,
].filter((w): w is string => Boolean(w));

/**
 * Animal / enemy wander step bounds, in whole tiles (16 px). Every
 * wander move walks an exact integer number of tiles in one cardinal
 * direction. NPCs have their own bounds below.
 */
export const MOVE_MIN_TILES = 1;
export const MOVE_MAX_TILES = 4;

/**
 * Parse an env tile-count bound. Non-integers / values below 1 fall
 * back to `fallback`. Exported for tests.
 */
export function parseTiles(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : fallback;
}

/**
 * NPC wander step bounds (whole tiles). Env: NPC_MOVE_MIN_TILES /
 * NPC_MOVE_MAX_TILES. Min is clamped to max.
 */
export const NPC_MOVE_MAX_TILES = parseTiles(process.env.NPC_MOVE_MAX_TILES, 10);
export const NPC_MOVE_MIN_TILES = Math.min(parseTiles(process.env.NPC_MOVE_MIN_TILES, 1), NPC_MOVE_MAX_TILES);

/**
 * Minimum NPC leash radius (tiles from home). NPCs use the larger of
 * this and their row's `wander_radius`, so an NPC at home can always
 * take a full-length step in any open direction.
 */
export const NPC_LEASH_TILES = NPC_MOVE_MAX_TILES;

/**
 * How long a talk request keeps an NPC standing still, and how often the
 * open dialog renews it. The hold simply lapses after the dialog closes.
 */
export const NPC_TALK_HOLD_MS = 20_000;
export const NPC_TALK_KEEPALIVE_MS = 8_000;

/** A* bound for goal moves (fox raid, remote-agent "move" action). */
export const PLANNER_MAX_TILES_DEFAULT = 80;

/**
 * Planner bound for the fox raid egg-pick. Wider than the default
 * because the fox may target an egg across the map.
 */
export const PLANNER_MAX_TILES_EGG_PICK = 200;

/**
 * Movement speeds in world pixels per second. A wander move of
 * MOVE_MAX_TILES must finish within its kind's move interval (asserted
 * at tickd startup).
 */
export const NPC_SPEED = 38;
export const ANIMAL_SPEED = 28;
export const ENEMY_SPEED = 22;
/** Raiding foxes move faster than walking animals. */
export const ANIMAL_RAID_SPEED = 60;
