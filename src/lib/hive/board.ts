// Beehive Builder's comb: a hexagon of hex cells of radius RADIUS in axial
// coordinates (q, r; s = −q − r), each with an index, and its lines: every cell
// with the same q, the same r, or the same s. Pure, built once.

import { RADIUS } from "./rules";
import type { HiveCell } from "@/types/hive";

const R = RADIUS;
const inside = (q: number, r: number): boolean => Math.abs(q) <= R && Math.abs(r) <= R && Math.abs(q + r) <= R;

/** Every cell, row by row (r, then q). */
export const CELLS: HiveCell[] = [];
for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) if (inside(q, r)) CELLS.push([q, r]);

const INDEX = new Map(CELLS.map(([q, r], i) => [q * 100 + r, i]));
/** A cell's index, or -1 off the comb. */
export const cellIndex = (q: number, r: number): number => (inside(q, r) ? INDEX.get(q * 100 + r) ?? -1 : -1);

/** The lines, as cell indices: constant q, constant r, constant s. */
export const LINES: number[][] = [];
for (let k = -R; k <= R; k++) {
  LINES.push(CELLS.flatMap(([q], i) => (q === k ? [i] : [])));
  LINES.push(CELLS.flatMap(([, r], i) => (r === k ? [i] : [])));
  LINES.push(CELLS.flatMap(([q, r], i) => (-q - r === k ? [i] : [])));
}
/** The lines each cell is on. */
export const LINES_OF: number[][] = CELLS.map(() => []);
LINES.forEach((line, li) => { for (const i of line) LINES_OF[i].push(li); });
