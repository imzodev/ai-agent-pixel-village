// Postgres read replica connection. Snapshot/read queries route here so
// the primary is left free for writes (sim tick, heartbeats, player
// actions). Falls back to the primary when DATABASE_REPLICA_URL is unset
// — local dev and single-instance deployments keep working unchanged.
//
// IMPORTANT: only reads go here. Never write through readDb. Replica lag
// is typically 100-500 ms; the 250 ms snapshot cache and the 45 s presence
// window both mask it comfortably.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const primaryUrl = process.env.DATABASE_URL;
if (!primaryUrl) {
  throw new Error("DATABASE_URL is required");
}

const replicaUrl = process.env.DATABASE_REPLICA_URL ?? primaryUrl;
export const usingReplica = Boolean(process.env.DATABASE_REPLICA_URL);

const globalForReplica = globalThis as typeof globalThis & {
  __villageReplicaPool?: Pool;
};

export const replicaPool =
  globalForReplica.__villageReplicaPool ??
  new Pool({
    connectionString: replicaUrl,
    max: Number(process.env.DATABASE_REPLICA_POOL_MAX ?? 50),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: usingReplica ? "ai-village-replica" : "ai-village",
  });

if (process.env.NODE_ENV !== "production") {
  globalForReplica.__villageReplicaPool = replicaPool;
}

export const readDb = drizzle(replicaPool);
