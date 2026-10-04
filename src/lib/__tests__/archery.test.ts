// Bows: real items you can buy, craft or find; better bows hit harder and
// reach further; shots use arrows; the art has the shoot rows.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ARROW_ITEM, BOWS, bowOf } from "@/lib/progression";
import { RECIPES } from "@/lib/recipes";
import { stockForNpc } from "@/lib/trade";
import { WEAPON_LAYERS, SHEET_W, SHEET_H, SHOOT_ROW, SHOOT_FRAMES } from "@/game/lpc";

const SEED = fs.readFileSync("src/lib/seed.ts", "utf8");

describe("archery", () => {
  it("every bow and arrows are items, and every bow has art", () => {
    for (const k of [...Object.keys(BOWS), ARROW_ITEM]) expect(SEED, k).toContain(`key: "${k}"`);
    for (const k of Object.keys(BOWS)) expect(WEAPON_LAYERS[k], k).toBeDefined();
  });
  it("better bows hit harder and reach further", () => {
    expect(BOWS.recurve_bow.damage).toBeGreaterThan(BOWS.short_bow.damage);
    expect(BOWS.great_bow.damage).toBeGreaterThan(BOWS.recurve_bow.damage);
    expect(BOWS.great_bow.rangePx).toBeGreaterThan(BOWS.short_bow.rangePx);
    expect(bowOf(["wooden_sword", "short_bow", "great_bow"])?.key).toBe("great_bow");
    expect(bowOf(["wooden_sword"])).toBeNull();
  });
  it("shops sell the short bow and arrows; smiths make the recurve bow and arrows", () => {
    const pip = stockForNpc("shopkeeper").map((t) => t.itemKey);
    expect(pip).toContain("short_bow");
    expect(pip).toContain(ARROW_ITEM);
    const outs = RECIPES.filter((r) => r.crafterKey === "tinker" || r.crafterKey === "blacksmith").map((r) => r.output.itemKey);
    expect(outs).toContain("recurve_bow");
    expect(outs).toContain(ARROW_ITEM);
  });
  it("the character sheets hold the shoot rows", () => {
    expect(SHEET_W).toBeGreaterThanOrEqual(SHOOT_FRAMES * 64);
    expect(SHEET_H).toBeGreaterThanOrEqual((SHOOT_ROW + 4) * 64);
  });
});
