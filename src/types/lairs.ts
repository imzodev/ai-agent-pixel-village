// Lair bosses of the far lands (src/lib/lairs.ts). Types only.
import type { Biome } from "./continent";

export type LairBoss = {
  /** The boss's enemy kind (ENEMY_KINDS, tier "boss"). */
  kind: string;
  name: string;
  lair: string;
  /** The far-land danger tier it guards. */
  tier: 5 | 6 | 7 | 8;
  /** Lands its lair may stand in. */
  biomes: readonly Biome[];
  hp: number;
  damage: number;
  /** What each fighter who did enough damage earns. */
  xp: number;
  coins: number;
  trophy: string;
  /** Its unique weapon, and the chance each fighter gets one. */
  unique: string;
  uniqueChance: number;
  icon: string;
};

/** Where a lair stands (scripts/gen-lairs.ts → src/lib/lairsData.json). */
export type LairSpot = { kind: string; tx: number; ty: number };
