// "Online players" materialized view.
//
// The snapshot needs the full character rows for every player seen in the
// last 45 s (chat and rendering need them). Reading them straight from
// `characters` on every snapshot build is an indexed range scan over a
// potentially huge table. A materialized view of just the online window
// is small and stable, so snapshot reads hit a tiny relation instead.
//
// Refreshed periodically by the sim worker (world-tickd.ts). We use
// CONCURRENTLY so readers are never blocked; that requires a unique index
// on the view, which ensureOnlinePlayersView() creates.
//
// Everything here is best-effort: if the view is missing or a refresh
// fails, the snapshot falls back to querying `characters` directly.

import { pool } from "@/db";

const PRESENCE_WINDOW_SECONDS = Math.max(
  1,
  Math.floor(Number(process.env.PRESENCE_WINDOW_MS ?? 45_000) / 1000),
);

// Keep the column list in sync with the snapshot's PlayerRow projection.
// `last_seen_at` is included so the snapshot can still bound by it.
export const ONLINE_PLAYERS_VIEW = "online_players";

const CREATE_VIEW_SQL = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS ${ONLINE_PLAYERS_VIEW} AS
  SELECT id, name, x, y, facing, appearance, level, hp, max_hp, coins, gems, xp, last_seen_at
  FROM characters
  WHERE last_seen_at > now() - interval '${PRESENCE_WINDOW_SECONDS} seconds'
  WITH DATA
`;

const CREATE_INDEX_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS online_players_pk ON ${ONLINE_PLAYERS_VIEW} (id)
`;

let ensured = false;

/**
 * Idempotently create the view + its unique index. Safe to call on boot
 * of every process; the IF NOT EXISTS guards make it a no-op after the
 * first run. Returns false if the view could not be created (e.g. the
 * connected user lacks privileges) so callers can fall back.
 */
export async function ensureOnlinePlayersView(): Promise<boolean> {
  if (ensured) return true;
  try {
    await pool.query(CREATE_VIEW_SQL);
    await pool.query(CREATE_INDEX_SQL);
    ensured = true;
    return true;
  } catch (err) {
    console.warn("[onlinePlayers] could not ensure materialized view:", err);
    return false;
  }
}

/**
 * Refresh the view. CONCURRENTLY avoids blocking readers. Returns false
 * on failure (view missing, permissions) so the caller can ignore it.
 */
export async function refreshOnlinePlayers(): Promise<boolean> {
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${ONLINE_PLAYERS_VIEW}`);
    return true;
  } catch (err) {
    // A concurrent refresh can fail if the view was just created or is
    // empty; fall back to a blocking refresh once.
    try {
      await ensureOnlinePlayersView();
      await pool.query(`REFRESH MATERIALIZED VIEW ${ONLINE_PLAYERS_VIEW}`);
      return true;
    } catch (err2) {
      console.warn("[onlinePlayers] refresh failed:", err2);
      return false;
    }
  }
}
