// A homestead's barn and workshop: built on their parcels, what each one
// unlocks, where machines stand, and the tiles they block.
import { describe, expect, it } from "vitest";
import { EMPTY_GROWTH, growthScope } from "@/lib/ranchUpgrades";
import { BUILDING_KEY, PARCEL_BUILDINGS, PARCEL_SHOWROOM, PARCEL_SPOTS, PARCEL_TILES, buildingTiles } from "@/lib/homestead";
import { MACHINE_SPRITE } from "@/game/machineSprites";
import { RANCH_PROP_SPRITES } from "@/game/ranchProps";
import { VINEYARD_PROP_SPRITES } from "@/game/vineyardProps";
import { WORKSHOP_PROP_SPRITES } from "@/game/workshopProps";
import type { Parcel } from "@/types/homestead";

const g = (machines: string[]) => ({ ...EMPTY_GROWTH, machines: machines as never[] });
const ids = (s: { id: string }[]) => s.map((x) => x.id);

describe("homestead buildings", () => {
  it("offers the barn and workshop only with a parcel for them", () => {
    expect(ids(growthScope(g([]), { barn: false, workshop: false }).steps)).toEqual([]);
    expect(ids(growthScope(g([]), { barn: true, workshop: false }).steps)).toEqual(["hs_barn"]);
    expect(growthScope(g([]), { barn: true, workshop: true }).recipes).toEqual([]);
  });

  it("unlocks the farm's machines with the barn, the carpenter's with the workshop", () => {
    const barn = growthScope(g(["hs_barn"]), { barn: true, workshop: false });
    expect(ids(barn.steps)).toEqual(expect.arrayContaining(["silo", "feeder", "mill", "press", "loom", "hives", "fruit_press", "cellar", "racks", "jam"]));
    expect(ids(barn.recipes)).toEqual(expect.arrayContaining(["mill_wheat", "wine_red", "o_jam_cherry", "press_apples"]));
    expect(ids(barn.recipes)).not.toContain("o_press_apple"); // cider once
    expect(barn.recipes.some((r) => r.place === "workshop")).toBe(false);
    const shop = growthScope(g(["hs_workshop"]), { barn: false, workshop: true });
    expect(ids(shop.steps)).toEqual(expect.arrayContaining(["saw", "lathe", "upholstery", "varnish"]));
    expect(shop.recipes.every((r) => r.place === "workshop")).toBe(true);
    // packed away: built, but no parcel for it
    expect(growthScope(g(["hs_barn"]), { barn: false, workshop: false }).recipes).toEqual([]);
  });

  it("draws every machine it can build, at its spot by the right building", () => {
    const barn = growthScope(g(["hs_barn", "hs_workshop"]), { barn: true, workshop: true });
    for (const s of barn.steps) {
      if (s.place === "homestead") continue;
      expect(PARCEL_SPOTS[s.key]?.on, s.key).toBe(s.place);
      expect(MACHINE_SPRITE[s.key], s.key).toBeDefined();
      expect({ ...RANCH_PROP_SPRITES, ...VINEYARD_PROP_SPRITES, ...WORKSHOP_PROP_SPRITES }[MACHINE_SPRITE[s.key]!], s.key).toBeDefined();
    }
  });

  it("places every machine and showroom spot inside its parcel and clear of the building's walls", () => {
    for (const [key, spot] of Object.entries(PARCEL_SPOTS)) {
      expect(spot!.x >= 0 && spot!.x < PARCEL_TILES * 16 && spot!.y > 0 && spot!.y <= PARCEL_TILES * 16, key).toBe(true);
      const s = PARCEL_BUILDINGS[spot!.on].solid;
      const inWalls = spot!.x >= s.dx * 16 && spot!.x < (s.dx + s.w) * 16 && spot!.y > s.dy * 16 && spot!.y <= (s.dy + s.h) * 16;
      expect(inWalls, key).toBe(false);
    }
    expect(PARCEL_SHOWROOM).toHaveLength(6);
  });

  it("blocks the walls of built buildings on their parcels only", () => {
    const site = { tx: 100, ty: 200 };
    const parcels: Parcel[] = [{ col: 1, row: 0, use: "barn" }, { col: 0, row: 0, use: "workshop" }, { col: 0, row: 1, use: "field" }];
    expect(buildingTiles(site, parcels, [])).toEqual([]);
    const barn = buildingTiles(site, parcels, [BUILDING_KEY.barn]);
    const s = PARCEL_BUILDINGS.barn.solid;
    expect(barn).toHaveLength(s.w * s.h);
    expect(barn.every((t) => t.tx >= 110 && t.tx < 120 && t.ty >= 200 && t.ty < 210)).toBe(true);
    expect(buildingTiles(site, parcels, [BUILDING_KEY.barn, BUILDING_KEY.workshop]).length).toBe(s.w * s.h + PARCEL_BUILDINGS.workshop.solid.w * PARCEL_BUILDINGS.workshop.solid.h);
  });
});
