// Write the homestead sites (src/lib/homesteadSites.ts) into
// src/lib/homesteadSitesData.json.
//
//   npx tsx --tsconfig tsconfig.json scripts/gen-homestead-sites.ts
//
// Every grid cell (SITE_COLS × SITE_ROWS) that is all open land in the
// homesteads or the heartland, clear of roads, towns and the buildings
// standing today (planned lot rows don't count: they're retired), becomes a
// site. Sites already in the file are pinned (same key, place and block):
// people own them. New sites are numbered and put in blocks of BLOCK_SIZE
// by their distance from the village, after the blocks already there.

import fs from "node:fs";
import path from "node:path";
import { inHeartland } from "../src/lib/continent";
import { terrainWalkable } from "../src/lib/regions";
import { ROADS, townAt } from "../src/lib/settlements";
import { BLOCK_SIZE, SITE_COLS, SITE_LANE_W, SITE_ROWS, SITE_TILES, VILLAGE_TILE } from "../src/lib/homesteadSites";
import type { HomesteadSite, HomesteadSitesData } from "../src/types/homestead";

const file = path.join(process.cwd(), "src/lib/homesteadSitesData.json");
const data: HomesteadSitesData = JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/buildings/buildings.json"), "utf8"));
const W = 24, H = 15;
const standing = (manifest.buildings as { row?: string; tx: number; ty: number }[])
  .filter((b) => !b.row || /_0$/.test(b.row)) // in the world today (closed rows are retired)
  .map((b) => ({ x0: b.tx, y0: b.ty, x1: b.tx + W - 1, y1: b.ty + H - 1 }));
const roadTiles = new Set(ROADS.flatMap((r) => r.map(([x, y]) => `${x},${y}`)));

/** Why a site can't stand at (tx, ty) (with its lane), or null. */
function blocked(tx: number, ty: number): string | null {
  const [x0, y0, x1, y1] = [tx - SITE_LANE_W, ty - SITE_LANE_W, tx + SITE_TILES - 1, ty + SITE_TILES - 1];
  if (standing.some((r) => x0 <= r.x1 && x1 >= r.x0 && y0 <= r.y1 && y1 >= r.y0)) return "building";
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (roadTiles.has(`${x},${y}`)) return "road";
    if (townAt(x, y)) return "town";
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inHeartland(x, y)) return "wild land";
    if (!terrainWalkable(x, y)) return `not open (${x},${y})`;
  }
  return null;
}

const pinned = new Set(data.sites.map((s) => `${s.tx},${s.ty}`));
const fresh: { tx: number; ty: number }[] = [];
for (const ty of SITE_ROWS) for (const tx of SITE_COLS) {
  if (pinned.has(`${tx},${ty}`)) continue;
  const why = blocked(tx, ty);
  if (why) console.log(`skip ${tx},${ty}: ${why}`);
  else fresh.push({ tx, ty });
}
const dist = (s: { tx: number; ty: number }) => Math.hypot(s.tx + SITE_TILES / 2 - VILLAGE_TILE.tx, s.ty - VILLAGE_TILE.ty);
fresh.sort((a, b) => dist(a) - dist(b));
let n = data.sites.reduce((m, s) => Math.max(m, Number(s.key.slice(5))), 0);
const firstBlock = data.sites.length ? Math.max(...data.sites.map((s) => s.block)) + 1 : 0;
const added: HomesteadSite[] = fresh.map((s, i) => ({
  key: `site_${++n}`,
  tx: s.tx,
  ty: s.ty,
  block: firstBlock + Math.floor(i / BLOCK_SIZE),
  sign: { tx: s.tx + 3, ty: s.ty }, // on the first parcel, by the lane
}));
data.sites.push(...added);
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
console.log(`${added.length} new sites (${data.sites.length} in all, ${new Set(data.sites.map((s) => s.block)).size} blocks)`);
