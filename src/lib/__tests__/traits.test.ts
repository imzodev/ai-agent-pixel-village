import { describe, expect, it } from "vitest";
import { ORIGINS, TRAITS, TRAIT_CHANGE_MS, TRAIT_PICKS, canChoose, choiceProblem, earnedTraitFor, heroLine } from "@/lib/traits";
import { KNOWN_AT, QUALITIES, knownFor, qualitiesOf, qualityTitles, scoreOf } from "@/lib/qualities";
import { itemDef } from "@/lib/itemDefs";
import { MEMBER_COSMETICS } from "@/lib/membership";
import type { QualityTallies } from "@/types/qualities";
import type { TraitKey } from "@/types/traits";

describe("origins and traits", () => {
  it("every origin's kit is real goods, and small", () => {
    for (const o of ORIGINS) {
      for (const it of o.kit.items ?? []) expect(itemDef(it.itemKey), it.itemKey).toBeTruthy();
      const worth = (o.kit.coins ?? 0) + (o.kit.items ?? []).reduce((s, it) => s + (itemDef(it.itemKey)?.value ?? 0) * it.qty, 0);
      expect(worth).toBeLessThanOrEqual(50);
    }
  });

  it("a choice needs a known origin and two different known traits", () => {
    expect(choiceProblem("farmhand", ["lucky", "brave"])).toBeNull();
    expect(choiceProblem("king", ["lucky", "brave"])).not.toBeNull();
    expect(choiceProblem("farmhand", ["lucky"])).not.toBeNull();
    expect(choiceProblem("farmhand", ["lucky", "lucky"])).not.toBeNull();
    expect(choiceProblem("farmhand", ["lucky", "rich"])).not.toBeNull();
    expect(TRAIT_PICKS).toBe(2);
  });

  it("can be changed only on the first day", () => {
    expect(canChoose(null, 1e12)).toBe(true);
    expect(canChoose(1e12, 1e12 + TRAIT_CHANGE_MS - 1)).toBe(true);
    expect(canChoose(1e12, 1e12 + TRAIT_CHANGE_MS)).toBe(false);
  });

  it("no trait touches a price, and membership grants none", () => {
    for (const t of TRAITS) expect(t.description).not.toMatch(/price|discount|cheaper|sell for|pay/i);
    expect(JSON.stringify(MEMBER_COSMETICS)).not.toMatch(/trait/i);
  });

  it("a story teaches what it asked most, never one already held", () => {
    expect(earnedTraitFor(["defeat", "defeat", "talk"], new Set())).toBe("brave");
    expect(earnedTraitFor(["defeat", "defeat", "talk"], new Set<TraitKey>(["brave"]))).toBe("hardy");
    expect(earnedTraitFor(["fish", "fish", "talk"], new Set())).toBe("angler");
    expect(earnedTraitFor(["talk"], new Set(TRAITS.map((t) => t.key)))).toBeNull();
    // With the taught ones held, any trait still missing.
    const most = new Set(TRAITS.map((t) => t.key).filter((k) => k !== "angler"));
    expect(earnedTraitFor(["defeat"], most)).toBe("angler");
  });

  it("NPCs hear where you're from and what you're like", () => {
    expect(heroLine("Ada", { origin: null, picked: [], earned: [] })).toBeNull();
    const line = heroLine("Ada", { origin: "farmhand", picked: ["charming", "lucky"], earned: ["brave"] })!;
    expect(line).toContain("Ada grew up on a farm");
    expect(line).toContain("easy to like, famously lucky and brave to a fault");
    expect(heroLine("Ada", { origin: null, picked: ["hardy"], earned: [] })).toContain("Ada is tough as old boots");
  });
});

describe("qualities", () => {
  const zero: QualityTallies = { foes: 0, bounties: 0, regard: 0, missions: 0, reputation: 0, shifts: 0, crops: 0, fish: 0 };

  it("grow on a log scale, capped at 100", () => {
    expect(scoreOf(0)).toBe(0);
    expect(scoreOf(9)).toBe(25);
    expect(scoreOf(99)).toBe(50);
    expect(scoreOf(1e9)).toBe(100);
    expect(scoreOf(-5)).toBe(0);
  });

  it("each is measured from its own deeds", () => {
    const q = qualitiesOf({ ...zero, foes: 200, bounties: 10 });
    expect(q.courage).toBeGreaterThan(50);
    expect(q.kindness).toBe(0);
    expect(qualitiesOf({ ...zero, crops: 50, fish: 40, shifts: 2 }).industry).toBeGreaterThan(0);
    expect(qualitiesOf({ ...zero, regard: 30, missions: 4 }).kindness).toBeGreaterThan(0);
    expect(qualitiesOf({ ...zero, reputation: 120 }).cunning).toBeGreaterThan(50);
  });

  it("unlock titles at 50 and 80, and the best stands out for NPCs", () => {
    expect(qualityTitles({ courage: 49, kindness: 0, cunning: 0, industry: 0 })).toEqual([]);
    expect(qualityTitles({ courage: 80, kindness: 50, cunning: 0, industry: 0 })).toEqual([...QUALITIES[0].titles, QUALITIES[1].titles[0]]);
    expect(knownFor({ courage: KNOWN_AT - 1, kindness: 0, cunning: 0, industry: 0 })).toBeNull();
    expect(knownFor({ courage: 40, kindness: 60, cunning: 0, industry: 0 })?.key).toBe("kindness");
  });
});
