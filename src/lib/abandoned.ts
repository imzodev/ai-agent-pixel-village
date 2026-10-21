// "Play now" characters nobody came back for. A character made with Play now
// has no password until it's saved; if it then isn't seen for
// ABANDONED_AFTER_MS and never got past ABANDONED_MAX_LEVEL, tickd deletes it
// (daily), so drive-by and bot accounts don't pile up. Saved characters are
// never touched. deleteCharacters is also the load test's cleanup.

import { pool } from "@/db";
import { releaseLotsOf } from "@/lib/lots";

export const ABANDONED_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** Only characters below this level go: someone who played a lot but never saved keeps theirs. */
export const ABANDONED_MAX_LEVEL = Number(process.env.ABANDONED_MAX_LEVEL ?? 3);
/** At most this many per run, so one sweep never holds the database for long. */
const BATCH = 500;
/** Records kept after a character is gone: payments, moderation and analytics. */
const KEEP = new Set(["gem_transactions", "memberships", "member_grants", "reports", "events", "active_days"]);

let characterTables: string[] | null = null;

/** Every table with a `character_id` column (the schema has no foreign keys to follow). */
async function tablesWithCharacterId(): Promise<string[]> {
  characterTables ??= (await pool.query<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'character_id' AND table_name <> 'characters'`,
  )).rows.map((r) => r.t);
  return characterTables;
}

/**
 * Deletes characters, their users and everything that's theirs: lots are
 * given up first (as on moving out), then their rows everywhere. `keepRecords`
 * keeps payments, reports and analytics (false for test bots).
 */
export async function deleteCharacters(ids: number[], { keepRecords = true } = {}): Promise<number> {
  if (!ids.length) return 0;
  for (const id of ids) await releaseLotsOf(id);
  const users = (await pool.query<{ user_id: number }>(`SELECT user_id FROM characters WHERE id = ANY($1)`, [ids])).rows.map((r) => r.user_id);
  let n = 0;
  const del = async (sql: string, values: unknown[]) => { n += (await pool.query(sql, values)).rowCount ?? 0; };
  for (const t of await tablesWithCharacterId()) {
    if (keepRecords && KEEP.has(t)) continue;
    await del(`DELETE FROM "${t}" WHERE character_id = ANY($1)`, [ids]);
  }
  await del(`DELETE FROM world_events WHERE subject_type = 'character' AND subject_id = ANY($1)`, [ids]);
  await del(`DELETE FROM resource_nodes WHERE owner_id = ANY($1)`, [ids]);
  await del(`DELETE FROM animals WHERE owner_id = ANY($1)`, [ids]);
  await del(`DELETE FROM lot_cheers WHERE owner_id = ANY($1) OR cheerer_id = ANY($1)`, [ids]);
  await del(`DELETE FROM referrals WHERE invitee_id = ANY($1) OR inviter_id = ANY($1)`, [ids]);
  await del(`DELETE FROM sessions WHERE user_id = ANY($1)`, [users]);
  await del(`DELETE FROM characters WHERE id = ANY($1)`, [ids]);
  await del(`DELETE FROM users WHERE id = ANY($1)`, [users]);
  return n;
}

/** Deletes unsaved Play now characters left alone too long. Returns how many went. */
export async function pruneAbandoned(now = Date.now()): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT c.id FROM characters c JOIN users u ON u.id = c.user_id
     WHERE u.password_hash IS NULL AND c.last_seen_at < $1 AND c.level < $2
     ORDER BY c.last_seen_at LIMIT ${BATCH}`,
    [new Date(now - ABANDONED_AFTER_MS), ABANDONED_MAX_LEVEL],
  );
  const ids = rows.map((r) => r.id);
  await deleteCharacters(ids);
  return ids.length;
}
