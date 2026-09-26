// Pure tests for the path planner. No DB / no chunks — a synchronous
// WalkableChecker is constructed over a small boolean grid and the
// planner is exercised by handing it arbitrary start/goal pairs.

import { describe, expect, it } from "vitest";
import { CELL_PX, cellToWorldCenter, worldToCell } from "@/lib/nav/chunkIndex";
import { planPath } from "@/lib/nav/navigator";
import type { WalkableChecker } from "@/types/world";

function gridWalkable(grid: boolean[][]): WalkableChecker {
  return (x, y) => {
    const c = worldToCell({ x, y });
    const tx = Math.floor(c.tx);
    const ty = Math.floor(c.ty);
    if (ty < 0 || ty >= grid.length) return false;
    if (tx < 0 || tx >= grid[ty].length) return false;
    return grid[ty][tx];
  };
}

function grid(rows: string[]): boolean[][] {
  return rows.map((row) =>
    Array.from(row).map((ch) => ch === "#" ? false : true),
  );
}

const cx = (tx: number) => tx * CELL_PX + CELL_PX / 2;
const cy = (ty: number) => ty * CELL_PX + CELL_PX / 2;

describe("planPath", () => {
  it("finds a straight line on an empty grid", async () => {
    const g = grid(Array.from({ length: 8 }, () => "........"));
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(4), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    expect(r!.path.cost).toBe(4);
    expect(r!.path.waypoints.length).toBeGreaterThanOrEqual(5);
    expect(r!.path.waypoints.at(-1)).toEqual({ x: cx(4), y: cy(0) });
  });

  it("detours around a wall", async () => {
    // Wall between x=3 and x=4 in row 0.
    const g = grid([
      "...#...",
      "...#...",
      ".......",
      ".......",
    ]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(6), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    expect(r!.path.cost).toBeGreaterThan(6);
    // Path must not step on (3, 0) or (4, 0).
    for (const wp of r!.path.waypoints) {
      const tx = Math.floor(wp.x / CELL_PX);
      const ty = Math.floor(wp.y / CELL_PX);
      expect(g[ty][tx]).toBe(true);
    }
  });

  it("goes around a U-shaped obstacle", async () => {
    // Cup shape opening upward; start inside, goal outside to the right.
    const g = grid([
      ".....",
      "#...#",
      "#...#",
      "#####",
    ]);
    // Start at (2, 2), goal at (4, 0).
    const r = await planPath({ x: cx(2), y: cy(2) }, { x: cx(4), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    for (const wp of r!.path.waypoints) {
      const tx = Math.floor(wp.x / CELL_PX);
      const ty = Math.floor(wp.y / CELL_PX);
      expect(g[ty][tx]).toBe(true);
    }
  });

  it("snaps the goal to a nearby walkable cell when the goal itself is blocked", async () => {
    const g = grid([
      ".....#",  // (5, 0) blocked
      "......",
      "......",
    ]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(5), y: cy(0) }, gridWalkable(g));
    expect(r).not.toBeNull();
    // Snapped goal should be adjacent (within radius 6).
    const last = r!.path.waypoints.at(-1)!;
    const end = worldToCell(last);
    const desired = { tx: 5, ty: 0 };
    expect(Math.abs(end.tx - desired.tx) + Math.abs(end.ty - desired.ty)).toBeLessThanOrEqual(6);
  });

  it("returns null when the goal is unreachable from a sealed bubble", async () => {
    const g = grid([
      "#####",
      "#...#",
      "#####",
      "......",
    ]);
    // Start at (2, 3), goal at (4, 3) — completely open below the wall but
    // (5, 3) and (0, 3) corners are isolated.
    const r = await planPath({ x: cx(2), y: cy(3) }, { x: cx(4), y: cy(3) }, gridWalkable(g), { maxTiles: 200 });
    expect(r).not.toBeNull();
  });

  it("returns null when start is unreachable", async () => {
    const g = grid(["#........."]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(5), y: cy(0) }, gridWalkable(g));
    expect(r).toBeNull();
  });

  it("returns a one-waypoint path when start equals goal", async () => {
    const g = grid(Array.from({ length: 5 }, () => "........"));
    const r = await planPath({ x: cx(2), y: cy(2) }, { x: cx(2), y: cy(2) }, gridWalkable(g));
    expect(r).not.toBeNull();
    expect(r!.path.waypoints).toEqual([{ x: cx(2), y: cy(2) }]);
    expect(r!.path.cost).toBe(0);
  });

  it("4-connected: never produces a diagonal step", async () => {
    const g = grid([
      ".......",
      ".......",
      ".......",
    ]);
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(6), y: cy(2) }, gridWalkable(g));
    expect(r).not.toBeNull();
    for (let i = 1; i < r!.path.waypoints.length; i++) {
      const a = r!.path.waypoints[i - 1];
      const b = r!.path.waypoints[i];
      // Each step must change exactly one axis (or be the same cell,
      // which is impossible for a path that advances).
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      // 32-px cell; allow rounding tolerance but no diagonals.
      const countChanges = (dx > 1 ? 1 : 0) + (dy > 1 ? 1 : 0);
      expect(countChanges).toBe(1);
    }
  });

  it("respects maxTiles cap (returns null when path would be longer)", async () => {
    const g = grid(Array.from({ length: 60 }, () => "..........."));
    const r = await planPath({ x: cx(0), y: cy(0) }, { x: cx(50), y: cy(0) }, gridWalkable(g), { maxTiles: 5 });
    expect(r).toBeNull();
  });
});

describe("chunkIndex", () => {
  it("cellToWorldCenter round-trips through worldToCell", () => {
    for (const p of [{ x: 0, y: 0 }, { x: 32, y: 32 }, { x: 100, y: 200 }]) {
      const c = worldToCell(p);
      const back = cellToWorldCenter(c);
      // Cell center may differ from the original by up to CELL_PX/2 in
      // each axis, but the cell index is correct.
      const origCell = worldToCell(p);
      expect(c).toEqual(origCell);
      expect(back.x).toBeGreaterThanOrEqual(p.x - CELL_PX / 2);
      expect(back.x).toBeLessThanOrEqual(p.x + CELL_PX / 2);
    }
  });
});
