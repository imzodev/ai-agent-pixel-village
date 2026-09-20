// Metrics registry and helpers. The actual counters and gauges are
// exported as a single VillageMetrics singleton, stored on globalThis
// so Next.js dev/HMR module re-evaluation does not double-register
// collectors. The /api/metrics scrape endpoint was removed; this
// registry is kept for a future operational endpoint and so the
// in-process counters keep firing (they cost almost nothing).

import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "@prometheus-io/client";
import { pool } from "@/db";
import type { VillageMetrics } from "@/types/metrics";

const globalForMetrics = globalThis as typeof globalThis & {
  __villageMetrics?: VillageMetrics;
};

function build(): VillageMetrics {
  const registry = new Registry();
  // Default labels are applied to every metric so a single scrape picks
  // up service + shard without callers having to repeat them.
  registry.setDefaultLabels({
    service: process.env.SERVICE_NAME ?? "ai-village",
    shard: process.env.WS_SHARD_ID ?? "0",
  });
  // Node / process / runtime collectors.
  collectDefaultMetrics({ register: registry });

  const wsConnections = new Gauge({
    name: "ws_connections",
    help: "Currently-open WebSocket connections.",
    labelNames: ["shard"] as const,
    registers: [registry],
  });
  const wsConnectionsTotal = new Counter({
    name: "ws_connections_total",
    help: "Total WebSocket connections accepted.",
    labelNames: ["shard"] as const,
    registers: [registry],
  });
  const wsEvictionsTotal = new Counter({
    name: "ws_evictions_total",
    help: "WebSocket connections closed because the client could not keep up.",
    labelNames: ["reason"] as const,
    registers: [registry],
  });
  const wsUpgradeRejectedTotal = new Counter({
    name: "ws_upgrade_rejected_total",
    help: "WebSocket upgrade requests refused (rate limit, draining, bad path).",
    labelNames: ["reason"] as const,
    registers: [registry],
  });
  const snapshotCacheHitsTotal = new Counter({
    name: "snapshot_cache_hits_total",
    help: "Snapshot lookups served from a cache layer.",
    registers: [registry],
  });
  const snapshotCacheMissesTotal = new Counter({
    name: "snapshot_cache_misses_total",
    help: "Snapshot lookups that required a rebuild.",
    registers: [registry],
  });
  const simTickDuration = new Histogram({
    name: "sim_tick_duration_seconds",
    help: "Sim tick duration in seconds.",
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });
  const simTickFailuresTotal = new Counter({
    name: "sim_tick_failures_total",
    help: "Sim ticks that threw.",
    registers: [registry],
  });

  // DB pool gauges — sampled on scrape via the `collect` callback so
  // we never have to poll the pool from a timer.
  new Gauge({
    name: "db_pool_connections",
    help: "Postgres pool connections by state.",
    labelNames: ["state"] as const,
    registers: [registry],
    collect() {
      // pg pool counters are read on demand; this avoids a separate
      // sampling timer.
      this.set({ state: "total" }, pool.totalCount);
      this.set({ state: "idle" }, pool.idleCount);
      this.set({ state: "waiting" }, pool.waitingCount);
    },
  });

  return {
    registry,
    wsConnections,
    wsConnectionsTotal,
    wsEvictionsTotal,
    wsUpgradeRejectedTotal,
    snapshotCacheHitsTotal,
    snapshotCacheMissesTotal,
    simTickDuration,
    simTickFailuresTotal,
  };
}

/**
 * Process-wide metrics singleton. Imported by the WS server, the snapshot
 * module, the sim worker and the /api/metrics route. Stored on globalThis
 * so HMR doesn't double-register collectors.
 */
export const metrics: VillageMetrics =
  globalForMetrics.__villageMetrics ??
  (globalForMetrics.__villageMetrics = build());
