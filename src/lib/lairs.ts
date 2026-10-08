// Lair bosses: one in each far land (danger tiers 5–8), in a lair on the
// map. A boss is there until someone beats it, then returns LAIR_RESPAWN_MS
// later. Everyone who dealt a fair share of its damage (bossRewardees) earns
// XP, coins and its trophy, and has a chance at its unique weapon, a step
// beyond Bjorn's best. Pure; tickd raises them (src/lib/sim.ts), the attack
// API pays out (src/app/api/act/route.ts). Lair spots: scripts/gen-lairs.ts.

import LAIR_SPOTS_JSON from "./lairsData.json";
import type { LairBoss, LairSpot } from "@/types/lairs";

export type { LairBoss, LairSpot } from "@/types/lairs";

/** A beaten boss returns this long after it fell. */
export const LAIR_RESPAWN_MS = 2 * 3600_000;
/** No trees, water or rocks this close to a lair (tiles), so there's room to fight. */
export const LAIR_CLEARING = 10;

export const LAIR_BOSSES: readonly LairBoss[] = [
  { kind: "sand_wyrm", name: "Sand Wyrm", lair: "the Glass Pit", tier: 5, biomes: ["desert"], hp: 1200, damage: 26, xp: 600, coins: 120, trophy: "wyrm_fang", unique: "dunecaller_bow", uniqueChance: 0.25, icon: "🐛" },
  { kind: "frost_giant", name: "Frost Giant", lair: "the Rime Hall", tier: 6, biomes: ["snow"], hp: 1800, damage: 34, xp: 900, coins: 180, trophy: "giant_heart", unique: "glacier_blade", uniqueChance: 0.25, icon: "🧊" },
  { kind: "fire_drake", name: "Fire Drake", lair: "the Cinder Roost", tier: 7, biomes: ["badlands", "mesa"], hp: 2400, damage: 42, xp: 1200, coins: 240, trophy: "drake_horn", unique: "drakefire_blade", uniqueChance: 0.2, icon: "🐉" },
  { kind: "the_hollow", name: "the Hollow", lair: "the Hollow Grove", tier: 8, biomes: ["darkwood"], hp: 3200, damage: 50, xp: 1600, coins: 320, trophy: "hollow_eye", unique: "hollow_edge", uniqueChance: 0.15, icon: "👁️" },
];

export const LAIR_SPOTS: readonly LairSpot[] = LAIR_SPOTS_JSON as LairSpot[];
export const lairBoss = (kind: string): LairBoss | undefined => LAIR_BOSSES.find((b) => b.kind === kind);
export const lairSpot = (kind: string): LairSpot | undefined => LAIR_SPOTS.find((s) => s.kind === kind);

/** Should the boss be in its lair now? (never beaten, or beaten long enough ago) */
export function lairReady(defeatedAt: number | null, now: number): boolean {
  return defeatedAt === null || now - defeatedAt >= LAIR_RESPAWN_MS;
}

/** Does this fighter get the unique weapon? (`roll` in [0, 1)) */
export const getsUnique = (b: LairBoss, roll: number): boolean => roll < b.uniqueChance;
