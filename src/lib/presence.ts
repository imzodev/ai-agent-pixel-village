// Throttle writes to characters.lastSeenAt via Redis.
//
// Before: every /api/world POST ran UPDATE characters SET lastSeenAt = now()
// WHERE id = $me. At 5k concurrent players polling 1 Hz that's 5k
// UPDATEs/sec on the same table.
//
// After: only write to Postgres when the Redis key is missing. Each player
// gets one Postgres write per ~10 s instead of one per second.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { redis } from "@/lib/redis";

const LAST_SEEN_TTL_SECONDS = Math.max(1, Number(process.env.LAST_SEEN_TTL_SECONDS ?? 10));
const lastSeenKey = (playerId: number): string => `player:${playerId}:ping`;

/**
 *Refresh a player's lastSeenAt. Only touches Postgres when the Redis
 * throttle key has expired (i.e. it's been at least
 * LAST_SEEN_TTL_SECONDS seconds since the last DB write for this player).
 *
 * If `position` is given, also patch the position in the same UPDATE.
 * Returns true if the DB write happened (or if Redis is down, in which
 * case we degrade to always-write so we don't lose presence).
 */
export async function refreshLastSeen(
  playerId: number,
  position?: { x?: number; y?: number; facing?: string },
): Promise<void> {
  // Redis EXISTS is the gate; if the key is present we skip the write.
  // If Redis is unreachable, fail open (assume not present) and let the
  // DB write proceed so the player doesn't disappear from the world.
  let present = 0;
  try {
    present = await redis.exists(lastSeenKey(playerId));
  } catch {
    present = 0;
  }
  if (present === 1) return;

  const patch: Partial<typeof characters.$inferInsert> = { lastSeenAt: new Date() };
  if (position?.x !== undefined) patch.x = position.x;
  if (position?.y !== undefined) patch.y = position.y;
  if (position?.facing !== undefined) patch.facing = position.facing;

  await db.update(characters).set(patch).where(eq(characters.id, playerId));
  try {
    await redis.set(lastSeenKey(playerId), "1", { ex: LAST_SEEN_TTL_SECONDS });
  } catch {
    // Ignore — TTL next write will retry.
  }
}