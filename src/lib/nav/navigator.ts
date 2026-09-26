// Grid A* planner over the chunked world. The walkability oracle is
// injected — tests pass a synchronous boolean grid, sim passes
// `isWalkableServer` (which lazy-loads chunks as needed). The planner
// knows nothing about NPCs / animals / enemies; it produces a
// WalkPath. Following the path is the caller's job (and uses the
// existing `stepTowardWalkable` primitive in src/lib/movement.ts).
//
// Bounds: `maxTiles` caps the *path length*. We also cap the number of
// visited cells at 4× the Manhattan distance so a pathological chunk
// can't burn sim time.

import type {
  NavOptions,
  NavResult,
  Navigator,
  Point,
  WalkableChecker,
} from "@/types/world";
import { CELL_PX, cellToWorldCenter, worldToCell } from "./chunkIndex";
import type { GridPoint } from "@/types/world";

// Tie-break epsilon: how much extra h-cost we tolerate between f-buckets
// before preferring a fresher h. 0 = strict, ~1.001 = standard A* idiom.
const TIE_EPS = 1.001;

// Nodes visited before giving up. 4× Manhattan is plenty for a sparse
// grid where the route is at most a few times the Manhattan distance.
const VISIT_LIMIT_MULTIPLIER = 4;

interface Node {
  key: number;       // ty * 1_000_003 + tx (avoids Map<string, Node> allocations)
  tx: number;
  ty: number;
  g: number;
  f: number;
  parent: number;    // key of the predecessor (0 == no parent)
}

// 4-connected keys. 32 px cells. Cardinal moves only.
const DIRS: { dtx: number; dty: number }[] = [
  { dtx: 1, dty: 0 },
  { dtx: -1, dty: 0 },
  { dtx: 0, dty: 1 },
  { dtx: 0, dty: -1 },
];

function keyOf(tx: number, ty: number): number {
  // Encodes the pair as a single integer so Node lookups don't allocate.
  // 1_000_003 is a prime > any practical world tile dimension; safe up
  // to ~1M tiles per axis.
  return ty * 1_000_003 + tx;
}

function heuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

/**
 * Bidirectional heap-backed priority queue. Standard A* needs an open set
 * keyed by f-cost; an array of nodes with `push(siftDown)` / `pop(siftUp)`
 * is enough. No external deps.
 */
class MinHeap {
  private readonly a: Node[] = [];
  size(): number { return this.a.length; }
  push(n: Node) {
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

async function isCellWalkable(
  isWalkable: WalkableChecker,
  tx: number,
  ty: number,
): Promise<boolean> {
  // Test the centre, plus the four corners of the cell. A 32-px cell can
  // straddle two walkable regions (e.g. a one-tile-wide corridor next to
  // a wall); the centre+corner test mirrors what the step primitive does
  // in `stepTowardWalkable` and avoids routing through half-blocked cells.
  const cx = tx * CELL_PX + CELL_PX / 2;
  const cy = ty * CELL_PX + CELL_PX / 2;
  const r = CELL_PX / 2 - 1; // sample slightly inside the cell
  const samples: Point[] = [
    { x: cx, y: cy },
    { x: cx + r, y: cy },
    { x: cx - r, y: cy },
    { x: cx, y: cy + r },
    { x: cx, y: cy - r },
  ];
  for (const p of samples) {
    if (!(await isWalkable(p.x, p.y))) return false;
  }
  return true;
}

/**
 * Plan a route from `from` to `to` (both world-pixel). The first
 * waypoint equals `from` so the caller can always advance by one step
 * without a special "already at start" case.
 *
 * `invalidate(id)` is a no-op for the planner itself (it keeps no per-id
 * state), but is exposed on the Navigator facade so callers can clear
 * both the planner and the cache through one interface.
 */
export async function planPath(
  from: Point,
  to: Point,
  isWalkable: WalkableChecker,
  opts: NavOptions = {},
): Promise<NavResult> {
  const maxTiles = opts.maxTiles ?? 80;

  const start = worldToCell(from);
  const goal = worldToCell(to);

  // Sanity: start must be walkable. Goal: snap to nearest walkable if
  // it's blocked; if none within a small radius, no path.
  if (!(await isCellWalkable(isWalkable, start.tx, start.ty))) {
    return null;
  }
  let goalCell = goal;
  if (!(await isCellWalkable(isWalkable, goalCell.tx, goalCell.ty))) {
    const snapped = await findNearestWalkableCell(isWalkable, goal);
    if (!snapped) return null;
    goalCell = snapped;
  }

  if (start.tx === goalCell.tx && start.ty === goalCell.ty) {
    return { path: { waypoints: [from], cost: 0 } };
  }



  const open = new MinHeap();
  const bestG = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();

  const startKey = keyOf(start.tx, start.ty);
  bestG.set(startKey, 0);
  parent.set(startKey, 0);
  open.push({ key: startKey, tx: start.tx, ty: start.ty, g: 0, f: heuristic(start, goalCell), parent: 0 });

  const visitLimit = Math.max(64, heuristic(start, goalCell) * VISIT_LIMIT_MULTIPLIER);
  let visited = 0;

  while (open.size() > 0) {
    const cur = open.pop()!;
    if (closed.has(cur.key)) continue;
    closed.add(cur.key);
    visited += 1;
    if (visited > visitLimit) return null;

    if (cur.tx === goalCell.tx && cur.ty === goalCell.ty) {
      // Reconstruct path: cell coords, then convert waypoints back to
      // world pixels at the cell centres. The first waypoint is replaced
      // with the caller's exact `from` so the path-follower can step
      // from the entity's actual position.
      const cells: GridPoint[] = [];
      let k: number | undefined = cur.key;
      while (k && k !== startKey) {
        const tx = k % 1_000_003;
        const ty = Math.floor(k / 1_000_003);
        cells.push({ tx, ty });
        k = parent.get(k);
        if (k === undefined) break;
      }
      cells.reverse();
      const waypoints: Point[] = [from, ...cells.map(cellToWorldCenter)];
      if (waypoints.length > maxTiles + 1) {
        // Defensive: a maxTiles-cap should have stopped us earlier.
        return null;
      }
      return { path: { waypoints, cost: cur.g } };
    }

    for (const d of DIRS) {
      const ntx = cur.tx + d.dtx;
      const nty = cur.ty + d.dty;
      const nKey = keyOf(ntx, nty);
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

/**
 * Spiral outward from `origin` to find the nearest walkable cell. Used
 * only when the requested goal cell is itself unwalkable. Bounded so
 * unreachable goals don't loop forever.
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

/**
 * Make a Navigator facade. The planner itself is stateless across calls
 * (each `planPath` is independent), but wrapping it lets callers depend
 * on the `Navigator` interface and treat `invalidate(id)` uniformly
 * whether the planner or the path cache does the work.
 */
export function makeNavigator(isWalkable: WalkableChecker): Navigator {
  return {
    plan(from, to, opts) {
      return planPath(from, to, isWalkable, opts);
    },
    invalidate() {
      // no per-id planner cache to clear today; reserved for future
      // memoisation layers.
    },
  };
}
