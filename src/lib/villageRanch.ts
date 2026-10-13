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
 *  heartland margin, src/lib/continent.ts), close enough to raid the hen yard. */
export const FOX_DEN: Rect = tileRect(VILLAGE_RANCH.tx + VILLAGE_RANCH.w + 1, VILLAGE_RANCH.ty + 33, 5, 18);
