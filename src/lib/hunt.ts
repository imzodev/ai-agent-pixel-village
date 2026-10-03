// Hunting enemies (wolves): on each beat, a hunter with a player close by
// runs at them instead of wandering. Planned by the WS server, which knows
// every player's live position, as an ordinary beat-synced move: A* to the
// player, stopping a tile short, clipped so the leg ends within the beat
// (the next beat re-plans toward wherever the player went).

import { HUNT_LEASH_PX, HUNT_RADIUS_PX, HUNT_SPEED, WORLD_TICK_MS } from "./constants";
import { moveEndAt, moveOfRow, pathTiles, tileCenter, tileOf, truncateMove } from "./motion";
import { buildMoveWrite } from "./moveStore";
import { planGoalMove } from "./wander";
import { CELL_PX } from "./nav/chunkIndex";
import type { GridPoint, Point, WalkableChecker } from "@/types/world";
import type { MoveWrite, MovingRow } from "@/types/motion";

/** Longest chase leg: it must finish before the next beat's leg starts. */
export const HUNT_MAX_TILES = Math.floor((((WORLD_TICK_MS - 300) / 1000) * HUNT_SPEED) / CELL_PX);
/** Planner budget: a hunter never paths around more than this. */
const HUNT_PLAN_MAX_TILES = 40;

/** Nearest player a hunter at `from` will chase, or null (none near / outside its leash). */
export function huntTarget(from: Point, players: readonly Point[], zone: { x: number; y: number; w: number; h: number }): Point | null {
  const m = HUNT_LEASH_PX;
  let best: Point | null = null;
  let bestD = HUNT_RADIUS_PX;
  for (const p of players) {
    if (p.x < zone.x - m || p.x > zone.x + zone.w + m || p.y < zone.y - m || p.y > zone.y + zone.h + m) continue;
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d <= bestD) { best = p; bestD = d; }
  }
  return best;
}

/**
 * The hunter's move for the beat starting at `startAt`, or null when it
 * has nobody to chase (tickd's wander stands). A wander tickd already
 * queued for this beat is replaced; a move still running is left alone.
 */
export async function planHunt(
  row: MovingRow & { id: number },
  players: readonly Point[],
  zone: { x: number; y: number; w: number; h: number },
  startAt: number,
  isWalkable: WalkableChecker,
): Promise<MoveWrite | null> {
  const current = moveOfRow(row);
  let from: GridPoint;
  if (current && current.startAt === startAt) from = current.path[0];
  else if (current && moveEndAt(current) > startAt) return null;
  else from = tileOf(row.x, row.y);

  const target = huntTarget(tileCenter(from), players, zone);
  if (!target) return null;
  const hold = buildMoveWrite(row.id, [from, from], startAt, HUNT_SPEED, "hunt");
  const path = await planGoalMove(from, target, isWalkable, HUNT_PLAN_MAX_TILES);
  if (!path) return current && current.startAt === startAt ? hold : null;
  const tiles = Math.min(pathTiles(path) - 1, HUNT_MAX_TILES); // stop a tile short of the player
  if (tiles < 1) return hold; // already at their heels: stand and bite
  const leg = truncateMove({ path, startAt, speed: HUNT_SPEED }, startAt + (tiles * CELL_PX * 1000) / HUNT_SPEED);
  return buildMoveWrite(row.id, leg.path, startAt, HUNT_SPEED, "hunt");
}
