// Per-entity path cache for the navigation planner. The sim worker
// creates one of these and clears / prunes it as part of its normal
// cadence (mirrors the snapshot cache pattern in src/lib/snapshot.ts).
//
// LRU TTL keeps long-lived entities from holding onto a path past the
// next target change. Cap on size prevents the cache from growing
// without bound if a misbehaving entity re-targets in a loop.

import type { WalkPath } from "@/types/world";

export interface NavCache {
  /** Idempotent: replace any existing entry for `id` with the new path. */
  set(id: number, path: WalkPath): void;
  get(id: number): WalkPath | undefined;
  /** Drop the entry for one id, or all ids if omitted. */
  clear(id?: number): void;
  /** Drop every entry whose `setAtMs` is older than `ttlMs` ago. Returns evicted count. */
  prune(ttlMs: number, nowMs: number): number;
  size(): number;
}

interface Entry {
  path: WalkPath;
  setAtMs: number;
}

const HARD_CAP = 1024;

/**
 * FIFO map (JS Map preserves insertion order). `prune` evicts entries
 * older than ttl AND removes any id that's silently missing so the cache
 * doesn't retain ghost ids after a process restart.
 */
export function makeNavCache(): NavCache {
  const entries = new Map<number, Entry>();
  const trim = () => {
    if (entries.size <= HARD_CAP) return;
    // drop oldest until under cap
    while (entries.size > HARD_CAP) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };
  return {
    set(id, path) {
      entries.set(id, { path, setAtMs: Date.now() });
      trim();
    },
    get(id) {
      return entries.get(id)?.path;
    },
    clear(id) {
      if (id === undefined) entries.clear();
      else entries.delete(id);
    },
    prune(ttlMs, nowMs) {
      let evicted = 0;
      for (const [id, e] of entries) {
        if (nowMs - e.setAtMs > ttlMs) {
          entries.delete(id);
          evicted += 1;
        }
      }
      return evicted;
    },
    size() {
      return entries.size;
    },
  };
}
