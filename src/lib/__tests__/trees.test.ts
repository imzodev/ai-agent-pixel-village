// Choppable terrain trees: tiles map back to their tree, a felled tree
// leaves open ground and a stump, and comes back when un-felled.
import { afterEach, describe, expect, it } from "vitest";
import { setFelledTrees, terrainAt, treeAt } from "@/lib/regions";
import { TREE_HITS, treeChunks, treeFromTile, treeKey, trunkPoint } from "@/lib/trees";

/** The first standing tree found scanning Whisperwood's road edge. */
function someTree(): { vx: number; vy: number } {
  for (let vy = -20; vy <= 30; vy += 2) for (let vx = -250; vx <= -130; vx += 2) if (treeAt(vx, vy)) return { vx, vy };
  throw new Error("no tree found");
}

afterEach(() => setFelledTrees(new Set()));

describe("tree tiles", () => {
  it("every tile of a tree points back at its corner", () => {
    const { vx, vy } = someTree();
    for (const [tx, ty] of [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]]) {
      const c = terrainAt(tx, ty);
      const name = c.lower ?? c.canopy ?? null;
      expect(treeFromTile(name, tx, ty), `${tx},${ty} ${name}`).toMatchObject({ vx, vy });
    }
    expect(treeFromTile("grass_1", 0, 0)).toBeNull();
  });
  it("the trunk tiles block (DecorationLower)", () => {
    const { vx, vy } = someTree();
    expect(terrainAt(vx - 1, vy).lower).toMatch(/^tree_/);
    expect(terrainAt(vx, vy).lower).toMatch(/^tree_/);
    expect(trunkPoint(vx, vy)).toEqual({ x: vx * 16, y: (vy + 1) * 16 - 4 });
  });
});

describe("felling", () => {
  it("a felled tree leaves walkable ground with a stump, until it regrows", () => {
    const { vx, vy } = someTree();
    setFelledTrees(new Set([treeKey(vx, vy)]));
    expect(treeAt(vx, vy)).toBeNull();
    for (const [tx, ty] of [[vx - 1, vy], [vx, vy]]) expect(terrainAt(tx, ty).lower ?? "").not.toMatch(/^tree_/);
    expect(terrainAt(vx, vy).upper).toBe("stump");
    setFelledTrees(new Set());
    expect(treeAt(vx, vy)).not.toBeNull();
  });
  it("lists every chunk the tree touches", () => {
    expect(treeChunks(24, 30)).toEqual(expect.arrayContaining([{ cx: 0, cy: -1 }, { cx: 1, cy: -1 }, { cx: 0, cy: -2 }, { cx: 1, cy: -2 }]));
    expect(treeChunks(10, 6)).toEqual([{ cx: 0, cy: 0 }]);
    expect(TREE_HITS).toBeGreaterThan(1);
  });
});
