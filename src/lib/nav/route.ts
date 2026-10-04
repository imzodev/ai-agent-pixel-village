// Route planning, like a maps app: hierarchical A* (HPA*). The world is
// cut into blocks (the game's chunks, 24×15 tiles). Where two blocks share
// walkable border cells there are *entrances*; inside a block, the cost of
// crossing between its entrances is worked out once (turn-penalised A*
// confined to the block) and cached. A long trip searches that small graph
// — thousands of entrances, not hundreds of thousands of tiles — then fills
// in each hop with real tiles. Short trips just search the tiles.
// Roads are cheaper to walk (the grid's cost), so routes keep to them.
// Pure logic over a NavGrid; the real world's grid is src/lib/nav/walkGrid.ts.

import { Heap, TURN_COST as TURN_PENALTY, floodCosts, nearestWalkable, searchTiles } from "./tileSearch";
import { compressToLegs } from "@/lib/motion";
import type { BlockGraph, Entrance, GraphStore, NavGrid, Route } from "@/types/nav";
import type { GridPoint } from "@/types/world";

export const BLOCK_W = 24;
export const BLOCK_H = 15;
/** Trips shorter than this (Manhattan tiles) search the tiles directly. */
const SHORT_TRIP = 64;
/** A block's crossing costs are trusted this long, then recomputed (the world changes: trees fall and grow). */
const GRAPH_TTL_MS = 5 * 60_000;
/**
 * The long-trip search's estimate of the cost per remaining tile: above open
 * ground (10), so it heads for the goal — routes stay within a fraction of a
 * percent of the best on the real map, while exploring far fewer blocks.
 */
const LONG_TRIP_H = 12;
/** The straightening pass re-searches routes in windows this long (tiles). */
const STRAIGHTEN_WINDOW = 32;
/** At most this many entrances on one side of a block. */
const MAX_ENTRANCES_PER_SIDE = 4;
/** Border openings up to this wide get one entrance; wider ones get two, near their ends. */
const ONE_ENTRANCE_MAX = 6;

const blockOf = (tx: number, ty: number) => ({ bx: Math.floor(tx / BLOCK_W), by: Math.floor(ty / BLOCK_H) });
const bkey = (bx: number, by: number) => `${bx},${by}`;
const tkey = (tx: number, ty: number) => `${tx},${ty}`;
const boundsOf = (bx: number, by: number) => ({ tx0: bx * BLOCK_W, ty0: by * BLOCK_H, tx1: bx * BLOCK_W + BLOCK_W - 1, ty1: by * BLOCK_H + BLOCK_H - 1 });

/** Entrances of a block along one shared border, from the run of cells open on both sides. */
function borderEntrances(grid: NavGrid, cells: GridPoint[], step: { dx: number; dy: number }): Entrance[] {
  const out: Entrance[] = [];
  let run: GridPoint[] = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length <= ONE_ENTRANCE_MAX) out.push(run[Math.floor(run.length / 2)]);
    else { out.push(run[1]); out.push(run[run.length - 2]); }
    run = [];
  };
  for (const c of cells) {
    if (grid.walkable(c.tx, c.ty) && grid.walkable(c.tx + step.dx, c.ty + step.dy)) run.push(c);
    else flush();
  }
  flush();
  // Tree-dotted borders have many small gaps: keep a few, spread along the side
  // (routes still pass anywhere — the final tiles are searched for real).
  if (out.length <= MAX_ENTRANCES_PER_SIDE) return out;
  return Array.from({ length: MAX_ENTRANCES_PER_SIDE }, (_, i) => out[Math.round((i * (out.length - 1)) / (MAX_ENTRANCES_PER_SIDE - 1))]);
}

