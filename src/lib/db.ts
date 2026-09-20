// Read/write DB split. Kept dependency-light so both server and worker
// processes can import it.
//
// - withReadDb(): the read replica when DATABASE_REPLICA_URL is set,
//   otherwise the primary. Use for snapshots, listings, any pure read.
// - withWriteDb(): always the primary. Use for sim updates, heartbeats,
//   player actions, agent registration, anything that mutates.
//
// PgBouncer caveat: LISTEN/NOTIFY and session-scoped advisory locks do
// not work through PgBouncer transaction-mode pooling. The sim worker
// (world-tickd.ts) and any NOTIFY relay must connect directly to the
// primary, bypassing the pooler. That is why world-tickd.ts imports
// `pool` from "@/db" rather than anything from this module.

import { db as primaryDb } from "@/db";
import { readDb } from "@/db/replica";

export function withReadDb() {
  return readDb;
}

export function withWriteDb() {
  return primaryDb;
}
