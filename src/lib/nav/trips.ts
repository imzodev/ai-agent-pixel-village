// Trips: an NPC walking a planned route (src/lib/nav/route.ts) through the
// deterministic move system (AGENTS.md "Movement"). The route is planned
// once and stored; tickd then writes it as chained segments, each starting
// exactly on a beat boundary (so the WS beat broadcast carries it) and only
// after the previous one has ended. A segment lasts SEG_BEATS beats, so the
// NPC walks long, smooth stretches with barely a pause at the joins. On the
// way it discovers places; if the way ahead is blocked (a tree grew back)
// it re-plans from where it stands. Server only.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { npcTrips, npcs } from "@/db/schema";
import { NPC_SPEED, WORLD_TICK_MS } from "@/lib/constants";
import { compressToLegs, moveEndAt, moveOfRow, rowPositionAt, tileCenter, tileOf } from "@/lib/motion";
import { buildMoveWrite, writeMoves } from "@/lib/moveStore";
import { logEvent } from "@/lib/game";
import { BLOCK_H, BLOCK_W } from "./route";
import { worldGrid, worldRouter } from "./walkGrid";
import { discoverAround } from "./places";
import type { MoveWrite, TickBeat } from "@/types/motion";
import type { Place } from "@/types/nav";
import type { GridPoint } from "@/types/world";

/** Each segment of a trip lasts this many beats… */
export const SEG_BEATS = 4;
/** …which is this many tiles at walking pace (it ends a moment before its last beat). */
export const SEG_TILES = Math.floor(((SEG_BEATS * WORLD_TICK_MS) / 1000) * NPC_SPEED / 16);

/** Plan a trip for an NPC to a place; it sets off on the next beat. */
export async function startTrip(npcId: number, dest: Pick<Place, "name" | "x" | "y"> & { key?: string }): Promise<{ ok: true; tiles: number } | { ok: false; error: string }> {
  const [n] = await db.select().from(npcs).where(eq(npcs.id, npcId));
  if (!n) return { ok: false, error: "No such NPC." };
  const at = rowPositionAt(n, Date.now());
  const route = await worldRouter.plan(tileOf(at.x, at.y), tileOf(dest.x, dest.y));
  if (!route) return { ok: false, error: `No way to ${dest.name} from here.` };
  const row = { npcId, destKey: dest.key ?? null, destName: dest.name, destX: dest.x, destY: dest.y, tiles: route.tiles, idx: 0, status: "active", updatedAt: new Date() };
  await db.insert(npcTrips).values(row).onConflictDoUpdate({ target: npcTrips.npcId, set: row });
  return { ok: true, tiles: route.tiles.length };
}

/** NPCs walking a trip right now (the random wander leaves them alone). */
export async function npcsOnTrips(): Promise<Set<number>> {
  const rows = await db.select({ id: npcTrips.npcId }).from(npcTrips).where(eq(npcTrips.status, "active"));
  return new Set(rows.map((r) => r.id));
}

/** Are all these tiles still walkable? */
async function clear(tiles: readonly GridPoint[]): Promise<boolean> {
  for (const t of tiles) {
    await worldGrid.ensureBlock(Math.floor(t.tx / BLOCK_W), Math.floor(t.ty / BLOCK_H));
    if (!worldGrid.walkable(t.tx, t.ty)) return false;
  }
  return true;
}

/**
 * tickd, each beat: NPCs whose current segment has ended get the next one,
 * starting at `beat.startAt`; NPCs at the end of their route arrive.
 */
export async function advanceTrips(beat: TickBeat): Promise<number> {
  const trips = await db.select().from(npcTrips).where(eq(npcTrips.status, "active"));
  if (!trips.length) return 0;
  const rows = await db.select().from(npcs).where(inArray(npcs.id, trips.map((t) => t.npcId)));
  const writes: MoveWrite[] = [];
  for (const trip of trips) {
    const n = rows.find((r) => r.id === trip.npcId);
    if (!n) { await db.update(npcTrips).set({ status: "failed", updatedAt: new Date() }).where(eq(npcTrips.npcId, trip.npcId)); continue; }
    if (n.holdUntil != null && Number(n.holdUntil) > beat.startAt) continue; // someone is talking to them
    const move = moveOfRow(n);
    if (move && moveEndAt(move) > beat.startAt) continue; // still walking this segment
    const pos = rowPositionAt(n, beat.startAt);
    const here = tileOf(pos.x, pos.y);
    let tiles = trip.tiles, idx = trip.idx;
    // Arrived?
    if (idx >= tiles.length - 1) {
      await db.update(npcTrips).set({ status: "arrived", updatedAt: new Date() }).where(eq(npcTrips.npcId, trip.npcId));
      const end = tileCenter(here);
      await discoverAround(n.id, end.x, end.y);
      void logEvent("visit", `${n.name} arrived at ${trip.destName}.`, "npc", n.id, end.x, end.y).catch(() => {});
      continue;
    }
    // Knocked off course (held, teleported) or the way ahead is blocked: re-plan from here.
    let seg = tiles.slice(idx, idx + SEG_TILES + 1);
    if (seg[0].tx !== here.tx || seg[0].ty !== here.ty || !(await clear(seg))) {
      const route = await worldRouter.plan(here, tileOf(trip.destX, trip.destY));
      if (!route) { await db.update(npcTrips).set({ status: "failed", updatedAt: new Date() }).where(eq(npcTrips.npcId, trip.npcId)); continue; }
      tiles = route.tiles; idx = 0;
      seg = tiles.slice(0, SEG_TILES + 1);
    }
    if (seg.length >= 2) writes.push(buildMoveWrite(n.id, compressToLegs(seg), beat.startAt, NPC_SPEED));
    await db.update(npcTrips).set({ tiles, idx: idx + seg.length - 1, updatedAt: new Date() }).where(eq(npcTrips.npcId, trip.npcId));
    const p = tileCenter(here);
    await discoverAround(n.id, p.x, p.y);
  }
  await writeMoves("npc", writes);
  return writes.length;
}
