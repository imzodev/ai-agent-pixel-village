// Home gardens: growth / watering rules, garden plots read from templates,
// and the crop / seed / shop data staying consistent.

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isRipe, wateredAdvanceAt, waterCheck } from "@/lib/gardenRules";
import { gardenCellsOf, gardenPlotsAt } from "@/lib/buildingManifest";
import { CROP_KINDS, GARDEN_CROPS } from "@/lib/crops";
import { SHOP_STOCK, findBuyer } from "@/lib/trade";

describe("growth rules", () => {
  it("a crop is ripe on its last stage", () => {
    expect(isRipe(3, 5)).toBe(false);
    expect(isRipe(4, 5)).toBe(true);
  });

  it("watering halves the time left in the current stage", () => {
    expect(wateredAdvanceAt(1_000, 61_000)).toBe(31_000);
    expect(wateredAdvanceAt(5_000, 4_000)).toBe(5_000); // overdue: ready now
  });

  it("water once per stage, never when ripe or not growing", () => {
    const soon = new Date(Date.now() + 60_000);
    expect(waterCheck({ stage: 2, wateredStage: null, nextAdvanceAt: soon }, 5)).toBeNull();
    expect(waterCheck({ stage: 2, wateredStage: 1, nextAdvanceAt: soon }, 5)).toBeNull(); // watered last stage
    expect(waterCheck({ stage: 2, wateredStage: 2, nextAdvanceAt: soon }, 5)).toMatch(/Already watered/);
    expect(waterCheck({ stage: 4, wateredStage: null, nextAdvanceAt: null }, 5)).toMatch(/ready to harvest/);
    expect(waterCheck({ stage: 2, wateredStage: null, nextAdvanceAt: null }, 5)).toMatch(/not growing/);
  });
});

describe("garden plots from templates", () => {
  const rose = JSON.parse(fs.readFileSync("public/buildings/rose_cottage.json", "utf8"));

  it("Rose Cottage declares 8 plots in scan order", () => {
    const cells = gardenCellsOf(rose);
    expect(cells.map((c) => [c.dy, c.dx])).toEqual([
      [11, 7], [11, 9], [11, 13], [11, 15], [13, 7], [13, 9], [13, 13], [13, 15],
    ]);
    expect(cells.map((c) => c.plot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("resolves plots to crop anchors in world pixels", () => {
    const plots = gardenPlotsAt(98, 20, rose);
    // plot 0: cells (7, 8) of row 11 → centre x = (98+7)*16+16, bottom y = (20+11)*16+16
    expect(plots[0]).toEqual({ plot: 0, x: 1696, y: 512 });
  });

  it("templates without a Garden layer have no plots", () => {
    const cabin = JSON.parse(fs.readFileSync("public/buildings/cabin_1.json", "utf8"));
    expect(gardenCellsOf(cabin)).toEqual([]);
  });
});

describe("crop data", () => {
  it("every seed plants a known crop whose frames fit the 1024×1024 crops sheet", () => {
    for (const def of Object.values(GARDEN_CROPS)) {
      const cfg = CROP_KINDS[def.kind];
      expect(cfg, def.kind).toBeDefined();
      expect(cfg.frames).toHaveLength(cfg.stages);
      expect(cfg.regrowthMs).toBeGreaterThan(0);
      for (const f of cfg.frames) {
        expect(f.x + f.w).toBeLessThanOrEqual(1024);
        expect(f.y + f.h).toBeLessThanOrEqual(1024);
      }
    }
  });

  it("every seed on sale is plantable, and every harvest has a buyer", () => {
    for (const stock of Object.values(SHOP_STOCK)) {
      for (const t of stock) expect(GARDEN_CROPS[t.itemKey], t.itemKey).toBeDefined();
    }
    for (const def of Object.values(GARDEN_CROPS)) expect(findBuyer(def.produceKey), def.produceKey).not.toBeNull();
  });

  it("longer crops earn more per harvest after the seed cost", () => {
    const profit = (seedKey: string) => {
      const def = GARDEN_CROPS[seedKey];
      const seed = SHOP_STOCK.shopkeeper.find((t) => t.itemKey === seedKey)!.price;
      return CROP_KINDS[def.kind].yield * findBuyer(def.produceKey)!.trade.price - seed;
    };
    const order = ["radish_seeds", "carrot_seeds", "tomato_seeds", "pumpkin_seeds"].map(profit);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    expect(order[0]).toBeGreaterThan(0);
  });
});
