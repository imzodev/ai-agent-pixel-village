// DB side of the deterministic movement system: build a move write,
// persist a batch of them in ONE statement per table, and read back the
// moves that start on a given beat (for the WS broadcaster).

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { animals, enemies, npcs } from "@/db/schema";
import { moveDestination, moveEndAt, moveOfRow, positionAt, tileCenter, truncateMove } from "./motion";
import type { GridPoint } from "@/types/world";
import type { HoldResult, MoverKind, MoveWrite, ScheduledMove } from "@/types/motion";

const TABLE: Record<MoverKind, string> = { npc: "npcs", animal: "animals", enemy: "enemies" };

/**
 * Turn a tile path into a DB write. The row's `x`/`y` become the
 * destination tile centre (where the entity rests once the move ends)
 * and `facing` the direction of the last leg.
 */
export function buildMoveWrite(id: number, path: GridPoint[], startAt: number, speed: number): MoveWrite {
  const move = { path, startAt, speed };
  const end = tileCenter(moveDestination(move));
  return { id, x: end.x, y: end.y, facing: positionAt(move, Infinity).facing, move };
}

/**
 * Persist a batch of moves with a single `UPDATE ... FROM (VALUES ...)`.
 * Only the rows in `writes` are touched. Enemies have no `facing`.
 */
export async function writeMoves(kind: MoverKind, writes: readonly MoveWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const values = sql.join(
    writes.map((w) => sql`(${w.id}::int, ${w.x}::real, ${w.y}::real, ${w.facing}::text, ${JSON.stringify(w.move.path)}::jsonb, ${w.move.startAt}::bigint, ${w.move.speed}::real)`),
    sql`, `,
  );
  const setFacing = kind === "enemy" ? sql`` : sql`facing = v.facing, `;
  // A held NPC (someone is talking to it) must not get a move that starts
  // during the hold — even from a tick that was already in flight.
  const notHeld = kind === "npc" ? sql` AND (t.hold_until IS NULL OR t.hold_until <= v.start_at)` : sql``;
  await db.execute(sql`
    UPDATE ${sql.raw(TABLE[kind])} AS t
    SET x = v.x, y = v.y, ${setFacing}move_path = v.path, move_start_at = v.start_at, move_speed = v.speed
    FROM (VALUES ${values}) AS v(id, x, y, facing, path, start_at, speed)
    WHERE t.id = v.id${notHeld}
  `);
}

/**
 * Keep an NPC standing still for `holdMs` (a player is talking to it).
 * Extends any existing hold, and cuts a running or pending move short
 * so the NPC stops on the next tile it reaches. The cut move keeps its
 * `startAt`, so clients that already hold the original accept it as a
 * replacement. Callers should push a snapshot when `stopped` is true.
 */
export async function holdNpc(npcId: number, now: number, holdMs: number): Promise<HoldResult | null> {
  const [row] = await db
    .select({ x: npcs.x, y: npcs.y, movePath: npcs.movePath, moveStartAt: npcs.moveStartAt, moveSpeed: npcs.moveSpeed, holdUntil: npcs.holdUntil })
    .from(npcs)
    .where(eq(npcs.id, npcId));
  if (!row) return null;
  const holdUntil = Math.max(row.holdUntil ?? 0, now + holdMs);
  const move = moveOfRow(row);
  if (!move || moveEndAt(move) <= now) {
    await db.update(npcs).set({ holdUntil }).where(eq(npcs.id, npcId));
    return { x: row.x, y: row.y, stopped: false };
  }
  const cut = truncateMove(move, now);
  const w = buildMoveWrite(npcId, cut.path, cut.startAt, cut.speed);
  await db
    .update(npcs)
    .set({ holdUntil, x: w.x, y: w.y, facing: w.facing, movePath: cut.path })
    .where(eq(npcs.id, npcId));
  return { x: w.x, y: w.y, stopped: true };
}

/**
 * Every move that starts exactly at `startAt` (one beat's worth),
 * across all mover tables. Three indexed lookups per beat, shared by
 * every connection on this process.
 */
export async function fetchMovesStartingAt(startAt: number): Promise<ScheduledMove[]> {
  const cols = { id: sql<number>`id`, x: sql<number>`x`, y: sql<number>`y`, path: sql<GridPoint[]>`move_path`, speed: sql<number>`move_speed` };
  const [n, a, e] = await Promise.all([
    db.select({ ...cols }).from(npcs).where(eq(npcs.moveStartAt, startAt)),
    db.select({ ...cols }).from(animals).where(eq(animals.moveStartAt, startAt)),
    db.select({ ...cols }).from(enemies).where(eq(enemies.moveStartAt, startAt)),
  ]);
  const out: ScheduledMove[] = [];
  const push = (kind: MoverKind, rows: typeof n) => {
    for (const r of rows) out.push({ kind, id: r.id, x: r.x, y: r.y, move: { path: r.path, startAt, speed: r.speed } });
  };
  push("npc", n);
  push("animal", a);
  push("enemy", e);
  return out;
}
