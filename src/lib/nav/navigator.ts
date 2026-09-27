// A* path planner over the chunked world. Stateless across calls — the
// caller manages any waypoint cache. The walkability oracle is injected
// (tests pass a synchronous boolean grid; sim passes `isWalkableServer`,
// which lazy-loads chunks as needed).
//
// Walkability contract: `isWalkable(x, y)` returns true iff an entity
// standing at world-pixel `(x, y)` is not blocked by any tile under its
// foot box (the same 4-corner box `isWalkableAt` checks). The planner
// calls it at the 4 foot-box offsets for each candidate cell, so
// planner walkability matches step walkability exactly — there is no
// separate "planner walkable" notion.
//
// Anti-regressions (from a previous failed attempt at this planner):
//   1. CELL_PX is aliased to the chunk tile size (16 px), not 32 px.
//      A larger cell size under-samples the foot box and lets the
//      planner route through blocked tiles.
//   2. The walkability sample uses the same 4-corner offsets as the
//      production `FOOT_CORNERS`, not a hand-picked 5-point set.
//   3. Cells whose foot box falls outside any loaded chunk are
//      treated as non-walkable — we don't know what's there, so we
//      refuse to route through it.
//   4. The key encoder round-trips negative coords so cells north/
//      west of the world origin path correctly.
//   5. Neighbour expansion accepts negative `tx`/`ty` only if the
//      world actually has data there; bounds checks live in the
//      caller via `walkable` returning false.

import {
  chunkAtWorldPx,
  FOOT_CORNERS,
} from "@/lib/chunkCollision";
import type {
  GridPoint,
  Point,
  WalkableChecker,
} from "@/types/world";
import type { PlanNode as Node, PlanOptions, PlanPath } from "@/types/nav";

export type { PlanOptions, PlanPath };
import {
  CELL_PX,
  cellToWorldCenter,
  worldToCell,
} from "./chunkIndex";

/**
 * Plan a route from `from` to `to` (both world-pixel coordinates) that
 * avoids blocked cells. Returns null when:
 *   - the start cell is non-walkable,
 *   - the goal cell is non-walkable AND no walkable neighbour exists,
 *   - the open set is exhausted without finding the goal,
 *   - the visit cap is exceeded,
 *   - the path would exceed `maxTiles`.
 *
 * The planner never logs or throws; callers should handle `null` by
 * falling back to a direct step (which uses the same `walkable`
 * oracle via `stepTowardWalkable`).
 */
export async function planPath(
  from: Point,
  to: Point,
  isWalkable: WalkableChecker,
  opts: PlanOptions = {},
): Promise<PlanPath | null> {
  const maxTiles = opts.maxTiles ?? 80;
  const start = worldToCell(from);
  const goal = worldToCell(to);

  if (!(await isCellWalkable(isWalkable, start.tx, start.ty))) return null;
  let goalCell = goal;
  if (!(await isCellWalkable(isWalkable, goalCell.tx, goalCell.ty))) {
    const snapped = await findNearestWalkableCell(isWalkable, goal);
    if (!snapped) return null;
    goalCell = snapped;
  }
  if (start.tx === goalCell.tx && start.ty === goalCell.ty) {
    return { waypoints: [from], cost: 0 };
  }

  const open = new MinHeap();
  const bestG = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();

  const startKey = packKey(start.tx, start.ty);
  bestG.set(startKey, 0);
  parent.set(startKey, 0);
  open.push({ key: startKey, tx: start.tx, ty: start.ty, g: 0, f: heuristic(start, goalCell), parent: 0 });

  // Cap visited cells. 4× Manhattan is plenty for a sparse grid; we
  // bail earlier if the open set drains without finding the goal.
  const visitLimit = Math.max(64, heuristic(start, goalCell) * 4);
  let visited = 0;

  while (open.size() > 0) {
    const cur = open.pop()!;
    if (closed.has(cur.key)) continue;
    closed.add(cur.key);
    visited += 1;
    if (visited > visitLimit) return null;

    if (cur.tx === goalCell.tx && cur.ty === goalCell.ty) {
      const waypoints = reconstructPath(cur.key, startKey, parent, from);
      if (waypoints.length > maxTiles + 1) return null;
      return { waypoints, cost: cur.g };
    }

    for (const d of DIRS) {
      const ntx = cur.tx + d.dtx;
      const nty = cur.ty + d.dty;
      const nKey = packKey(ntx, nty);
      if (closed.has(nKey)) continue;
      if (!(await isCellWalkable(isWalkable, ntx, nty))) continue;

      const tentativeG = cur.g + 1;
      const prevG = bestG.get(nKey);
      if (prevG !== undefined && tentativeG >= prevG) continue;
      bestG.set(nKey, tentativeG);
      parent.set(nKey, cur.key);

      const f = tentativeG * TIE_EPS + heuristic({ tx: ntx, ty: nty }, goalCell);
      open.push({ key: nKey, tx: ntx, ty: nty, g: tentativeG, f, parent: cur.key });
    }
  }
  return null;
}

/* ─── internal helpers ─────────────────────────────────────────────────── */

