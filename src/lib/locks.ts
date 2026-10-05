// One-at-a-time sections across processes (the web server and tickd):
// a Postgres advisory lock on a key, held on its own connection while `fn`
// runs. Advisory locks only block other takers of the same key, so `fn` can
// read and write the rows it guards through the normal pool without
// deadlocking. Use it around read-modify-write that two requests could race
// (a player's double click on their own lot, a delivery).

import { pool } from "@/db";

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [key]);
    try {
      return await fn();
    } finally {
      await client.query("select pg_advisory_unlock(hashtext($1))", [key]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** The lock for everything that changes one lot's growth (ranch_state). */
export const lotLock = (lotKey: string) => `lot:${lotKey}`;
