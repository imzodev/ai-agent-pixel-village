#!/usr/bin/env node
// Town square: an original 24×15 scenery stamp for the towns on the King's
// Road (Hollowmere, Brightwater). A cobbled plaza the road runs through,
// with a well, lamp posts, a notice board, benches and a signpost.
//
//   node scripts/draw-town-square.mjs
//
// Writes public/assets/TownSquare.png + public/buildings/town_square.json.
// Layers: plaza → GroundUpper (walkable; the generator leaves the road out
// under it, see TOWN_SQUARES in src/lib/regions.ts); object bases →
// DecorationLower (block, and anchor the Y-sort); their tops →
// DecorationUpper1 (Y-sorted, so you walk behind lamp heads and the roof).
// Every object stays inside its own tiles so nothing else gets blocked.

import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";

const W = 384, H = 240, T = 16;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
// Warm, bright paving and stone to match the Wilds terrain and new houses.
const P = {
  ink: hex(0x2a2220),
  cobble: hex(0xd8cbb0), cobbleDk: hex(0xb8a88a), cobbleLt: hex(0xece2cc), mortar: hex(0x9a8a70),
  edge: hex(0xa89878), edgeDk: hex(0x7a6a54),
  stone: hex(0xb4b0aa), stoneDk: hex(0x86827c), stoneLt: hex(0xd8d4ce),
  wood: hex(0x8c5c38), woodDk: hex(0x64402a), woodLt: hex(0xb07a4c),
  roof: hex(0xa4483c), roofDk: hex(0x7c3428), roofLt: hex(0xc4644c),
  water: hex(0x3a78b8), waterLt: hex(0x6aa6dc),
  iron: hex(0x3c3c44), glass: hex(0xffe08a), glassLt: hex(0xfff6c8),
  paper: hex(0xeee4cc), paperDk: hex(0xc8bca0),
  leaf: hex(0x4e9a3e), leafDk: hex(0x357433), red: hex(0xd8505c), yellow: hex(0xf0c850),
};

// ── Plaza (GroundUpper) ─────────────────────────────────────────────────
const plaza = new Canvas(W, H);
const X0 = 1 * T, X1 = 23 * T - 1, Y0 = 1 * T, Y1 = 14 * T - 1, R = 18;
const inPlaza = (x, y) => {
  if (x < X0 || x > X1 || y < Y0 || y > Y1) return false;
  const cx = Math.min(Math.max(x, X0 + R), X1 - R), cy = Math.min(Math.max(y, Y0 + R), Y1 - R);
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!inPlaza(x, y)) continue;
  // Cobbles: offset brick-ish stones with mortar lines.
  const row = Math.floor(y / 5), off = row % 2 ? 3 : 0;
  const mortar = y % 5 === 4 || (x + off) % 7 === 6;
  let c = mortar ? P.mortar : P.cobble;
  if (!mortar) { const r = rand(Math.floor((x + off) / 7), row); c = r < 0.25 ? P.cobbleDk : r > 0.8 ? P.cobbleLt : P.cobble; }
  plaza.put(x, y, c);
}
// A kerb ring round the plaza.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!inPlaza(x, y)) continue;
  if (!inPlaza(x - 2, y) || !inPlaza(x + 2, y) || !inPlaza(x, y - 2) || !inPlaza(x, y + 2)) plaza.put(x, y, P.edge);
}
// The road enters on both sides (cols 0 and 23 come from the generator).
for (let y = 6 * T; y < 9 * T; y++) for (const x of [X0, X0 + 1, X1 - 1, X1]) plaza.put(x, y, P.cobbleDk);

// ── Objects: bases (lower) and tops (upper) ─────────────────────────────
const lower = new Canvas(W, H), upper = new Canvas(W, H);
const at = (col, row) => [col * T, row * T];

// Fountain (cols 10–13): a round stone basin (rows 3–4, blocks) with a
// two-tier spout rising into row 2 (drawn over you when you're behind it).
{
  const f = new Canvas(W, H);
  const cx = 192, cy = 66;
  const ramp3 = (a, b, c, t) => (t > 0.66 ? c : t > 0.33 ? b : a);
  for (let y = cy - 14; y <= cy + 12; y++) for (let x = cx - 31; x <= cx + 31; x++) {
    const d = ((x - cx) / 30) ** 2 + ((y - cy) / 11.5) ** 2;
    if (d > 1) continue;
    const inner = ((x - cx) / 24) ** 2 + ((y - cy + 1) / 7.5) ** 2;
    if (inner <= 1) {
      // water: deeper toward the centre, with ripple rings
      const r = Math.hypot((x - cx) / 24, (y - cy + 1) / 7.5);
      f.put(x, y, Math.abs(r - 0.55) < 0.06 || Math.abs(r - 0.85) < 0.05 ? P.waterLt : r < 0.4 ? hex(0x5c9ee4) : P.water);
    } else {
      f.put(x, y, ramp3(P.stoneDk, P.stone, P.stoneLt, 0.6 - (y - cy) / 24 - (x - cx) / 120)); // rim
    }
  }
  f.hline(cx - 22, cx + 22, cy + 9, P.stoneDk);
  // pillar and two bowls
  f.rect(cx - 3, cy - 26, 6, 26, P.stone); f.vline(cx - 3, cy - 26, cy - 1, P.stoneLt); f.vline(cx + 2, cy - 26, cy - 1, P.stoneDk);
  f.ellipse(cx, cy - 16, 9, 2.6, P.stone); f.ellipse(cx, cy - 16.6, 7.5, 1.6, P.water);
  f.ellipse(cx, cy - 27, 5, 1.8, P.stone); f.ellipse(cx, cy - 27.5, 3.5, 1, P.waterLt);
  // falling water
  for (const dx of [-8, 8]) for (let k = 0; k < 9; k++) f.put(cx + dx + Math.sign(dx) * Math.round(k * 0.4), cy - 15 + k, k % 3 === 0 ? hex(0xf4fcff) : P.waterLt);
  for (const dx of [-4, 4]) for (let k = 0; k < 9; k++) f.put(cx + dx + Math.sign(dx) * Math.round(k * 0.3), cy - 26 + k, k % 2 ? P.waterLt : hex(0xf4fcff));
  f.outline(P.ink);
  upper.over(f.rows(0, 3 * T));
  lower.over(f.rows(3 * T, H));
}

