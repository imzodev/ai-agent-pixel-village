#!/usr/bin/env node
// "Vineyard lot": a fenced parcel south of the ranches (src/lib/crops.ts
// perennials). Players claim one, plant grapevines on the trellises and
// apple trees in the orchard, and build a winery (src/lib/ranchUpgrades.ts).
//
//   node scripts/draw-vineyard-lot.mjs
//
// Writes public/assets/VineyardLot.png + public/buildings/vineyard_lot.json.
// Same skeleton as scripts/draw-land-lot.mjs (road rows 0–1, fence rows
// 3–13 with the gate at cols 11–12), and inside:
//   - left: 5 trellis rows (rows 4–12) of 4 vine plots (cols 2–8)
//   - right: 2 fruit trees (cols 13 / 18, row 9) — the LPC fruit trees are
//     ~83×110 px, so one row of two fills the orchard — and below them a
//     gravel yard where the winery's buildings stand (src/game/vineyardProps.ts)
//   - a path from the gate down the middle
// Garden cells with dx < 12 are vine plots, the rest tree plots (vineyardSlot).

import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";

const W = 384, H = 240, T = 16;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x2e2228),
  road: hex(0xb89a6c), roadDk: hex(0x9a7e56), roadLt: hex(0xcfb487), roadEdge: hex(0x8a7048),
  pebble: hex(0x8e8a84), pebbleLt: hex(0xb4b0aa),
  soil: hex(0x74523a), soilDk: hex(0x5c402c), soilLt: hex(0x86603f), soilEdge: hex(0x4e3624),
  path: hex(0xa48660), pathDk: hex(0x8a6e4c), pathLt: hex(0xbc9e74),
  wood: hex(0x9a6a40), woodDk: hex(0x6e4a2c), woodLt: hex(0xbc8a58),
  sign: hex(0xc49a64), signDk: hex(0x8c663e),
  leaf: hex(0x52a048), leafDk: hex(0x3a7a3a),
  grape: hex(0x6e2a5a), grapeLt: hex(0x9a4a82),
  mulch: hex(0x6a4c30), mulchLt: hex(0x86603f),
  grass: hex(0x5a9a4a), grassDk: hex(0x4a8a3c),
};

// Fence tiles: top row 3, bottom row 13, sides cols 1 and 22.
const TOP_ROW = 3, BOT_ROW = 13, LEFT_COL = 1, RIGHT_COL = 22;
const GATE_C0 = 11, GATE_C1 = 12;
// Plots: a crop centres on (c+1)*16 and stands on (r+1)*16.
const VINE_COLS = [2, 4, 6, 8], VINE_ROWS = [4, 6, 8, 10, 12];
const TREE_COLS = [13, 18], TREE_ROWS = [9];

// ── Ground ──────────────────────────────────────────────────────────────
const ground = new Canvas(W, H);
// Road (rows 0–1, y 0..31): packed dirt with ruts, a darker verge, pebbles.
ground.rect(0, 3, W, 26, P.road);
ground.hline(0, W - 1, 3, P.roadEdge);
ground.hline(0, W - 1, 28, P.roadEdge);
for (let x = 0; x < W; x++) {
  if (rand(x, 1) < 0.5) ground.put(x, 2, P.roadEdge); // ragged verges
  if (rand(x, 2) < 0.5) ground.put(x, 29, P.roadEdge);
  for (let y = 4; y < 28; y++) if (rand(x, y) < 0.08) ground.put(x, y, P.roadDk);
  for (const ry of [10, 21]) if (rand(x, ry) < 0.8) ground.put(x, ry, P.roadDk); // cart ruts
  if (rand(x, 3) < 0.6) ground.put(x, 11, P.roadLt);
  if (rand(x, 4) < 0.6) ground.put(x, 22, P.roadLt);
}
for (let k = 0; k < 18; k++) {
  const x = Math.floor(rand(k, 9) * (W - 4)) + 2, y = 6 + Math.floor(rand(9, k) * 18);
  ground.put(x, y, P.pebble); ground.put(x + 1, y, P.pebbleLt);
}
// Short spur from the road through the gate (rows 2–3).
ground.rect(GATE_C0 * T + 4, 28, 24, (TOP_ROW + 1) * T - 28, P.path); // through the gate to the field
for (let y = 28; y < (TOP_ROW + 1) * T; y++) for (let x = GATE_C0 * T + 4; x < GATE_C0 * T + 28; x++) if (rand(x, y) < 0.1) ground.put(x, y, P.pathDk);

// A worn path from the gate down the middle of the lot.
ground.rect(GATE_C0 * T + 4, 28, 24, (BOT_ROW + 1) * T - 32, P.path);
for (let y = 28; y < BOT_ROW * T + 12; y++) for (let x = GATE_C0 * T + 4; x < GATE_C0 * T + 28; x++) if (rand(x, y) < 0.1) ground.put(x, y, P.pathDk);
// Trellis rows: a strip of tilled soil under each, where the vines root.
for (const r of VINE_ROWS) {
  const by = (r + 1) * T;
  ground.rect(VINE_COLS[0] * T + 2, by - 6, (VINE_COLS.at(-1) + 2 - VINE_COLS[0]) * T - 4, 6, P.soil);
  ground.hline(VINE_COLS[0] * T + 2, (VINE_COLS.at(-1) + 2) * T - 3, by - 6, P.soilEdge);
  for (let x = VINE_COLS[0] * T + 2; x < (VINE_COLS.at(-1) + 2) * T - 2; x++) if (rand(x, r) < 0.25) ground.put(x, by - 3, P.soilDk);
}
// Orchard: a ring of mulch under each tree.
for (const r of TREE_ROWS) for (const c of TREE_COLS) {
  const mx = (c + 1) * T - 3, my = (r + 1) * T - 2; // the trunk stands 3 px left of the cell centre
  ground.ellipse(mx, my, 20, 5, P.mulch);
  ground.ellipse(mx - 3, my - 1, 13, 2.5, P.mulchLt);
}
// A gravel yard at the bottom right, under the trees, for the winery's buildings.
ground.rect(13 * T, 12 * T - 2, 9 * T - 4, T + 6, P.path);
for (let y = 12 * T - 2; y < 13 * T + 4; y++) for (let x = 13 * T; x < 22 * T - 4; x++) if (rand(x, y, 7) < 0.12) ground.put(x, y, P.pathDk);

