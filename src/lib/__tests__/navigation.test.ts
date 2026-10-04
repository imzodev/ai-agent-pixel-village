// Navigation: turn-penalised A* and the hierarchical router on synthetic
// worlds — mazes, a river with one bridge, roads, unreachable goals.
import { describe, expect, it } from "vitest";
import { searchTiles } from "@/lib/nav/tileSearch";
import { BLOCK_H, BLOCK_W, createRouter } from "@/lib/nav/route";
import type { NavGrid } from "@/types/nav";
import type { GridPoint } from "@/types/world";

/** A grid from a predicate (walkable) and an optional road predicate. */
function world(w: number, h: number, open: (x: number, y: number) => boolean, road: (x: number, y: number) => boolean = () => false): NavGrid {
  return {
    walkable: (x, y) => x >= 0 && y >= 0 && x < w && y < h && open(x, y),
    cost: (x, y) => (road(x, y) ? 6 : 10),
    ensureBlock: async () => {},
  };
}
const turns = (tiles: GridPoint[]) => {
  let n = 0;
  for (let i = 2; i < tiles.length; i++) {
    const a = [tiles[i - 1].tx - tiles[i - 2].tx, tiles[i - 1].ty - tiles[i - 2].ty], b = [tiles[i].tx - tiles[i - 1].tx, tiles[i].ty - tiles[i - 1].ty];
    if (a[0] !== b[0] || a[1] !== b[1]) n++;
  }
  return n;
};
const steps = (tiles: GridPoint[]) => tiles.every((t, i) => i === 0 || Math.abs(t.tx - tiles[i - 1].tx) + Math.abs(t.ty - tiles[i - 1].ty) === 1);

describe("tile search", () => {
  it("walks open ground in at most one turn", () => {
    const g = world(40, 40, () => true);
    const r = searchTiles(g, { tx: 2, ty: 2 }, { tx: 30, ty: 25 })!;
    expect(r.tiles.length).toBe(28 + 23 + 1);
    expect(turns(r.tiles)).toBeLessThanOrEqual(1); // one long L, not a staircase
  });
  it("finds the way through a maze, and never steps on walls", () => {
    // Walls every 4 columns, with a gap alternating top / bottom.
    const open = (x: number, y: number) => x % 4 !== 2 || (Math.floor(x / 4) % 2 ? y === 1 : y === 18);
    const g = world(40, 20, open);
    const r = searchTiles(g, { tx: 0, ty: 0 }, { tx: 39, ty: 0 })!;
    expect(r).not.toBeNull();
    expect(steps(r.tiles)).toBe(true);
    for (const t of r.tiles) expect(open(t.tx, t.ty), `${t.tx},${t.ty}`).toBe(true);
  });
  it("prefers the road when it isn't much longer", () => {
    const g = world(30, 20, () => true, (_x, y) => y === 10);
    const r = searchTiles(g, { tx: 0, ty: 9 }, { tx: 29, ty: 9 })!;
    const onRoad = r.tiles.filter((t) => t.ty === 10).length;
    expect(onRoad).toBeGreaterThan(20);
  });
  it("gives up on an unreachable goal", () => {
    const g = world(20, 20, (x) => x !== 10);
    expect(searchTiles(g, { tx: 0, ty: 0 }, { tx: 19, ty: 0 })).toBeNull();
  });
});

describe("router (hierarchical)", () => {
  // A river across the world with one bridge, and a long trip over it.
  const W = BLOCK_W * 12, H = BLOCK_H * 10;
  const bridge = (x: number) => x >= 200 && x <= 202;
  const river = (x: number, y: number) => y >= 70 && y <= 74 && !bridge(x);
  const g = world(W, H, (x, y) => !river(x, y) && !(x % 37 === 0 && y % 23 < 18));
  it("crosses the river by the only bridge, on a long trip", async () => {
    const router = createRouter(g);
    const r = (await router.plan({ tx: 5, ty: 5 }, { tx: 20, ty: 140 }))!;
    expect(r).not.toBeNull();
    expect(steps(r.tiles)).toBe(true);
    const crossing = r.tiles.filter((t) => t.ty === 72);
    expect(crossing.every((t) => bridge(t.tx))).toBe(true);
    expect(r.tiles.at(-1)).toEqual({ tx: 20, ty: 140 });
  });
  it("is close to the best possible route", async () => {
    const router = createRouter(g);
    for (const [a, b] of [[{ tx: 3, ty: 3 }, { tx: 270, ty: 140 }], [{ tx: 250, ty: 10 }, { tx: 10, ty: 120 }]] as const) {
      const r = (await router.plan(a, b))!;
      const best = searchTiles(g, a, b, { maxVisits: 2_000_000 })!;
      expect(r.cost).toBeLessThanOrEqual(best.cost * 1.15);
    }
  });
  it("snaps a goal inside something solid to the nearest open tile; none when cut off", async () => {
    const router = createRouter(g);
    const r = (await router.plan({ tx: 5, ty: 5 }, { tx: 37, ty: 5 }))!; // a wall tile
    expect(g.walkable(r.tiles.at(-1)!.tx, r.tiles.at(-1)!.ty)).toBe(true);
    const island = world(100, 100, (x) => x < 40 || x > 60);
    expect(await createRouter(island).plan({ tx: 5, ty: 5 }, { tx: 90, ty: 90 })).toBeNull();
  });
  it("is quick across a big world once warm", async () => {
    const router = createRouter(g);
    await router.plan({ tx: 2, ty: 2 }, { tx: 280, ty: 145 });
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) await router.plan({ tx: 2 + i, ty: 2 }, { tx: 280, ty: 145 - i });
    expect((performance.now() - t0) / 5).toBeLessThan(150);
  });
});

describe("router caches", () => {
  it("re-plans around a change once its block is forgotten", async () => {
    let wall = false;
    const g = world(BLOCK_W * 6, BLOCK_H * 3, (x, y) => !(wall && x === 70 && y >= 0 && y < 40));
    const router = createRouter(g);
    const a = (await router.plan({ tx: 2, ty: 20 }, { tx: 140, ty: 20 }))!;
    expect(a.tiles.some((t) => t.tx === 70 && t.ty < 40)).toBe(true); // straight across, where the wall will be
    wall = true; // a wall goes up across the middle (rows 0–39)
    router.invalidate(Math.floor(70 / BLOCK_W), 0);
    router.invalidate(Math.floor(70 / BLOCK_W), 1);
    router.invalidate(Math.floor(70 / BLOCK_W), 2);
    const b = (await router.plan({ tx: 2, ty: 20 }, { tx: 140, ty: 20 }))!;
    expect(b.tiles.every((t) => !(t.tx === 70 && t.ty < 40))).toBe(true); // around the end of the wall
  });
});
