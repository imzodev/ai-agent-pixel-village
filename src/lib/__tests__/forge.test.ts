// The forge: costs climb per level, stop at +3, and each level adds to
// what the item is for — and only that.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { FORGE_ITEMS, FORGE_MAX_PLUS, plusOf, upgradeCost, withPlus } from "@/lib/forge";
import { chopBonus, weaponBonus, WEAPONS } from "@/lib/progression";

// seed.ts talks to the database on import, so read its keys as text.
const SEED_KEYS = new Set([...fs.readFileSync("src/lib/seed.ts", "utf8").matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]));

describe("forge costs", () => {
  it("every upgradable item and material is a real item", () => {
    for (const [key, def] of Object.entries(FORGE_ITEMS)) {
      expect(SEED_KEYS.has(key), key).toBe(true);
      for (const m of def.materials) expect(SEED_KEYS.has(m), m).toBe(true);
    }
  });
  it("climbs per level and stops at the cap", () => {
    const costs = [0, 1, 2].map((p) => upgradeCost("thorn_blade", p)!);
    expect(costs.map((c) => c.coins)).toEqual([20, 50, 120]);
    expect(costs.map((c) => c.items[0].qty)).toEqual([2, 4, 6]);
    expect(costs.map((c) => c.items[0].itemKey)).toEqual(["thorn", "boar_hide", "wolf_pelt"]);
    expect(upgradeCost("thorn_blade", FORGE_MAX_PLUS)).toBeNull();
    expect(upgradeCost("bread", 0)).toBeNull();
  });
  it("reads and shows the level", () => {
    expect(plusOf({ plus: 2 })).toBe(2);
    expect(plusOf({})).toBe(0);
    expect(plusOf({ plus: "9" })).toBe(0);
    expect(plusOf({ plus: 99 })).toBe(FORGE_MAX_PLUS);
    expect(withPlus("Thorn Blade", 2)).toBe("Thorn Blade +2");
    expect(withPlus("Axe", 0)).toBe("Axe");
  });
});

describe("forge bonuses", () => {
  it("a sword's level adds damage, an axe's adds wood, never the other way", () => {
    expect(weaponBonus(["thorn_blade"], { thorn_blade: 2 })).toBe(WEAPONS.thorn_blade.damage + 2);
    expect(weaponBonus(["axe"], { axe: 3 })).toBe(0);
    expect(chopBonus(["axe"], { axe: 2 })).toBe(2);
    expect(chopBonus(["thorn_blade", "axe"], { thorn_blade: 3 })).toBe(0);
    expect(chopBonus(["sharp_axe"], { sharp_axe: 1 })).toBe(WEAPONS.sharp_axe.chopBonus! + 1);
  });
});
