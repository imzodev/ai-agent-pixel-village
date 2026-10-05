// Carpenter's workshops: the lots south of Hollowmere, stations and recipes
// scoped to workshops, the built-in workbench, furniture sprites, buyers
// and the showroom.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILD_STEPS, EMPTY_GROWTH, MACHINE_RECIPES, hasBuilt, machineFree } from "@/lib/ranchUpgrades";
import { FURNITURE_ITEMS, FURNITURE_VALUE } from "@/lib/furniture";
import { FURNITURE_CELLS, furnitureCell } from "@/game/furnitureArt";
import { SHOWROOM_SPOTS } from "@/game/workshopProps";
import { WORKSHOP_ROW, treeAt } from "@/lib/regions";
import { findBuyer } from "@/lib/trade";

const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")) as { buildings: { key: string; kind: string; tx: number; ty: number }[] };
const shops = manifest.buildings.filter((b) => b.kind === "workshop");

describe("workshop lots", () => {
  it("4 lots on the road south of Hollowmere, apart and clear of trees", () => {
    expect(shops).toHaveLength(4);
    const xs = shops.map((s) => s.tx).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(24); // no overlap
    for (const s of shops) {
      expect(s.ty).toBe(38);
      expect(s.tx > -352 || s.tx + 23 < -352).toBe(true); // the road at tx -352 stays open
      for (let vy = s.ty; vy < s.ty + 15; vy += 2) for (let vx = s.tx; vx < s.tx + 24; vx += 2) expect(treeAt(vx, vy), `${vx},${vy}`).toBeNull();
      expect(s.tx).toBeGreaterThanOrEqual(WORKSHOP_ROW.tx0);
      expect(s.tx + 23).toBeLessThanOrEqual(WORKSHOP_ROW.tx1);
    }
  });
});

describe("stations and recipes", () => {
  it("the workbench is built in; the others are built", () => {
    expect(hasBuilt(EMPTY_GROWTH, "workbench")).toBe(true);
    expect(machineFree(EMPTY_GROWTH, "workbench")).toBe(true);
    expect(hasBuilt(EMPTY_GROWTH, "lathe")).toBe(false);
    expect(BUILD_STEPS.filter((s) => s.lot === "workshop").map((s) => s.key)).toEqual(["saw", "lathe", "upholstery", "varnish"]);
  });
  it("every workshop recipe uses a workshop station and makes something real", () => {
    const stations = new Set(["workbench", ...BUILD_STEPS.filter((s) => s.lot === "workshop").map((s) => s.key)]);
    for (const r of MACHINE_RECIPES.filter((x) => x.lot === "workshop")) {
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
  it("the showroom has 6 spots on the porch", () => {
    expect(SHOWROOM_SPOTS).toHaveLength(6);
    for (const s of SHOWROOM_SPOTS) { expect(s.x).toBeGreaterThan(14 * 16); expect(s.y).toBeLessThanOrEqual(11 * 16); }
  });
});
