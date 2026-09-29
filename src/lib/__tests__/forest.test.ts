// Woodcutting forest: a stable layout inside its chunks with a clear trail,
// and the oak / axe / wood data staying consistent.

import { describe, expect, it } from "vitest";
import { FOREST_TILES, FOREST_TRAIL_TY, forestTrees } from "@/lib/forest";
import { CROP_KINDS } from "@/lib/crops";
import { RECIPES } from "@/lib/recipes";
import { SHOP_STOCK, findBuyer } from "@/lib/trade";

describe("forest layout", () => {
  const trees = forestTrees();

  it("is deterministic and dense enough to be a forest", () => {
    expect(forestTrees()).toEqual(trees);
    expect(trees.length).toBeGreaterThanOrEqual(60);
  });

  it("stays inside the forest chunks and off the trail", () => {
    for (const [tx, ty] of trees) {
      expect(tx).toBeGreaterThanOrEqual(FOREST_TILES.tx0);
      expect(tx).toBeLessThanOrEqual(FOREST_TILES.tx1);
      expect(ty).toBeGreaterThanOrEqual(FOREST_TILES.ty0);
      expect(ty).toBeLessThanOrEqual(FOREST_TILES.ty1);
      expect(ty >= FOREST_TRAIL_TY.ty0 && ty <= FOREST_TRAIL_TY.ty1 + 3).toBe(false);
    }
  });

  it("never stacks two trees on one tile", () => {
    expect(new Set(trees.map(([x, y]) => `${x},${y}`)).size).toBe(trees.length);
  });
});

describe("woodcutting data", () => {
  it("oaks need an axe, regrow, and have a frame per stage", () => {
    const oak = CROP_KINDS.oak_tree;
    expect(oak.needsAxe).toBe(true);
    expect(oak.regrowthMs).toBeGreaterThan(0);
    expect(oak.frames).toHaveLength(oak.stages);
  });

  it("the axe is for sale and wood has a buyer and recipes", () => {
    expect(SHOP_STOCK.shopkeeper.some((t) => t.itemKey === "axe")).toBe(true);
    expect(findBuyer("wood")).not.toBeNull();
    expect(RECIPES.filter((r) => r.inputs.some((i) => i.itemKey === "wood")).length).toBeGreaterThan(0);
  });
});
