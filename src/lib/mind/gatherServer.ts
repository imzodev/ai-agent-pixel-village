// What an NPC's gathering errand really takes from the world (profiles'
// `supplies[item].gather`), so players can watch it: ripe resource nodes cut
// down around the spot (the Common Field's wheat regrows as when a player
// picks it), or trees felled (stumps that grow back; the WS server's tree
// sync tells every client). Server only.

import { and, between, eq } from "drizzle-orm";
import { db } from "@/db";
import { resourceNodes } from "@/db/schema";
import { CROP_KINDS } from "@/lib/crops";
import { TREE_HITS } from "@/lib/trees";
import { treeAt } from "@/lib/regions";
import { chopTree } from "@/lib/treesServer";
import type { GatherDef } from "@/types/mind";

const T = 16;

/** Cut up to `max` ripe `kind` nodes within `radius` tiles of (x, y), nearest first. Returns how many. */
async function cutNodes(kind: string, x: number, y: number, radius: number, max: number, now: number): Promise<number> {
  const cfg = CROP_KINDS[kind];
  if (!cfg) return 0;
  const r = radius * T;
  const ripe = await db.select({ id: resourceNodes.id, x: resourceNodes.x, y: resourceNodes.y }).from(resourceNodes)
    .where(and(eq(resourceNodes.kind, kind), eq(resourceNodes.stage, cfg.stages - 1), between(resourceNodes.x, x - r, x + r), between(resourceNodes.y, y - r, y + r)));
  ripe.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  let n = 0;
  for (const node of ripe.slice(0, max)) {
    // Only if it's still ripe (a player may have just picked it).
    const done = await db.update(resourceNodes).set({ stage: 0, nextAdvanceAt: new Date(now + cfg.regrowthMs) })
      .where(and(eq(resourceNodes.id, node.id), eq(resourceNodes.stage, cfg.stages - 1))).returning({ id: resourceNodes.id });
    n += done.length;
  }
  return n;
}

/** Fell standing trees within `radius` tiles of the tile (tx, ty), nearest first, until `logs` are cut. Returns the logs. */
async function fellTrees(tx: number, ty: number, radius: number, logs: number, perTree: number): Promise<number> {
  const corners: { vx: number; vy: number; d: number }[] = [];
  for (let vy = ty - radius; vy <= ty + radius; vy++) for (let vx = tx - radius; vx <= tx + radius; vx++) {
    if (vx % 2 === 0 && vy % 2 === 0 && treeAt(vx, vy)) corners.push({ vx, vy, d: Math.hypot(vx - tx, vy - ty) });
  }
  corners.sort((a, b) => a.d - b.d);
  let got = 0;
  for (const c of corners) {
    if (got >= logs) break;
    for (let hit = 0; hit < TREE_HITS; hit++) {
      const r = await chopTree(c.vx, c.vy);
      if (!r.ok) break; // already down, or one that won't budge
      if (r.felled) { got += perTree; break; }
    }
  }
  return Math.min(got, logs);
}

/** Gather at most `max` with `g` at the world pixel (x, y). Returns how much was really gathered. */
export async function gatherAt(g: GatherDef, x: number, y: number, max: number, now = Date.now()): Promise<number> {
  if (g.from === "nodes") return cutNodes(g.kind, x, y, g.radius, max, now);
  return fellTrees(Math.round(x / T), Math.round(y / T), g.radius, max, g.perTree);
}
