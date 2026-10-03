// The DB side of choppable trees: the felled set every process (the web /
// WS server, tickd) mirrors into the terrain generator, and the chop.
// Each process re-reads it on its beat and forgets the collision of any
// chunk whose trees changed, so pathing and walls follow the terrain.

import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { felledTrees } from "@/db/schema";
import { setFelledTrees, treeAt } from "./regions";
import { unregisterChunk } from "./chunkCollision";
import { TREE_HITS, TREE_HITS_RESET_MS, TREE_REGROW_MS, treeChunks, treeKey } from "./trees";
import type { ChopTreeResult, ChunkRef } from "@/types/trees";

let current: Set<string> = new Set();
let loaded: Promise<void> | null = null;

/** Load the felled set once before the first generated chunk is built. */
export function ensureFelledLoaded(): Promise<void> {
  loaded ??= syncFelledTrees().then(() => undefined, () => { loaded = null; });
  return loaded;
}

function apply(next: Set<string>): ChunkRef[] {
  const changed = [...next].filter((k) => !current.has(k)).concat([...current].filter((k) => !next.has(k)));
  current = next;
  setFelledTrees(next);
  const chunks = new Map<string, ChunkRef>();
  for (const k of changed) {
    const [vx, vy] = k.split(",").map(Number);
    for (const c of treeChunks(vx, vy)) chunks.set(`${c.cx},${c.cy}`, c);
  }
  for (const c of chunks.values()) unregisterChunk(c.cx, c.cy);
  return [...chunks.values()];
}

/** Re-read the felled set; returns the chunks whose terrain changed. */
export async function syncFelledTrees(now = new Date()): Promise<ChunkRef[]> {
  // Tidy up: long-regrown trees and cuts nobody finished.
  await db.delete(felledTrees).where(or(
    lt(felledTrees.regrowAt, new Date(now.getTime() - 3_600_000)),
    and(isNull(felledTrees.felledAt), lt(felledTrees.updatedAt, new Date(now.getTime() - TREE_HITS_RESET_MS))),
  ));
  const rows = await db.select({ vx: felledTrees.vx, vy: felledTrees.vy }).from(felledTrees).where(gt(felledTrees.regrowAt, now));
  return apply(new Set(rows.map((r) => treeKey(r.vx, r.vy))));
}

/** Don't let a tree grow back on someone: push back regrowths due within
 *  `withinMs` where `occupied(vx, vy)` says a player stands. */
export async function postponeRegrowth(occupied: (vx: number, vy: number) => boolean, withinMs: number, now = new Date()): Promise<void> {
  const due = await db.select().from(felledTrees).where(and(gt(felledTrees.regrowAt, now), lte(felledTrees.regrowAt, new Date(now.getTime() + withinMs))));
  for (const r of due) {
    if (!occupied(r.vx, r.vy)) continue;
    await db.update(felledTrees).set({ regrowAt: new Date(now.getTime() + withinMs + 60_000) }).where(and(eq(felledTrees.vx, r.vx), eq(felledTrees.vy, r.vy)));
  }
}

const authored = new Map<string, boolean>();
/** True when the chunk is a hand-authored map (its trees aren't generated). */
function isAuthoredChunk(c: ChunkRef): boolean {
  const k = `${c.cx},${c.cy}`;
  let v = authored.get(k);
  if (v === undefined) {
    v = fs.existsSync(path.join(process.cwd(), "public", "assets", "maps", `map_${c.cx}_${c.cy}.json`));
    authored.set(k, v);
  }
  return v;
}

/** One chop at the tree on lattice corner (vx, vy). */
export async function chopTree(vx: number, vy: number, now = new Date()): Promise<ChopTreeResult> {
  await ensureFelledLoaded();
  if (!Number.isInteger(vx) || !Number.isInteger(vy) || !treeAt(vx, vy)) return { ok: false, error: "There's no tree there." };
  if (treeChunks(vx, vy).some(isAuthoredChunk)) return { ok: false, error: "This old tree won't budge." };
  const res = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(felledTrees).where(and(eq(felledTrees.vx, vx), eq(felledTrees.vy, vy))).for("update");
    if (row?.regrowAt && row.regrowAt > now) return { felled: false, already: true, hits: 0 };
    const fresh = row && !row.felledAt && now.getTime() - row.updatedAt.getTime() < TREE_HITS_RESET_MS;
    const hits = (fresh ? row.hits : 0) + 1;
    const felled = hits >= TREE_HITS;
    const values = { hits: felled ? 0 : hits, felledAt: felled ? now : null, regrowAt: felled ? new Date(now.getTime() + TREE_REGROW_MS) : null, updatedAt: now };
    if (row) await tx.update(felledTrees).set(values).where(and(eq(felledTrees.vx, vx), eq(felledTrees.vy, vy)));
    else await tx.insert(felledTrees).values({ vx, vy, ...values });
    return { felled, already: false, hits };
  });
  if (res.already) return { ok: false, error: "It's already down." };
  if (!res.felled) return { ok: true, felled: false, hitsLeft: TREE_HITS - res.hits, chunks: [] };
  const chunks = apply(new Set([...current, treeKey(vx, vy)]));
  return { ok: true, felled: true, hitsLeft: 0, chunks };
}
