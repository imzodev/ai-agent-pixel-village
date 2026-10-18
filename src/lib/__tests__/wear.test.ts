// Tool wear: which tools wear, how fast, what a worn one does worse, and what
// Bjorn charges to repair it.
import { describe, expect, it } from "vitest";
import {
  WEAR_MAX, WEAR_PER_USE, WORN_AT, axeKeyOf, mostWorn, repairCost, usedCopy, wearLevel, wearNotice, wearOf, wears, weaponKeyOf, wornDamage, wornRodZone, wornYield,
} from "@/lib/wear";

describe("tool wear", () => {
  it("axes, blades, bows and the rod wear; other things don't", () => {
    for (const k of ["axe", "sharp_axe", "stone_sword", "hollow_edge", "short_bow", "runed_bow", "fishing_rod"]) expect(wears(k), k).toBe(true);
    for (const k of ["wood", "lantern", "bicycle", "fox_charm"]) expect(wears(k), k).toBe(false);
  });
  it("reads a row's wear safely, capped", () => {
    expect(wearOf({})).toBe(0);
    expect(wearOf({ wear: 40.5 })).toBe(40.5);
    expect(wearOf({ wear: 400 })).toBe(WEAR_MAX);
    expect(wearOf({ wear: "lots" })).toBe(0);
    expect(wearOf(null)).toBe(0);
  });
  it("takes a few hundred uses from new to dull", () => {
    for (const use of Object.values(WEAR_PER_USE)) expect(WEAR_MAX / use).toBeGreaterThanOrEqual(200);
  });
  it("worn tools work a little worse, dull ones much worse, and never not at all", () => {
    expect(wearLevel(0)).toBe("fine");
    expect(wearLevel(WORN_AT)).toBe("worn");
    expect(wearLevel(WEAR_MAX)).toBe("dull");
    expect(wornYield(3, 0)).toBe(3);
    expect(wornYield(3, WORN_AT)).toBe(2);
    expect(wornYield(3, WEAR_MAX)).toBe(1);
    expect(wornYield(1, WEAR_MAX)).toBe(1);
    expect(wornDamage(0)).toBe(1);
    expect(wornDamage(WORN_AT)).toBeLessThan(1);
    expect(wornDamage(WEAR_MAX)).toBeLessThan(wornDamage(WORN_AT));
    expect(wornRodZone(WEAR_MAX)).toBeGreaterThan(wornRodZone(WORN_AT));
  });
  it("a repair costs more for finer tools and more wear, but stays well under the tool's value", () => {
    expect(repairCost("axe", 0)).toBe(0);
    expect(repairCost("axe", 50)).toBeLessThan(repairCost("axe", 100));
    expect(repairCost("steel_sword", 100)).toBeGreaterThan(repairCost("axe", 100));
    for (const k of ["axe", "fishing_rod", "short_bow", "steel_sword", "hollow_edge"]) expect(repairCost(k, 100), k).toBeLessThan(200);
    expect(repairCost("hollow_edge", 100)).toBeLessThan(1200 / 5);
    expect(repairCost("axe", 1)).toBe(1);
  });
  it("the copy that wears is the one that works: best axe, strongest blade, the copy in hand", () => {
    expect(axeKeyOf(["axe", "sharp_axe", "wood"])).toBe("sharp_axe");
    expect(axeKeyOf(["wood"])).toBeNull();
    expect(weaponKeyOf(["stone_sword", "thorn_blade", "lantern"])).toBe("thorn_blade");
    expect(weaponKeyOf(["lantern"])).toBeNull();
    // the most upgraded; of those, the one in hand until it's dull, then a spare
    const copies = [{ id: 1, meta: { wear: 10 } }, { id: 2, meta: { plus: 2, wear: 90 } }, { id: 3, meta: { plus: 2, wear: 30 } }];
    expect(usedCopy(copies).id).toBe(2);
    expect(usedCopy([{ id: 2, meta: { wear: 100 } }, { id: 3, meta: {} }]).id).toBe(3);
    expect(mostWorn([{ id: 2, meta: { wear: 100 } }, { id: 3, meta: { wear: 5 } }]).id).toBe(2); // what Bjorn repairs
  });
  it("says so when a tool gets worn or dull, once", () => {
    expect(wearNotice("Axe", 74.5, 75)).toMatch(/getting worn.*Bjorn/);
    expect(wearNotice("Axe", 99.5, 100)).toMatch(/dull.*Bjorn/);
    expect(wearNotice("Axe", 80, 80.5)).toBeNull();
  });
});
