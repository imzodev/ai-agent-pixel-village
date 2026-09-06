// Shared chunk-space collision. The single source of truth for walkability is
// each chunk map's DecorationLower tile layer: any non-zero GID marks the tile
// as blocked. Dependency-free so both the Phaser client and the server can
// use it. The client registers chunks synchronously as they stream in; the
// server registers on demand from disk (see chunkCollisionServer.ts).

export const CHUNK_TILE_W = 24;
export const CHUNK_TILE_H = 15;
export const CHUNK_TILE_PX = 16;
export const CHUNK_PX_W = CHUNK_TILE_W * CHUNK_TILE_PX;
export const CHUNK_PX_H = CHUNK_TILE_H * CHUNK_TILE_PX;

export function chunkId(cx: number, cy: number): string {
  return `${cx}_${cy}`;
}

// World pixel (x, y) → chunk coord + chunk-local tile coord. Screen y grows
// downward while chunk cy=+1 points up, matching the renderer (cy negated).
export function chunkAtWorldPx(x: number, y: number): { cx: number; cy: number; lx: number; ly: number } {
  const tx = Math.floor(x / CHUNK_TILE_PX);
  const ty = Math.floor(y / CHUNK_TILE_PX);
  const cx = Math.floor(tx / CHUNK_TILE_W);
  const cy = -Math.floor(ty / CHUNK_TILE_H);
  return { cx, cy, lx: tx - cx * CHUNK_TILE_W, ly: ty + cy * CHUNK_TILE_H };
}

// Tile layers that block movement: the authored DecorationLower decoration
// AND the dedicated Collision layer Tiled maps carry alongside it.
const COLLISION_LAYERS = new Set(["DecorationLower", "Collision"]);

// Extract the blocked-tile set (local index = ly * CHUNK_TILE_W + lx) from a
// parsed Tiled chunk JSON. Chunks without any collision layer (generated
// defaults) block nothing.
export function blockedFromChunk(json: unknown): Set<number> {
  const blocked = new Set<number>();
  const layers = (json as { layers?: Array<{ name?: unknown; type?: unknown; data?: unknown }> })?.layers;
  if (!Array.isArray(layers)) return blocked;
  for (const layer of layers) {
    if (layer?.type !== "tilelayer" || !COLLISION_LAYERS.has(layer.name as string)) continue;
    if (!Array.isArray(layer.data)) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (typeof gid === "number" && gid > 0) blocked.add(i);
    }
  }
  return blocked;
}

const registry = new Map<string, Set<number>>();

// Blocks contributed by stamped building templates, kept separate from the
// per-chunk sets so a later chunk (re-)registration can never erase them.
const stamped = new Map<string, Set<number>>();

export function registerChunk(cx: number, cy: number, json: unknown): void {
  registry.set(chunkId(cx, cy), blockedFromChunk(json));
}

// Mark a building template's blocked tiles (layer indexes on a tileW-wide
// grid) as solid at the template's world-pixel origin.
export function blockStampTiles(originX: number, originY: number, tileW: number, blockedIndexes: number[]): void {
  for (const i of blockedIndexes) {
    const lx = i % tileW;
    const ly = Math.floor(i / tileW);
    const t = chunkAtWorldPx(originX + lx * CHUNK_TILE_PX, originY + ly * CHUNK_TILE_PX);
    let set = stamped.get(chunkId(t.cx, t.cy));
    if (!set) {
      set = new Set();
      stamped.set(chunkId(t.cx, t.cy), set);
    }
    set.add(t.ly * CHUNK_TILE_W + t.lx);
  }
}

export function chunkRegistered(cx: number, cy: number): boolean {
  return registry.has(chunkId(cx, cy));
}

function isTileBlocked(cx: number, cy: number, lx: number, ly: number): boolean {
  const idx = ly * CHUNK_TILE_W + lx;
  const key = chunkId(cx, cy);
  return registry.get(key)?.has(idx) === true || stamped.get(key)?.has(idx) === true;
}

// Foot box (16×10 under the character's feet): blocked if any corner lands on
// a DecorationLower tile. Unregistered chunks are walkable by default so the
// player can step into a chunk before its JSON finishes streaming.
const FOOT_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-8, -6], [8, -6], [-8, 4], [8, 4],
];

export function isWalkableAt(x: number, y: number): boolean {
  for (const [dx, dy] of FOOT_CORNERS) {
    const t = chunkAtWorldPx(x + dx, y + dy);
    if (isTileBlocked(t.cx, t.cy, t.lx, t.ly)) return false;
  }
  return true;
}

// Debug/testing helper (attached to window.__walk by WorldScene).
export function debugRegistry(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, set] of registry) out[key] = set.size;
  return out;
}
