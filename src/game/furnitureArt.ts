// The furniture sheet (scripts/draw-furniture.mjs → /assets/furniture.png):
// which 32×32 cell draws each placeable piece. Used by the Home panel
// (FurnitureSprite) and by the scene for workshop showrooms.

export const FURNITURE_SHEET = "/assets/furniture.png";
export const FURNITURE_CELL = 32;
export const FURNITURE_COLS = 6;

/** Item → cell index on the sheet (row-major, 6 per row). */
export const FURNITURE_CELLS: Readonly<Record<string, number>> = {
  chair: 0, stool: 1, table: 2, bookshelf: 3, cabinet: 4, wardrobe: 5,
  rocking_chair: 6, armchair: 7, sofa: 8, bed: 9, rug: 10, lamp: 11,
  plant: 12, painting: 13, polished_chair: 14, polished_table: 15, polished_cabinet: 16, polished_wardrobe: 17,
};

/** Top-left of an item's cell on the sheet, or null if it has no sprite. */
export function furnitureCell(itemKey: string): { x: number; y: number } | null {
  const i = FURNITURE_CELLS[itemKey];
  if (i == null) return null;
  return { x: (i % FURNITURE_COLS) * FURNITURE_CELL, y: Math.floor(i / FURNITURE_COLS) * FURNITURE_CELL };
}
