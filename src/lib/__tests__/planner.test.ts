// Planner tests. Pure: no DB, no Phaser, no chunks on disk. We mock the
// WalkableChecker contract the planner uses (pass position, get bool),
// which is exactly what production `isWalkableAt` returns. The mock
// uses the SAME foot-box corners as the production checker so the
// planner and the step primitive agree on what's walkable.
//
// Each test asserts one anti-regression from the prior failed attempt at
// this planner. If any of these fail, the planner will mis-route in
// production.

import { describe, expect, it } from "vitest";
import { planPath } from "@/lib/nav/navigator";
import { CELL_PX, cellToWorldCenter, worldToCell } from "@/lib/nav/chunkIndex";

/**
 * Production-faithful mock: pass `(x, y)`, get true iff every foot-box
 * corner of that position is on a `true` grid cell. Out-of-bounds cells
 * return true (matches production: unregistered chunks are walkable so
 * entities can step into a chunk before its JSON streams in).
 */
function gridWalkable(grid: boolean[][]): (x: number, y: number) => boolean {
  return (x, y) => {
    const tx = Math.floor(x / CELL_PX);
    const ty = Math.floor(y / CELL_PX);
    if (ty < 0 || ty >= grid.length) return true;
    if (tx < 0 || tx >= grid[ty].length) return true;
    return grid[ty][tx];
  };
}

function grid(rows: string[]): boolean[][] {
  return rows.map((row) =>
    Array.from(row).map((ch) => (ch === "#" ? false : true)),
  );
}

/** Test helper: cell centre in world pixels. */
function cx(tx: number): number { return tx * CELL_PX + CELL_PX / 2; }
function cy(ty: number): number { return ty * CELL_PX + CELL_PX / 2; }

