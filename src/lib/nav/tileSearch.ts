// Turn-penalised A* over a NavGrid. Each search state is a tile plus the
// heading it was entered with; turning costs extra, so of two equally long
// routes the one with fewer, longer legs wins — NPCs walk long straight
// lines instead of staircases (moves stay four-directional, per AGENTS.md).
// Pure and synchronous (the caller loads blocks first).

import type { GridPoint } from "@/types/world";
import type { Bounds, NavGrid } from "@/types/nav";

/** Turning costs this much on top of the step (in tenths: 5 = half a tile). */
export const TURN_COST = 5;
/** The cheapest a step can be (a road), for an admissible heuristic. */
export const MIN_STEP = 6;

const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
/** Tile coordinates are offset and packed into one number for state keys (the world is far smaller). */
const KEY_OFF = 100_000, KEY_SPAN = 200_000;

/** A small binary min-heap of [priority, id]. */
export class Heap {
  private p: number[] = [];
  private v: number[] = [];
  get size() { return this.v.length; }
  push(pri: number, id: number) {
    this.p.push(pri); this.v.push(id);
    let i = this.v.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (this.p[j] <= this.p[i]) break;
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]]; [this.v[i], this.v[j]] = [this.v[j], this.v[i]];
      i = j;
    }
  }
  pop(): number {
    const top = this.v[0];
    const lp = this.p.pop()!, lv = this.v.pop()!;
    if (this.v.length) {
      this.p[0] = lp; this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.v.length && this.p[l] < this.p[m]) m = l;
        if (r < this.v.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break;
        [this.p[i], this.p[m]] = [this.p[m], this.p[i]]; [this.v[i], this.v[m]] = [this.v[m], this.v[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Cheapest route (tiles, start first) from `a` to `b`, or null. `maxVisits`
 * caps the work; `bounds` keeps the search inside a box.
 */
export function searchTiles(grid: NavGrid, a: GridPoint, b: GridPoint, opts: { bounds?: Bounds; maxVisits?: number } = {}): { tiles: GridPoint[]; cost: number } | null {
  if (!grid.walkable(a.tx, a.ty) || !grid.walkable(b.tx, b.ty)) return null;
  if (a.tx === b.tx && a.ty === b.ty) return { tiles: [a], cost: 0 };
  const bounds = opts.bounds;
  const maxVisits = opts.maxVisits ?? 60_000;
  // Ids: index into these arrays. A state is (tile, heading 0–3 or 4 = none).
  const tx: number[] = [], ty: number[] = [], hd: number[] = [], g: number[] = [], par: number[] = [];
  // Numeric state keys (tile and heading): far cheaper than strings in the hot loop.
  const ids = new Map<number, number>();
  const sk = (x: number, y: number, d: number) => ((x + KEY_OFF) * KEY_SPAN + (y + KEY_OFF)) * 5 + d;
  const closed = new Set<number>();
  const h = (x: number, y: number) => (Math.abs(x - b.tx) + Math.abs(y - b.ty)) * MIN_STEP;
  const add = (x: number, y: number, d: number, cost: number, parent: number) => {
    const k = sk(x, y, d);
    const old = ids.get(k);
    if (old !== undefined && g[old] <= cost) return -1;
    const id = old ?? tx.length;
    if (old === undefined) { tx.push(x); ty.push(y); hd.push(d); g.push(cost); par.push(parent); ids.set(k, id); }
    else { g[id] = cost; par[id] = parent; closed.delete(id); }
    return id;
  };
  const open = new Heap();
  open.push(h(a.tx, a.ty), add(a.tx, a.ty, 4, 0, -1));
  let visits = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++visits > maxVisits) return null;
    if (tx[cur] === b.tx && ty[cur] === b.ty) {
      const tiles: GridPoint[] = [];
      for (let i = cur; i >= 0; i = par[i]) tiles.push({ tx: tx[i], ty: ty[i] });
      return { tiles: tiles.reverse(), cost: g[cur] };
    }
    for (let d = 0; d < 4; d++) {
      const nx = tx[cur] + DX[d], ny = ty[cur] + DY[d];
      if (bounds && (nx < bounds.tx0 || nx > bounds.tx1 || ny < bounds.ty0 || ny > bounds.ty1)) continue;
      if (!grid.walkable(nx, ny)) continue;
      const step = grid.cost(nx, ny) + (hd[cur] !== 4 && hd[cur] !== d ? TURN_COST : 0);
      const id = add(nx, ny, d, g[cur] + step, cur);
      if (id >= 0) open.push(g[id] + h(nx, ny), id);
    }
  }
  return null;
}

/**
 * Every tile's cheapest cost from `a` within `bounds` (turn-penalised, like
 * searchTiles): one flood answers "how far to each of these" at once.
 * Returns costs indexed by (ty - ty0) * width + (tx - tx0) (Infinity = unreached).
 * Typed arrays throughout: a block's whole state space is a few thousand slots.
 */
export function floodCosts(grid: NavGrid, a: GridPoint, bounds: Bounds): Float64Array {
  const w = bounds.tx1 - bounds.tx0 + 1, h = bounds.ty1 - bounds.ty0 + 1;
  const best = new Float64Array(w * h).fill(Infinity);
  if (!grid.walkable(a.tx, a.ty)) return best;
  // State = tile * 5 + heading (4 = none yet).
  const g = new Float64Array(w * h * 5).fill(Infinity);
  const done = new Uint8Array(w * h * 5);
  const open = new Heap();
  const s0 = ((a.ty - bounds.ty0) * w + (a.tx - bounds.tx0)) * 5 + 4;
  g[s0] = 0;
  open.push(0, s0);
  while (open.size) {
    const s = open.pop();
    if (done[s]) continue;
    done[s] = 1;
    const t = (s / 5) | 0, d0 = s % 5;
    const x = t % w, y = (t / w) | 0;
    if (g[s] < best[t]) best[t] = g[s];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const wx = nx + bounds.tx0, wy = ny + bounds.ty0;
      if (!grid.walkable(wx, wy)) continue;
      const ns = (ny * w + nx) * 5 + d;
      const c = g[s] + grid.cost(wx, wy) + (d0 !== 4 && d0 !== d ? TURN_COST : 0);
      if (c < g[ns]) { g[ns] = c; open.push(c, ns); }
    }
  }
  return best;
}

/** The nearest walkable tile to `p` within `radius` (a spiral), or null. */
export function nearestWalkable(grid: NavGrid, p: GridPoint, radius = 8): GridPoint | null {
  if (grid.walkable(p.tx, p.ty)) return p;
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (grid.walkable(p.tx + dx, p.ty + dy)) return { tx: p.tx + dx, ty: p.ty + dy };
    }
  }
  return null;
}
