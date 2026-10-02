// Brings the hand-authored village chunks up to the Wilds look when they
// are served (src/app/api/chunks): the old grass becomes Wilds grass and
// the orange sand paths are re-tiled as Wilds path autotiles. Only ground
// layers change, so collision (DecorationLower / Collision) is untouched;
// buildings, trees and props stay as authored.
//
// Path re-tiling works on corners like the rest of the Wilds terrain: a
// corner is path when at least three of the four tiles around it were path
// tiles in the authored map (neighbouring chunks included), and each tile
// takes the path autotile for its 4-corner mask.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { TiledMapJson } from "@/types/tiled";
import { WILDS_FIRSTGID, WILDS_SHEET, WILDS_TILE_ANIMATIONS, wildsGid } from "./terrain/wilds";

export type { TiledMapJson } from "@/types/tiled";

const W = 24, H = 15, TILE = 16;
/** The village grass (Floors_Tiles 251–253). */
const OLD_GRASS = new Set([4952, 4953, 4954]);
/** The village's orange sand path autotile (Floors_Tiles rows 12–16, cols 5–9). */
const OLD_PATH = new Set<number>();
for (let r = 12; r <= 16; r++) for (let c = 5; c <= 9; c++) OLD_PATH.add(4701 + r * 25 + c);

const MAPS = path.join(process.cwd(), "public", "assets", "maps");
const cache = new Map<string, Promise<TiledMapJson | null>>();
/** The authored map for a chunk, or null (generated chunk). Cached. */
export function readAuthored(cx: number, cy: number): Promise<TiledMapJson | null> {
  const key = `${cx},${cy}`;
  let p = cache.get(key);
  if (!p) {
    p = fs.readFile(path.join(MAPS, `map_${cx}_${cy}.json`), "utf8").then((s) => JSON.parse(s) as TiledMapJson, () => null);
    cache.set(key, p);
  }
  return p;
}

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(b ^ 0x9e3779b9, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** A restyled copy of authored chunk (cx, cy). */
export async function restyleAuthored(cx: number, cy: number, src: TiledMapJson): Promise<TiledMapJson> {
  const map = JSON.parse(JSON.stringify(src)) as TiledMapJson;
  // Wilds needs a GID range no tileset in this map uses.
  const end = Math.max(...map.tilesets.map((t) => t.firstgid + (t.tilecount ?? 0)));
  const base = Math.max(WILDS_FIRSTGID, end);
  const gid = (name: string) => base + (wildsGid(name) - WILDS_FIRSTGID);
  map.tilesets.push({
    name: "Wilds", firstgid: base, image: "../Wilds.png", columns: WILDS_SHEET.columns, imagewidth: WILDS_SHEET.width, imageheight: WILDS_SHEET.height,
    margin: 0, spacing: 0, tilewidth: TILE, tileheight: TILE, tilecount: (WILDS_SHEET.width / TILE) * (WILDS_SHEET.height / TILE), tiles: WILDS_TILE_ANIMATIONS,
  });

  const ground = map.layers.find((l) => l.name === "Ground");
  if (ground?.data) {
    ground.data = ground.data.map((g, i) => {
      if (!OLD_GRASS.has(g)) return g;
      const tx = cx * W + (i % W), ty = -cy * H + Math.floor(i / W);
      return gid(`grass_${Math.floor(hash(tx, ty) * 4)}`);
    });
  }

  const upper = map.layers.find((l) => l.name === "GroundUpper");
  if (upper?.data) {
    // Path tiles of this chunk and its 8 neighbours (world tile coords).
    const isPath = await pathLookup(cx, cy);
    const ox = cx * W, oy = -cy * H;
    const vertex = (vx: number, vy: number) => {
      let n = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (isPath(vx + dx, vy + dy)) n++;
      return n >= 3;
    };
    upper.data = upper.data.map((g, i) => {
      const lx = i % W, ly = Math.floor(i / W);
      const tx = ox + lx, ty = oy + ly;
      const m = (vertex(tx, ty) ? 1 : 0) | (vertex(tx + 1, ty) ? 2 : 0) | (vertex(tx, ty + 1) ? 4 : 0) | (vertex(tx + 1, ty + 1) ? 8 : 0);
      if (m === 0) return OLD_PATH.has(g) ? 0 : g;
      if (!OLD_PATH.has(g) && g !== 0) return g; // keep other authored decor
      return gid(m === 15 ? `path_15_${Math.floor(hash(tx, ty) * 3)}` : `path_${m}`);
    });
  }
  return map;
}

/** World-tile → "was a sand path tile" over a chunk and its neighbours. */
async function pathLookup(cx: number, cy: number): Promise<(tx: number, ty: number) => boolean> {
  const grids = new Map<string, number[] | null>();
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const m = await readAuthored(cx + dx, cy + dy);
    grids.set(`${cx + dx},${cy + dy}`, m?.layers.find((l) => l.name === "GroundUpper")?.data ?? null);
  }
  return (tx, ty) => {
    const ccx = Math.floor(tx / W), ccy = -Math.floor(ty / H);
    const data = grids.get(`${ccx},${ccy}`);
    if (!data) return false;
    const lx = tx - ccx * W, ly = ty + ccy * H;
    return OLD_PATH.has(data[ly * W + lx]);
  };
}
