// The continent's wild side: biome-appropriate enemies by danger tier,
// danger rising away from the village, and named provinces.
import { describe, expect, it } from "vitest";
import { wildKindFor, wildTarget } from "@/lib/wildlife";
import { ENEMY_KINDS } from "@/lib/progression";
import { ANIMAL_SPRITES } from "@/game/animalSprites";
import { PROVINCES, provinceAt, tierAt } from "@/lib/continent";
import { PLACES, regionAt } from "@/lib/regions";

describe("wild enemies", () => {
  it("fit their biome", () => {
    const pick = (b: Parameters<typeof wildKindFor>[0], tier: number) => new Set(Array.from({ length: 60 }, (_, i) => wildKindFor(b, tier, false, () => (i + 0.5) / 60)));
    expect(pick("desert", 3)).toEqual(new Set(["scorpion", "bat"]));
    expect(pick("swamp", 3).has("lurker")).toBe(true);
    expect(pick("snow", 3).has("frostwolf")).toBe(true);
    expect(pick("darkwood", 3).has("shade")).toBe(true);
    expect(wildKindFor("ocean", 4, false)).toBeNull();
  });
  it("respect the danger tier and the night", () => {
    // tier-3 kinds don't appear where the danger is tier 1
    for (let i = 0; i < 40; i++) expect(wildKindFor("swamp", 1, false, () => i / 40)).not.toBe("lurker");
    expect(wildTarget(4)).toBeGreaterThan(wildTarget(1));
  });
  it("every new kind has stats and a sprite", () => {
    for (const k of ["scorpion", "lurker", "frostwolf", "shade"]) {
      expect(ENEMY_KINDS[k], k).toBeDefined();
      expect(ANIMAL_SPRITES[k], k).toBeDefined();
    }
  });
});

describe("danger and provinces", () => {
  it("danger rises away from the village", () => {
    expect(tierAt(32, 21)).toBe(1);
    expect(tierAt(-900, -300)).toBe(4);
    expect(tierAt(-700, 7)).toBeLessThanOrEqual(2); // the heartland stays gentle
  });
  it("the wilds are split into named provinces", () => {
    expect(PROVINCES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PROVINCES.map((p) => p.name)).size).toBe(PROVINCES.length);
    expect(provinceAt(-300, -200)).not.toBeNull();
    expect(provinceAt(0, 7)).toBeNull(); // the heartland keeps its own regions
    expect(regionAt(-300 * 16, -200 * 16)?.key).toMatch(/^prov_/);
    expect(regionAt(-200 * 16, 7 * 16)?.key).toBe("whisperwood");
    expect(new Set(PLACES.map((p) => p.key)).size).toBe(PLACES.length);
  });
});
