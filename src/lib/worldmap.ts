// Shared world geometry. Used by the server (simulation, collision) and the
// Phaser client (rendering). Keep this dependency-free.

import { isWalkableAt } from "./chunkCollision";

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

/** Zones where wildlife appears (outside the village core). */
export const WILD_ZONES: Rect[] = [
  { x: 4 * TILE, y: 36 * TILE, w: 20 * TILE, h: 6 * TILE },
  { x: 52 * TILE, y: 2 * TILE, w: 10 * TILE, h: 12 * TILE },
  { x: 2 * TILE, y: 26 * TILE, w: 8 * TILE, h: 10 * TILE },
];

/** Game clock: 1 game day = dayLengthMinutes real minutes. Returns 0..24 hours. */
export function gameHour(epochStartMs: number, dayLengthMinutes: number, nowMs = Date.now()) {
  const dayMs = dayLengthMinutes * 60_000;
  const t = ((nowMs - epochStartMs) % dayMs) / dayMs;
  return (t * 24 + 7) % 24; // world starts at 7am
}
