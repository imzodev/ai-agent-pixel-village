// Exact-tile wander picker and goal-move planning, on synthetic grids.

import { describe, expect, it } from "vitest";
import { leashAround, leashOfRect, pickWanderMove, planGoalMove } from "@/lib/wander";
import { tileOf } from "@/lib/motion";
import type { GridPoint } from "@/types/world";
import type { WanderPick } from "@/types/motion";

const T = 16;

/** '#' = blocked. Row 0 is ty = 0. Outside the grid is blocked. */
function gridWalkable(rows: string[]): (x: number, y: number) => boolean {
  return (x, y) => {
    const { tx, ty } = tileOf(x, y);
    return ty >= 0 && ty < rows.length && tx >= 0 && tx < rows[ty].length && rows[ty][tx] !== "#";
  };
}

/** Deterministic rng cycling through the given values. */
function seq(...vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length];
}

const open9 = Array.from({ length: 9 }, () => ".........");

async function allPicks(from: GridPoint, walk: (x: number, y: number) => boolean, opts: Parameters<typeof pickWanderMove>[2]): Promise<WanderPick[]> {
  const out = new Map<string, WanderPick>();
  for (let i = 0; i < 200; i++) {
    const p = await pickWanderMove(from, walk, { ...opts, rng: seq((i + 0.5) / 200) });
    if (p) out.set(`${p.dir}${p.tiles}`, p);
  }
  return [...out.values()];
}

describe("pickWanderMove", () => {
  it("always walks an exact whole number of tiles in one cardinal direction", async () => {
    const picks = await allPicks({ tx: 4, ty: 4 }, gridWalkable(open9), { minTiles: 1, maxTiles: 4, leash: null });
    expect(picks).toHaveLength(16); // 4 directions × 1..4 tiles
    for (const p of picks) {
      const dx = p.to.tx - 4;
      const dy = p.to.ty - 4;
      expect(dx === 0 || dy === 0).toBe(true);
      expect(Math.abs(dx) + Math.abs(dy)).toBe(p.tiles);
      expect(Number.isInteger(p.tiles)).toBe(true);
      expect(p.tiles).toBeGreaterThanOrEqual(1);
      expect(p.tiles).toBeLessThanOrEqual(4);
    }
  });

  it("offers every length 1..10 on open ground when maxTiles is 10", async () => {
    const open25 = Array.from({ length: 25 }, () => ".".repeat(25));
    const picks = await allPicks({ tx: 12, ty: 12 }, gridWalkable(open25), { minTiles: 1, maxTiles: 10, leash: leashAround({ x: 12 * T + 8, y: 12 * T + 8 }, 10) });
    expect(new Set(picks.map((p) => p.tiles))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(picks).toHaveLength(40);
  });

  it("never passes through a blocked tile", async () => {
    const rows = [
      ".........",
      ".........",
      ".........",
      "....#....", // wall 1 tile north
      "..#......", // wall 2 tiles west
      ".........",
      ".........",
      ".........",
      ".........",
    ];
    const picks = await allPicks({ tx: 4, ty: 4 }, gridWalkable(rows), { minTiles: 1, maxTiles: 4, leash: null });
    expect(picks.some((p) => p.dir === "N")).toBe(false);
    expect(picks.filter((p) => p.dir === "W").map((p) => p.tiles)).toEqual([1]);
    expect(picks.filter((p) => p.dir === "E").map((p) => p.tiles).sort()).toEqual([1, 2, 3, 4]);
  });

  it("respects minTiles", async () => {
    const picks = await allPicks({ tx: 4, ty: 4 }, gridWalkable(open9), { minTiles: 3, maxTiles: 4, leash: null });
    expect(picks.every((p) => p.tiles >= 3)).toBe(true);
  });

  it("stays inside the leash", async () => {
    const leash = leashAround({ x: 4 * T + 8, y: 4 * T + 8 }, 2);
    const picks = await allPicks({ tx: 4, ty: 4 }, gridWalkable(open9), { minTiles: 1, maxTiles: 4, leash });
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) expect(p.tiles).toBeLessThanOrEqual(2);
  });

  it("lets an entity outside its leash walk back toward it, but not further away", async () => {
    const leash = { minTx: 0, maxTx: 1, minTy: 0, maxTy: 8 };
    const picks = await allPicks({ tx: 6, ty: 4 }, gridWalkable(open9), { minTiles: 1, maxTiles: 4, leash });
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p) => p.dir === "W")).toBe(true);
  });

  it("returns null when boxed in", async () => {
    const rows = ["###", "#.#", "###"];
    expect(await pickWanderMove({ tx: 1, ty: 1 }, gridWalkable(rows), { minTiles: 1, maxTiles: 4, leash: null })).toBeNull();
  });

  it("works with an async walkability oracle (the server one is async)", async () => {
    const sync = gridWalkable(open9);
    const p = await pickWanderMove({ tx: 4, ty: 4 }, async (x, y) => sync(x, y), { minTiles: 1, maxTiles: 4, leash: null, rng: () => 0 });
    expect(p).not.toBeNull();
  });
});

describe("leashOfRect", () => {
  it("covers the tiles of a pixel rectangle", () => {
    expect(leashOfRect({ x: 32, y: 48, w: 64, h: 32 })).toEqual({ minTx: 2, maxTx: 5, minTy: 3, maxTy: 4 });
  });
});

describe("planGoalMove", () => {
  it("returns axis-aligned legs from the origin tile to the goal tile", async () => {
    // One spare column: the A* planner samples foot-box corners, which
    // reach half a tile past the goal tile.
    const rows = [
      ".......",
      ".####..",
      ".......",
    ];
    const path = await planGoalMove({ tx: 0, ty: 2 }, { x: 5 * T + 8, y: 0 * T + 8 }, gridWalkable(rows));
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ tx: 0, ty: 2 });
    expect(path!.at(-1)).toEqual({ tx: 5, ty: 0 });
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1];
      const b = path![i];
      expect(a.tx === b.tx || a.ty === b.ty).toBe(true);
    }
  });
});
