// Move choosers for NPCs, animals and enemies.
//
// - `pickWanderMove`: one straight N/S/E/W walk of an EXACT whole number
//   of tiles, never through a blocked tile and never out of the leash.
// - `planGoalMove`: an A*-planned walk to a target (fox raid, remote
//   agent), compressed into axis-aligned legs.
//
// Both only choose a path; turning it into a timed `Move` (start beat,
// speed) is the caller's job. Tunables live in `src/lib/constants.ts`.

import { planPath } from "./nav/navigator";
import { PLANNER_MAX_TILES_DEFAULT, PLANNER_MAX_TILES_EGG_PICK } from "./constants";
import { compressToLegs, tileCenter, tileOf } from "./motion";
import type { GridPoint, Point, WalkableChecker } from "@/types/world";
import type { CardinalDir, EggCandidate, TileLeash, WanderOptions, WanderPick } from "@/types/motion";

const DIRS: ReadonlyArray<{ dir: CardinalDir; dtx: number; dty: number }> = [
  { dir: "N", dtx: 0, dty: -1 },
  { dir: "S", dtx: 0, dty: 1 },
  { dir: "E", dtx: 1, dty: 0 },
  { dir: "W", dtx: -1, dty: 0 },
];

/** Tile distance from `t` to the leash rectangle (0 when inside). */
function leashDistance(t: GridPoint, leash: TileLeash): number {
  const dx = t.tx < leash.minTx ? leash.minTx - t.tx : t.tx > leash.maxTx ? t.tx - leash.maxTx : 0;
  const dy = t.ty < leash.minTy ? leash.minTy - t.ty : t.ty > leash.maxTy ? t.ty - leash.maxTy : 0;
  return dx + dy;
}

/** Leash rectangle `radius` tiles around the tile containing `home`. */
export function leashAround(home: Point, radius: number): TileLeash {
  const c = tileOf(home.x, home.y);
  return { minTx: c.tx - radius, maxTx: c.tx + radius, minTy: c.ty - radius, maxTy: c.ty + radius };
}

/** Leash rectangle covering a world-pixel rect (animal / enemy zone). */
export function leashOfRect(r: { x: number; y: number; w: number; h: number }): TileLeash {
  const a = tileOf(r.x, r.y);
  const b = tileOf(r.x + r.w - 1, r.y + r.h - 1);
  return { minTx: a.tx, maxTx: b.tx, minTy: a.ty, maxTy: b.ty };
}

/**
 * Pick a wander move from tile `from`. For each cardinal direction we
 * scan outward up to `maxTiles` and stop at the first tile that is
 * blocked or would leave the leash. Every (direction, length) pair with
 * `minTiles <= length <= free run` is a candidate; one is chosen
 * uniformly. Returns null when boxed in (the entity idles this turn).
 */
export async function pickWanderMove(
  from: GridPoint,
  isWalkable: WalkableChecker,
  opts: WanderOptions,
): Promise<WanderPick | null> {
  const rng = opts.rng ?? Math.random;
  const candidates: WanderPick[] = [];
  for (const d of DIRS) {
    let prevLeash = opts.leash ? leashDistance(from, opts.leash) : 0;
    for (let n = 1; n <= opts.maxTiles; n++) {
      const t = { tx: from.tx + d.dtx * n, ty: from.ty + d.dty * n };
      if (opts.leash) {
        const dist = leashDistance(t, opts.leash);
        if (dist > 0 && dist >= prevLeash) break;
        prevLeash = dist;
      }
      const c = tileCenter(t);
      if (!(await isWalkable(c.x, c.y))) break;
      if (n >= opts.minTiles) candidates.push({ dir: d.dir, tiles: n, to: t });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
}

/**
 * Plan a goal walk from tile `from` to world point `to`. Returns the
 * axis-aligned leg path (first point = `from`), or null when the
 * planner can't reach it.
 */
export async function planGoalMove(
  from: GridPoint,
  to: Point,
  isWalkable: WalkableChecker,
  maxTiles = PLANNER_MAX_TILES_DEFAULT,
): Promise<GridPoint[] | null> {
  const plan = await planPath(tileCenter(from), to, isWalkable, { maxTiles });
  if (!plan) return null;
  const tiles = [from, ...plan.waypoints.slice(1).map((p) => tileOf(p.x, p.y))];
  const legs = compressToLegs(tiles);
  return legs.length >= 2 ? legs : null;
}

/**
 * Pick the egg the fox should target — closest by walkable path, not
 * straight-line distance, so it never commits to an egg behind a wall.
 * Returns null when no egg is reachable.
 */
export async function pickClosestEggByWalkablePath(
  from: Point,
  eggs: readonly EggCandidate[],
  isWalkable: WalkableChecker,
): Promise<EggCandidate | null> {
  let best: EggCandidate | null = null;
  let bestCost = Infinity;
  for (const egg of eggs) {
    const path = await planPath(from, { x: egg.x, y: egg.y }, isWalkable, {
      maxTiles: PLANNER_MAX_TILES_EGG_PICK,
    });
    if (!path) continue;
    if (path.cost < bestCost) {
      bestCost = path.cost;
      best = egg;
    }
  }
  return best;
}
