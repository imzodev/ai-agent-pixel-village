// How long the event loop is held up (the game server's best "am I
// overloaded" signal). Read by /api/health and the load test. One monitor
// per process (globalThis), reporting the last full 10 s window.

import { monitorEventLoopDelay } from "node:perf_hooks";
import type { LoopLag } from "@/types/health";

const WINDOW_MS = 10_000;
const g = globalThis as typeof globalThis & { __loopLag?: { last: LoopLag } };

function start(): { last: LoopLag } {
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  const box = { last: { meanMs: 0, p99Ms: 0, maxMs: 0 } };
  setInterval(() => {
    const ms = (ns: number) => Math.round(ns / 1e5) / 10;
    box.last = { meanMs: ms(h.mean), p99Ms: ms(h.percentile(99)), maxMs: ms(h.max) };
    h.reset();
  }, WINDOW_MS).unref();
  return box;
}

/** Event-loop delay over the last 10 s. */
export function loopLag(): LoopLag {
  return (g.__loopLag ??= start()).last;
}
