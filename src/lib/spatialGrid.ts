// "Who's near here?" without checking everyone: points bucketed into square
// cells, so a query only looks at the few cells around it. With hundreds
// of players and thousands of enemies, the spawner and the combat clock
// stay cheap. Pure.

import type { SpatialGrid } from "@/types/world";

const key = (cx: number, cy: number) => `${cx},${cy}`;

export function buildGrid<T>(items: readonly T[], at: (t: T) => { x: number; y: number }, cell: number): SpatialGrid<T> {
  const g: SpatialGrid<T> = { cell, buckets: new Map() };
  for (const it of items) addToGrid(g, it, at(it));
  return g;
}

export function addToGrid<T>(g: SpatialGrid<T>, it: T, p: { x: number; y: number }): void {
  const k = key(Math.floor(p.x / g.cell), Math.floor(p.y / g.cell));
  const b = g.buckets.get(k);
  if (b) b.push(it); else g.buckets.set(k, [it]);
}

/** Everything in the cells that could hold a point within `r` of (x, y) (callers check the exact distance). */
export function nearby<T>(g: SpatialGrid<T>, x: number, y: number, r: number): T[] {
  const out: T[] = [];
  const x0 = Math.floor((x - r) / g.cell), x1 = Math.floor((x + r) / g.cell);
  const y0 = Math.floor((y - r) / g.cell), y1 = Math.floor((y + r) / g.cell);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const b = g.buckets.get(key(cx, cy));
    if (b) out.push(...b);
  }
  return out;
}

/** How many grid points lie within `r` of (x, y). */
export function countWithin<T>(g: SpatialGrid<T>, x: number, y: number, r: number, at: (t: T) => { x: number; y: number }): number {
  let n = 0;
  for (const it of nearby(g, x, y, r)) { const p = at(it); if (Math.hypot(p.x - x, p.y - y) <= r) n++; }
  return n;
}
