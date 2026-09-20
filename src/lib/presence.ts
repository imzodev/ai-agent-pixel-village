// Player presence persistence.
//
// Responsibility: remember where each player was when last seen, so they
// rejoin at the right spot and appear in the "online" window. That is a
// single Postgres UPDATE per player, throttled in memory so a 1.5 s WS
// heartbeat becomes at most one write per LAST_SEEN_TTL_MS (default 10 s).
//
// This module deliberately does NOT touch Redis. It previously mirrored
// presence into a `presence:{id}` key and used a `player:{id}:ping` key as
// the throttle gate; the mirror had no readers and the gate cost two Redis
// commands per write, which is unsustainable on a small Upstash plan. The
// in-memory throttle below is exact for a single process and, in a
// multi-process deployment, still bounds each process to one write per
// player per window.
//
// "Who is online" is answered from Postgres directly: the `online_players`
// materialized view (see src/lib/onlinePlayers.ts) or a characters query
// filtered on lastSeenAt.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";

const LAST_SEEN_TTL_MS = Math.max(
  1000,
  Number(process.env.LAST_SEEN_TTL_SECONDS ?? 10) * 1000,
);

// playerId → last time we persisted a position for them. Bounded by a
// prune so a long-lived process does not grow this without limit.
const lastWriteAt = new Map<number, number>();
const MAP_SOFT_CAP = 10_000;

function prune(now: number): void {
  if (lastWriteAt.size < MAP_SOFT_CAP) return;
  for (const [id, at] of lastWriteAt) {
    if (now - at >= LAST_SEEN_TTL_MS) lastWriteAt.delete(id);
  }
}

/**
 * Persist a player's position + lastSeenAt, throttled to once per
 * LAST_SEEN_TTL_MS unless `force` is set.
 *
 * The WS server already throttles per connection and passes
 * `{ force: true }`; the HTTP fallback relies on the throttle here.
 */
export async function refreshLastSeen(
  playerId: number,
  position?: { x?: number; y?: number; facing?: string },
  opts?: { force?: boolean },
): Promise<void> {
  const now = Date.now();
  if (!opts?.force) {
    const last = lastWriteAt.get(playerId) ?? 0;
    if (now - last < LAST_SEEN_TTL_MS) return;
  }
  lastWriteAt.set(playerId, now);
  prune(now);

  const patch: Partial<typeof characters.$inferInsert> = { lastSeenAt: new Date(now) };
  if (position?.x !== undefined) patch.x = position.x;
  if (position?.y !== undefined) patch.y = position.y;
  if (position?.facing !== undefined) patch.facing = position.facing;

  await db.update(characters).set(patch).where(eq(characters.id, playerId));
}