/** A router over a grid, with its own cache of block graphs (optionally kept somewhere, e.g. on disk). */
export function createRouter(grid: NavGrid, store?: GraphStore) {
  const graphs = new Map<string, BlockGraph & { at: number }>();

  async function blockGraph(bx: number, by: number): Promise<BlockGraph> {
    const k = bkey(bx, by);
    const hit = graphs.get(k);
    if (hit && Date.now() - hit.at < GRAPH_TTL_MS) return hit;
    // The block and its neighbours' tiles: borders depend on both sides, and
    // crossing into a neighbour checks its tiles (even for a saved graph).
    await Promise.all([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => grid.ensureBlock(bx + dx, by + dy)));
    if (!hit && store) {
      const saved = await store.load(bx, by);
      if (saved) { const g = { ...saved, at: Date.now() }; graphs.set(k, g); return g; }
    }
    const b = boundsOf(bx, by);
    const col = (x: number) => Array.from({ length: BLOCK_H }, (_, i) => ({ tx: x, ty: b.ty0 + i }));
    const row = (y: number) => Array.from({ length: BLOCK_W }, (_, i) => ({ tx: b.tx0 + i, ty: y }));
    const entrances = [
      ...borderEntrances(grid, col(b.tx1), { dx: 1, dy: 0 }),
      ...borderEntrances(grid, col(b.tx0), { dx: -1, dy: 0 }),
      ...borderEntrances(grid, row(b.ty1), { dx: 0, dy: 1 }),
      ...borderEntrances(grid, row(b.ty0), { dx: 0, dy: -1 }),
    ];
    // One flood from each entrance gives its cost to all the others.
    const edges = new Map<number, { to: number; cost: number }[]>();
    for (let i = 0; i < entrances.length; i++) {
      const costs = floodCosts(grid, entrances[i], b);
      const out: { to: number; cost: number }[] = [];
      for (let j = 0; j < entrances.length; j++) {
        if (j === i) continue;
        const c = costs[(entrances[j].ty - b.ty0) * BLOCK_W + (entrances[j].tx - b.tx0)];
        if (c !== Infinity) out.push({ to: j, cost: c });
      }
      edges.set(i, out);
    }
    const g = { entrances, edges, at: Date.now() };
    graphs.set(k, g);
    void store?.save(bx, by, g);
    return g;
  }

  /** The tile across the border from an entrance cell (in the neighbouring block), if it's walkable. */
  function across(e: GridPoint): GridPoint[] {
    const { bx, by } = blockOf(e.tx, e.ty);
    const b = boundsOf(bx, by);
    const out: GridPoint[] = [];
    if (e.tx === b.tx1) out.push({ tx: e.tx + 1, ty: e.ty });
    if (e.tx === b.tx0) out.push({ tx: e.tx - 1, ty: e.ty });
    if (e.ty === b.ty1) out.push({ tx: e.tx, ty: e.ty + 1 });
    if (e.ty === b.ty0) out.push({ tx: e.tx, ty: e.ty - 1 });
    return out.filter((c) => grid.walkable(c.tx, c.ty));
  }

  /** Long trips: A* over block entrances, then fill in each hop with tiles. */
  async function hierarchical(start: GridPoint, goal: GridPoint): Promise<Route | null> {
    const sB = blockOf(start.tx, start.ty), gB = blockOf(goal.tx, goal.ty);
    const node = new Map<string, { p: GridPoint; g: number; parent: string | null }>();
    const closed = new Set<string>();
    // A heap of node ids (keys indexed in `ids`), ordered by f.
    const open = new Heap();
    const ids: string[] = [];
    const push = (p: GridPoint, g: number, parent: string | null) => {
      const k = tkey(p.tx, p.ty);
      const old = node.get(k);
      if (old && old.g <= g) return;
      node.set(k, { p, g, parent });
      closed.delete(k);
      ids.push(k);
      open.push(g + (Math.abs(p.tx - goal.tx) + Math.abs(p.ty - goal.ty)) * LONG_TRIP_H, ids.length - 1);
    };
    const goalK = tkey(goal.tx, goal.ty);
    // From the start: to each entrance of its block (inside the block).
    const sg = await blockGraph(sB.bx, sB.by);
    const sBounds = boundsOf(sB.bx, sB.by);
    push(start, 0, null);
    for (const e of sg.entrances) {
      const r = searchTiles(grid, start, e, { bounds: sBounds, maxVisits: BLOCK_W * BLOCK_H * 6 });
      if (r) push(e, r.cost, tkey(start.tx, start.ty));
    }
    let expanded = 0;
    while (open.size) {
      const k = ids[open.pop()];
      if (closed.has(k)) continue;
      closed.add(k);
      if (++expanded > 40_000) return null;
      if (k === goalK) break;
      const cur = node.get(k)!;
      const cb = blockOf(cur.p.tx, cur.p.ty);
      const bg = await blockGraph(cb.bx, cb.by);
      // Reaching the goal's block: try the goal itself.
      if (cb.bx === gB.bx && cb.by === gB.by) {
        const r = searchTiles(grid, cur.p, goal, { bounds: boundsOf(gB.bx, gB.by), maxVisits: BLOCK_W * BLOCK_H * 6 });
        if (r) push(goal, cur.g + r.cost, k);
      }
      const i = bg.entrances.findIndex((e) => e.tx === cur.p.tx && e.ty === cur.p.ty);
      if (i >= 0) {
        for (const ed of bg.edges.get(i) ?? []) push(bg.entrances[ed.to], cur.g + ed.cost, k);
        for (const n of across(cur.p)) push(n, cur.g + grid.cost(n.tx, n.ty), k);
      }
    }
    if (!node.has(goalK) || !closed.has(goalK)) return null;
    // Walk back through the hops and fill each in with tiles.
    const hops: GridPoint[] = [];
    for (let k: string | null = goalK; k; k = node.get(k)!.parent) hops.push(node.get(k)!.p);
    hops.reverse();
    const tiles: GridPoint[] = [hops[0]];
    for (let h = 1; h < hops.length; h++) {
      const a = hops[h - 1], b = hops[h];
      if (Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty) === 1) { tiles.push(b); continue; }
      const blk = blockOf(b.tx, b.ty);
      const r = searchTiles(grid, a, b, { bounds: boundsOf(blk.bx, blk.by), maxVisits: BLOCK_W * BLOCK_H * 6 })
        ?? searchTiles(grid, a, b, { maxVisits: 20_000 });
      if (!r) return null;
      tiles.push(...r.tiles.slice(1));
    }
    const straight = straighten(tiles);
    return { tiles: straight, legs: compressToLegs(straight), cost: node.get(goalK)!.g };
  }

  /**
   * Remove the little jogs where a route crosses block borders (entrances
   * aren't always in line with the road): re-search the route in short
   * windows, inside a narrow box around it, and keep what's no worse.
   */
  function straighten(tiles: GridPoint[]): GridPoint[] {
    const out: GridPoint[] = [tiles[0]];
    for (let i = 0; i < tiles.length - 1; i += STRAIGHTEN_WINDOW) {
      const j = Math.min(tiles.length - 1, i + STRAIGHTEN_WINDOW);
      const seg = tiles.slice(i, j + 1);
      let segCost = 0;
      for (let k = 1; k < seg.length; k++) segCost += grid.cost(seg[k].tx, seg[k].ty);
      for (let k = 2; k < seg.length; k++) {
        const a = [seg[k - 1].tx - seg[k - 2].tx, seg[k - 1].ty - seg[k - 2].ty], b = [seg[k].tx - seg[k - 1].tx, seg[k].ty - seg[k - 1].ty];
        if (a[0] !== b[0] || a[1] !== b[1]) segCost += TURN_PENALTY;
      }
      const xs = seg.map((t) => t.tx), ys = seg.map((t) => t.ty);
      const box = { tx0: Math.min(...xs) - 3, ty0: Math.min(...ys) - 3, tx1: Math.max(...xs) + 3, ty1: Math.max(...ys) + 3 };
      const r = searchTiles(grid, seg[0], seg[seg.length - 1], { bounds: box, maxVisits: 20_000 });
      out.push(...(r && r.cost <= segCost ? r.tiles : seg).slice(1));
    }
    return out;
  }

  return {
    /**
     * The best route from `from` to `to` (tiles), or null when there's none.
     * A goal on something solid snaps to the nearest open tile.
     */
    async plan(from: GridPoint, to: GridPoint): Promise<Route | null> {
      for (const p of [from, to]) { const b = blockOf(p.tx, p.ty); await grid.ensureBlock(b.bx, b.by); }
      // Standing against a wall, or a goal on something solid: the nearest open tile.
      const start = nearestWalkable(grid, from, 2);
      const goal = nearestWalkable(grid, to);
      if (!start || !goal) return null;
      from = start;
      if (Math.abs(from.tx - goal.tx) + Math.abs(from.ty - goal.ty) <= SHORT_TRIP) {
        // Load what a short search could touch, then search the tiles.
        const a = blockOf(Math.min(from.tx, goal.tx) - 8, Math.min(from.ty, goal.ty) - 8), b = blockOf(Math.max(from.tx, goal.tx) + 8, Math.max(from.ty, goal.ty) + 8);
        for (let by = a.by; by <= b.by; by++) for (let bx = a.bx; bx <= b.bx; bx++) await grid.ensureBlock(bx, by);
        const r = searchTiles(grid, from, goal, { maxVisits: 30_000 });
        if (r) return { tiles: r.tiles, legs: compressToLegs(r.tiles), cost: r.cost };
      }
      return hierarchical(from, goal);
    },
    /** Forget a block's crossings (and its neighbours': their borders touch it). */
    invalidate(bx: number, by: number): void {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) graphs.delete(bkey(bx + dx, by + dy));
    },
    /** How many block graphs are cached (for tests and debugging). */
    cachedBlocks: () => graphs.size,
  };
}
