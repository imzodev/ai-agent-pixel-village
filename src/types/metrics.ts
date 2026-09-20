// Metrics container + shard descriptors. Types only — no logic.
//
// The concrete metric objects come from @prometheus-io/client (the
// maintained successor to prom-client). They are re-exported through
// lib/metrics.ts, not here, so this file stays dependency-free.

import type { Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";

export type VillageMetrics = {
  registry: Registry;
  /** Currently-open WS connections. */
  wsConnections: Gauge<"shard">;
  /** Total WS connections accepted. */
  wsConnectionsTotal: Counter<"shard">;
  /** WS connections closed because the client could not keep up. */
  wsEvictionsTotal: Counter<"reason">;
  /** Upgrades refused (rate limit, draining, bad path). */
  wsUpgradeRejectedTotal: Counter<"reason">;
  /** Snapshot cache lookups served from a cache layer. */
  snapshotCacheHitsTotal: Counter;
  /** Snapshot cache lookups that required a rebuild. */
  snapshotCacheMissesTotal: Counter;
  /** Sim tick duration in seconds. */
  simTickDuration: Histogram;
  /** Sim ticks that threw. */
  simTickFailuresTotal: Counter;
};

/** A rectangular band of chunk coordinates a WS shard owns. */
export type ShardRegion = {
  /** Inclusive x range, in chunks. */
  xMin: number;
  xMax: number;
  /** Inclusive y range, in chunks. */
  yMin: number;
  yMax: number;
};
