// Furniture: every placeable piece (it has a sprite on the furniture sheet,
// src/game/furnitureArt.ts) and what it's worth. Made in carpenter's
// workshops (src/lib/ranchUpgrades.ts, lot "workshop"), placed in homes,
// put on show, sold to shops and ordered by NPCs (src/lib/commissions.ts).

import { FURNITURE_CELLS } from "@/game/furnitureArt";

export const FURNITURE_ITEMS: readonly string[] = Object.keys(FURNITURE_CELLS);

/** What each piece is worth (items seed `value`; shops pay about this). */
export const FURNITURE_VALUE: Readonly<Record<string, number>> = {
  chair: 10, stool: 6, table: 14, bookshelf: 16, cabinet: 20, wardrobe: 32,
  rocking_chair: 24, armchair: 30, sofa: 44, bed: 28, rug: 16, lamp: 12, plant: 8, painting: 15,
  polished_chair: 22, polished_table: 30, polished_cabinet: 42, polished_wardrobe: 66,
};
