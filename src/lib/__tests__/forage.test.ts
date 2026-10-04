// Wild foraging in a shared world: every player picks each patch on their
// own cooldown, and patches are spread over the continent by biome.
import { describe, expect, it } from "vitest";
import { FORAGE_COOLDOWN_MS, forageKey, forageSpots, isForage, readyIn } from "@/lib/forage";
import { biomeAt, continentAt, inHeartland } from "@/lib/continent";
import { townAt } from "@/lib/settlements";
import { CROP_KINDS } from "@/lib/crops";

describe("personal picks", () => {
  it("only wild patches are personal; crops and trees aren't", () => {
    for (const k of ["herb_patch", "berry_bush", "mushroom_ring", "rock"]) expect(isForage(k)).toBe(true);
    for (const k of ["oak_tree", "radish_crop", "wheat_field"]) expect(isForage(k)).toBe(false);
  });
  it("come back after the cooldown — for you", () => {
    const t = 1_000_000;
    expect(readyIn("herb_patch", null, t)).toBe(0);
    expect(readyIn("herb_patch", t, t + 60_000)).toBe(FORAGE_COOLDOWN_MS.herb_patch - 60_000);
    expect(readyIn("herb_patch", t, t + FORAGE_COOLDOWN_MS.herb_patch)).toBe(0);
  });
  it("know a patch by kind and place (stable across reseeds)", () => {
    expect(forageKey("rock", 100.4, 200.6)).toBe("rock@100,201");
  });
});

describe("patches across the continent", () => {
  const spots = forageSpots();
  it("plenty of every kind, herbs most of all", () => {
    const count = (k: string) => spots.filter((s) => s[0] === k).length;
    expect(spots.length).toBeGreaterThan(300);
    for (const k of ["herb_patch", "berry_bush", "mushroom_ring", "rock"]) expect(count(k), k).toBeGreaterThan(30);
    for (const [k] of spots) expect(CROP_KINDS[k], k).toBeDefined();
  });
  it("only on open ground in the wilds", () => {
    for (const [, , tx, ty] of spots) {
      expect(inHeartland(tx, ty) || !!townAt(tx, ty)).toBe(false);
      const c = continentAt(tx, ty);
      expect(c.lower ?? c.collide ?? null, `${tx},${ty}`).toBeFalsy();
    }
  });
  it("swamps grow herbs (Reedhollow's bounties can be done)", () => {
    expect(spots.some(([k, , tx, ty]) => k === "herb_patch" && biomeAt(tx, ty) === "swamp")).toBe(true);
  });
});
