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