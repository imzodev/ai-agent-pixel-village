// Orchards: the LPC fruit trees beyond the apple, their saplings from the
// towns that grow them, what the fruit becomes and who buys it.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CROP_KINDS, GARDEN_CROPS } from "@/lib/crops";
import { ORCHARD_FRUITS, ORCHARD_PRODUCTS } from "@/lib/orchard";
import { SHOP_STOCK, findBuyer } from "@/lib/trade";
import { MACHINE_RECIPES } from "@/lib/ranchUpgrades";
import { plantRule } from "@/lib/vineyard";
import { entryIsOpen } from "@/lib/lotRows";

const SEED = fs.readFileSync("src/lib/seed.ts", "utf8");

describe("the trees", () => {
  it("every frame is inside the sheet and not blank, its trunk where the art stands", async () => {
    const { data, info } = await sharp("public/assets/trees/fruit-trees.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const f of ORCHARD_FRUITS) {
      const c = CROP_KINDS[f.tree];
      expect(c, f.tree).toBeDefined();
      expect(c.frames).toHaveLength(c.stages);
      for (const fr of c.frames) {
        expect(fr.x + fr.w).toBeLessThanOrEqual(info.width);
        expect(fr.y + fr.h).toBeLessThanOrEqual(info.height);
        let opaque = 0, nearTrunk = 0;
        for (let y = 0; y < fr.h; y++) for (let x = 0; x < fr.w; x++) {
          if (data[((fr.y + y) * info.width + fr.x + x) * 4 + 3] !== 255) continue;
          opaque++;
          if (Math.abs(x - (fr.ax ?? c.baseX!)) <= 10 && y >= (fr.ay ?? c.baseY!) - 14 && y <= (fr.ay ?? c.baseY!)) nearTrunk++;
        }
        expect(opaque, `${f.tree} ${fr.x},${fr.y}`).toBeGreaterThan(100);
        expect(nearTrunk, `${f.tree} ${fr.x},${fr.y}: trunk at its anchor`).toBeGreaterThan(0);
      }
    }
  });
  it("each is a perennial that fruits again, planted from its sapling", () => {
    for (const f of ORCHARD_FRUITS) {
      expect(CROP_KINDS[f.tree].perennial, f.tree).toBeDefined();
      expect(GARDEN_CROPS[f.sapling]).toMatchObject({ kind: f.tree, produceKey: f.fruit, lots: ["orchard"], slot: "tree" });
      for (const k of [f.fruit, f.sapling]) expect(SEED, k).toContain(`f.${k === f.fruit ? "fruit" : "sapling"}`); // generated from the table
    }
  });
});

describe("saplings from the towns that grow them", () => {
  it("every sapling is sold by some town's shop, and Pip sells only apples", () => {
    const sold = new Set(Object.values(SHOP_STOCK).flat().map((s) => s.itemKey));
    for (const f of ORCHARD_FRUITS) expect(sold.has(f.sapling), f.sapling).toBe(true);
    expect(SHOP_STOCK.village_pip.some((s) => ORCHARD_FRUITS.some((f) => f.sapling === s.itemKey))).toBe(false);
  });
});

describe("what the fruit becomes", () => {
  it("every fruit has a buyer, and something to make", () => {
    for (const f of ORCHARD_FRUITS) expect(findBuyer(f.fruit), f.fruit).not.toBeNull();
    const made = new Set(MACHINE_RECIPES.filter((r) => r.lot === "orchard").map((r) => r.output));
    for (const p of ["orange_juice", "lemonade", "pear_cider", "cherry_jam", "peach_jam", "plum_jam"]) expect(made.has(p), p).toBe(true);
    for (const p of ORCHARD_PRODUCTS.filter((x) => !x.key.endsWith("_pie"))) expect(findBuyer(p.key) !== null || made.has(p.key), p.key).toBe(true);
  });
});

describe("where trees grow", () => {
  it("orchards take every fruit tree; vineyards only apples", () => {
    const cherry = GARDEN_CROPS.cherry_sapling, apple = GARDEN_CROPS.apple_sapling;
    expect(plantRule(cherry, "orchard", "tree", 1)).toBeNull();
    expect(plantRule(apple, "orchard", "tree", 1)).toBeNull();
    expect(plantRule(cherry, "vineyard", "tree", 1)).not.toBeNull();
    expect(plantRule(cherry, "land", null, 1)).not.toBeNull();
  });
  it("the first orchard row is open from the start", () => {
    const m = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: { kind: string; row?: string }[] };
    const first = m.buildings.filter((b) => b.kind === "orchard" && b.row === "orchard_0");
    expect(first.length).toBeGreaterThanOrEqual(10);
    expect(first.every((b) => entryIsOpen(b, new Set()))).toBe(true);
  });
});
