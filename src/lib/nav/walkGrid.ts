// The real world as a NavGrid (src/types/nav.ts): per block (a game chunk,
// 24×15 tiles), whether an NPC's foot box fits on each tile — the very
// check a step makes (isWalkableAt over FOOT_CORNERS), so routes never
// disagree with movement — and what each tile costs to walk (roads and
// bridges are cheaper, so routes keep to them). Blocks are built once from
// the collision registry and refreshed after a few minutes (trees fall and
// grow back). Built blocks are also saved to disk (.cache/nav, keyed by
// the map version), so after the first time a fresh start reads them in
// microseconds instead of regenerating chunks. Server only.

import fs from "node:fs";
import path from "node:path";
import { CHUNK_TILE_PX, isWalkableAt } from "@/lib/chunkCollision";
import { mapVersion } from "@/lib/worldAtlasServer";
import { ensureChunkAt } from "@/lib/chunkCollisionServer";
import { terrainAt } from "@/lib/regions";
import { BLOCK_H, BLOCK_W, createRouter } from "./route";
import type { Entrance, GraphStore, NavBlock, NavGrid } from "@/types/nav";

// Local copies: imported constants compile to getter calls under tsx, and
// these are read millions of times per long route.
const BW = BLOCK_W, BH = BLOCK_H;

/** A block is trusted this long, then rebuilt from the collision registry. */
const BLOCK_TTL_MS = 5 * 60_000;
/** Step costs (tenths): open ground, roads and bridges. */
const COST_OPEN = 10, COST_ROAD = 6;

// Numeric keys: lookups run millions of times per long route.
const blocks = new Map<number, NavBlock>();
const building = new Map<number, Promise<void>>();
const key = (bx: number, by: number) => (bx + 50_000) * 100_000 + (by + 50_000);

const CACHE_DIR = path.join(process.cwd(), ".cache", "nav");
const fileOf = async (bx: number, by: number) => path.join(CACHE_DIR, await mapVersion(), `${bx}_${by}.bin`);

/** A block saved earlier (walk then cost, 360 bytes each), if any. */
async function fromDisk(bx: number, by: number): Promise<NavBlock | null> {
  try {
    const buf = await fs.promises.readFile(await fileOf(bx, by));
    const n = BLOCK_W * BLOCK_H;
    if (buf.length !== n * 2) return null;
    return { walk: new Uint8Array(buf.subarray(0, n)), cost: new Uint8Array(buf.subarray(n)), at: Date.now() };
  } catch {
    return null;
  }
}

async function build(bx: number, by: number, fresh: boolean): Promise<void> {
  if (!fresh) {
    const saved = await fromDisk(bx, by);
    if (saved) { blocks.set(key(bx, by), saved); lastKey = NaN; return; }
  }
  const x0 = bx * BLOCK_W * CHUNK_TILE_PX, y0 = by * BLOCK_H * CHUNK_TILE_PX;
  const x1 = x0 + BLOCK_W * CHUNK_TILE_PX, y1 = y0 + BLOCK_H * CHUNK_TILE_PX;
  // The block's chunk and every neighbour a foot box at its edges can touch.
  await Promise.all([[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => ensureChunkAt(x, y)));
  const walk = new Uint8Array(BLOCK_W * BLOCK_H), cost = new Uint8Array(BLOCK_W * BLOCK_H);
  for (let j = 0; j < BLOCK_H; j++) for (let i = 0; i < BLOCK_W; i++) {
    const tx = bx * BLOCK_W + i, ty = by * BLOCK_H + j, k = j * BLOCK_W + i;
    walk[k] = isWalkableAt(tx * CHUNK_TILE_PX + CHUNK_TILE_PX / 2, ty * CHUNK_TILE_PX + CHUNK_TILE_PX / 2) ? 1 : 0;
    if (!walk[k]) continue;
    const up = terrainAt(tx, ty).upper ?? "";
    cost[k] = up.startsWith("path_") || up.startsWith("bridge") ? COST_ROAD : COST_OPEN;
  }
  blocks.set(key(bx, by), { walk, cost, at: Date.now() });
  lastKey = NaN;
  const file = await fileOf(bx, by);
  void fs.promises.mkdir(path.dirname(file), { recursive: true }).then(() => fs.promises.writeFile(file, Buffer.concat([walk, cost]))).catch(() => {});
}

// The last block looked up (searches stay inside one block for long runs).
let lastKey = NaN, lastBlock: NavBlock | undefined;
function blockAt(bx: number, by: number): NavBlock | undefined {
  const k = key(bx, by);
  if (k !== lastKey) { lastKey = k; lastBlock = blocks.get(k); }
  return lastBlock;
}

/** The live world, as the router sees it. */
export const worldGrid: NavGrid = {
  walkable(tx, ty) {
    const bx = Math.floor(tx / BW), by = Math.floor(ty / BH);
    const b = blockAt(bx, by);
    return !!b && b.walk[(ty - by * BH) * BW + (tx - bx * BW)] === 1; // unbuilt: not known, not walked
  },
  cost(tx, ty) {
    const bx = Math.floor(tx / BW), by = Math.floor(ty / BH);
    const b = blockAt(bx, by);
    return b ? b.cost[(ty - by * BH) * BW + (tx - bx * BW)] || COST_OPEN : COST_OPEN;
  },
  async ensureBlock(bx, by) {
    const k = key(bx, by);
    const have = blocks.get(k);
    if (have && Date.now() - have.at < BLOCK_TTL_MS) return;
    let p = building.get(k);
    if (!p) {
      // Stale in memory (trees may have fallen or grown back): rebuild from the live world.
      p = build(bx, by, !!have).finally(() => building.delete(k));
      building.set(k, p);
    }
    await p;
  },
};

/** Drop a block (its terrain changed); the next route rebuilds it. */
export function forgetBlock(bx: number, by: number): void {
  blocks.delete(key(bx, by));
  lastKey = NaN;
}

/** Block graphs on disk beside the grids: entrances and their crossing costs, as JSON. */
const graphStore: GraphStore = {
  async load(bx, by) {
    try {
      const j = JSON.parse(await fs.promises.readFile((await fileOf(bx, by)).replace(/\.bin$/, ".graph.json"), "utf8")) as { entrances: Entrance[]; edges: [number, { to: number; cost: number }[]][] };
      return { entrances: j.entrances, edges: new Map(j.edges) };
    } catch {
      return null;
    }
  },
  async save(bx, by, g) {
    const file = (await fileOf(bx, by)).replace(/\.bin$/, ".graph.json");
    await fs.promises.mkdir(path.dirname(file), { recursive: true }).then(() => fs.promises.writeFile(file, JSON.stringify({ entrances: g.entrances, edges: [...g.edges] }))).catch(() => {});
  },
};

/** The router every NPC shares (block graphs cached in memory and on disk). */
export const worldRouter = createRouter(worldGrid, graphStore);
