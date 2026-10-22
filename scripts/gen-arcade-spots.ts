// Place the arcade's games in the village (src/lib/arcade/spots.ts): Whistle's
// sheepfold by the plaza, Harvest Haul's cart outside the Village Ranch's west
// gate, by the lane from the village. On clear ground (scripts/clearGround.ts),
// clear of the billboards, the ranch's fence and each other, with room to stand
// in front. Pinned: spots already in spotsData.json are kept; a re-run adds new games.
//
//   npx tsx --tsconfig tsconfig.json scripts/gen-arcade-spots.ts
import fs from "node:fs";
import path from "node:path";
import { VILLAGE_TILE } from "../src/lib/homesteadSites";
import { BOARD_H, BOARD_W } from "../src/lib/billboards";
import { SPOT_SHAPE } from "../src/lib/arcade/spots";
import { clearTile } from "./clearGround";
import type { BillboardSpotDef } from "../src/types/billboard";
import type { ArcadeGameKey } from "../src/types/arcade";

const OUT = path.join(process.cwd(), "src/lib/arcade/spotsData.json");
const spots = JSON.parse(fs.readFileSync(OUT, "utf8")) as Partial<Record<ArcadeGameKey, { tx: number; ty: number }>>;
const boards = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/billboardSpotsData.json"), "utf8")) as BillboardSpotDef[];
/** The Village Ranch inside its fence (src/lib/villageRanch.json: tx 128..199, ty -15..59). */
const RANCH = { tx0: 127, tx1: 200, ty0: -16, ty1: 60 };
/** Where each game would like to be (bottom middle), and how far to look. */
const WANT: Record<ArcadeGameKey, { ax: number; ay: number; r: number }> = {
  whistle: { ax: VILLAGE_TILE.tx + 2, ay: VILLAGE_TILE.ty + 8, r: 26 },
  haul: { ax: 121, ay: -3, r: 14 },
};

const overlaps = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number, pad: number) =>
  ax < bx + bw + pad && ax + aw + pad > bx && ay < by + bh + pad && ay + ah + pad > by;

function fits(game: ArcadeGameKey, tx: number, ty: number): boolean {
  const { w, h } = SPOT_SHAPE[game];
  if (boards.some((b) => overlaps(tx, ty, w, h, b.tx, b.ty, BOARD_W, BOARD_H, 3))) return false;
  if (overlaps(tx, ty, w, h + 2, RANCH.tx0, RANCH.ty0, RANCH.tx1 - RANCH.tx0, RANCH.ty1 - RANCH.ty0, 1)) return false;
  for (const [g, s] of Object.entries(spots)) if (g !== game && s && overlaps(tx, ty, w, h, s.tx, s.ty, SPOT_SHAPE[g as ArcadeGameKey].w, SPOT_SHAPE[g as ArcadeGameKey].h, 3)) return false;
  for (let y = ty - 1; y <= ty + h + 2; y++) for (let x = tx - 1; x <= tx + w; x++) if (!clearTile(x, y)) return false;
  return true;
}

for (const game of Object.keys(SPOT_SHAPE) as ArcadeGameKey[]) {
  if (spots[game]) { console.log(`${game.padEnd(8)} pinned at (${spots[game]!.tx}, ${spots[game]!.ty})`); continue; }
  const { ax, ay, r } = WANT[game], { w, h } = SPOT_SHAPE[game];
  let best: { tx: number; ty: number; d: number } | null = null;
  for (let ty = ay - r - h; ty <= ay + r; ty++) for (let tx = ax - r - w; tx <= ax + r; tx++) {
    const d = Math.hypot(tx + w / 2 - ax, ty + h - ay);
    if (d > r || (best && d >= best.d)) continue;
    if (fits(game, tx, ty)) best = { tx, ty, d };
  }
  if (!best) { console.error(`no room for ${game}`); process.exit(1); }
  spots[game] = { tx: best.tx, ty: best.ty };
  console.log(`${game.padEnd(8)} at (${best.tx}, ${best.ty})`);
}
fs.writeFileSync(OUT, JSON.stringify(spots, null, 1) + "\n");
process.exit(0);
