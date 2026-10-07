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

/**
 * How many wild enemies a player's surroundings hold at danger `tier`.
 * Counted around each player, so players close together share one
 * population — a crowd doesn't multiply the beasts.
 */
export const wildTarget = (tier: number): number => 6 + 4 * tier;
/** Each spawn is a pack of the same kind: 1–3 near home, 2–4 further out, 2–5 in the far wilds
 *  (a kind's own `pack` wins: big beasts walk alone). */
export function wildPackSize(tier: number, rand = Math.random, kind?: string): number {
  const own = kind ? enemyKind(kind).pack : undefined;
  const [min, max] = own ?? (tier >= 4 ? [2, 5] : tier >= 3 ? [2, 4] : [1, 3]);
  return min + Math.floor(rand() * (max - min + 1));
}
/** The land ahead of a moving player is populated this many chunks out
 *  (always off their screen: the camera shows at most 1.5 chunks each way). */
export const POPULATE_AHEAD_CHUNKS = 3;
/** A chunk gets a new pack at most this often, for everyone: a cleared camp stays cleared a while. */
export const REPOPULATE_MS = 3 * 60_000;
/** Players this many chunks from a chunk count toward its crowd. */
export const CROWD_CHUNKS = 4;
/**
 * The chance a chunk holds a pack, by danger tier. Matches wildTarget's
 * density for a solo player: wildTarget(t) enemies around a player
 * (~11 chunks) over the tier's average pack size.
 */
export function chunkPackChance(tier: number): number {
  return tier <= 1 ? 0.44 : tier === 2 ? 0.6 : tier === 3 ? 0.53 : 0.56;
}
/** More players around, more enemies: +50% per extra player, at most ×3. */
export const crowdFactor = (players: number): number => Math.min(3, 1 + 0.5 * Math.max(0, players - 1));
/** A hard ceiling on wild enemies in the whole world (protects the database). */
export const WILD_MAX_TOTAL = 8000;

/** Which kinds live in a biome (heavier weight = more common). */
const BIOME_KINDS: Readonly<Record<Biome, Readonly<Record<string, number>>>> = {
  ocean: {},
  beach: { slime: 3, boar: 1, dune_stalker: 1, wyvern: 1 },
  meadow: { slime: 3, wolf: 2, boar: 2, gloam_stag: 1, wyvern: 1 },
  forest: { wolf: 3, boar: 2, thornling: 2, slime: 1, gloam_stag: 2, elder_treant: 1 },
  darkwood: { shade: 3, wolf: 1, thornling: 1, gloam_stag: 3, elder_treant: 2 },
  swamp: { lurker: 3, slime: 2, bog_hag: 3, elder_treant: 1 },
  desert: { scorpion: 4, bat: 1, dune_stalker: 4, wyvern: 1 },
  badlands: { scorpion: 3, boar: 1, dune_stalker: 2, wyvern: 3 },
  snow: { frostwolf: 4, bat: 1, ice_troll: 3, rime_wraith: 2 },
  peak: { bat: 2, boar: 1, basalt_golem: 3, wyvern: 1 },
  snowpeak: { frostwolf: 2, ice_troll: 2, rime_wraith: 3 },
  mesa: { scorpion: 2, basalt_golem: 3, wyvern: 2 },
};

/** A wild kind for this biome and tier (weighted), or null if none fits.
 *  Kinds within three tiers below to one above: the far lands keep their
 *  own beasts, not slimes. If none fits that window, the toughest the biome has. */
export function wildKindFor(biome: Biome, tier: number, night: boolean, rand = Math.random): string | null {
  const all = Object.entries(BIOME_KINDS[biome]).filter(([k]) => {
    const d = enemyKind(k);
    return d.tier !== "boss" && (night || !d.nightOnly);
  });
  const tierOf = (k: string) => enemyKind(k).tier as number;
  let opts = all.filter(([k]) => tierOf(k) <= tier + 1 && tierOf(k) >= tier - 3);
  if (!opts.length) {
    const fit = all.filter(([k]) => tierOf(k) <= tier + 1);
    const top = Math.max(...fit.map(([k]) => tierOf(k)));
    opts = fit.filter(([k]) => tierOf(k) === top);
  }
  const total = opts.reduce((s, [, w]) => s + w, 0);
  if (total === 0) return null;
  let r = rand() * total;
  for (const [k, w] of opts) { r -= w; if (r < 0) return k; }
  return opts[opts.length - 1][0];
}
