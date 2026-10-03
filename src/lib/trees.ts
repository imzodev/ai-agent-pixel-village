// Choppable terrain trees. Every generated tree (src/lib/regions.ts) can be
// chopped with an axe: each chop gives wood, TREE_HITS chops fell it, and
// it grows back after TREE_REGROW_MS. A felled tree leaves the terrain
// (open ground + stump), so chopping opens a way through the woods.
// Pure rules shared by the server and the client; the DB side is
// src/lib/treesServer.ts.

import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import type { ChunkRef, TreeSpot } from "@/types/trees";

export type { ChopTreeResult, ChunkRef, TreeSpot } from "@/types/trees";

/** Chops to fell a tree (each one gives wood). */
export const TREE_HITS = 3;
export const TREE_REGROW_MS = 20 * 60_000;
/** A half-chopped tree forgets its cuts after this long. */
export const TREE_HITS_RESET_MS = 5 * 60_000;
/** How close (px, feet to trunk) you must stand to chop. */
export const TREE_REACH_PX = 44;

export const treeKey = (vx: number, vy: number): string => `${vx},${vy}`;

/** Where the trunk meets the ground (the tree's 2×2 tiles sit around (vx, vy)). */
export function trunkPoint(vx: number, vy: number): { x: number; y: number } {
  return { x: vx * 16, y: (vy + 1) * 16 - 4 };
}

/** The tree drawn by a Wilds tile named `name` at tile (tx, ty), if any. */
export function treeFromTile(name: string | null, tx: number, ty: number): TreeSpot | null {
  const m = name ? /^tree_(oak|pine)_(\d+)$/.exec(name) : null;
  if (!m) return null;
  const fm = Number(m[2]);
  // The lattice puts exactly one tree corner on a tile (regions.ts terrainAt).
  const [vx, vy] = fm & 1 ? [tx, ty] : fm & 2 ? [tx + 1, ty] : fm & 4 ? [tx, ty + 1] : [tx + 1, ty + 1];
  return { vx, vy, kind: m[1] as "oak" | "pine" };
}

/** Chunks whose tiles depend on the tree at (vx, vy): its 2×2 tiles and the
 *  two below it (they block only when a tree stands right above them). */
export function treeChunks(vx: number, vy: number): ChunkRef[] {
  const out = new Map<string, ChunkRef>();
  for (let ty = vy - 1; ty <= vy + 1; ty++) for (let tx = vx - 1; tx <= vx; tx++) {
    const c = { cx: Math.floor(tx / CHUNK_TILE_W), cy: -Math.floor(ty / CHUNK_TILE_H) || 0 };
    out.set(`${c.cx},${c.cy}`, c);
  }
  return [...out.values()];
}