// ── Fence (blocking) ────────────────────────────────────────────────────
// Every pixel, outline included, stays inside the fence tiles so the gate,
// the walkway outside and the field inside stay walkable.
const fence = new Canvas(W, H);
/** Horizontal post-and-rail run inside tile row `row`, x0..x1 inclusive. */
function hFence(row, x0, x1) {
  const y = row * T;
  fence.rect(x0, y + 5, x1 - x0 + 1, 2, P.wood); // top rail
  fence.hline(x0, x1, y + 7, P.woodDk);
  fence.rect(x0, y + 10, x1 - x0 + 1, 2, P.wood); // bottom rail
  fence.hline(x0, x1, y + 12, P.woodDk);
  for (let x = x0; x + 3 <= x1; x += 16) post(x, y + 2, y + 13);
  post(x1 - 3, y + 2, y + 13);
}
/** Vertical run inside tile column `col`, y0..y1 inclusive. */
function vFence(col, y0, y1) {
  const x = col * T + 6;
  fence.rect(x, y0, 2, y1 - y0 + 1, P.wood);
  fence.vline(x + 2, y0, y1, P.woodDk);
  for (let y = y0; y + 10 <= y1; y += 16) post(x - 1, y, y + 9);
}
function post(x, y0, y1) {
  fence.rect(x, y0, 4, y1 - y0 + 1, P.wood);
  fence.vline(x, y0, y1, P.woodLt);
  fence.vline(x + 3, y0, y1, P.woodDk);
  fence.hline(x, x + 3, y0, P.woodLt);
}
const FX0 = LEFT_COL * T + 5, FX1 = (RIGHT_COL + 1) * T - 6;
vFence(LEFT_COL, TOP_ROW * T + 6, BOT_ROW * T + 12);
vFence(RIGHT_COL, TOP_ROW * T + 6, BOT_ROW * T + 12);
hFence(TOP_ROW, FX0, GATE_C0 * T - 3); // left of the gate
hFence(TOP_ROW, (GATE_C1 + 1) * T + 2, FX1); // right of the gate
hFence(BOT_ROW, FX0, FX1);
// Taller gate posts with round caps, gate left open.
for (const gx of [GATE_C0 * T - 7, (GATE_C1 + 1) * T + 2]) {
  fence.rect(gx, TOP_ROW * T + 1, 5, 13, P.wood);
  fence.vline(gx, TOP_ROW * T + 1, TOP_ROW * T + 13, P.woodLt);
  fence.vline(gx + 4, TOP_ROW * T + 1, TOP_ROW * T + 13, P.woodDk);
}
fence.outline(P.ink);

// ── Sign beside the gate: a bunch of grapes ──────────────────────────────
const sign = new Canvas(W, H);
const SX = (GATE_C1 + 2) * T + 2, SY = TOP_ROW * T - 8;
sign.rect(SX + 9, SY + 10, 3, 12, P.woodDk);
sign.rect(SX, SY, 22, 12, P.sign);
sign.hline(SX, SX + 21, SY + 11, P.signDk);
sign.vline(SX + 21, SY, SY + 11, P.signDk);
for (const [dx, dy] of [[7, 3], [9, 3], [11, 3], [8, 5], [10, 5], [9, 7]]) { sign.put(SX + dx, SY + dy, P.grape); sign.put(SX + dx + 1, SY + dy, P.grapeLt); }
sign.put(SX + 10, SY + 2, P.leaf); sign.put(SX + 11, SY + 1, P.leaf); sign.put(SX + 12, SY + 2, P.leafDk);
sign.outline(P.ink);

// ── Soft shadow under the fence ────────────────────────────────────────
const shadow = new Canvas(W, H);
shadow.rect(FX0, TOP_ROW * T + 14, GATE_C0 * T - 3 - FX0, 1, P.ink, 50);
shadow.rect((GATE_C1 + 1) * T + 2, TOP_ROW * T + 14, FX1 - (GATE_C1 + 1) * T - 2, 1, P.ink, 50);
shadow.rect(FX0, BOT_ROW * T + 14, FX1 - FX0, 1, P.ink, 50);

// ── Route to template layers and bake ───────────────────────────────────
const lower = fence.over(sign.rows(TOP_ROW * T, H));
const upper = sign.rows(0, TOP_ROW * T);
const collision = [];
for (let c = LEFT_COL; c <= RIGHT_COL; c++) if (c < GATE_C0 || c > GATE_C1) collision.push([TOP_ROW, c]);
// Garden cells in row-major order: vines (dx < 12) and trees.
const garden = [];
for (let r = 0; r < 15; r++) {
  if (VINE_ROWS.includes(r)) for (const c of VINE_COLS) garden.push([r, c]);
  if (TREE_ROWS.includes(r)) for (const c of TREE_COLS) garden.push([r, c]);
}

await bakeCanvases({
  name: "VineyardLot",
  jsonName: "vineyard_lot",
  layers: { GroundUpper: ground, DecorationLowerShadow: shadow, DecorationLower: lower, DecorationUpper1: upper },
  collision,
  door: [TOP_ROW, GATE_C0],
  garden,
});
