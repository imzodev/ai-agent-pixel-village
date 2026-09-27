// World-pixel <-> tile-grid conversions for the wander/pathfinding system.
// Pure functions; no DB or Phaser imports. Safe to use from any module
// on either side (server sim, planner, client). CELL_PX is the single
// source of truth and aliases the chunk tile size so the planner's
// walkability sampling aligns with the production `isWalkableAt`
// foot-box check.
//
// See `src/lib/chunkCollision.ts` for the production collision grid.

import type { GridPoint, Point } from "@/types/world";
import { CHUNK_TILE_PX } from "@/lib/chunkCollision";

/**
 * Wander / planner cell side length in world pixels. Must equal the
 * chunk tile size (`CHUNK_TILE_PX`) so that the planner's per-cell
 * walkability check can sample the same foot-box the production
 * `isWalkableAt` checks. Re-exported under the familiar name so
 * existing callers don't need to switch imports.
 */
export const CELL_PX = CHUNK_TILE_PX;

export function worldToCell(p: Point): GridPoint {
  return { tx: Math.floor(p.x / CELL_PX), ty: Math.floor(p.y / CELL_PX) };
}

export function cellToWorldCenter(c: GridPoint): Point {
  return { x: c.tx * CELL_PX + CELL_PX / 2, y: c.ty * CELL_PX + CELL_PX / 2 };
}
