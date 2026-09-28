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
import {
  ANIMAL_MOVE_INTERVAL_MS,
  ANIMAL_SPEED,
  ENEMY_MOVE_INTERVAL_MS,
  ENEMY_SPEED,
  MOVE_INTERVAL_WARNINGS,
  MOVE_MAX_TILES,
  NPC_MOVE_INTERVAL_MS,
  NPC_MOVE_MAX_TILES,
  NPC_SPEED,
  WORLD_TICK_MS,
} from "./constants";
import { CHUNK_TILE_PX } from "./chunkCollision";
import { beatIndex, nextBeatAt } from "./motion";
import { initRedis } from "./redis";
import { releaseInactiveLots } from "./lots";
import { ensureOnlinePlayersView, refreshOnlinePlayers } from "./onlinePlayers";
import { metrics } from "@/lib/metrics";
import { log } from "@/lib/logger";

const LOCK_WAIT_MS = Number(process.env.TICKD_LOCK_WAIT_MS ?? 8000);
const LOCK_POLL_MS = 250;
const ADVISORY_LOCK_KEY = 42;
// The materialized "online players" view is refreshed on this cadence.
// Snapshot reads hit the view, so this bounds how stale the online window
// can be. 5s keeps `me` fresh enough while staying cheap.
const VIEW_REFRESH_MS = Number(process.env.ONLINE_PLAYERS_REFRESH_MS ?? 5000);
const LOT_SWEEP_MS = 60 * 60 * 1000;

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

/**
 * A wander move of MOVE_MAX_TILES must finish before the same entity's
 * next move starts, otherwise moves would overlap. Fail fast at boot.
 */
function assertMoveTimings(): void {
  const checks = [
    ["NPC", NPC_MOVE_INTERVAL_MS, NPC_SPEED, NPC_MOVE_MAX_TILES],
    ["ANIMAL", ANIMAL_MOVE_INTERVAL_MS, ANIMAL_SPEED, MOVE_MAX_TILES],
    ["ENEMY", ENEMY_MOVE_INTERVAL_MS, ENEMY_SPEED, MOVE_MAX_TILES],
  ] as const;
  for (const [kind, interval, speed, maxTiles] of checks) {
    const longestMs = ((maxTiles * CHUNK_TILE_PX) / speed) * 1000;
    if (longestMs > interval) {
      throw new Error(
        `${kind}_MOVE_INTERVAL_MS=${interval} is shorter than the longest wander move (${Math.ceil(longestMs)} ms); raise the interval or lower the max tiles`,
      );
    }
  }
  for (const w of MOVE_INTERVAL_WARNINGS) log.warn(w);
}

async function main(): Promise<void> {
  assertMoveTimings();
  await initRedis();

  if (!(await acquireWithWait())) {
    console.error(
      `[tickd] could not acquire advisory lock within ${LOCK_WAIT_MS}ms — another instance is running or a previous tickd crashed without releasing. Exiting.`,
    );
    await pool.end();
    process.exit(1);
  }
  log.info(
    { beatMs: WORLD_TICK_MS, npcMoveMs: NPC_MOVE_INTERVAL_MS, animalMoveMs: ANIMAL_MOVE_INTERVAL_MS, enemyMoveMs: ENEMY_MOVE_INTERVAL_MS },
    "acquired advisory lock; ticking on epoch-aligned beats",
  );

  // Create the online_players view if it doesn't exist, then refresh it on
  // its own cadence. Best-effort: if the DB user can't manage views the
  // snapshot falls back to querying characters directly.
  await ensureOnlinePlayersView();

  let running = true;
  let inFlight: Promise<void> | null = null;
  let lastViewRefresh = 0;

  // Free lots whose owners haven't logged in for 14 days (hourly check).
  let lastLotSweep = 0;
  const maybeReleaseInactiveLots = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastLotSweep < LOT_SWEEP_MS) return;
    lastLotSweep = now;
    try {
      const freed = await releaseInactiveLots(now);
      if (freed > 0) log.info({ freed }, "released inactive lots");
    } catch (err) {
      log.error({ err }, "lot sweep failed");
    }
  };

  const maybeRefreshView = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastViewRefresh < VIEW_REFRESH_MS) return;
    lastViewRefresh = now;
    await refreshOnlinePlayers();
  };

  let beatTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeBeat: (() => void) | null = null;

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, "draining");
    running = false;
    if (beatTimer) clearTimeout(beatTimer);
    wakeBeat?.();
    if (inFlight) await inFlight;
    await releaseAdvisoryLock();
    await pool.end();
    log.info("exiting");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Beat loop. Sleep until the next epoch-aligned boundary (k * WORLD_TICK_MS)
  // rather than "WORLD_TICK_MS minus however long the tick took": the WS
  // servers compute the same boundaries independently, so both sides stay
  // phase-locked without talking to each other and nothing drifts. A tick
  // that overruns a beat simply skips to the following boundary.
  while (running) {
    await new Promise<void>((resolve) => {
      wakeBeat = resolve;
      beatTimer = setTimeout(resolve, nextBeatAt(Date.now()) - Date.now());
    });
    if (!running) break;
    const start = Date.now();
    inFlight = tickWorld()
      .then((scheduled) => {
        metrics.simTickDuration.observe((Date.now() - start) / 1000);
        log.info({ beat: beatIndex(start), lagMs: start % WORLD_TICK_MS, scheduled, tookMs: Date.now() - start }, "beat");
      })
      .catch((err) => {
        metrics.simTickFailuresTotal.inc();
        log.error({ err }, "tick failed");
      })
      .finally(() => {
        inFlight = null;
      });
    await inFlight;
    await maybeRefreshView();
    await maybeReleaseInactiveLots();
  }
}

main().catch((err) => {
  console.error("[tickd] fatal:", err);
  process.exit(1);
});