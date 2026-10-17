// A homestead's carpenter's workshop: its stations and recipes, the
// built-in workbench, furniture sprites, buyers and the showroom.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILD_STEPS, EMPTY_GROWTH, MACHINE_RECIPES, hasBuilt, machineFree } from "@/lib/ranchUpgrades";
import { FURNITURE_ITEMS, FURNITURE_VALUE } from "@/lib/furniture";
import { FURNITURE_CELLS, furnitureCell } from "@/game/furnitureArt";
import { PARCEL_SHOWROOM, PARCEL_TILES } from "@/lib/homestead";
import { findBuyer } from "@/lib/trade";

describe("stations and recipes", () => {
  it("the workbench is built in; the others are built", () => {
    expect(hasBuilt(EMPTY_GROWTH, "workbench")).toBe(true);
    expect(machineFree(EMPTY_GROWTH, "workbench")).toBe(true);
    expect(hasBuilt(EMPTY_GROWTH, "lathe")).toBe(false);
    expect(BUILD_STEPS.filter((s) => s.place === "workshop").map((s) => s.key)).toEqual(["saw", "lathe", "upholstery", "varnish"]);
  });
  it("every workshop recipe uses a workshop station and makes something real", () => {
    const stations = new Set(["workbench", ...BUILD_STEPS.filter((s) => s.place === "workshop").map((s) => s.key)]);
    for (const r of MACHINE_RECIPES.filter((x) => x.place === "workshop")) {
      expect(stations.has(r.machine), r.id).toBe(true);
      expect(r.output === "plank" || FURNITURE_ITEMS.includes(r.output), r.id).toBe(true);
    }
  });
  it("polishing doubles the value", () => {
    for (const p of ["chair", "table", "cabinet", "wardrobe"]) expect(FURNITURE_VALUE[`polished_${p}`]).toBeGreaterThanOrEqual(FURNITURE_VALUE[p] * 2);
  });
});

describe("furniture", () => {
  it("every piece has a sprite cell on the sheet, and a buyer", () => {
    const png = fs.readFileSync("public/assets/furniture.png");
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    for (const item of FURNITURE_ITEMS) {
      const c = furnitureCell(item)!;
      expect(c.x + 32).toBeLessThanOrEqual(w);
      expect(c.y + 32).toBeLessThanOrEqual(h);
      expect(findBuyer(item), item).not.toBeNull();
    }
    expect(new Set(Object.values(FURNITURE_CELLS)).size).toBe(FURNITURE_ITEMS.length); // one cell each
  });
  it("the showroom has 6 spots in front of the workshop, on its parcel", () => {
    expect(PARCEL_SHOWROOM).toHaveLength(6);
    for (const s of PARCEL_SHOWROOM) { expect(s.x > 0 && s.x < PARCEL_TILES * 16).toBe(true); expect(s.y > 96 && s.y <= PARCEL_TILES * 16).toBe(true); }
  });
});