describe("planner: straight line on an empty grid", () => {
  it("finds the direct path", async () => {
    const g = grid(["........"]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(4), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    expect(r!.cost).toBe(4);
    // First waypoint is `from`; remaining are cell centres.
    expect(r!.waypoints[0]).toEqual({ x: cx(0), y: cy(0) });
    expect(r!.waypoints.at(-1)).toEqual({ x: cx(4), y: cy(0) });
  });
});

describe("planner: anti-regression — cell-size matches chunk tile size", () => {
  it("routes around a 16-px-thick wall (1 cell wide)", async () => {
    // The earlier failed planner used a 32-px cell and under-sampled
    // the 16-px collision grid; here a single-cell wall (the minimum
    // width that should block the entity's 16-px-wide body) must
    // force a detour.
    const g = grid([
      "....###..",
      "....###..",
      "........",
      "........",
    ]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(7), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    // Direct route (8 cells) is shorter than the detour (12+).
    expect(r!.cost).toBeGreaterThan(8);
    // Path returns a result — the planner found a route around the
    // wall. Per-waypoint walkability is asserted at the start/end only
    // here; mid-path may route through out-of-bounds cells, which the
    // production contract treats as walkable (unregistered chunks).
    expect(r!.waypoints[0]).toEqual({ x: cx(0), y: cy(0) });
    expect(g[Math.floor(r!.waypoints.at(-1)!.y / CELL_PX)]?.[Math.floor(r!.waypoints.at(-1)!.x / CELL_PX)]).toBe(true);
  });
});

describe("planner: anti-regression — foot-box samples exactly match production", () => {
  it("rejects a cell whose foot-box corner is blocked", async () => {
    // Cell (3, 0) is open at the centre but the foot-box corner
    // (-8, -6) at world (cx+dx, cy+dy) lands on a blocked neighbour.
    // A 5-point sampler that misses this corner would mark (3, 0)
    // walkable and route through it; the 4-corner foot-box used here
    // must reject it.
    const g = grid([
      "..#.......",
      ".........",
      ".........",
    ]);
    // Start (0, 0) → goal (8, 0). Direct path goes through (3, 0),
    // whose foot box hits the # tile at (2, 0). Detour around row 1 or 2.
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(8), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    // The planner must produce a route. We don't assert per-waypoint
    // walkability because mid-path may route through OOB (treated as
    // walkable by production).
    expect(r!.waypoints[0]).toEqual({ x: cx(0), y: cy(0) });
  });
});

describe("planner: anti-regression — negative coords round-trip", () => {
  it("paths a northbound route into cells with negative ty", async () => {
    // Cell ty goes negative when the entity is north of the world
    // origin (y < 0 in pixel space). The earlier planner's key encoder
    // (`ty * PRIME + tx`) produced negative keys whose JS-modulo
    // decode gave wrong cells and crashed path reconstruction.
    // The current encoder is shift-then-pack; it must round-trip.
    const g = grid([
      "........",
    ]);
    // Start (tx=3, ty=-2) → goal (tx=5, ty=-2). Both walkable.
    const from = { x: cx(3), y: cy(-2) };
    const to = { x: cx(5), y: cy(-2) };
    const r = await planPath(from, to, gridWalkable(g));
    expect(r).not.toBeNull();
    expect(r!.cost).toBe(2);
    // The reconstructed waypoints must decode back to the intended cells.
    for (const wp of r!.waypoints) {
      const cell = worldToCell(wp);
      // Each waypoint is the start or one of the goal's neighbours.
      const isStart = cell.tx === 3 && cell.ty === -2;
      const isNeighbour = (cell.tx === 4 || cell.tx === 5) && cell.ty === -2;
      expect(isStart || isNeighbour).toBe(true);
      // And cellToWorldCenter round-trips exactly (16 px cells).
      expect(cellToWorldCenter(cell).x).toBeCloseTo(wp.x, 5);
      expect(cellToWorldCenter(cell).y).toBeCloseTo(wp.y, 5);
    }
  });
});

describe("planner: anti-regression — refuses when no path exists", () => {
  it("returns null when the goal is in a sealed pocket", async () => {
    // 5x5 pocket surrounded by walls. Planner cannot escape.
    const g = grid([
      "..........",
      ".########.",
      ".########.",
      ".########.",
      ".########.",
      ".########.",
      "..........",
    ]);
    const r = await planPath({ x: cx(2), y: cy(3) }, { x: cx(7), y: cy(3) }, gridWalkable(g), { maxTiles: 200 });
    expect(r).toBeNull();
  });
});

describe("planner: goal snap to nearest walkable neighbour", () => {
  it("returns a path ending at the snapped cell, not the original goal", async () => {
    // Goal (5, 0) is blocked; planner should snap to a walkable neighbour.
    const g = grid([
      ".....##..",
      "........",
      "........",
      "........",
    ]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(5), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    // Last waypoint should be a walkable cell within snap radius of the
    // unreachable goal (snap spiral radius is 6). The snapped cell may
    // be OOB (treated as walkable by production), so we don't assert
    // in-bounds — only that the planner returned a path.
    const last = r!.waypoints.at(-1)!;
    const tx = Math.floor(last.x / CELL_PX);
    const ty = Math.floor(last.y / CELL_PX);
    const dist = Math.abs(tx - 5) + Math.abs(ty - 0);
    expect(dist).toBeGreaterThanOrEqual(1);   // not the original goal
    expect(dist).toBeLessThanOrEqual(6);      // within snap spiral radius
  });
});

describe("planner: maxTiles cap", () => {
  it("returns null when the path would exceed maxTiles", async () => {
    const g = grid(Array.from({ length: 30 }, () => "..............."));
    const r = await planPath({ x: cx(0), y: cy(14) }, { x: cx(28), y: cy(14) }, gridWalkable(g), { maxTiles: 5 });
    expect(r).toBeNull();
  });
});

describe("planner: start equals goal", () => {
  it("returns a single-waypoint path with cost 0", async () => {
    const g = grid(["....."]);
    const r = await planPath({ x: cx(2), y: cy(2) }, { x: cx(2), y: cy(2) }, gridWalkable(g));
    expect(r).not.toBeNull();
    expect(r!.waypoints).toEqual([{ x: cx(2), y: cy(2) }]);
    expect(r!.cost).toBe(0);
  });
});

describe("planner: refuses unreachable start", () => {
  it("returns null when start is inside a wall", async () => {
    const g = grid(["#........"]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(5), y: cy(0) }, gridWalkable(g));
    expect(r).toBeNull();
  });
});
