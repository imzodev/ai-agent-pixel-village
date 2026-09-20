// Server-only companion to chunkCollision.ts: registers a chunk's collision
// data on demand by reading the authored map JSON from disk, falling back to
// the deterministic default generator. Never import this from client code —
// it pulls in node:fs.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CHUNK_TILE_PX,
  CHUNK_TILE_W,
  blockStampTiles,
  blockedFromChunk,
  chunkAtWorldPx,
  chunkId,
  chunkRegistered,
  isWalkableAt,
  registerChunk,
} from "./chunkCollision";
import { defaultChunk } from "./chunkGen";
import { getBuildingsManifest, getTemplate } from "./buildingsServer";

async function loadChunkJson(cx: number, cy: number): Promise<unknown> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "assets", "maps", `map_${cx}_${cy}.json`));
    return JSON.parse(buf.toString("utf8"));
  } catch {
    // No authored map — generated chunks have no DecorationLower layer, so
    // nothing blocks there.
    return defaultChunk(cx, cy);
  }
}

// Mirror of the client's `stampBuildings()` pass (game/buildingStamps.ts):
// populates the `stamped` Map in chunkCollision.ts with every building
// template's DecorationLower + Collision tiles. The client does this once
// during WorldScene.create(); the server must do it once per process or
// NPCs / animals walk through walls. Memoised — manifest never changes
// at runtime.
let stampedBuildings = false;
async function ensureBuildingsStamped(): Promise<void> {
  if (stampedBuildings) return;
  stampedBuildings = true;
  const manifest = await getBuildingsManifest();
  for (const entry of manifest.buildings) {
    const template = await getTemplate(entry);
    const blocked = blockedFromChunk(template);
    if (blocked.size === 0) continue;
    const ox = entry.tx * CHUNK_TILE_PX;
    const oy = entry.ty * CHUNK_TILE_PX;
    blockStampTiles(ox, oy, CHUNK_TILE_W, [...blocked]);
  }
}

// Register (once) every chunk that a foot-box walkability check around
// (x, y) can touch. The foot box spans at most 2×2 chunks.
export async function ensureChunkAt(x: number, y: number): Promise<void> {
  await ensureBuildingsStamped();
  const jobs: Promise<void>[] = [];
  const seen = new Set<string>();
  for (const [dx, dy] of [[-8, -6], [8, -6], [-8, 4], [8, 4]] as const) {
    const t = chunkAtWorldPx(x + dx, y + dy);
    const key = chunkId(t.cx, t.cy);
    if (chunkRegistered(t.cx, t.cy) || seen.has(key)) continue;
    seen.add(key);
    jobs.push(loadChunkJson(t.cx, t.cy).then((json) => registerChunk(t.cx, t.cy, json)));
  }
  await Promise.all(jobs);
}

export async function isWalkableServer(x: number, y: number): Promise<boolean> {
  await ensureChunkAt(x, y);
  return isWalkableAt(x, y);
}
