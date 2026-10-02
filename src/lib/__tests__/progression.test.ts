// Combat and level progression: damage, drops, spawning, unlocks, perks,
// the world boss schedule, and data consistency with items / recipes / shops.

import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOSS_WINDOW_MS,
  ENEMY_KINDS,
  ENEMY_ZONES,
  LEVEL_UNLOCKS,
  PERKS,
  WEAPONS,
  bossRewardees,
  bossWindowStart,
  chopBonus,
  enemyHit,
  isAggressive,
  landLotLimit,
  levelForXp,
  maxHpFor,
  perkPoints,
  pickEnemyKind,
  playerDamage,
  rollDrops,
  unlocksBetween,
  weaponBonus,
  xpForLevel,
} from "@/lib/progression";
import { RECIPES } from "@/lib/recipes";
import { SHOP_STOCK } from "@/lib/trade";

const itemKeys = new Set([...fs.readFileSync("src/lib/seed.ts", "utf8").matchAll(/\{ key: "([a-z_]+)", name:/g)].map((m) => m[1]));

describe("damage", () => {
  it("adds base roll, weapon, level and Fighter", () => {
    expect(playerDamage({ level: 1, weapon: 0, fighter: false, roll: 0 })).toBe(2);
    expect(playerDamage({ level: 1, weapon: 0, fighter: false, roll: 0.99 })).toBe(4);
    expect(playerDamage({ level: 6, weapon: 4, fighter: true, roll: 0 })).toBe(2 + 4 + 3 + 2);
  });

  it("uses the best equipped weapon and the best axe", () => {
    expect(weaponBonus(["lantern", "stone_sword"])).toBe(4);
    expect(weaponBonus([])).toBe(0);
    expect(chopBonus(["axe"])).toBe(0);
    expect(chopBonus(["axe", "sharp_axe"])).toBe(1);
  });

  it("Tough takes 1 off enemy hits, never below 1", () => {
    expect(enemyHit("boar", false)).toBe(3);
    expect(enemyHit("boar", true)).toBe(2);
    expect(enemyHit("slime", true)).toBe(1);
  });

  it("only tier 2+ and the boss are aggressive", () => {
    expect(isAggressive("slime")).toBe(false);
    expect(isAggressive("bat")).toBe(false);
    expect(isAggressive("thornling")).toBe(true);
    expect(isAggressive("rootking")).toBe(true);
  });
});

describe("drops and spawning", () => {
  it("rolls each drop by its chance", () => {
    expect(rollDrops("slime", () => 0.99)).toEqual([{ itemKey: "slime_gel", qty: 1 }]); // chance 1
    expect(rollDrops("boar", () => 0.99)).toEqual([]);
    expect(rollDrops("boar", () => 0)).toEqual([{ itemKey: "boar_hide", qty: 1 }]);
  });

  it("night-only kinds spawn only at night", () => {
    const forest = ENEMY_ZONES.find((z) => z.name === "oak forest")!;
    expect(pickEnemyKind(forest, false)).toBeNull();
    expect(pickEnemyKind(forest, true)).toBe("wisp");
    const woods = ENEMY_ZONES.find((z) => z.name === "west woods")!;
    expect(["thornling", "boar"]).toContain(pickEnemyKind(woods, false, () => 0.3));
  });

  it("every zone kind and drop is real", () => {
    for (const z of ENEMY_ZONES) for (const k of Object.keys(z.kinds)) expect(ENEMY_KINDS[k], k).toBeDefined();
    for (const def of Object.values(ENEMY_KINDS)) for (const d of def.drops) expect(itemKeys.has(d.itemKey), d.itemKey).toBe(true);
  });
});

describe("levels, unlocks and perks", () => {
  it("level curve and its inverse agree", () => {
    for (let lv = 1; lv <= 20; lv++) expect(levelForXp(xpForLevel(lv))).toBe(lv);
    expect(levelForXp(xpForLevel(5) - 1)).toBe(4);
  });

  it("max HP, perk points and land lots grow with level", () => {
    expect(maxHpFor(1, false)).toBe(20);
    expect(maxHpFor(3, true)).toBe(50);
    expect(perkPoints(4)).toBe(0);
    expect(perkPoints(5)).toBe(1);
    expect(perkPoints(10)).toBe(2);
    expect(landLotLimit(9)).toBe(1);
    expect(landLotLimit(10)).toBe(2);
  });

  it("lists unlocks crossed by a level-up", () => {
    expect(unlocksBetween(1, 3).map((u) => u.level)).toEqual([2, 3]);
    expect(unlocksBetween(5, 7)).toEqual([]);
  });

  it("every gated shop item and recipe level appears in LEVEL_UNLOCKS", () => {
    const levels = new Set(LEVEL_UNLOCKS.map((u) => u.level));
    for (const stock of Object.values(SHOP_STOCK)) for (const t of stock) if (t.minLevel) expect(levels.has(t.minLevel), t.itemKey).toBe(true);
    for (const r of RECIPES) if (r.requires?.level) expect(levels.has(r.requires.level), r.key).toBe(true);
  });

  it("recipe items and weapons exist as items", () => {
    for (const r of RECIPES) {
      for (const i of r.inputs) expect(itemKeys.has(i.itemKey), i.itemKey).toBe(true);
      expect(itemKeys.has(r.output.itemKey), r.output.itemKey).toBe(true);
    }
    for (const k of Object.keys(WEAPONS)) expect(itemKeys.has(k), k).toBe(true);
  });

  it("perks are unique", () => {
    expect(new Set(PERKS.map((p) => p.key)).size).toBe(PERKS.length);
  });
});

describe("world boss", () => {
  const sat18 = Date.UTC(2026, 9, 3, 18); // Saturday 3 Oct 2026, 18:00 UTC

  it("opens a one-hour window on the scheduled weekday and hour", () => {
    expect(new Date(sat18).getUTCDay()).toBe(6);
    expect(bossWindowStart(sat18 + 5 * 60_000)).toBe(sat18);
    expect(bossWindowStart(sat18 + BOSS_WINDOW_MS)).toBeNull();
    expect(bossWindowStart(sat18 - 60_000)).toBeNull();
    expect(bossWindowStart(sat18 + 24 * 3_600_000)).toBeNull(); // Sunday
    expect(bossWindowStart(Date.UTC(2026, 9, 7, 9, 30), "3@9")).toBe(Date.UTC(2026, 9, 7, 9)); // Wednesday 9:00
  });

  it("force keeps a window open", () => {
    expect(bossWindowStart(sat18 - 3 * 86_400_000, "6@18", true)).not.toBeNull();
  });

  it("rewards fighters who dealt at least 3% of its HP", () => {
    expect(bossRewardees({ "1": 100, "2": 18, "3": 17 }, 600).sort()).toEqual([1, 2]);
  });
});
