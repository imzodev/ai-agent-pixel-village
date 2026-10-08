// The world map's overview, in blocks (pure geometry): the map at one pixel
// per OVERVIEW_STEP tiles, cut into BLOCK_TW × BLOCK_TH-tile blocks, one file
// each under .cache/map/<mapVersion>/blocks/. Terrain only (buildings are
// painted on when a tile is cut), keyed by the stable map version, so
// homestead rows opening never rebuild it. A zoom-1 tile needs only the
// blocks it covers, so the map fills in where people look, piece by piece.
// Drawn by src/lib/mapRender.ts in background workers.

import path from "node:path";
import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import { MAP_BOUNDS, MAP_TILE_H, MAP_TILE_W, mapTileInBounds, mapTileRect } from "./worldAtlas";
import type { OverviewFrame } from "@/types/mapRender";

/** Tiles per overview pixel: zoom 1 is 1:1 with it. */
export const OVERVIEW_STEP = 2;
/** A block, in tiles (and so 128 × 80 overview pixels). */
export const BLOCK_TW = 256, BLOCK_TH = 160;
export const BLOCK_PW = BLOCK_TW / OVERVIEW_STEP, BLOCK_PH = BLOCK_TH / OVERVIEW_STEP;

/** The overview covers the map bounds. */
export function overviewFrame(): OverviewFrame {
  const tx0 = MAP_BOUNDS.cx0 * CHUNK_TILE_W, ty0 = -MAP_BOUNDS.cy1 * CHUNK_TILE_H;
  const tw = (MAP_BOUNDS.cx1 - MAP_BOUNDS.cx0 + 1) * CHUNK_TILE_W, th = (MAP_BOUNDS.cy1 - MAP_BOUNDS.cy0 + 1) * CHUNK_TILE_H;
  return { tx0, ty0, blocksX: Math.ceil(tw / BLOCK_TW), blocksY: Math.ceil(th / BLOCK_TH) };
}

/** The block holding world tile (tx, ty), or null outside the overview. */
export function blockOf(tx: number, ty: number, f = overviewFrame()): { bx: number; by: number } | null {
  const bx = Math.floor((tx - f.tx0) / BLOCK_TW), by = Math.floor((ty - f.ty0) / BLOCK_TH);
  return bx >= 0 && by >= 0 && bx < f.blocksX && by < f.blocksY ? { bx, by } : null;
}

/** The blocks a tile rectangle (world tiles) touches. */
export function blocksIn(rect: { tx: number; ty: number; tw: number; th: number }, f = overviewFrame()): { bx: number; by: number }[] {
  const out: { bx: number; by: number }[] = [];
  const bx0 = Math.max(0, Math.floor((rect.tx - f.tx0) / BLOCK_TW)), bx1 = Math.min(f.blocksX - 1, Math.floor((rect.tx + rect.tw - 1 - f.tx0) / BLOCK_TW));
  const by0 = Math.max(0, Math.floor((rect.ty - f.ty0) / BLOCK_TH)), by1 = Math.min(f.blocksY - 1, Math.floor((rect.ty + rect.th - 1 - f.ty0) / BLOCK_TH));
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) out.push({ bx, by });
  return out;
}

export const blockFile = (cacheDir: string, mapV: string, bx: number, by: number) => path.join(cacheDir, mapV, "blocks", `${bx}_${by}.rgba`);
export const tileFile = (cacheDir: string, tilesV: string, z: number, mx: number, my: number) => path.join(cacheDir, tilesV, String(z), `${mx}_${my}.png`);

/** Every map tile at zoom z within the map bounds. */
export function tilesAt(z: number): { z: number; mx: number; my: number }[] {
  const k = 2 ** z, f = overviewFrame();
  const tx1 = f.tx0 + f.blocksX * BLOCK_TW, ty1 = f.ty0 + f.blocksY * BLOCK_TH;
  const out: { z: number; mx: number; my: number }[] = [];
  for (let my = Math.floor(f.ty0 / (MAP_TILE_H * k)); my <= Math.floor((ty1 - 1) / (MAP_TILE_H * k)); my++) {
    for (let mx = Math.floor(f.tx0 / (MAP_TILE_W * k)); mx <= Math.floor((tx1 - 1) / (MAP_TILE_W * k)); mx++) if (mapTileInBounds(z, mx, my)) out.push({ z, mx, my });
  }
  return out;
}

/** Tiles ordered nearest first to any of `spots` (world tiles). */
export function nearestFirst<T extends { z: number; mx: number; my: number }>(tiles: readonly T[], spots: readonly { tx: number; ty: number }[]): T[] {
  const d = (t: T) => {
    const r = mapTileRect(t.z, t.mx, t.my), cx = r.tx + r.tw / 2, cy = r.ty + r.th / 2;
    return Math.min(...spots.map((s) => Math.hypot(s.tx - cx, s.ty - cy)));
  };
  return [...tiles].map((t) => ({ t, d: d(t) })).sort((a, b) => a.d - b.d).map((x) => x.t);
}

/** Does map tile (z, mx, my) overlap any of these world-tile rectangles? */
export function tileTouches(z: number, mx: number, my: number, rects: readonly { tx: number; ty: number; tw: number; th: number }[]): boolean {
  const r = mapTileRect(z, mx, my);
  return rects.some((o) => o.tx < r.tx + r.tw && r.tx < o.tx + o.tw && o.ty < r.ty + r.th && r.ty < o.ty + o.th);
}
