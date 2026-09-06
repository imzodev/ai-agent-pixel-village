// Shared world geometry. Used by the server (simulation, collision) and the
// Phaser client (rendering). Keep this dependency-free.

import { isWalkableAt, CHUNK_PX_W, CHUNK_PX_H, CHUNK_TILE_PX } from "./chunkCollision";

export const TILE = 32;
export const MAP_W = 64; // tiles
export const MAP_H = 44;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export type Rect = { x: number; y: number; w: number; h: number };

export type BuildingDef = {
  key: string;
  name: string;
  kind: string;
  description: string;
  color: string;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  menu: string[];
  reservable: boolean;
};

// Building entries are temporarily disabled - the chunk tiles already include
// building art and the JSON-overlay renderer / DB rows are paused. The
// shape and importable `BuildingDef` are preserved so the system can be
// re-enabled by populating this array.
export const BUILDINGS: BuildingDef[] = [];

export const PLAZA: Rect = { x: 26 * TILE, y: 17 * TILE, w: 12 * TILE, h: 9 * TILE };
export const POND: Rect = { x: 50 * TILE, y: 32 * TILE, w: 8 * TILE, h: 6 * TILE };

export const SPAWN = { x: PLAZA.x + PLAZA.w / 2, y: PLAZA.y + PLAZA.h / 2 + 40 };

export function buildingRects(): (Rect & { key: string })[] {
  return BUILDINGS.map((b) => ({
    key: b.key,
    x: b.tx * TILE,
    y: b.ty * TILE,
    w: b.tw * TILE,
    h: b.th * TILE,
  }));
}

/** Is a character (feet point) allowed at (x, y)?
 *  Delegates to the chunk collision registry: a tile is blocked when the
 *  chunk's DecorationLower layer has a non-zero GID there. Chunks that are
 *  not loaded/registered yet are walkable by default. */
export function isWalkable(x: number, y: number) {
  return isWalkableAt(x, y);
}

/** Rect spanning `chunksWide × chunksHigh` chunks, top-left at chunk (cx, cy).
 *  Chunk cy=+1 is up the screen (see chunkCollision). */
export function chunkRect(cx: number, cy: number, chunksWide: number, chunksHigh: number): Rect {
  return { x: cx * CHUNK_PX_W, y: -cy * CHUNK_PX_H, w: chunksWide * CHUNK_PX_W, h: chunksHigh * CHUNK_PX_H };
}

/** Rect in 16px world tiles: (tx, ty) = top-left tile, size in tiles.
 *  Tile ty grows DOWNWARD (matches screen space — unlike chunk cy). */
export function tileRect(tx: number, ty: number, tw: number, th: number): Rect {
  return { x: tx * CHUNK_TILE_PX, y: ty * CHUNK_TILE_PX, w: tw * CHUNK_TILE_PX, h: th * CHUNK_TILE_PX };
}

/** World-tile center point (tx, ty), ty growing downward. */
export function tilePoint(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * CHUNK_TILE_PX + CHUNK_TILE_PX / 2, y: ty * CHUNK_TILE_PX + CHUNK_TILE_PX / 2 };
}

/** Zones where wildlife appears. Anchored to the chunk world: the authored
 *  town spans chunks (-1..4, -2..2), i.e. x -384..1920 / y -480..720, so the
 *  wild ring sits just outside it — north woods, south meadow, east field and
 *  west woods. */
export const WILD_ZONES: Rect[] = [
  chunkRect(0, 4, 3, 2),   // north woods (chunks 0..2, cy 3..4)
  chunkRect(0, -4, 3, 2),  // south meadow (chunks 0..2, cy -4..-3)
  chunkRect(5, 2, 2, 5),   // east field (chunks 5..6, cy -2..2)
  chunkRect(-4, 2, 2, 5),  // west woods (chunks -4..-3, cy -2..2)
];

/** Game clock: 1 game day = dayLengthMinutes real minutes. Returns 0..24 hours. */
export function gameHour(epochStartMs: number, dayLengthMinutes: number, nowMs = Date.now()) {
  const dayMs = dayLengthMinutes * 60_000;
  const t = ((nowMs - epochStartMs) % dayMs) / dayMs;
  return (t * 24 + 7) % 24; // world starts at 7am
}
