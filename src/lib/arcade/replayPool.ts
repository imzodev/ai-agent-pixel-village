// The arcade's replay worker: checking a run means replaying it, and a Harvest
// Haul run is a few thousand physics ticks, so it happens in a background
// process (scripts/arcade-replay-worker.ts), never on the game server's event
// loop. At most MAX_WORKERS, started on first need, normal priority (a player
// is waiting for their score). A job that takes longer than TIMEOUT_MS, or a
// worker that can't start, falls back to replaying here. Shared on globalThis
// so the Next routes and src/server.ts use one pool. Like src/lib/mapRenderPool.ts.

import { spawn } from "node:child_process";
import os from "node:os";
import { ARCADE_GAMES } from "./games";
import type { ArcadeGameKey, ArcadeReplayDone, ArcadeReplayJob, ArcadeReplayPool, ArcadeResult } from "@/types/arcade";

const MAX_WORKERS = Math.max(1, Math.min(2, os.cpus().length - 1));
const QUEUE_CAP = 200;
const TIMEOUT_MS = 5000;

const g = globalThis as typeof globalThis & { __arcadePool?: ArcadeReplayPool };
const pool: ArcadeReplayPool = (g.__arcadePool ??= { next: 1, waiting: new Map(), queue: [], workers: [] });

/** Replay here (the fallback, and tests). */
export function replayInline(game: ArcadeGameKey, course: unknown, inputs: unknown[]): ArcadeResult | null {
  try { return ARCADE_GAMES[game].replay(course, inputs); } catch { return null; }
}

/** A run's result, replayed in the worker (or here if the worker can't). Null if it can't be replayed at all. */
export function replayRun(game: ArcadeGameKey, course: unknown, inputs: unknown[]): Promise<ArcadeResult | null> {
  if (process.env.ARCADE_INLINE === "1") return Promise.resolve(replayInline(game, course, inputs));
  if (pool.queue.length >= QUEUE_CAP) return Promise.resolve(null);
  return new Promise((resolve) => {
    const job: ArcadeReplayJob = { id: pool.next++, game, course, inputs };
    pool.waiting.set(job.id, { job, resolve, timer: null });
    pool.queue.push(job.id);
    dispatch();
  });
}

function finish(id: number, result: ArcadeResult | null, fallback: boolean): void {
  const w = pool.waiting.get(id);
  if (!w) return;
  pool.waiting.delete(id);
  if (w.timer) clearTimeout(w.timer);
  w.resolve(result ?? (fallback ? replayInline(w.job.game, w.job.course, w.job.inputs) : null));
}

function dispatch(): void {
  for (;;) {
    if (!pool.queue.length) return; // nothing waiting: don't start a worker for nothing
    let worker = pool.workers.find((x) => x.busy === null && x.proc.connected);
    if (!worker && pool.workers.filter((x) => x.proc.connected).length < MAX_WORKERS) worker = startWorker();
    if (!worker) return;
    const id = pool.queue.shift();
    if (id === undefined) return;
    const w = pool.waiting.get(id);
    if (!w) continue;
    worker.busy = id;
    const busy = worker;
    w.timer = setTimeout(() => { busy.proc.kill(); finish(id, null, true); }, TIMEOUT_MS);
    try { worker.proc.send(w.job); } catch { worker.busy = null; finish(id, null, true); }
  }
}

function startWorker(): ArcadeReplayPool["workers"][number] {
  const proc = spawn(process.execPath, ["--import", "tsx", "scripts/arcade-replay-worker.ts"], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const worker: ArcadeReplayPool["workers"][number] = { proc, busy: null };
  proc.on("message", (m: ArcadeReplayDone) => {
    worker.busy = null;
    finish(m.id, m.result, true);
    dispatch();
  });
  proc.on("error", () => undefined);
  proc.on("exit", () => {
    pool.workers = pool.workers.filter((x) => x !== worker);
    if (worker.busy !== null) finish(worker.busy, null, true);
    dispatch();
  });
  pool.workers.push(worker);
  return worker;
}
