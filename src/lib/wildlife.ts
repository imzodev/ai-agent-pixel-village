// Life in the continent's wilds: enemies that appear around players, by
// biome and danger tier, and go away when nobody's near. Simulation cost
// follows the players, not the size of the world (src/lib/sim.ts runs it).
// Pure rules here.

import { enemyKind } from "./progression";
import type { Biome } from "@/types/continent";

/** Wild enemies count around a player within this many px… */
export const WILD_RADIUS_PX = 36 * 16;
/** …spawn this far from them (px), out of sight… */
export const WILD_SPAWN_MIN_PX = 14 * 16;
export const WILD_SPAWN_MAX_PX = 30 * 16;
/** …wander this many tiles around where they appeared… */
export const WILD_LEASH_TILES = 8;
/** …and fade once nobody has been near for this long. */
export const WILD_DESPAWN_MS = 5 * 60_000;

/** How many wild enemies a player's surroundings hold at danger `tier`. */
export const wildTarget = (tier: number): number => 2 + tier;

/** Which kinds live in a biome (heavier weight = more common). */
const BIOME_KINDS: Readonly<Record<Biome, Readonly<Record<string, number>>>> = {
  ocean: {},
  beach: { slime: 3, boar: 1 },
  meadow: { slime: 3, wolf: 2, boar: 2 },
  forest: { wolf: 3, boar: 2, thornling: 2, slime: 1 },
  darkwood: { shade: 3, wolf: 1, thornling: 1 },
  swamp: { lurker: 3, slime: 2 },
  desert: { scorpion: 4, bat: 1 },
  badlands: { scorpion: 3, boar: 1 },
  snow: { frostwolf: 4, bat: 1 },
  peak: { bat: 2, boar: 1 },
  snowpeak: { frostwolf: 2 },
  mesa: { scorpion: 2 },
};

/** A wild kind for this biome and tier (weighted), or null if none fits. */
export function wildKindFor(biome: Biome, tier: number, night: boolean, rand = Math.random): string | null {
  const opts = Object.entries(BIOME_KINDS[biome]).filter(([k]) => {
    const d = enemyKind(k);
    return d.tier !== "boss" && d.tier <= tier + 1 && (night || !d.nightOnly);
  });
  const total = opts.reduce((s, [, w]) => s + w, 0);
  if (total === 0) return null;
  let r = rand() * total;
  for (const [k, w] of opts) { r -= w; if (r < 0) return k; }
  return opts[opts.length - 1][0];
}
