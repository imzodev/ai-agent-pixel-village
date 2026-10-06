// Server-only companion to chunkCollision.ts: registers a chunk's collision
// data on demand by reading the authored map JSON from disk, falling back to
// the deterministic default generator. Never import this from client code —
// it pulls in node:fs.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  chunkAtWorldPx,
  chunkId,
  chunkRegistered,
  isWalkableAt,
  registerChunk,
  FOOT_CORNERS,
} from "./chunkCollision";
import { defaultChunk } from "./chunkGen";
import { stampBuildingCollisions } from "./buildingStampsServer";
import { ensureFelledLoaded } from "./treesServer";

async function loadChunkJson(cx: number, cy: number): Promise<unknown> {
  await ensureFelledLoaded(); // generated trees players have felled
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "assets", "maps", `map_${cx}_${cy}.json`));
    return JSON.parse(buf.toString("utf8"));
  } catch {
    // No authored map — generated chunks have no DecorationLower layer, so
    // nothing blocks there.
    return defaultChunk(cx, cy);
  }
}

// In-flight dedup. Without this, two concurrent requests for the same
// uncached chunk each fire loadChunkJson — duplicate fs.readFile + JSON
// parse per cold chunk under burst.
const inFlightLoads = new Map<string, Promise<void>>();

// Register (once) every chunk that a foot-box walkability check around
// (x, y) can touch. The foot box spans at most 2×2 chunks.
export async function ensureChunkAt(x: number, y: number): Promise<void> {
  await stampBuildingCollisions();
  const jobs: Promise<void>[] = [];
  const seen = new Set<string>();
  for (const [dx, dy] of FOOT_CORNERS) {
    const t = chunkAtWorldPx(x + dx, y + dy);
    const key = chunkId(t.cx, t.cy);
    if (chunkRegistered(t.cx, t.cy) || seen.has(key)) continue;
    seen.add(key);

    let pending = inFlightLoads.get(key);
    if (!pending) {
      pending = loadChunkJson(t.cx, t.cy).then((json) => registerChunk(t.cx, t.cy, json));
      inFlightLoads.set(key, pending);
      pending.finally(() => inFlightLoads.delete(key));
    }
    jobs.push(pending);
  }
  await Promise.all(jobs);
}

export async function isWalkableServer(x: number, y: number): Promise<boolean> {
  await ensureChunkAt(x, y);
  return isWalkableAt(x, y);
}

/** Steps to try, in order, for somewhere to stand by a door: below it first. */
const ARRIVAL_STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0, 16], [0, 24], [0, 32], [0, 48], [-16, 16], [16, 16], [-16, 32], [16, 32], [0, 64],
];

/**
 * Where to put someone arriving at a door (a portal's far end): the door
 * itself if they can stand there, else the nearest open ground below it.
 * Arriving inside a stamp's collision leaves them unable to take a step.
 */
export async function arrivalPoint(door: { x: number; y: number }): Promise<{ x: number; y: number }> {
  for (const [dx, dy] of ARRIVAL_STEPS) {
    const p = { x: door.x + dx, y: door.y + dy };
    if (await isWalkableServer(p.x, p.y)) return p;
  }
  return door;
}

/** The village plaza, where someone with nowhere else to stand ends up. */
const VILLAGE_SPAWN = { x: 32 * 16 + 8, y: 21 * 16 + 8 };

/**
 * The nearest spot a player can stand on, searching rings of tiles out to
 * `maxTiles`; the village plaza when there's none (they stood on land that
 * became sea when the continent was regenerated, say).
 */
export async function nearestOpenGround(x: number, y: number, maxTiles = 40): Promise<{ x: number; y: number }> {
  if (await isWalkableServer(x, y)) return { x, y };
  const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
  for (let r = 1; r <= maxTiles; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const p = { x: (tx + dx) * 16 + 8, y: (ty + dy) * 16 + 8 };
      if (await isWalkableServer(p.x, p.y)) return p;
    }
  }
  return VILLAGE_SPAWN;
}
