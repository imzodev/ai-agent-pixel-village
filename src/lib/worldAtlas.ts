// The world map ("atlas"): shared, pure geometry. Map space is world tiles. A map
// tile at zoom z covers MAP_TILE_CHUNKS·2^z chunks a side and is always
// MAP_TILE_W × MAP_TILE_H px, so zoom 0 is 1 px per world tile and each
// zoom out halves it — like a web map, so the map scales to any world
// size: tiles are rendered on demand and cached (src/lib/worldAtlasServer.ts).
// Fog of war is per chunk, stored sparsely as 64-bit masks per 8×8 block.

import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import type { MapBounds, SeenBlock } from "@/types/map";

export type { MapBounds, MapLot, MapMarkers, MapPlace, MapRegionLabel, MapWaystone, SeenBlock } from "@/types/map";

/** Chunks per side of a zoom-0 map tile. */
export const MAP_TILE_CHUNKS = 8;
export const MAP_TILE_W = MAP_TILE_CHUNKS * CHUNK_TILE_W; // 192 px
export const MAP_TILE_H = MAP_TILE_CHUNKS * CHUNK_TILE_H; // 120 px
export const MAP_MAX_ZOOM = 5;
/** Chunks per side of a fog block (one 64-bit mask). */
export const SEEN_BLOCK = 8;

/** What the map renders (chunks): the continent (src/lib/continent.ts,
 *  cx −40…9, cy −24…25) and, up north, the Greyspine caverns. */
export const MAP_BOUNDS: MapBounds = { cx0: -40, cx1: 9, cy0: -24, cy1: 33 };

/** Fast travel: free from beside a waystone, this much from anywhere else. */
export const TRAVEL_COST = 10;
export const WAYSTONE_NEAR_PX = 160;
/** Walking this close attunes a waystone. */
export const WAYSTONE_ATTUNE_PX = 56;
/** No travelling with an aggressive enemy this close. */
export const TRAVEL_DANGER_PX = 150;

export const travelCost = (atWaystone: boolean): number => (atWaystone ? 0 : TRAVEL_COST);

/** Chunk of world tile (tx, ty) (chunk cy grows upward, tile ty downward). */
export function chunkOfTile(tx: number, ty: number): { cx: number; cy: number } {
  return { cx: Math.floor(tx / CHUNK_TILE_W), cy: -Math.floor(ty / CHUNK_TILE_H) || 0 };
}

/** World tiles covered by chunk (cx, cy): top-left tile. */
export function chunkTile(cx: number, cy: number): { tx: number; ty: number } {
  return { tx: cx * CHUNK_TILE_W, ty: -cy * CHUNK_TILE_H };
}

/** World tiles covered by map tile (z, mx, my): top-left tile and size. */
export function mapTileRect(z: number, mx: number, my: number): { tx: number; ty: number; tw: number; th: number } {
  const k = 2 ** z;
  return { tx: mx * MAP_TILE_W * k, ty: my * MAP_TILE_H * k, tw: MAP_TILE_W * k, th: MAP_TILE_H * k };
}

/** True when map tile (z, mx, my) touches the rendered bounds. */
export function mapTileInBounds(z: number, mx: number, my: number, b: MapBounds = MAP_BOUNDS): boolean {
  const r = mapTileRect(z, mx, my);
  const tx0 = b.cx0 * CHUNK_TILE_W, tx1 = (b.cx1 + 1) * CHUNK_TILE_W; // [tx0, tx1)
  const ty0 = -b.cy1 * CHUNK_TILE_H, ty1 = (-b.cy0 + 1) * CHUNK_TILE_H;
  return r.tx < tx1 && r.tx + r.tw > tx0 && r.ty < ty1 && r.ty + r.th > ty0;
}

export function chunkInBounds(cx: number, cy: number, b: MapBounds = MAP_BOUNDS): boolean {
  return cx >= b.cx0 && cx <= b.cx1 && cy >= b.cy0 && cy <= b.cy1;
}

const ZERO = BigInt(0), ONE = BigInt(1);

/** The fog block of a chunk and its bit in the block's mask. */
export function seenBit(cx: number, cy: number): { bx: number; by: number; bit: bigint } {
  const bx = Math.floor(cx / SEEN_BLOCK), by = Math.floor(cy / SEEN_BLOCK);
  return { bx, by, bit: ONE << BigInt((cx - bx * SEEN_BLOCK) + SEEN_BLOCK * (cy - by * SEEN_BLOCK)) };
}

/** Group chunks into per-block masks (signed 64-bit, as Postgres stores them). */
export function seenMasks(chunks: ReadonlyArray<{ cx: number; cy: number }>): { bx: number; by: number; mask: bigint }[] {
  const out = new Map<string, { bx: number; by: number; mask: bigint }>();
  for (const c of chunks) {
    const { bx, by, bit } = seenBit(c.cx, c.cy);
    const k = `${bx},${by}`;
    const cur = out.get(k) ?? { bx, by, mask: ZERO };
    cur.mask = BigInt.asIntN(64, cur.mask | bit);
    out.set(k, cur);
  }
  return [...out.values()];
}

/** Every seen chunk ("cx,cy") in a list of blocks. */
export function seenChunks(blocks: readonly SeenBlock[]): Set<string> {
  const out = new Set<string>();
  for (const b of blocks) {
    const m = BigInt.asUintN(64, BigInt(b.mask));
    if (m === ZERO) continue;
    for (let i = 0; i < 64; i++) {
      if (((m >> BigInt(i)) & ONE) === ZERO) continue;
      out.add(`${b.bx * SEEN_BLOCK + (i % SEEN_BLOCK)},${b.by * SEEN_BLOCK + Math.floor(i / SEEN_BLOCK)}`);
    }
  }
  return out;
}

/** The chunk at a world-pixel position and its 8 neighbours (what you can see). */
export function chunksAround(x: number, y: number): { cx: number; cy: number }[] {
  const c = chunkOfTile(Math.floor(x / 16), Math.floor(y / 16));
  const out: { cx: number; cy: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push({ cx: c.cx + dx, cy: c.cy + dy });
  return out;
}
