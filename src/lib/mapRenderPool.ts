// A small, bounded pool of background processes that draw the world map's
// pictures (scripts/map-tile-worker.ts → src/lib/mapRender.ts), so the game
// server never does: it only serves what's on disk. Workers run at the
// lowest CPU priority (they use spare CPU only), at most MAX_WORKERS of them,
// started on first need. Jobs are deduplicated; the newest requests go first
// (the view someone is looking at now); the queue is capped, and the oldest
// waiting jobs are dropped past it. Low-priority jobs (pre-drawing around the
// towns at start) run only when nothing else waits. Shared on globalThis so
// the Next routes and src/server.ts use one pool.

import os from "node:os";
import { spawn } from "node:child_process";
import type { MapJob, MapJobDone, MapPool, MapPoolWorker } from "@/types/mapRender";

const MAX_WORKERS = Math.max(1, Math.min(2, os.cpus().length - 1));
const QUEUE_CAP = 500;
/** The background pass (drawing the whole map ahead of time). */
const LOW_CAP = 5000;

const g = globalThis as typeof globalThis & { __mapPool?: MapPool };
const pool: MapPool = (g.__mapPool ??= { waiting: new Map(), order: [], low: [], workers: [] });

/** Have `job` done (once, however many ask). Resolves true when its picture is on disk. */
export function requestMapJob(job: MapJob, low = false): Promise<boolean> {
  return new Promise((resolve) => {
    const w = pool.waiting.get(job.key);
    if (w) {
      w.resolve.push(resolve);
      if (!low && w.low) { w.low = false; pool.low = pool.low.filter((k) => k !== job.key); pool.order.push(job.key); }
      else if (!low) { pool.order = pool.order.filter((k) => k !== job.key); pool.order.push(job.key); } // asked again: to the front
      return;
    }
    pool.waiting.set(job.key, { job, low, resolve: [resolve] });
    (low ? pool.low : pool.order).push(job.key);
    // Requests are capped (the oldest waiting drop); the background pass has its own, larger cap.
    while (pool.order.length > QUEUE_CAP) finish(pool.order.shift()!, false);
    while (pool.low.length > LOW_CAP) finish(pool.low.pop()!, false);
    dispatch();
  });
}

function finish(key: string, ok: boolean): void {
  const w = pool.waiting.get(key);
  pool.waiting.delete(key);
  for (const r of w?.resolve ?? []) r(ok);
}

function dispatch(): void {
  for (;;) {
    let worker = pool.workers.find((x) => !x.busy && x.proc.connected);
    if (!worker && pool.workers.filter((x) => x.proc.connected).length < MAX_WORKERS) worker = startWorker();
    if (!worker) return;
    const key = pool.order.pop() ?? pool.low.shift(); // newest request first; low ones only when idle
    if (!key) return;
    const w = pool.waiting.get(key);
    if (!w) continue;
    worker.busy = key;
    worker.proc.send(w.job);
  }
}

function startWorker(): MapPoolWorker {
  const proc = spawn(process.execPath, ["--import", "tsx", "scripts/map-tile-worker.ts"], { cwd: process.cwd(), env: process.env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  try { if (proc.pid) os.setPriority(proc.pid, 19); } catch { /* not allowed here: the worker lowers itself too */ }
  const worker: MapPoolWorker = { proc, busy: null };
  proc.on("message", (m: MapJobDone) => {
    worker.busy = null;
    finish(m.key, m.ok);
    dispatch();
  });
  proc.on("exit", () => {
    pool.workers = pool.workers.filter((x) => x !== worker);
    if (worker.busy) finish(worker.busy, false);
    dispatch();
  });
  pool.workers.push(worker);
  return worker;
}
