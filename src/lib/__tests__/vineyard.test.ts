// Planting: what may go in a home's garden or a field, vineyard or orchard
// parcel, perennials that fruit again, and the winery's steps and recipes.
import { describe, expect, it } from "vitest";
import { CROP_KINDS, GARDEN_CROPS, NODE_SHEETS } from "@/lib/crops";
import { afterPerennialHarvest, fruitStepMs, msToRipe, plantRule, plantablesFor, plotHint, ripeIn, stageMs } from "@/lib/vineyard";
import { BUILD_STEPS, MACHINE_RECIPES } from "@/lib/ranchUpgrades";
import { PROFILES } from "@/lib/mind/profiles";
import { SHOP_STOCK } from "@/lib/trade";

describe("planting", () => {
  it("vines in vineyards, trees in orchards, vegetables in fields and gardens", () => {
    const vine = GARDEN_CROPS.grape_cutting, tree = GARDEN_CROPS.apple_sapling, radish = GARDEN_CROPS.radish_seeds;
    expect(plantRule(vine, "vineyard", 1)).toBeNull();
    expect(plantRule(tree, "orchard", 1)).toBeNull();
    expect(plantRule(tree, "vineyard", 1)).toContain("vineyard");
    expect(plantRule(radish, "vineyard", 1)).toContain("vineyard");
    expect(plantRule(vine, "field", 1)).toContain("vineyard parcel");
    expect(plantRule(tree, "garden", 1)).toContain("orchard parcel");
    expect(plantRule(radish, "field", 1)).toBeNull();
    expect(plantRule(radish, "garden", 1)).toBeNull();
  });
  it("white grapes need farm level 2", () => {
    expect(plantRule(GARDEN_CROPS.white_grape_cutting, "vineyard", 1)).toContain("level 2");
    expect(plantRule(GARDEN_CROPS.white_grape_cutting, "vineyard", 2)).toBeNull();
  });
  it("only offers what grows there", () => {
    const bag = [{ itemKey: "radish_seeds", qty: 2 }, { itemKey: "grape_cutting", qty: 1 }, { itemKey: "apple_sapling", qty: 0 }];
    expect(plantablesFor(["vineyard"], bag, GARDEN_CROPS).map((i) => i.itemKey)).toEqual(["grape_cutting"]);
    expect(plantablesFor(["field"], bag, GARDEN_CROPS).map((i) => i.itemKey)).toEqual(["radish_seeds"]);
    expect(plantablesFor(["field", "vineyard"], bag, GARDEN_CROPS).map((i) => i.itemKey)).toEqual(["radish_seeds", "grape_cutting"]);
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
    for (const [seed, def] of Object.entries(GARDEN_CROPS)) if (def.grows?.includes("vineyard") || seed === "apple_sapling") expect(sold.has(seed), seed).toBe(true);
  });
});

describe("the winery", () => {
  it("its machines are built by the barn, and every barn recipe has its machine", () => {
    const steps = BUILD_STEPS.filter((s) => s.place === "barn").map((s) => s.key);
    for (const k of ["fruit_press", "cellar", "racks", "jam"]) expect(steps).toContain(k);
    for (const r of MACHINE_RECIPES.filter((x) => x.place === "barn")) expect(steps, r.id).toContain(r.machine);
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

describe("plot hints", () => {
  it("tell a vineyard from an orchard and name what grows and who sells it", () => {
    expect(plotHint("vineyard")).toMatch(/trellises.*Pip/);
    expect(plotHint("orchard")).toMatch(/lemon.*banana.*apple.*towns/);
    expect(plotHint("field")).toMatch(/vegetables/);
  });
});

describe("time to ripe", () => {
  it("counts the time to the next stage, then every stage after (a perennial's fruit at its own pace)", () => {
    const radish = CROP_KINDS.radish_crop ?? Object.values(CROP_KINDS).find((c) => !c.perennial && c.stages >= 3)!;
    expect(msToRipe(radish, radish.stages - 1, null, 0)).toBe(0);
    expect(msToRipe(radish, 1, null, 0)).toBeNull();
    expect(msToRipe(radish, radish.stages - 2, 5000, 1000)).toBe(4000);
    expect(msToRipe(radish, 1, 5000, 1000)).toBe(4000 + (radish.stages - 3) * radish.regrowthMs);
    const tree = CROP_KINDS.apple_tree, p = tree.perennial!;
    let rest = 0;
    for (let s = 2; s < tree.stages - 1; s++) rest += s >= p.mature ? fruitStepMs(tree.stages, p) : tree.regrowthMs;
    expect(msToRipe(tree, 1, 0, 0)).toBe(rest);
  });
  it("says it in words", () => {
    expect(ripeIn(0)).toBe("ripe");
    expect(ripeIn(null)).toBe("not growing");
    expect(ripeIn(90_000)).toBe("~2 min");
    expect(ripeIn(80 * 60_000)).toBe("~1 h 20 min");
    expect(ripeIn(120 * 60_000)).toBe("~2 h");
  });
});