// Lamp posts: base tile (lower) + head in the tile above (upper).
for (const [col, row] of [[4, 4], [19, 4], [4, 11], [19, 11]]) {
  const [x, y] = at(col, row);
  lower.rect(x + 6, y + 1, 4, 12, P.iron); // from y+1: the outline stays in this tile
  lower.rect(x + 4, y + 12, 8, 3, P.iron);
  const [ux, uy] = at(col, row - 1);
  upper.rect(ux + 7, uy + 9, 2, 7, P.iron);
  upper.rect(ux + 4, uy + 2, 8, 8, P.iron);
  upper.rect(ux + 5, uy + 3, 6, 6, P.glass);
  upper.rect(ux + 6, uy + 4, 2, 2, P.glassLt);
  upper.poly([[ux + 3, uy + 3], [ux + 8, uy - 0.5], [ux + 13, uy + 3]], P.iron);
}

// Notice board: posts (row 3, cols 7–8) under the board (row 2).
{
  const [x, y] = at(7, 3);
  lower.rect(x + 4, y + 1, 3, 13, P.woodDk);
  lower.rect(x + 25, y + 1, 3, 13, P.woodDk);
  const [ux, uy] = at(7, 2);
  upper.rect(ux + 1, uy + 2, 30, 14, P.wood);
  upper.rect(ux + 3, uy + 4, 26, 10, P.woodLt);
  for (const [px, py, w, h] of [[5, 5, 7, 6], [14, 6, 6, 7], [22, 5, 5, 5]]) {
    upper.rect(ux + px, uy + py, w, h, P.paper);
    upper.hline(ux + px + 1, ux + px + w - 2, uy + py + 2, P.paperDk);
    upper.put(ux + px + w / 2, uy + py, P.red); // pin
  }
  upper.rect(ux + 4, uy + 18, 24, 2, P.woodDk); // ledge (falls into the posts' tiles)
}

// Benches (lower only: low enough to sit under the player's head).
for (const [col, row] of [[15, 3], [7, 11], [15, 11]]) {
  const [x, y] = at(col, row);
  lower.rect(x + 2, y + 5, 28, 4, P.wood);
  lower.hline(x + 2, x + 29, y + 5, P.woodLt);
  lower.rect(x + 2, y + 1, 28, 3, P.woodDk); // backrest
  for (const lx of [4, 26]) lower.rect(x + lx, y + 9, 2, 5, P.woodDk);
}

// Signpost (col 21, row 5) pointing both ways along the road.
{
  const [x, y] = at(21, 5);
  lower.rect(x + 7, y + 1, 3, 13, P.woodDk);
  const [ux, uy] = at(21, 4);
  upper.rect(ux + 7, uy + 6, 3, 10, P.woodDk);
  upper.poly([[ux + 0, uy + 3], [ux + 3, uy + 0], [ux + 14, uy + 0], [ux + 14, uy + 6], [ux + 3, uy + 6]], P.woodLt); // ← west
  upper.poly([[ux + 2, uy + 8], [ux + 13, uy + 8], [ux + 16, uy + 11], [ux + 13, uy + 14], [ux + 2, uy + 14]], P.wood); // → east
  upper.hline(ux + 4, ux + 11, uy + 3, P.woodDk);
  upper.hline(ux + 4, ux + 11, uy + 11, P.woodDk);
}

// Flower planters in the plaza corners.
for (const [col, row] of [[2, 2], [21, 2], [2, 12], [21, 12]]) {
  const [x, y] = at(col, row);
  lower.rect(x + 2, y + 6, 12, 8, P.woodDk);
  lower.rect(x + 3, y + 7, 10, 6, P.wood);
  lower.ellipse(x + 8, y + 5, 6, 3.5, P.leafDk);
  lower.ellipse(x + 8, y + 4.5, 5, 2.5, P.leaf);
  for (const [fx, c] of [[4, P.red], [8, P.yellow], [11, P.red]]) lower.put(x + fx, y + 3, c);
}

lower.outline(P.ink);
upper.outline(P.ink);

await bakeCanvases({
  name: "TownSquare",
  jsonName: "town_square",
  layers: { GroundUpper: plaza, DecorationLower: lower, DecorationUpper1: upper },
  collision: [],
  door: [6, 12],
});
