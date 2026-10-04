// Treasure maps: a scrap of hand-drawn map with a red X somewhere in the
// wilds. Read it in your bag to see the sketch (the land around the spot,
// with no names or numbers), find the place, and dig. The deeper into
// dangerous country, the richer the chest. Three maps chain into a trail
// that ends at a legendary cache. Maps come from bounties, encounters,
// wanted beasts, finished relic sets, and innkeepers who sell old rumours.
// Pure rules; the world side is src/lib/treasureServer.ts.

import type { TreasureLoot } from "@/types/treasure";

export type { TreasureLoot, TreasureMapOpts, TreasureMapView } from "@/types/treasure";

/** Dig within this many px of the X. */
export const DIG_REACH_PX = 40;
/** Closer than this, a wrong dig hints that you're near. */
export const DIG_WARM_PX = 14 * 16;
/** The sketch: this many tiles across and down, drawn this many px a tile. */
export const SKETCH_W = 56;
export const SKETCH_H = 36;
export const SKETCH_SCALE = 6;
/** The X sits at most this many tiles off the sketch's centre. */
export const SKETCH_JITTER = { x: 16, y: 10 } as const;
/** Undug maps a player can carry; more are turned away. */
export const MAX_MAPS = 6;
/** What an innkeeper charges for an old rumour (a tier 1–2 map). */
export const RUMOUR_PRICE = 60;
/** Bought maps per player per rolling day. */
export const RUMOUR_DAILY = 3;
/** Coins in a bought map's chest, as a share of an earned one's: about
 *  what you paid, so maps from the inn are for the hunt, not a mint. */
export const RUMOUR_COIN_SHARE = 0.6;
/** Parts in a trail to a legendary cache. */
export const TRAIL_PARTS = 3;

/** Chances a map turns up as a reward. */
export const MAP_CHANCE = { bounty: 0.25, encounter: 0.2, wanted: 0.5 } as const;

/** Things worth burying, by danger tier. */
const TIER_ITEMS: readonly (readonly string[])[] = [
  [],
  ["honey_bun", "bread", "hot_stew", "lantern"],
  ["stone_sword", "sharp_axe", "golden_carp", "lantern"],
  ["thorn_blade", "frost_pelt", "shade_essence", "golden_carp", "recurve_bow"],
  ["wisp_blade", "thorn_blade", "frost_pelt", "shade_essence", "great_bow"],
];

/** A chest's loot for a map of `tier` (1–4); a bought map's holds fewer coins. */
export function lootFor(tier: number, rand = Math.random, bought = false): TreasureLoot {
  const t = Math.max(1, Math.min(4, tier));
  const items = TIER_ITEMS[t];
  const coins = 40 * t + Math.floor(rand() * 30 * t);
  return {
    coins: bought ? Math.round(coins * RUMOUR_COIN_SHARE) : coins,
    xp: 35 * t,
    gems: t >= 3 ? t - 2 + (rand() < 0.5 ? 1 : 0) : 0,
    items: [{ itemKey: items[Math.floor(rand() * items.length)], qty: 1 }],
  };
}

/** The cache at the end of a trail. */
export const LEGENDARY_LOOT: TreasureLoot = { coins: 800, xp: 400, gems: 5, items: [{ itemKey: "sunken_cutlass", qty: 1 }] };
