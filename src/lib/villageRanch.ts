// The Village Ranch: a big fenced public ranch east of the village where the
// village's farm animals live, each kind in its own paddock. Its layout is
// src/lib/villageRanch.json, shared with the art (scripts/draw-village-ranch.mjs,
// which cuts the picture into the scenery stamps listed in
// villageRanchStamps.json and public/buildings/buildings.json). The paddocks
// are the animals' wander zones (src/lib/seed.ts ANIMAL_DEFS).

import LAYOUT from "./villageRanch.json";
import STAMPS from "./villageRanchStamps.json";
import { tileRect, type Rect } from "@/lib/worldmap";
import type { RanchSpecies } from "@/types/villageRanch";
import { RANCH_PICKS } from "@/lib/ranchPicks";

const SW = 24, SH = 15;

/** The ranch's top-left tile and size in tiles. */
export const VILLAGE_RANCH = { tx: LAYOUT.origin.tx, ty: LAYOUT.origin.ty, w: LAYOUT.stamps.cols * SW, h: LAYOUT.stamps.rows * SH } as const;

/** The ranch's stamps (buildings.json entries) and the tilesets they draw from. */
export const VILLAGE_RANCH_STAMPS = STAMPS.stamps;
export const VILLAGE_RANCH_TILESETS: readonly string[] = STAMPS.tilesets;

/** A species' paddock as world tiles [tx, ty, w, h]. */
export function paddockTiles(species: RanchSpecies): [number, number, number, number] {
  const [c, r, w, h] = LAYOUT.paddocks[species];
  return [VILLAGE_RANCH.tx + c, VILLAGE_RANCH.ty + r, w, h];
}

/** A species' paddock in world pixels: its animals' wander zone. */
export function paddock(species: RanchSpecies): Rect {
  return tileRect(...paddockTiles(species));
}

/** The fox's den: the open meadow just east of the ranch's fence (inside the
 *  heartland margin, src/lib/continent.ts), beside the gap in the east fence
 *  (layout gates.east) it slips through, by the orchard, into the hen yard. */
export const FOX_DEN: Rect = tileRect(VILLAGE_RANCH.tx + VILLAGE_RANCH.w + 1, VILLAGE_RANCH.ty + 52, 5, 18);

/** The lamp posts along the ranch's lanes, as world tiles (their lights: src/game/buildingStamps.ts). */
export const VILLAGE_RANCH_LAMPS: readonly [number, number][] = LAYOUT.lamps.map(([c, r]) => [VILLAGE_RANCH.tx + c, VILLAGE_RANCH.ty + r]);

/**
 * The garden's crops and the beehives' pick spots, as seed nodes [kind, item,
 * tx, ty]: a row along the back of each bed, a plant every two tiles (each
 * sprite is two tiles wide), and one on each beehive.
 */
export function ranchPickSpots(): [string, string, number, number][] {
  const out: [string, string, number, number][] = [];
  const at = (kind: string, c: number, r: number) => { if (RANCH_PICKS[kind]) out.push([kind, RANCH_PICKS[kind].item, VILLAGE_RANCH.tx + c, VILLAGE_RANCH.ty + r]); };
  for (const [c, r, w, h, crop] of LAYOUT.beds as [number, number, number, number, string][]) {
    for (let x = c; x < c + w; x += 2) at(`ranch_${crop}`, x, r + h - 1);
  }
  for (const [c, r] of LAYOUT.beehives) at("ranch_beehive", c, r);
  return out;
}
