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
// lock pg_try_advisory_lock(42) prevents two tickds from fighting.
//
// On shutdown (SIGINT / SIGTERM) we release the lock and close the pool
// promptly so a restarted tickd can acquire the lock immediately. If a
// previous tickd crashed without releasing, the lock auto-releases when
// its connection drops — but Postgres keeps the connection open until
// TCP teardown. We poll for up to LOCK_WAIT_MS to give a graceful
// restart a chance to settle.
//
// Run: `pnpm dev:tickd` (or `node --import tsx src/lib/world-tickd.ts`).

import { pool } from "@/db";
import { tickWorld } from "./sim";
import { initRedis } from "./redis";

const TICK_INTERVAL_MS = Number(process.env.WORLD_TICK_INTERVAL_MS ?? 1000);
const LOCK_WAIT_MS = Number(process.env.TICKD_LOCK_WAIT_MS ?? 8000);
const LOCK_POLL_MS = 250;
const ADVISORY_LOCK_KEY = 42;

async function tryAcquireAdvisoryLock(): Promise<boolean> {
  const result = await pool.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [ADVISORY_LOCK_KEY],
  );
  return result.rows[0]?.locked === true;
}

async function releaseAdvisoryLock(): Promise<void> {
  try {
    await pool.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
  } catch {
    // Connection may already be gone; lock auto-released.
  }
}

async function acquireWithWait(): Promise<boolean> {
  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    if (await tryAcquireAdvisoryLock()) return true;
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
  }
  return false;
}

async function main(): Promise<void> {
  await initRedis();

  if (!(await acquireWithWait())) {
    console.error(
      `[tickd] could not acquire advisory lock within ${LOCK_WAIT_MS}ms — another instance is running or a previous tickd crashed without releasing. Exiting.`,
    );
    await pool.end();
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