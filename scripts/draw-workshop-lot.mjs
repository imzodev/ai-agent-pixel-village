#!/usr/bin/env node
// "Workshop lot": a carpenter's yard on the road south of Hollowmere. Players
// claim one, build stations (src/lib/ranchUpgrades.ts, lot "workshop") and
// make furniture, then show it off on the porch.
//
//   node scripts/draw-workshop-lot.mjs
//
// Writes public/assets/WorkshopLot.png + public/buildings/workshop_lot.json.
// Same skeleton as the land / vineyard lots (road rows 0–1, fence rows 3–13,
// gate at cols 11–12), and inside:
//   - left: an open-fronted timber shed (cols 2–9, rows 4–8) with the
//     workbench and tools on the back wall, and a stack of logs beside it
//   - right: the showroom porch, a raised deck (cols 14–21, rows 5–10) with
//     6 display spots the game draws furniture on (src/game/workshopProps.ts)
//   - the bottom rows: a yard where stations stand as they're built

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
  timber: hex(0x8a5a32), timberDk: hex(0x5e3c20), timberLt: hex(0xb07a48),
  plank: hex(0xc8a070), plankDk: hex(0xa07c50), plankLt: hex(0xe0c090),
  roof: hex(0x6a4a3a), roofDk: hex(0x4a3226), roofLt: hex(0x8a6450),
  iron: hex(0x5a5a68), ironLt: hex(0x9a9aa8),
  log: hex(0x7a5232), logDk: hex(0x5a3a22), ring: hex(0xd8b37c), ringDk: hex(0xb48a58),
};


const TOP_ROW = 3, BOT_ROW = 13, LEFT_COL = 1, RIGHT_COL = 22;
const GATE_C0 = 11, GATE_C1 = 12;

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

// Packed earth through the gate and across the yard.
ground.rect(GATE_C0 * T + 4, 28, 24, (BOT_ROW + 1) * T - 32, P.path);
ground.rect(2 * T, 11 * T, 20 * T - 4, 2 * T + 4, P.path);
for (let y = 28; y < BOT_ROW * T + 12; y++) for (let x = 2 * T; x < 22 * T - 4; x++) if (ground.alpha(x, y) && rand(x, y, 5) < 0.1) ground.put(x, y, P.pathDk);
// Sawdust under the shed.
for (let k = 0; k < 90; k++) { const x = 2 * T + 4 + Math.floor(rand(k, 21) * 8 * T), y = 8 * T + Math.floor(rand(21, k) * 2 * T); ground.put(x, y, P.plankLt); }

// ── Showroom porch: a raised deck of planks with a step ──────────────────
const DX0 = 14 * T - 4, DX1 = 22 * T - 4, DY0 = 5 * T + 4, DY1 = 10 * T + 10;
for (let y = DY0; y <= DY1; y++) for (let x = DX0; x <= DX1; x++) {
  const seam = (y - DY0) % 6 === 5, joint = (x + Math.floor((y - DY0) / 6) * 13) % 26 === 0;
  ground.put(x, y, seam || joint ? P.plankDk : rand(x >> 2, y >> 1, 9) < 0.5 ? P.plank : P.plankLt);
}
for (let x = DX0; x <= DX1; x++) { ground.put(x, DY1 + 1, P.timberDk); ground.put(x, DY1 + 2, P.timber); ground.put(x, DY1 + 3, P.ink); }
for (let y = DY0; y <= DY1 + 3; y++) { ground.put(DX0 - 1, y, P.ink); ground.put(DX1 + 1, y, P.ink); }
ground.rect(DX0 + 40, DY1 + 3, 48, 4, P.plankDk); // the step

