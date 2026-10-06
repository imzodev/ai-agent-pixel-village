// Generated chunks, served from memory: the terrain is deterministic, so a
// chunk only changes when a tree in it is felled or grows back
// (src/lib/treesServer.ts drops it then). Bounded LRU, so memory stays flat
// however big the world is. On globalThis so the chunk route (bundled by
// Next) and src/server.ts share it.

import { defaultChunk } from "./chunkGen";

const CAP = 2000;
const g = globalThis as typeof globalThis & { __chunkJson?: Map<string, string> };
const cache = (g.__chunkJson ??= new Map<string, string>());

/** The generated chunk (cx, cy) as JSON text. */
export function generatedChunkJson(cx: number, cy: number): string {
  const key = `${cx},${cy}`;
  const hit = cache.get(key);
  if (hit !== undefined) { cache.delete(key); cache.set(key, hit); return hit; }
  const json = JSON.stringify(defaultChunk(cx, cy));
  cache.set(key, json);
  if (cache.size > CAP) cache.delete(cache.keys().next().value!);
  return json;
}

/** Forget chunks whose terrain changed (a tree felled or regrown). */
export function dropChunks(chunks: readonly { cx: number; cy: number }[]): void {
  for (const c of chunks) cache.delete(`${c.cx},${c.cy}`);
}
