// World-pixel ↔ tile-grid conversions and a canonical distance helper.
// Pure functions, no db / Phaser / node:fs imports — safe in both
// client and server bundles. Kept beside the navigation code that uses
// CELL_PX, so the constant has a single owner.

import type { GridPoint, Point } from "@/types/world";

/** Tile side length in world pixels. Matches the LPC spritesheet cell. */
export const CELL_PX = 32 as const;

export function worldToCell(p: Point): GridPoint {
  return { tx: Math.floor(p.x / CELL_PX), ty: Math.floor(p.y / CELL_PX) };
}

export function cellToWorldCenter(c: GridPoint): Point {
  return { x: c.tx * CELL_PX + CELL_PX / 2, y: c.ty * CELL_PX + CELL_PX / 2 };
}

/** Cheaper than Math.hypot — closed-form; no sqrt needed for ordinal comparisons. */
export function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dist(a: Point, b: Point): number {
  return Math.sqrt(distSq(a, b));
}