// ── The shed: back wall of planks, posts, a pitched roof, open front ─────
const shed = new Canvas(W, H);
const SX0 = 2 * T, SX1 = 10 * T - 1, WALL_TOP = 4 * T + 6, FLOOR = 9 * T - 2;
for (let y = WALL_TOP; y <= 7 * T + 8; y++) for (let x = SX0 + 2; x <= SX1 - 2; x++) shed.put(x, y, (x - SX0) % 8 === 0 ? P.timberDk : rand(x, y >> 2, 3) < 0.5 ? P.timber : P.timberLt);
// tools on the back wall: a saw, a hammer, a square, a hand plane
const tool = (pts, col) => { for (const [x, y] of pts) shed.put(SX0 + x, WALL_TOP + y, col); };
for (let k = 0; k < 14; k++) { tool([[10 + k, 8 + Math.floor(k / 5)]], P.ironLt); tool([[10 + k, 9 + Math.floor(k / 5)]], P.iron); } tool([[8, 7], [8, 8], [9, 8], [8, 9]], P.timberDk);
for (let k = 0; k < 8; k++) tool([[32, 5 + k]], P.timberDk); tool([[30, 5], [31, 5], [32, 5], [33, 5], [34, 5]], P.iron);
for (let k = 0; k < 10; k++) { tool([[44 + k, 6]], P.ironLt); tool([[44, 6 + k]], P.ironLt); }
tool([[58, 8], [59, 8], [60, 8], [61, 8], [62, 8], [58, 9], [62, 9], [60, 7]], P.plankDk);
// the workbench along the back wall
for (let y = 7 * T + 2; y <= 7 * T + 6; y++) for (let x = SX0 + 6; x <= SX1 - 6; x++) shed.put(x, y, y === 7 * T + 2 ? P.plankLt : P.plank);
for (const lx of [SX0 + 8, SX1 - 10]) for (let y = 7 * T + 7; y <= FLOOR; y++) { shed.put(lx, y, P.timberDk); shed.put(lx + 1, y, P.timber); }
for (let k = 0; k < 6; k++) shed.put(SX0 + 40 + k, 7 * T, P.plankLt); // a board on the bench
// corner posts
for (const px of [SX0, SX1 - 3]) for (let y = WALL_TOP - 2; y <= FLOOR; y++) for (let k = 0; k < 4; k++) shed.put(px + k, y, k === 0 ? P.timberLt : k === 3 ? P.timberDk : P.timber);
// roof: shingles sloping toward the yard
for (let y = 2 * T + 8; y <= WALL_TOP + 2; y++) {
  const inset = Math.max(0, Math.round((WALL_TOP + 2 - y) * 0.15));
  for (let x = SX0 - 6 + inset; x <= SX1 + 6 - inset; x++) { const row = Math.floor((y - 2 * T) / 4), k = (y - 2 * T) % 4; shed.put(x, y, k === 3 ? P.roofDk : (x + row * 5) % 10 === 0 ? P.roofDk : k === 0 ? P.roofLt : P.roof); }
}
shed.outline(P.ink);

// ── The log stack beside the shed (cols 2–4, rows 11–12) ────────────────
const logs = new Canvas(W, H);
for (const [lx, ly] of [[2 * T + 6, 12 * T + 8], [2 * T + 18, 12 * T + 8], [2 * T + 30, 12 * T + 8], [2 * T + 12, 12 * T - 2], [2 * T + 24, 12 * T - 2], [2 * T + 18, 11 * T + 4]]) {
  logs.ellipse(lx, ly, 6, 5, P.logDk); logs.ellipse(lx - 1, ly - 1, 5, 4, P.ring); logs.ellipse(lx - 1, ly - 1, 2.5, 2, P.ringDk);
}
logs.outline(P.ink);

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

// ── Sign beside the gate: a saw ──────────────────────────────────────────
const sign = new Canvas(W, H);
const GX = (GATE_C1 + 2) * T + 2, GY = TOP_ROW * T - 8;
sign.rect(GX + 9, GY + 10, 3, 12, P.woodDk);
sign.rect(GX, GY, 22, 12, P.sign);
sign.hline(GX, GX + 21, GY + 11, P.signDk);
sign.vline(GX + 21, GY, GY + 11, P.signDk);
for (let k = 0; k < 12; k++) { sign.put(GX + 5 + k, GY + 5, P.ironLt); if (k % 2 === 0) sign.put(GX + 5 + k, GY + 6, P.iron); }
sign.rect(GX + 3, GY + 4, 3, 4, P.woodDk);
sign.outline(P.ink);

// ── Soft shadow under the fence ────────────────────────────────────────
const shadow = new Canvas(W, H);
shadow.rect(FX0, TOP_ROW * T + 14, GATE_C0 * T - 3 - FX0, 1, P.ink, 50);
shadow.rect((GATE_C1 + 1) * T + 2, TOP_ROW * T + 14, FX1 - (GATE_C1 + 1) * T - 2, 1, P.ink, 50);
shadow.rect(FX0, BOT_ROW * T + 14, FX1 - FX0, 1, P.ink, 50);

// ── Route to template layers and bake ───────────────────────────────────
// The shed's bottom row blocks (lower, anchors the Y-sort); everything above
// is upper so you walk behind the roof. The log stack blocks too.
const lowerArt = fence.over(sign.rows(TOP_ROW * T, H)).over(shed.rows(8 * T, H)).over(logs);
const upper = sign.rows(0, TOP_ROW * T).over(shed.rows(0, 8 * T));
const collision = [];
for (let c = LEFT_COL; c <= RIGHT_COL; c++) if (c < GATE_C0 || c > GATE_C1) collision.push([TOP_ROW, c]);
for (let c = 2; c <= 9; c++) collision.push([7, c], [8, c]); // the shed's back and the workbench
collision.push([11, 2], [11, 3], [12, 2], [12, 3], [12, 4]); // logs

await bakeCanvases({
  name: "WorkshopLot",
  jsonName: "workshop_lot",
  layers: { GroundUpper: ground, DecorationLowerShadow: shadow, DecorationLower: lowerArt, DecorationUpper1: upper },
  collision,
  door: [TOP_ROW, GATE_C0],
});
