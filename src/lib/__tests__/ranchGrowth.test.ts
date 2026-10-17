// Homestead growth: farm levels, what building needs, quality goods from
// love, the machines' timing and the silo. (What a homestead may build:
// homesteadBuildings.test.ts.)
import { describe, expect, it } from "vitest";
import {
  BUILD_STEPS, EMPTY_GROWTH, HIVE_MAX, HIVE_MS, MACHINE_RECIPES, QUALITY_MAX,
  afterHoney, applyBuild, canBuild, collectGoods, farmLevel, honeyReady, isNextStep, machineFree, newJob, nextLevelAt, qualityChance, takeFeed,
} from "@/lib/ranchUpgrades";
import type { RanchGrowth } from "@/types/ranchGrowth";

const step = (id: string) => BUILD_STEPS.find((s) => s.id === id)!;
const rich = { wood: 99, stone: 99, fittings: 99 };
const g0: RanchGrowth = { ...EMPTY_GROWTH };

describe("farm level", () => {
  it("climbs at 50 / 150 / 350 / 700 XP and stops at 5", () => {
    expect([0, 49, 50, 149, 150, 700, 9999].map(farmLevel)).toEqual([1, 1, 2, 2, 3, 5, 5]);
    expect(nextLevelAt(60)).toBe(150);
    expect(nextLevelAt(700)).toBeNull();
  });
});

describe("building", () => {
  it("needs the farm level, coins, materials and what comes first", () => {
    expect(canBuild(g0, step("press"), rich, 999).why).toBe("Needs farm level 2.");
    const lv2 = { ...g0, farmXp: 60 };
    expect(canBuild(lv2, step("press"), rich, 999).ok).toBe(true);
    expect(canBuild(lv2, step("hs_barn"), rich, 10).why).toBe("Needs 150 coins.");
    expect(canBuild(lv2, step("hs_barn"), { wood: 1 }, 999).why).toContain("20 wood");
    expect(canBuild(lv2, step("feeder"), rich, 999).why).toBe("Build the silo first.");
  });
  it("each building once", () => {
    const hives = applyBuild(g0, step("hives"), 1000);
    expect(hives.machines).toContain("hives");
    expect(hives.hivesAt).toBe(1000);
    expect(isNextStep(hives, step("hives"))).toBe(false);
    expect(canBuild(hives, step("hives"), rich, 999).why).toBe("Already built.");
  });
});

describe("love and quality", () => {
  it("quality chance grows with affection, capped", () => {
    expect(qualityChance(0)).toBe(0);
    expect(qualityChance(50)).toBeCloseTo(0.2);
    expect(qualityChance(100)).toBe(QUALITY_MAX);
  });
  it("collected goods split into plain and better ones", () => {
    expect(collectGoods("egg", 3, 0)).toEqual({ egg: 3 });
    expect(collectGoods("egg", 3, 100, () => 0)).toEqual({ golden_egg: 3 });
    expect(collectGoods("egg", 2, 100, () => 0.99)).toEqual({ egg: 2 });
  });
});

describe("workshop", () => {
  it("one job per machine, ready after its time", () => {
    const g = { ...g0, machines: ["mill" as const] };
    const r = MACHINE_RECIPES.find((x) => x.id === "mill_wheat")!;
    expect(machineFree(g, "mill")).toBe(true);
    expect(machineFree(g0, "mill")).toBe(false); // not built
    const j = newJob(r, 1000);
    expect(j.readyAt).toBe(1000 + r.ms);
    expect(machineFree({ ...g, jobs: [j] }, "mill")).toBe(false);
  });
  it("hives fill up over time and keep partial progress", () => {
    const g = { ...g0, machines: ["hives" as const], hivesAt: 0 };
    expect(honeyReady(g, HIVE_MS * 2 + 5)).toBe(2);
    expect(honeyReady(g, HIVE_MS * 99)).toBe(HIVE_MAX);
    expect(afterHoney(0, 2, HIVE_MS * 2 + 5)).toBe(HIVE_MS * 2);
  });
  it("the silo hands out feed, biggest pile first", () => {
    expect(takeFeed({})).toBeNull();
    expect(takeFeed({ wheat: 3, carrot: 1 })).toEqual({ item: "wheat", silo: { wheat: 2, carrot: 1 } });
    expect(takeFeed({ carrot: 1 })!.silo).toEqual({});
  });

});
