// Server-only companion to chunkCollision.ts: registers a chunk's collision
// data on demand by reading the authored map JSON from disk, falling back to
// the deterministic default generator. Never import this from client code —
// it pulls in node:fs.

import { promises as fs } from "node:fs";
import path from "node:path";
import { chunkAtWorldPx, chunkId, chunkRegistered, isWalkableAt, registerChunk } from "./chunkCollision";
import { defaultChunk } from "./chunkGen";

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

// Register (once) every chunk that a foot-box walkability check around
// (x, y) can touch. The foot box spans at most 2×2 chunks.
export async function ensureChunkAt(x: number, y: number): Promise<void> {
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
