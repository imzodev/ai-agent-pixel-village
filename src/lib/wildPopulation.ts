// Which wild enemies stand in a chunk, and which chunks to fill as a player
// moves. Pure: the WS server (src/lib/world-stream.ts) claims the chunks,
// writes the packs and tells nearby players. The land is filled ahead of
// players in the direction they travel, out of their sight, so enemies are
// already there when they arrive; a chunk is filled once for everyone and
// refilled at most every REPOPULATE_MS.

import { CHUNK_TILE_H, CHUNK_TILE_W } from "./chunkCollision";
import { biomeAt, inHeartland, tierAt } from "./continent";
import { townAt } from "./settlements";
import { hash } from "./terrain/noise";
import { POPULATE_AHEAD_CHUNKS, REPOPULATE_MS, chunkPackChance, crowdFactor, wildKindFor, wildPackSize } from "./wildlife";
import type { ChunkXY, PackMember } from "@/types/wildlife";

export type { ChunkXY, PackMember } from "@/types/wildlife";

/** No pack member stands closer than this to a player (px). */
export const MIN_PLAYER_GAP_PX = 2 * 16;

/**
 * The chunks to fill after a move from `from` to `to`: the leading edge,
 * POPULATE_AHEAD_CHUNKS out, in the direction of travel (both edges for a
 * diagonal). With no `from` (arrival, travel) the whole ring at that distance.
 */
export function chunksAhead(from: ChunkXY | null, to: ChunkXY, r = POPULATE_AHEAD_CHUNKS): ChunkXY[] {
  const out = new Map<string, ChunkXY>();
  const add = (cx: number, cy: number) => out.set(`${cx},${cy}`, { cx, cy });
  const dx = from ? Math.sign(to.cx - from.cx) : 0, dy = from ? Math.sign(to.cy - from.cy) : 0;
  if (!from || Math.abs(to.cx - from.cx) > 1 || Math.abs(to.cy - from.cy) > 1) {
    // arrived (or jumped): the full ring
    for (let k = -r; k <= r; k++) { add(to.cx + k, to.cy - r); add(to.cx + k, to.cy + r); add(to.cx - r, to.cy + k); add(to.cx + r, to.cy + k); }
  } else {
    if (dx) for (let k = -r; k <= r; k++) add(to.cx + dx * r, to.cy + k);
    if (dy) for (let k = -r; k <= r; k++) add(to.cx + k, to.cy + dy * r);
  }
  return [...out.values()];
}

/** A seeded random stream for one chunk and refill window. */
function seeded(cx: number, cy: number, epoch: number): () => number {
  let k = 0;
  return () => hash(cx * 7919 + k++, cy * 104729 + epoch, 811);
}

/**
 * The pack a chunk holds now: chosen by chunk and REPOPULATE_MS window, so
 * every process agrees; bigger and likelier with `players` around. Spots
 * are tile centres (world px) that pass `walkable`; none in the heartland
 * or a town, none within MIN_PLAYER_GAP_PX of `playersAt`.
 */
export async function packFor(
  c: ChunkXY, now: number, night: boolean, players: number,
  playersAt: readonly { x: number; y: number }[],
  walkable: (x: number, y: number) => Promise<boolean>,
): Promise<PackMember[]> {
  const rand = seeded(c.cx, c.cy, Math.floor(now / REPOPULATE_MS));
  const tx0 = c.cx * CHUNK_TILE_W, ty0 = -c.cy * CHUNK_TILE_H;
  const mid = { tx: tx0 + CHUNK_TILE_W / 2, ty: ty0 + Math.floor(CHUNK_TILE_H / 2) };
  if (inHeartland(mid.tx, mid.ty) || townAt(mid.tx, mid.ty)) return [];
  const tier = tierAt(mid.tx, mid.ty);
  const crowd = crowdFactor(players);
  if (rand() >= Math.min(0.9, chunkPackChance(tier) * crowd)) return [];
  const kind = wildKindFor(biomeAt(mid.tx, mid.ty), tier, night, rand);
  if (!kind) return [];
  const base = wildPackSize(tier, rand);
  const n = base + Math.floor(((crowd - 1) * base) / 2);
  const out: PackMember[] = [];
  // The pack stands together around a spot inside the chunk.
  const home = { tx: tx0 + 3 + Math.floor(rand() * (CHUNK_TILE_W - 6)), ty: ty0 + 2 + Math.floor(rand() * (CHUNK_TILE_H - 4)) };
  for (let tries = 0; out.length < n && tries < n * 4; tries++) {
    const t = out.length === 0 && tries === 0 ? home : { tx: home.tx + Math.round((rand() - 0.5) * 6), ty: home.ty + Math.round((rand() - 0.5) * 6) };
    if (inHeartland(t.tx, t.ty) || townAt(t.tx, t.ty)) continue;
    const p = { x: t.tx * 16 + 8, y: t.ty * 16 + 8 };
    if (playersAt.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_PLAYER_GAP_PX)) continue;
    if (out.some((m) => m.x === p.x && m.y === p.y)) continue;
    if (!(await walkable(p.x, p.y))) continue;
    out.push({ kind, ...p });
  }
  return out;
}
