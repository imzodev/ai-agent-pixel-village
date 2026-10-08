// Lair bosses: one per far tier, in a lair in its own land, fully registered,
// returning 2 hours after they fall, paying a trophy and a chance at a blade
// beyond Bjorn's best.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { LAIR_BOSSES, LAIR_CLEARING, LAIR_RESPAWN_MS, LAIR_SPOTS, getsUnique, lairReady, lairSpot } from "@/lib/lairs";
import { BOWS, ENEMY_KINDS, WEAPONS, isBossKind } from "@/lib/progression";
import { MOVESETS } from "@/lib/combat/movesets";
import { ANIMAL_SPRITES } from "@/game/animalSprites";
import { WEAPON_LAYERS } from "@/game/lpc";
import { biomeAt, tierAt } from "@/lib/continent";
import { terrainWalkable } from "@/lib/regions";
import { wildKindFor } from "@/lib/wildlife";

const SEED = fs.readFileSync("src/lib/seed.ts", "utf8");

describe("lair bosses", () => {
  it("one per far tier, each a boss with attacks, art, a trophy and a unique weapon", () => {
    expect(LAIR_BOSSES.map((b) => b.tier)).toEqual([5, 6, 7, 8]);
    for (const b of LAIR_BOSSES) {
      expect(isBossKind(b.kind), b.kind).toBe(true);
      expect(ENEMY_KINDS[b.kind].hp).toBe(b.hp);
      expect(MOVESETS[b.kind]?.length).toBe(3);
      expect(fs.existsSync(`public${ANIMAL_SPRITES[b.kind].url}`), b.kind).toBe(true);
      for (const k of [b.trophy, b.unique]) expect(SEED, k).toContain(`key: "${k}"`);
      expect(WEAPON_LAYERS[b.unique], b.unique).toBeDefined();
    }
  });
  it("their blades go beyond Bjorn's best, tougher boss, better blade", () => {
    const blades = LAIR_BOSSES.map((b) => WEAPONS[b.unique]?.damage).filter((d) => d !== undefined) as number[];
    for (const d of blades) expect(d).toBeGreaterThan(WEAPONS.elder_blade.damage);
    expect([...blades].sort((a, b) => a - b)).toEqual(blades);
    expect(BOWS.dunecaller_bow.damage).toBeGreaterThan(BOWS.runed_bow.damage);
  });
  it("never spawn as wild enemies", () => {
    for (const b of ["desert", "snow", "badlands", "darkwood"] as const) for (let k = 0; k < 20; k++) {
      expect(LAIR_BOSSES.map((x) => x.kind)).not.toContain(wildKindFor(b, 8, true, () => k / 20));
    }
  });
});

describe("lairs", () => {
  it("each lies in its own land at its tier, on open ground with room to fight", () => {
    expect(LAIR_SPOTS).toHaveLength(LAIR_BOSSES.length);
    for (const b of LAIR_BOSSES) {
      const s = lairSpot(b.kind)!;
      expect(b.biomes, b.kind).toContain(biomeAt(s.tx, s.ty));
      expect(tierAt(s.tx, s.ty)).toBeGreaterThanOrEqual(b.tier);
      for (let dy = -LAIR_CLEARING + 3; dy <= LAIR_CLEARING - 3; dy += 3) for (let dx = -LAIR_CLEARING + 3; dx <= LAIR_CLEARING - 3; dx += 3) {
        if (Math.hypot(dx, dy) < LAIR_CLEARING - 2) expect(terrainWalkable(s.tx + dx, s.ty + dy), `${b.kind} at ${dx},${dy}`).toBe(true);
      }
    }
  });
  it("a boss returns 2 hours after it falls", () => {
    expect(lairReady(null, 0)).toBe(true);
    expect(lairReady(1000, 1000 + LAIR_RESPAWN_MS - 1)).toBe(false);
    expect(lairReady(1000, 1000 + LAIR_RESPAWN_MS)).toBe(true);
  });
  it("the unique weapon is a chance, not a given", () => {
    for (const b of LAIR_BOSSES) { expect(getsUnique(b, 0)).toBe(true); expect(getsUnique(b, 0.99)).toBe(false); }
  });
});
