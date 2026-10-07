// Vineyards: the lot's plots (vines left, trees right), what may be planted
// where, perennials that fruit again, and the winery's steps and recipes.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CROP_KINDS, GARDEN_CROPS, NODE_SHEETS } from "@/lib/crops";
import { afterPerennialHarvest, fruitStepMs, plantRule, plantablesFor, stageMs, vineyardSlot } from "@/lib/vineyard";
import { BUILD_STEPS, MACHINE_RECIPES } from "@/lib/ranchUpgrades";
import { PROFILES } from "@/lib/mind/profiles";
import { SHOP_STOCK } from "@/lib/trade";
import { gardenCellsOf } from "@/lib/buildingManifest";

const template = JSON.parse(fs.readFileSync("public/buildings/vineyard_lot.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: { key: string; kind: string; tx: number; ty: number; file: string }[] };

describe("the vineyard lot", () => {
  it("has 20 vine plots and 2 tree plots", () => {
    const cells = gardenCellsOf(template);
    expect(cells.filter((c) => vineyardSlot(c) === "vine")).toHaveLength(20);
    expect(cells.filter((c) => vineyardSlot(c) === "tree")).toHaveLength(2);
  });
  it("11 lots in a row south of the ranches", () => {
    // The first row (more open later in the homesteads: lotDistricts.test.ts).
    const first = (kind: string) => manifest.buildings.filter((b) => b.kind === kind && (b as { row?: string }).row === `${kind}_0`);
    const v = first("vineyard");
    expect(v).toHaveLength(11);
    for (const b of v) { expect(b.ty).toBe(90); expect(b.file).toBe("/buildings/vineyard_lot.json"); }
    const ranches = first("ranch");
    expect(Math.max(...ranches.map((r) => r.ty)) + 15).toBeLessThanOrEqual(90); // no overlap with the ranch row
  });
});

describe("planting", () => {
  it("vines on trellises, trees in the orchard, vegetables in fields", () => {
    const vine = GARDEN_CROPS.grape_cutting, tree = GARDEN_CROPS.apple_sapling, radish = GARDEN_CROPS.radish_seeds;
    expect(plantRule(vine, "vineyard", "vine", 1)).toBeNull();
    expect(plantRule(vine, "vineyard", "tree", 1)).toContain("trellises");
    expect(plantRule(tree, "vineyard", "vine", 1)).toContain("orchard");
    expect(plantRule(radish, "vineyard", "vine", 1)).toContain("vineyard");
    expect(plantRule(vine, "land", null, 1)).toContain("vineyard");
    expect(plantRule(radish, "land", null, 1)).toBeNull();
  });
  it("white grapes need vineyard level 2", () => {
    expect(plantRule(GARDEN_CROPS.white_grape_cutting, "vineyard", "vine", 1)).toContain("level 2");
    expect(plantRule(GARDEN_CROPS.white_grape_cutting, "vineyard", "vine", 2)).toBeNull();
  });
  it("only offers what grows in the lot", () => {
    const bag = [{ itemKey: "radish_seeds", qty: 2 }, { itemKey: "grape_cutting", qty: 1 }, { itemKey: "apple_sapling", qty: 0 }];
    expect(plantablesFor("vineyard", bag, GARDEN_CROPS).map((i) => i.itemKey)).toEqual(["grape_cutting"]);
    expect(plantablesFor("land", bag, GARDEN_CROPS).map((i) => i.itemKey)).toEqual(["radish_seeds"]);
  });
  it("perennials fruit again: back to mature after a harvest", () => {
    for (const k of ["red_vine", "white_vine", "apple_tree"]) {
      const c = CROP_KINDS[k];
      const p = c.perennial!;
      expect(p, k).toBeDefined();
      expect(c.frames).toHaveLength(c.stages);
      expect(NODE_SHEETS[c.sheet!], c.sheet).toBeDefined();
      expect(p.mature).toBeLessThan(c.stages - 1);
      expect(afterPerennialHarvest(c.stages, p, 1000)).toEqual({ stage: p.mature, nextAdvanceAt: 1000 + fruitStepMs(c.stages, p) });
    }
  });
  it("growth takes regrowthMs a stage; the fruit ripens in fruitMs over its stages", () => {
    const c = CROP_KINDS.apple_tree, p = c.perennial!;
    expect(stageMs(c, 2)).toBe(c.regrowthMs);
    expect(stageMs(c, p.mature)).toBe(fruitStepMs(c.stages, p));
    let ripen = 0;
    for (let s = p.mature + 1; s < c.stages; s++) ripen += stageMs(c, s);
    expect(Math.abs(ripen - p.fruitMs)).toBeLessThan(c.stages); // rounding only
  });
  it("the LPC fruit trees stand on their trunk (ground line inside the 96×128 cell)", () => {
    const c = CROP_KINDS.apple_tree;
    expect(c.frames.every((f) => f.w === 96 && f.h === 128)).toBe(true);
    expect(c.baseY).toBeGreaterThan(100);
    expect(c.baseY).toBeLessThan(128);
  });
  it("Pip sells every cutting and sapling", () => {
    const sold = new Set(SHOP_STOCK.village_pip.map((t) => t.itemKey));
    for (const [seed, def] of Object.entries(GARDEN_CROPS)) if (def.lots?.includes("vineyard")) expect(sold.has(seed), seed).toBe(true);
  });
});

describe("the winery", () => {
  it("vineyard steps and recipes are separate from the ranch's", () => {
    const steps = BUILD_STEPS.filter((s) => s.lot === "vineyard").map((s) => s.key);
    expect(steps).toEqual(["fruit_press", "cellar", "racks", "jam"]);
    for (const r of MACHINE_RECIPES.filter((x) => x.lot === "vineyard")) expect(steps, r.id).toContain(r.machine);
    expect(BUILD_STEPS.find((s) => s.key === "racks")?.needs).toBe("cellar");
  });
  it("aging turns a bottle into an aged one", () => {
    expect(MACHINE_RECIPES.find((r) => r.id === "age_red")).toMatchObject({ inputs: { red_wine: 1 }, output: "aged_red_wine" });
  });
  it("Marigold bakes apple pies and orders apples and jam", () => {
    const b = PROFILES.baker;
    expect(b.crafts.bake_pies.uses.apple).toBeGreaterThan(0);
    expect(b.orders.apple && b.orders.jam).toBeTruthy();
    expect(SHOP_STOCK.village_marigold.some((t) => t.itemKey === "apple_pie")).toBe(true);
  });
});