/**
 * Sample a cell's 4-corner foot box (the same box `isWalkableAt` checks
 * in production). Returns true iff all 4 corners land on walkable
 * tiles. Crucially: the planner calls this at the EXACT positions the
 * production step primitive checks — there is no separate notion of
 * "planner walkable".
 *
 * The negative-coord contract: callers may pass any (tx, ty), including
 * negatives for cells north/west of the world origin. The walkable
 * oracle decides whether those positions are reachable; the planner
 * doesn't second-guess.
 */
async function isCellWalkable(
  isWalkable: WalkableChecker,
  tx: number,
  ty: number,
): Promise<boolean> {
  const cx = tx * CELL_PX + CELL_PX / 2;
  const cy = ty * CELL_PX + CELL_PX / 2;
  for (const [dx, dy] of FOOT_CORNERS) {
    if (!(await isWalkable(cx + dx, cy + dy))) return false;
  }
  return true;
}

/**
 * Spiral outward from an unreachable goal cell to find the nearest
 * walkable neighbour. Bounded radius so unreachable goals don't loop.
 */
async function findNearestWalkableCell(
  isWalkable: WalkableChecker,
  origin: GridPoint,
): Promise<GridPoint | null> {
  const radius = 6;
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = origin.tx + dx;
        const ty = origin.ty + dy;
        if (await isCellWalkable(isWalkable, tx, ty)) return { tx, ty };
      }
    }
  }
  return null;
}

function heuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

/**
 * Encode (tx, ty) as a single integer map key. Uses shift + multiply
 * (NOT `<<`) so we avoid JS's 32-bit signed integer overflow. The
 * earlier `ty * PRIME + tx` encoding produced negative keys whose
 * JS-modulo decode gave the wrong cell (it was a known anti-
 * regression from a prior attempt).
 *
 * Range: ~ ±1_048_575 tiles per axis. At 16 px/tile that's a world
 * spanning ±16.8 km per axis, well beyond any reachable cell.
 *
 * Encoding: each axis is shifted to non-negative, then the ty value is
 * stored in the upper half of the result via multiplication by
 * `KEY_AXIS_RANGE`. Multiplication is safe because the operands are
 * bounded at `2 * KEY_AXIS_RANGE ≈ 2.1M`, well below `Number.
 * MAX_SAFE_INTEGER`.
 */
const KEY_AXIS_BITS = 21;
const KEY_AXIS_RANGE = 1 << KEY_AXIS_BITS;            // 2_097_152
const KEY_AXIS_OFFSET = 1 << (KEY_AXIS_BITS - 1);    // 1_048_576
function packKey(tx: number, ty: number): number {
  // Use `+`, not `|`, so negative intermediate values don't get
  // truncated to 32-bit signed ints by JS's bitwise coercion.
  return (tx + KEY_AXIS_OFFSET) + (ty + KEY_AXIS_OFFSET) * KEY_AXIS_RANGE;
}
function unpackKey(k: number): { tx: number; ty: number } {
  // `%` here is safe because the divisor is positive (KEY_AXIS_RANGE)
  // and JS's modulo gives a non-negative result for non-negative
  // divisors regardless of dividend sign. `Math.floor` handles
  // negative dividends by rounding toward -∞, giving the same
  // quotient decomposition as encode.
  return {
    tx: (k % KEY_AXIS_RANGE) - KEY_AXIS_OFFSET,
    ty: Math.floor(k / KEY_AXIS_RANGE) - KEY_AXIS_OFFSET,
  };
}

/** 4-connected cardinal neighbours. Diagonals skipped to avoid clipping corners. */
const DIRS: ReadonlyArray<{ dtx: number; dty: number }> = [
  { dtx: 1, dty: 0 },
  { dtx: -1, dty: 0 },
  { dtx: 0, dty: 1 },
  { dtx: 0, dty: -1 },
];

/**
 * Standard A* tie-break: nodes with lower g are preferred when f is
 * close. 1.001 is the textbook epsilon for "tie-break in favour of
 * smaller g".
 */
const TIE_EPS = 1.001;


/**
 * Tiny binary min-heap keyed on `f`. Avoids pulling in a heap library
 * for a planner that touches ~10 entities per tick.
 */
class MinHeap {
  private readonly a: Node[] = [];
  size(): number { return this.a.length; }
  push(n: Node): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): Node | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < n && a[l].f < a[s].f) s = l;
        if (r < n && a[r].f < a[s].f) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

/**
 * Walk the parent chain from `goalKey` back to `startKey`, collect
 * the cells, reverse, convert to world-pixel cell centres, prepend the
 * exact `from` so the caller can start stepping from the entity's
 * current position without a "you're already at start" special case.
 */
function reconstructPath(
  goalKey: number,
  startKey: number,
  parent: Map<number, number>,
  from: Point,
): Point[] {
  const cells: GridPoint[] = [];
  let k: number | undefined = goalKey;
  while (k !== undefined && k !== startKey) {
    const { tx, ty } = unpackKey(k);
    cells.push({ tx, ty });
    k = parent.get(k);
  }
  cells.reverse();
  return [from, ...cells.map(cellToWorldCenter)];
}
