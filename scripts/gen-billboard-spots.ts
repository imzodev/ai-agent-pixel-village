// Place the billboard spots (src/lib/billboards.ts): two by the village plaza,
// one by each town's square, a few along the King's Road. Each
// board stands on clear ground: no buildings, decor, paths, roads, water or
// homestead sites under it or one tile around it, and somewhere to stand in
// front. Deterministic.
//
//   npx tsx --tsconfig tsconfig.json scripts/gen-billboard-spots.ts
//
// Writes src/lib/billboardSpotsData.json. Spots already there are pinned
// (rentals hang off their keys): a re-run only adds missing ones.
import fs from "node:fs";
import path from "node:path";
import { TOWNS } from "../src/lib/settlements";
import { ROAD } from "../src/lib/regions";
import { VILLAGE_TILE } from "../src/lib/homesteadSites";
import { clearTile } from "./clearGround";
import { BOARD_H, BOARD_W } from "../src/lib/billboards";
import type { BillboardSpotDef } from "../src/types/billboard";

const OUT = path.join(process.cwd(), "src/lib/billboardSpotsData.json");

// Pinned spots, plus the boxes they (and new ones) take, so boards never touch.
const pinned: BillboardSpotDef[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
const spots: BillboardSpotDef[] = [...pinned];
const overlaps = (tx: number, ty: number) => spots.some((s) => tx < s.tx + BOARD_W + 3 && tx + BOARD_W + 3 > s.tx && ty < s.ty + BOARD_H + 3 && ty + BOARD_H + 3 > s.ty);

/** A board fits at (tx, ty): its tiles and a ring round it are clear, and the
 *  two tiles in front of it (where you stand to read it) too. */
function fits(tx: number, ty: number): boolean {
  if (overlaps(tx, ty)) return false;
  for (let y = ty - 1; y <= ty + BOARD_H + 1; y++) for (let x = tx - 1; x <= tx + BOARD_W; x++) if (!clearTile(x, y)) return false;
  return true;
}

/** The fitting spot nearest (ax, ay) within r tiles. */
function nearest(ax: number, ay: number, r: number): { tx: number; ty: number } | null {
  let best: { tx: number; ty: number; d: number } | null = null;
  for (let ty = ay - r; ty <= ay + r; ty++) for (let tx = ax - r; tx <= ax + r; tx++) {
    const d = Math.hypot(tx + BOARD_W / 2 - ax, ty + BOARD_H - ay);
    if (d > r || (best && d >= best.d)) continue;
    if (fits(tx, ty)) best = { tx, ty, d };
  }
  return best && { tx: best.tx, ty: best.ty };
}

function add(key: string, name: string, tier: BillboardSpotDef["tier"], at: { tx: number; ty: number } | null) {
  if (spots.some((s) => s.key === key)) return;
  if (!at) { console.warn(`no room for ${key}`); return; }
  spots.push({ key, name, tier, tx: at.tx, ty: at.ty });
  console.log(`${key.padEnd(22)} ${tier.padEnd(9)} at (${at.tx}, ${at.ty})`);
}

// The plaza: two boards facing the spawn.
const V = VILLAGE_TILE;
add("plaza_west", "Village plaza (west)", "plaza", nearest(V.tx - 10, V.ty, 24));
add("plaza_east", "Village plaza (east)", "plaza", nearest(V.tx + 14, V.ty, 24));

// Each town: by its square, below the street.
for (const t of TOWNS) add(`town_${t.key}`, `${t.name} square`, "town", nearest(t.sq.tx + 12, t.sq.ty + 16, 22));

// The King's Road west out of the village: boards on alternate sides, the
// first just past the gate. (Anchors are a board's bottom middle.)
const KR = ROAD;
const ROADSIDE: readonly [string, number, "n" | "s"][] = [
  ["road_gate", KR.tx1 - 30, "n"], ["road_mill", KR.tx1 - 90, "s"],
  ["road_mid", KR.tx1 - 280, "s"], ["road_west", KR.tx1 - 600, "s"],
];
for (const [key, tx, side] of ROADSIDE) {
  add(key, "Roadside board", "roadside", nearest(tx, side === "n" ? KR.ty0 - 2 : KR.ty1 + BOARD_H + 3, 14));
}

fs.writeFileSync(OUT, JSON.stringify(spots, null, 1) + "\n");
console.log(`${spots.length} spots (${spots.length - pinned.length} new)`);
process.exit(0);
