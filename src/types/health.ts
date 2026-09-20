// Health endpoint response shape. Types only — no logic.

export type Health = {
  /** True when the process can serve traffic: DB reachable and not draining. */
  ok: boolean;
  db: boolean;
  /** Redis is optional now (off the hot path); reported for visibility only. */
  redis: {
    configured: boolean;
    degraded: boolean;
  };
  ws: {
    connections: number;
    shard: string;
    shardCount: number;
    draining: boolean;
    accepting: boolean;
  };
};
