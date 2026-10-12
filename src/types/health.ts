// Health endpoint response shape. Types only — no logic.

/** Event-loop delay over the last 10 s window (src/lib/loopLag.ts). */
export type LoopLag = { meanMs: number; p99Ms: number; maxMs: number };

export type Health = {
  /** True when the process can serve traffic: DB reachable and not draining. */
  ok: boolean;
  db: boolean;
  /** Redis is optional now (off the hot path); reported for visibility only. */
  redis: {
    configured: boolean;
    degraded: boolean;
  };
  /** How held up the event loop is: the overload signal. */
  loopLag: LoopLag;
  /** Resident memory, MB. */
  rssMb: number;
  ws: {
    /** Logged-in players connected. */
    connections: number;
    /** Logged-out visitors watching the village. */
    spectators: number;
    shard: string;
    shardCount: number;
    draining: boolean;
    accepting: boolean;
  };
};
