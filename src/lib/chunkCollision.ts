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

// Extract the blocked-tile set (local index = ly * CHUNK_TILE_W + lx) from a
// parsed Tiled chunk JSON. Only the DecorationLower layer contributes; chunks
// without that layer (generated defaults) block nothing.
export function blockedFromChunk(json: unknown): Set<number> {
  const blocked = new Set<number>();
  const layers = (json as { layers?: Array<{ name?: unknown; type?: unknown; data?: unknown }> })?.layers;
  if (!Array.isArray(layers)) return blocked;
  for (const layer of layers) {
    if (layer?.type !== "tilelayer" || layer.name !== "DecorationLower") continue;
    if (!Array.isArray(layer.data)) continue;
    for (let i = 0; i < layer.data.length; i++) {
      const gid = layer.data[i];
      if (typeof gid === "number" && gid > 0) blocked.add(i);
    }
  }
  return blocked;
}

const registry = new Map<string, Set<number>>();

export function registerChunk(cx: number, cy: number, json: unknown): void {
  registry.set(chunkId(cx, cy), blockedFromChunk(json));
}

export function chunkRegistered(cx: number, cy: number): boolean {
  return registry.has(chunkId(cx, cy));
}

function isTileBlocked(cx: number, cy: number, lx: number, ly: number): boolean {
  return registry.get(chunkId(cx, cy))?.has(ly * CHUNK_TILE_W + lx) ?? false;
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
