// Place Whistle's sheepfold (src/lib/whistle/fold.ts) by the village plaza, on
// clear ground (scripts/clearGround.ts), clear of the billboards, with room to
// stand in front of its gate. Pinned: once foldData.json exists, a re-run keeps it.
//
//   npx tsx --tsconfig tsconfig.json scripts/gen-sheepfold.ts
import fs from "node:fs";
import path from "node:path";
import { VILLAGE_TILE } from "../src/lib/homesteadSites";
import { BOARD_H, BOARD_W } from "../src/lib/billboards";
import { clearTile } from "./clearGround";
import type { BillboardSpotDef } from "../src/types/billboard";

const OUT = path.join(process.cwd(), "src/lib/whistle/foldData.json");
const W = 6, H = 5;
if (fs.existsSync(OUT) && process.argv[2] !== "--again") {
  console.log("pinned:", fs.readFileSync(OUT, "utf8").trim());
  process.exit(0);
}
const boards = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src/lib/billboardSpotsData.json"), "utf8")) as BillboardSpotDef[];
const nearBoard = (tx: number, ty: number) => boards.some((b) => tx < b.tx + BOARD_W + 3 && tx + W + 3 > b.tx && ty < b.ty + BOARD_H + 3 && ty + H + 3 > b.ty);
function fits(tx: number, ty: number): boolean {
  if (nearBoard(tx, ty)) return false;
  for (let y = ty - 1; y <= ty + H + 2; y++) for (let x = tx - 1; x <= tx + W; x++) if (!clearTile(x, y)) return false;
  return true;
}
const V = VILLAGE_TILE, AX = V.tx + 2, AY = V.ty + 8, R = 26;
let best: { tx: number; ty: number; d: number } | null = null;
for (let ty = AY - R; ty <= AY + R; ty++) for (let tx = AX - R; tx <= AX + R; tx++) {
  const d = Math.hypot(tx + W / 2 - AX, ty + H - AY);
  if (d > R || (best && d >= best.d)) continue;
  if (fits(tx, ty)) best = { tx, ty, d };
}
if (!best) { console.error("no room for the sheepfold"); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify({ tx: best.tx, ty: best.ty }) + "\n");
console.log(`sheepfold at (${best.tx}, ${best.ty})`);
process.exit(0);
