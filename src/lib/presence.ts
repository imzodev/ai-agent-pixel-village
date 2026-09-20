// Player presence.
//
// Two responsibilities:
//   1. Persist "where was everyone when they were last seen" to Postgres
//      so a player rejoins at the right spot.
//   2. Mirror a lightweight presence record into Redis with a short TTL,
//      so "who is online right now" can be answered without scanning the
//      characters table.
//
// Before: every /api/world POST ran UPDATE characters SET lastSeenAt=now().
// At 5k players @ 1 Hz that was 5k UPDATEs/sec. Now each player is written
// at most once per LAST_SEEN_TTL_SECONDS (default 10s), and the WS server
// additionally throttles in memory so the Redis EXISTS gate isn't hit on
// every heartbeat.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { redis } from "@/lib/redis";
import type { PresenceRecord } from "@/types/redis";

export type { PresenceRecord };

const LAST_SEEN_TTL_SECONDS = Math.max(1, Number(process.env.LAST_SEEN_TTL_SECONDS ?? 10));
// Presence outlives the write cadence so a player never briefly vanishes
// between writes.
const PRESENCE_TTL_SECONDS = Math.max(
  LAST_SEEN_TTL_SECONDS + 5,
  Number(process.env.PRESENCE_TTL_SECONDS ?? 30),
);

const pingKey = (playerId: number): string => `player:${playerId}:ping`;
const presenceKey = (playerId: number): string => `presence:${playerId}`;

/**
 * Write a player's presence.
 *
 * Callers on the hot path (WS heartbeats) should throttle themselves and
 * pass `{ force: true }` to skip the Redis EXISTS gate — that removes one
 * Redis command per heartbeat. The HTTP fallback path relies on the gate.
 */
export async function refreshLastSeen(
  playerId: number,
  position?: { x?: number; y?: number; facing?: string },
  opts?: { force?: boolean },
): Promise<void> {
  if (!opts?.force) {
    // Redis EXISTS is the gate; if the key is present we skip the write.
    // If Redis is unreachable, fail open and let the DB write proceed so
    // the player doesn't disappear from the world.
    let present = 0;
    try {
      present = await redis.exists(pingKey(playerId));
    } catch {
      present = 0;
    }
    if (present === 1) return;
  }

  const patch: Partial<typeof characters.$inferInsert> = { lastSeenAt: new Date() };
  if (position?.x !== undefined) patch.x = position.x;
  if (position?.y !== undefined) patch.y = position.y;
  if (position?.facing !== undefined) patch.facing = position.facing;

  await db.update(characters).set(patch).where(eq(characters.id, playerId));

  // Redis presence mirror — live position, short TTL. Best-effort.
  try {
    await redis.set(
      presenceKey(playerId),
      JSON.stringify({
        id: playerId,
        x: position?.x,
        y: position?.y,
        facing: position?.facing,
        at: Date.now(),
      }),
      { ex: PRESENCE_TTL_SECONDS },
    );
  } catch {
    // Presence mirror is advisory; the DB row is authoritative.
  }

  try {
    await redis.set(pingKey(playerId), "1", { ex: LAST_SEEN_TTL_SECONDS });
  } catch {
    // Ignore — the next write will retry.
  }
}

/**
 * Read every live presence record. Uses SCAN-style key listing via the
 * RedisLike `keys` helper (simple prefix match). At very large player
 * counts this would want a Redis SET/index; at village scale it is fine.
 */
export async function getOnlinePresence(): Promise<PresenceRecord[]> {
  const out: PresenceRecord[] = [];
  try {
    const keys = await redis.keys("presence:*");
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        out.push(JSON.parse(String(raw)) as PresenceRecord);
      } catch {
        // Skip malformed entries.
      }
    }
  } catch {
    // Redis unavailable — caller should fall back to the DB.
  }
  return out;
}

/** Cheap online count sourced from Redis presence. */
export async function onlineCount(): Promise<number> {
  return (await getOnlinePresence()).length;
}
