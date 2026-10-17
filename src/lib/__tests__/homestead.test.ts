// Homestead rules: the parcel grid, buying next to what you own, the level
// cap, pasture space and pens, changing a parcel's use, and how many
// homesteads one player may hold.
import { describe, expect, it } from "vitest";
import {
  GRID, PARCEL_PRICE, PARCEL_TILES, STARTER, adjacent, buyableCells, canAddAnimal, canBuyParcel, canClaimHomestead,
  canSetUse, capFor, nextCapAt, onParcels, parcelAtTile, pens, plotCell, plotIndex,
  plotOffsets, spaceFree, spaceTotal, changeCost,
} from "@/lib/homestead";
import type { Parcel } from "@/types/homestead";

const p = (col: number, row: number, use: Parcel["use"] = "wild"): Parcel => ({ col, row, use });
const starter = STARTER.map((c) => p(c.col, c.row));

describe("homestead parcels", () => {
  it("starts at 2×2 and caps by level up to the whole 6×6 grid", () => {
    expect(STARTER).toHaveLength(4);
    expect(capFor(1)).toBe(4);
    expect(capFor(4)).toBe(4);
    expect(capFor(5)).toBe(6);
    expect(capFor(10)).toBe(9);
    expect(capFor(40)).toBe(GRID * GRID);
    expect(capFor(99)).toBe(GRID * GRID);
    expect(nextCapAt(1)).toEqual({ level: 5, cap: 6 });
    expect(nextCapAt(40)).toBeNull();
  });

  it("sells only parcels touching yours, inside the grid, under the cap, for the same price", () => {
    expect(canBuyParcel(starter, { col: 2, row: 0 }, 5, PARCEL_PRICE)).toBeNull();
    expect(canBuyParcel(starter, { col: 2, row: 2 }, 5, 999)).toMatch(/next to/); // diagonal only
    expect(canBuyParcel(starter, { col: 0, row: 0 }, 5, 999)).toMatch(/already/);
    expect(canBuyParcel(starter, { col: -1, row: 0 }, 5, 999)).toMatch(/edge/);
    expect(canBuyParcel(starter, { col: 2, row: 0 }, 1, 999)).toMatch(/level 5/);
    expect(canBuyParcel(starter, { col: 2, row: 0 }, 5, PARCEL_PRICE - 1)).toMatch(/coins/);
    expect(adjacent(starter, { col: 0, row: 2 })).toBe(true);
    expect(buyableCells(starter)).toHaveLength(4); // (2,0) (2,1) (0,2) (1,2)
  });

  it("gives pasture space and refuses animals past it", () => {
    const parcels = [p(0, 0, "pasture"), p(1, 0, "field")];
    expect(spaceTotal(parcels)).toBe(8);
    expect(canAddAnimal(parcels, ["cow"], "cow")).toBeNull();
    expect(canAddAnimal(parcels, ["cow", "cow"], "chicken")).toMatch(/full/);
    expect(spaceFree(parcels, ["sheep"])).toBe(6);
    expect(canAddAnimal([p(0, 0, "field")], [], "chicken")).toMatch(/pasture first/);
  });

  it("joins touching pastures into one pen", () => {
    const parcels = [p(0, 0, "pasture"), p(1, 0, "pasture"), p(1, 1, "pasture"), p(3, 3, "pasture"), p(0, 1, "field")];
    const sizes = pens(parcels).map((g) => g.length).sort();
    expect(sizes).toEqual([1, 3]);
  });

  it("changes a parcel's use for free, but never out from under its animals", () => {
    const parcels = [p(0, 0, "pasture"), p(1, 0, "field")];
    expect(canSetUse(parcels, { col: 1, row: 0 }, "pasture", [])).toBeNull();
    expect(canSetUse(parcels, { col: 1, row: 0 }, "field", [])).toMatch(/already/);
    expect(canSetUse(parcels, { col: 2, row: 0 }, "field", [])).toMatch(/don't own/);
    expect(canSetUse(parcels, { col: 0, row: 0 }, "wild", [])).toMatch(/Pick/);
    expect(canSetUse([p(0, 0, "barn"), p(1, 0, "field")], { col: 1, row: 0 }, "barn", [])).toMatch(/already have a barn/);
    expect(canSetUse([p(0, 0, "barn"), p(1, 0, "field")], { col: 1, row: 0 }, "workshop", [])).toBeNull();
    expect(canSetUse(parcels, { col: 0, row: 0 }, "field", ["chicken"])).toMatch(/animals need/);
    expect(changeCost(parcels, { col: 1, row: 0 }, "pasture", [], 5)).toEqual({ crops: 5, animalsOver: 0 });
  });

  it("allows one homestead now, and later another only when every one is full", () => {
    expect(canClaimHomestead([], 1)).toBeNull();
    expect(canClaimHomestead([{ parcels: 4 }], 1)).toMatch(/already/);
    expect(canClaimHomestead([{ parcels: 4 }], 1, 2)).toBeNull(); // full at level 1 (cap 4)
    expect(canClaimHomestead([{ parcels: 4 }], 5, 2)).toMatch(/Fill/);
    expect(canClaimHomestead([{ parcels: 4 }, { parcels: 4 }], 1, 2)).toMatch(/2 homesteads/);
  });

  it("maps tiles, pixels and plots to parcels", () => {
    const site = { tx: 100, ty: 200 };
    expect(parcelAtTile(site, 100 + PARCEL_TILES + 3, 205)).toEqual({ col: 1, row: 0 });
    expect(parcelAtTile(site, 99, 205)).toBeNull();
    expect(onParcels(site, [{ col: 0, row: 0 }], 105 * 16, 205 * 16)).toBe(true);
    expect(onParcels(site, [{ col: 0, row: 0 }], 115 * 16, 205 * 16)).toBe(false);
    expect(plotOffsets("field")).toHaveLength(16);
    expect(plotOffsets("pasture")).toHaveLength(0);
    for (const u of ["field", "vineyard", "orchard"] as const) for (const o of plotOffsets(u)) expect(o.x > 0 && o.x < PARCEL_TILES * 16 && o.y > 0 && o.y <= PARCEL_TILES * 16, u).toBe(true);
    const n = plotIndex({ col: 3, row: 5 }, 11);
    expect(plotCell(n)).toEqual({ cell: { col: 3, row: 5 }, i: 11 });
  });
});
