#!/usr/bin/env node
// "Land lot": an original fenced farm parcel (no shared tilesets), one per
// chunk along the meadow row. Players claim or buy one and plant crops.
//
//   node scripts/draw-land-lot.mjs
//
// Writes public/assets/LandLot.png + public/buildings/land_lot.json via
// bakeCanvases() in scripts/bake-building.mjs. The 24×15-tile template:
//   - rows 0–1: dirt road across the full width (GroundUpper), so lots
//     stamped side by side form one continuous east–west road
//   - rows 3–13, cols 1–22: post-and-rail fence (DecorationLower, blocks
//     movement) with an open 2-tile gate at cols 11–12 facing the road
//   - inside: one tilled field, 10 plots × 5 rows = 50 garden plots
//     (GroundUpper); the gate opens straight onto it
//   - a wooden sign beside the gate; its top is Y-sorted (DecorationUpper1)
// Cols 0 and 23 stay free, so neighbouring lots have a 2-tile walkway.

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
};

// Fence tiles: top row 3, bottom row 13, sides cols 1 and 22.
const TOP_ROW = 3, BOT_ROW = 13, LEFT_COL = 1, RIGHT_COL = 22;
const GATE_C0 = 11, GATE_C1 = 12;
// Plot columns (left cell of each 2-cell plot) and plot rows (the row the
// crop's base sits on). Crops centre on (c+1)*16 and stand on (r+1)*16.
const PLOT_COLS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const PLOT_ROWS = [4, 6, 8, 10, 12];

// ── Ground: road, soil strips, centre path ─────────────────────────────
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

// One tilled field filling the fence (rows 4–12, cols 2–21): a mound row
// per plot row, furrows between, and a darker edge.
const FX_0 = (LEFT_COL + 1) * T + 2, FX_1 = RIGHT_COL * T - 3;
const FY_0 = (TOP_ROW + 1) * T + 2, FY_1 = BOT_ROW * T + 3; // tucks under the back fence
ground.rect(FX_0 - 1, FY_0 - 1, FX_1 - FX_0 + 3, FY_1 - FY_0 + 3, P.soilEdge);
ground.rect(FX_0, FY_0, FX_1 - FX_0 + 1, FY_1 - FY_0 + 1, P.soil);
for (let y = FY_0; y <= FY_1; y++) for (let x = FX_0; x <= FX_1; x++) if (rand(x, y) < 0.12) ground.put(x, y, P.soilDk);
for (const r of PLOT_ROWS) {
  const by = (r + 1) * T;
  if (r > PLOT_ROWS[0]) ground.hline(FX_0 + 1, FX_1 - 1, by - 16, P.soilDk); // furrow between plot rows
  for (const c of PLOT_COLS) { // a mound at each plot's base, where the crop grows
    const mx = (c + 1) * T;
    ground.ellipse(mx, by - 3, 11, 2.5, P.soilDk);
    ground.ellipse(mx, by - 4, 10, 1.5, P.soilLt);
  }
}

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

// ── Sign beside the gate (right side, on the fence) ────────────────────
// The board rises above the fence row; that part is Y-sorted (upper) so it
// never blocks the walkway in row 2.
const sign = new Canvas(W, H);
const SX = (GATE_C1 + 2) * T + 2, SY = TOP_ROW * T - 8;
sign.rect(SX + 9, SY + 10, 3, 12, P.woodDk); // post (ends in the fence row)
sign.rect(SX, SY, 22, 12, P.sign);
sign.hline(SX, SX + 21, SY + 11, P.signDk);
sign.vline(SX + 21, SY, SY + 11, P.signDk);
for (const [lx, ly, lw] of [[SX + 3, SY + 3, 15], [SX + 3, SY + 6, 11]]) sign.hline(lx, lx + lw, ly, P.signDk); // "writing"
sign.put(SX + 16, SY + 7, P.leaf); sign.put(SX + 17, SY + 6, P.leaf); sign.put(SX + 17, SY + 8, P.leafDk); // sprout mark
sign.outline(P.ink);

// ── Soft shadow under the fence ────────────────────────────────────────
const shadow = new Canvas(W, H);
shadow.rect(FX0, TOP_ROW * T + 14, GATE_C0 * T - 3 - FX0, 1, P.ink, 50);
shadow.rect((GATE_C1 + 1) * T + 2, TOP_ROW * T + 14, FX1 - (GATE_C1 + 1) * T - 2, 1, P.ink, 50);
shadow.rect(FX0, BOT_ROW * T + 14, FX1 - FX0, 1, P.ink, 50);

// ── Route to template layers and bake ───────────────────────────────────
const lower = fence.over(sign.rows(TOP_ROW * T, H));
const upper = sign.rows(0, TOP_ROW * T);

// Collision on the front fence (already blocking) gives the lot its
// footprint: the fence front is where you click the lot, and it sits above
// the plots so it never steals their clicks.
const collision = [];
for (let c = LEFT_COL; c <= RIGHT_COL; c++) if (c < GATE_C0 || c > GATE_C1) collision.push([TOP_ROW, c]);

const garden = [];
for (const r of PLOT_ROWS) for (const c of PLOT_COLS) garden.push([r, c]);

await bakeCanvases({
  name: "LandLot",
  jsonName: "land_lot",
  layers: {
    GroundUpper: ground,
    DecorationLowerShadow: shadow,
    DecorationLower: lower,
    DecorationUpper1: upper,
  },
  collision,
  door: [TOP_ROW, GATE_C0],
  garden,
});
