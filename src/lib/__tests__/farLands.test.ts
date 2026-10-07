// Danger tiers 5–8 of the bigger continent: the rings, the scaling, and the
// far lands' foes (each fully registered, every biome covered).
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTINENT, biomeAt, inHeartland, tierAt } from "@/lib/continent";
import { ENEMY_KINDS, MAX_TIER, WEAPONS, BOWS, enemyDmgAt, enemyHpAt, enemyXpAt } from "@/lib/progression";
import { MOVESETS } from "@/lib/combat/movesets";
import { ANIMAL_SPRITES } from "@/game/animalSprites";
import { wildKindFor, wildPackSize } from "@/lib/wildlife";
import { wantedName } from "@/lib/bounties";
import { RECIPES } from "@/lib/recipes";
import type { Biome } from "@/types/continent";

const SEED = fs.readFileSync("src/lib/seed.ts", "utf8");
const FAR = ["dune_stalker", "bog_hag", "ice_troll", "gloam_stag", "basalt_golem", "wyvern", "rime_wraith", "elder_treant"];
const BIOMES: Biome[] = ["beach", "meadow", "forest", "darkwood", "swamp", "desert", "badlands", "snow", "peak", "snowpeak", "mesa"];

describe("danger tiers", () => {
  it("go from 1 at the village to 8 in the far corners; the heartland stays ≤ 2", () => {
    expect(tierAt(32, 21)).toBe(1);
    let max = 0;
    for (let y = CONTINENT.ty0; y <= CONTINENT.ty1; y += 60) for (let x = CONTINENT.tx0; x <= CONTINENT.tx1; x += 60) max = Math.max(max, tierAt(x, y));
    expect(max).toBe(MAX_TIER);
    for (let x = -800; x <= 150; x += 50) if (inHeartland(x, 7)) expect(tierAt(x, 7)).toBeLessThanOrEqual(2);
  });
  it("scale HP, damage and XP all the way up, steadily", () => {
    for (let t = 2; t <= MAX_TIER; t++) {
      expect(enemyHpAt("wolf", t)).toBeGreaterThan(enemyHpAt("wolf", t - 1));
      expect(enemyDmgAt("wolf", t)).toBeGreaterThan(enemyDmgAt("wolf", t - 1));
      expect(enemyXpAt("wolf", t)).toBeGreaterThan(enemyXpAt("wolf", t - 1));
    }
    expect(enemyHpAt("wolf", 12)).toBe(enemyHpAt("wolf", MAX_TIER)); // capped
  });
});

describe("the far lands' foes", () => {
  it("are fully registered: tier 5–8, attacks, art, icon, bounty names, real drops", () => {
    const icons = fs.readFileSync("src/lib/collection.ts", "utf8");
    for (const k of FAR) {
      const d = ENEMY_KINDS[k];
      expect(d, k).toBeDefined();
      expect(d.tier as number).toBeGreaterThanOrEqual(5);
      expect(MOVESETS[k]?.length, k).toBeGreaterThan(0);
      expect(ANIMAL_SPRITES[k]?.url, k).toBe(`/assets/animals/${k}.png`);
      expect(fs.existsSync(`public${ANIMAL_SPRITES[k].url}`), k).toBe(true);
      expect(icons, k).toContain(`${k}:`);
      expect(wantedName(() => 0.4, k)).not.toMatch(/Ironjaw|Ashfang|Greymane/); // its own names, not the wolf's
      for (const drop of d.drops) expect(SEED, drop.itemKey).toContain(`key: "${drop.itemKey}"`);
    }
  });
  it("live in every biome at every tier, by day and by night", () => {
    // peaks, snowpeaks, mesas, darkwood and swamp are always one tier harder (tierAt): never tier 1
    const harsh = new Set<Biome>(["peak", "snowpeak", "mesa", "darkwood", "swamp"]);
    for (const b of BIOMES) for (let t = harsh.has(b) ? 2 : 1; t <= MAX_TIER; t++) for (const night of [false, true]) {
      expect(wildKindFor(b, t, night, () => 0.5), `${b} tier ${t}${night ? " night" : ""}`).not.toBeNull();
    }
  });
  it("the far lands keep their own beasts (no slimes at tier 8)", () => {
    for (const b of BIOMES) for (let k = 0; k < 20; k++) {
      const kind = wildKindFor(b, 8, true, () => k / 20)!;
      expect(ENEMY_KINDS[kind].tier as number, `${b}: ${kind}`).toBeGreaterThanOrEqual(5);
    }
  });
  it("big beasts walk alone", () => {
    for (let k = 0; k < 20; k++) {
      expect(wildPackSize(7, () => k / 20, "basalt_golem")).toBe(1);
      expect(wildPackSize(8, () => k / 20, "elder_treant")).toBe(1);
    }
  });
  it("only appear far out: none within the old continent's first rings", () => {
    for (let y = -300; y <= 300; y += 25) for (let x = -500; x <= 200; x += 25) {
      if (inHeartland(x, y)) continue;
      const t = tierAt(x, y);
      if (t <= 2) expect(FAR).not.toContain(wildKindFor(biomeAt(x, y), t, true, () => 0.99));
    }
  });
});

describe("gear for the far lands", () => {
  it("Bjorn forges each step from the one before and its land's trophies, each better", () => {
    const chain = ["wisp_blade", "steel_sword", "wyvernbone_blade", "elder_blade"];
    for (let i = 1; i < chain.length; i++) {
      const r = RECIPES.find((x) => x.output.itemKey === chain[i])!;
      expect(r, chain[i]).toBeDefined();
      expect(r.inputs.map((x) => x.itemKey)).toContain(chain[i - 1]);
      expect(WEAPONS[chain[i]].damage).toBeGreaterThan(WEAPONS[chain[i - 1]].damage);
    }
    expect(BOWS.runed_bow.damage).toBeGreaterThan(BOWS.great_bow.damage);
    for (const k of [...chain.slice(1), "runed_bow"]) expect(SEED, k).toContain(`key: "${k}"`);
  });
});
