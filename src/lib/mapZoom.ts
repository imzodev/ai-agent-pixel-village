// The world map panel's zoom and panning (pure): a few fixed levels, each
// shown with exactly one set of map pictures at their real size, and a
// camera that can't zoom out past "the world fits" or pan the map off-screen.

import { CONTINENT } from "./continentBox";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import { MAP_BOUNDS } from "./worldAtlas";
import type { MapCamera, MapTileBox } from "@/types/map";

/** Screen pixels per world tile, most zoomed in first. */
export const ZOOM_LEVELS: readonly number[] = [4, 2, 1, 0.5, 0.25, 0.125];
/** The level the map opens at. */
export const OPEN_LEVEL = 1; // 2 px per tile

/** The map picture zoom drawn at a scale: 1 px per tile and up use zoom 0. */
export const tileZoomFor = (scale: number): number => (scale >= 1 ? 0 : Math.round(Math.log2(1 / scale)));
/** The most zoomed-out picture the panel ever asks for (the server draws 0…this). */
export const MAX_TILE_ZOOM = tileZoomFor(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);

/** What zooming out shows at most: the continent, with a little sea. */
export const FIT_BOX: MapTileBox = { tx0: CONTINENT.tx0 - 40, ty0: CONTINENT.ty0 - 40, tx1: CONTINENT.tx1 + 40, ty1: CONTINENT.ty1 + 40 };
/** Where the camera may go: everything mapped (the continent, and the caverns up north). */
export const PAN_BOX: MapTileBox = {
  tx0: MAP_BOUNDS.cx0 * CHUNK_TILE_W, tx1: (MAP_BOUNDS.cx1 + 1) * CHUNK_TILE_W - 1,
  ty0: -MAP_BOUNDS.cy1 * CHUNK_TILE_H, ty1: (-MAP_BOUNDS.cy0 + 1) * CHUNK_TILE_H - 1,
};

/** The most zoomed-out level index for a view of w × h screen px: the first at which the continent fits. */
export function maxLevelFor(w: number, h: number, box: MapTileBox = FIT_BOX): number {
  const tw = box.tx1 - box.tx0 + 1, th = box.ty1 - box.ty0 + 1;
  for (let i = 0; i < ZOOM_LEVELS.length; i++) if (ZOOM_LEVELS[i] * tw <= w && ZOOM_LEVELS[i] * th <= h) return i;
  return ZOOM_LEVELS.length - 1;
}

/** Keep the camera's view inside the box (centred on an axis the view is wider than). Camera in world px. */
export function clampCamera(cam: MapCamera, w: number, h: number, box: MapTileBox = PAN_BOX): MapCamera {
  const clampAxis = (c: number, lo: number, hi: number, viewTiles: number) => {
    const span = (hi - lo + 1) * 16, view = viewTiles * 16;
    if (view >= span) return (lo * 16 + (hi + 1) * 16) / 2; // smaller than the view: centred
    return Math.max(lo * 16 + view / 2, Math.min((hi + 1) * 16 - view / 2, c));
  };
  return { ...cam, x: clampAxis(cam.x, box.tx0, box.tx1, w / cam.scale), y: clampAxis(cam.y, box.ty0, box.ty1, h / cam.scale) };
}
