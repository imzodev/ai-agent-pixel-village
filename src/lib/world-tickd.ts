// Standalone sim worker. Replaces the request-driven tickWorld() in /api/world.
//
// Why: the 1 Hz world tick used to be invoked inside the /api/world HTTP
// handler, gated by an atomic claim on worldState.lastTickAt. That works
// but couples sim CPU/DB work to client polling — at 5k concurrent players
// the 1 Hz tick would still be fine (one tick per second, atomic claim),
// but mixing it with the snapshot read path means contention on the
// connection pool. Moving the tick to a dedicated worker gives it its own
// pool and removes the dependency.
//
// Concurrency safety: only one tickd should run per primary. The advisory
// lock pg_try_advisory_lock(42) prevents two tickds from fighting. If the
// lock is held, this instance logs and exits. If the primary drops the
// connection, the lock auto-releases.
//
// Run: `pnpm dev:tickd` (or `node --import tsx src/lib/world-tickd.ts`).

import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { tickWorld } from "./sim";
import { initRedis } from "./redis";

const TICK_INTERVAL_MS = Number(process.env.WORLD_TICK_INTERVAL_MS ?? 1000);
const ADVISORY_LOCK_KEY = 42;

async function tryAcquireAdvisoryLock(): Promise<boolean> {
  const result = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`);
  const rows = result as unknown as { rows: Array<{ locked: boolean }> };
  return rows.rows[0]?.locked === true;
}

async function releaseAdvisoryLock(): Promise<void> {
  try {
    await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  } catch {
    // Connection may already be gone; lock auto-released.
  }
}

async function main(): Promise<void> {
  await initRedis();

  if (!(await tryAcquireAdvisoryLock())) {
    console.error(
      "[tickd] another tickd holds advisory lock; another instance is already running. Exiting.",
    );
    process.exit(1);
  }
  console.log(`[tickd] acquired advisory lock; ticking every ${TICK_INTERVAL_MS} ms`);

  let running = true;
  let inFlight: Promise<void> | null = null;

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[tickd] received ${signal}, draining`);
    running = false;
    if (inFlight) await inFlight;
    await releaseAdvisoryLock();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  while (running) {
    const start = Date.now();
    inFlight = tickWorld()
      .catch((err) => {
        console.error("[tickd] tick failed:", err);
      })
      .finally(() => {
        inFlight = null;
      });
    await inFlight;
    const elapsed = Date.now() - start;
    const sleepMs = Math.max(0, TICK_INTERVAL_MS - elapsed);
    if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
  }
}

main().catch((err) => {
  console.error("[tickd] fatal:", err);
  process.exit(1);
});