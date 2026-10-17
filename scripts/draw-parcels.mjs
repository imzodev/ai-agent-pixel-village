#!/usr/bin/env node
// Homestead parcels (src/lib/homestead.ts): one sheet with what each parcel
// use looks like, drawn over the meadow the terrain already paints, plus the
// fences round them and the site's signpost.
//
//   node scripts/draw-parcels.mjs
//
// Writes public/assets/parcels.png. Frames (src/game/homesteadArt.ts):
//   y 0:   160×160 overlays, x = i × 160: wild, field, pasture, vineyard, orchard
//   y 160: fence_h 160×16 (x 0), fence_h_gate (x 160), sign 32×48 (x 320),
//          fence_v 16×160 (x 352), fence_v_gate (x 368)
//   y 320: p_plot 160×160 (x 0: a staked-out building plot), barn 96×80
//          (x 160), workshop 80×64 (x 256) — placed by PARCEL_BUILDINGS
//          (src/lib/homestead.ts); their walls are its blocked tiles.
// A field's beds sit where its plots are (plotOffsets: 4 rows of four
// two-tile beds on tile rows 2, 4, 6, 8); vines and trees stand on their
// plots, so the overlays only lay the ground for them.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas, rand } from "./canvas-art.mjs";
import { PAL, hex, ramp } from "./ds-art.mjs";

const P = 160, T = 16, W = 800, H = 480;
const sheet = new Canvas(W, H);
const INK = PAL.ink;
const C = {
  soil: [hex(0x3a2214), hex(0x4e3020), hex(0x64402a), hex(0x7a5236), hex(0x8e6442)],
  path: [hex(0x8a7048), hex(0x9a7e56), hex(0xb89a6c), hex(0xcfb487)],
  grass: [hex(0x2f6a30), hex(0x3c7c36), hex(0x4a8e3e), hex(0x62a64c), hex(0x7cc060)],
  tall: [hex(0x3a6a28), hex(0x5a8a34), hex(0x7aa844), hex(0x9cc45a)],
  clover: [hex(0x2e6a3a), hex(0x4e9a4a), hex(0x7cc462)],
  mulch: [hex(0x3e2a1a), hex(0x543a24), hex(0x6a4a2e), hex(0x86603f)],
  straw: [hex(0x8a6a2a), hex(0xb08a3a), hex(0xd4b050), hex(0xecd078)],
  wood: PAL.wood,
};

/** Draw onto the sheet with an offset. */
const at = (ox, oy) => ({
  put: (x, y, c, a) => sheet.put(ox + x, oy + y, c, a),
  rect: (x, y, w, h, c, a) => sheet.rect(ox + x, oy + y, w, h, c, a),
});

// ── Wild: rough tussocks and a few flowers ──────────────────────────────
function wild(g) {
  for (let k = 0; k < 70; k++) {
    const x = 6 + Math.floor(rand(1, k * 7919) * (P - 12)), y = 8 + Math.floor(rand(k * 104729, 2) * (P - 12));
    for (let j = 0; j < 5; j++) {
      const h = 4 + Math.floor(rand(k, j, 3) * 5), bx = x + j - 2, lean = j < 2 ? -1 : j > 2 ? 1 : 0;
      for (let s = 0; s < h; s++) g.put(bx + (s > h / 2 ? lean : 0), y - s, ramp(C.tall, 0.25 + (s / h) * 0.7, bx, y - s));
    }
  }
  for (let k = 0; k < 14; k++) {
    const x = 8 + Math.floor(rand(k, 7) * (P - 16)), y = 8 + Math.floor(rand(k, 8) * (P - 16));
    const col = [PAL.yellow, PAL.white, PAL.violet][k % 3];
    g.put(x, y, col); g.put(x + 1, y, col); g.put(x, y - 1, col);
  }
}

// ── Field: four rows of tilled beds with paths between ─────────────────
function field(g) {
  // a worn path round the beds
  for (let y = 4; y < P - 4; y++) for (let x = 4; x < P - 4; x++) {
    const edge = Math.min(x - 4, P - 5 - x, y - 4, P - 5 - y);
    if (edge < 2 && rand(x, y, 3) < 0.5) continue;
    g.put(x, y, ramp(C.path, 0.55 + (rand(x, y, 8) - 0.5) * 0.35 - (edge < 2 ? 0.2 : 0), x, y), 235);
  }
  for (let r = 0; r < 4; r++) {
    const y0 = (2 + r * 2) * T - 6, y1 = (3 + r * 2) * T - 1; // the bed row, a little taller than a tile
    for (let c = 0; c < 4; c++) {
      const x0 = (1 + c * 2) * T + 1, x1 = (3 + c * 2) * T - 2;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const furrow = (y - y0) % 7;
        g.put(x, y, ramp(C.soil, (furrow === 5 ? 0.2 : furrow === 6 ? 0.35 : 0.64) + (rand(x, y, 12) - 0.5) * 0.25, x, y));
      }
      for (let x = x0; x <= x1; x++) { g.put(x, y0, C.wood[2]); g.put(x, y1, C.wood[1]); g.put(x, y0 - 1, INK); g.put(x, y1 + 1, INK); }
      for (let y = y0; y <= y1; y++) { g.put(x0, y, C.wood[2]); g.put(x1, y, C.wood[1]); g.put(x0 - 1, y, INK); g.put(x1 + 1, y, INK); }
    }
  }
}

// ── Pasture: lush grass, clover, a trough and straw by it ──────────────
function pasture(g) {
  // short grass tufts: a few blades each, darker at the root
  for (let k = 0; k < 120; k++) {
    const x = 4 + Math.floor(rand(11, k * 7919) * (P - 8)), y = 6 + Math.floor(rand(k * 104729, 12) * (P - 8));
    for (const [dx, h] of [[-1, 2], [0, 4], [1, 3]]) for (let s = 0; s < h; s++) g.put(x + dx + (s > 2 ? dx : 0), y - s, ramp(C.grass, 0.35 + (s / h) * 0.6, x, y - s));
  }
  for (let k = 0; k < 18; k++) {
    const x = 10 + Math.floor(rand(14, k * 6007) * (P - 20)), y = 10 + Math.floor(rand(k * 3571, 15) * (P - 20));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) g.put(x + dx, y + dy, C.clover[dx === 0 && dy === 0 ? 2 : 1]);
  }
  // water trough near the top-left corner
  const tx = 18, ty = 22;
  g.rect(tx - 1, ty - 1, 30, 12, INK);
  g.rect(tx, ty, 28, 10, C.wood[2]);
  g.rect(tx + 2, ty + 2, 24, 5, hex(0x3e80bc));
  for (let x = tx + 3; x < tx + 25; x += 5) g.put(x, ty + 3, hex(0xa8d4f0));
  g.rect(tx, ty + 8, 28, 2, C.wood[1]);
  for (let k = 0; k < 40; k++) { const x = tx - 4 + Math.floor(rand(k, 16) * 38), y = ty + 11 + Math.floor(rand(k, 17) * 8); g.put(x, y, C.straw[1 + (k % 3)]); g.put(x + 1, y, C.straw[1]); }
}

// ── Vineyard: two trellis rows (posts and wires) over soil strips ──────
function vineyard(g) {
  for (const row of [64, 128]) {
    for (let y = row - 6; y <= row + 3; y++) for (let x = 14; x < P - 14; x++) g.put(x, y, ramp(C.soil, 0.5 + (rand(x, y, 21) - 0.5) * 0.3, x, y), 230);
    for (const px of [14, 80, P - 16]) {
      g.rect(px - 1, row - 30, 4, 31, INK);
      g.rect(px, row - 29, 2, 29, C.wood[2]);
      g.put(px, row - 29, C.wood[4]);
    }
    for (const wy of [row - 26, row - 16]) for (let x = 16; x < P - 16; x++) g.put(x, wy + Math.round(Math.sin((x - 16) / 64 * Math.PI) * 1), PAL.stone[2]);
  }
}

// ── Orchard: a ring of mulch where each tree stands ────────────────────
function orchard(g) {
  for (const [cx, cy] of [[40, 64], [120, 64], [40, 144], [120, 144]]) {
    for (let y = cy - 10; y <= cy + 6; y++) for (let x = cx - 18; x <= cx + 18; x++) {
      const d = ((x - cx) / 18) ** 2 + ((y - cy + 2) / 8) ** 2 + (rand(x >> 1, y >> 1, 22) - 0.5) * 0.2;
      if (d > 1) continue;
      g.put(x, y, ramp(C.mulch, 0.62 - d * 0.35 + (rand(x, y, 23) - 0.5) * 0.3, x, y));
    }
  }
  for (let k = 0; k < 10; k++) { const x = 8 + Math.floor(rand(k, 24) * (P - 16)), y = 8 + Math.floor(rand(k, 25) * (P - 16)); g.put(x, y, PAL.white); g.put(x + 1, y + 1, PAL.white); }
}

[wild, field, pasture, vineyard, orchard].forEach((f, i) => f(at(i * P, 0)));

// ── Fences: post and rail, with a gate variant ──────────────────────────
function fenceH(g, gate) {
  const rail = (y) => { for (let x = 0; x < P; x++) { if (gate && x >= 64 && x < 96) continue; g.put(x, y, C.wood[3]); g.put(x, y + 1, C.wood[1]); } };
  rail(5); rail(10);
  for (let x = 0; x < P; x += 16) {
    if (gate && x > 64 && x < 96) continue;
    g.rect(x + 6, 1, 4, 14, C.wood[2]); g.put(x + 6, 1, C.wood[4]); g.put(x + 7, 1, C.wood[4]);
    for (let y = 1; y < 15; y++) g.put(x + 9, y, C.wood[1]);
  }
  if (gate) for (const x of [58, 96]) { g.rect(x, 0, 6, 15, C.wood[2]); g.rect(x + 1, 0, 4, 2, C.wood[4]); for (let y = 0; y < 15; y++) g.put(x + 5, y, C.wood[1]); }
}
function fenceV(g, gate) {
  for (let y = 0; y < P; y++) {
    if (gate && y >= 64 && y < 96) continue;
    g.put(6, y, C.wood[3]); g.put(7, y, C.wood[2]); g.put(8, y, C.wood[1]);
  }
  for (let y = 0; y < P; y += 16) {
    if (gate && y > 56 && y < 96) continue;
    g.rect(5, y + 2, 6, 12, C.wood[2]); g.rect(5, y + 2, 6, 2, C.wood[4]); g.rect(10, y + 4, 1, 10, C.wood[1]);
  }
  if (gate) for (const y of [54, 96]) { g.rect(4, y, 8, 10, C.wood[2]); g.rect(4, y, 8, 2, C.wood[4]); }
}
const fh = new Canvas(P, T), fhg = new Canvas(P, T), fv = new Canvas(T, P), fvg = new Canvas(T, P);
fenceH(fh, false); fenceH(fhg, true); fenceV(fv, false); fenceV(fvg, true);
for (const c of [fh, fhg, fv, fvg]) c.outline(INK);
const blit = (c, ox, oy) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const i = (y * c.w + x) * 4; if (c.px[i + 3]) sheet.put(ox + x, oy + y, [c.px[i], c.px[i + 1], c.px[i + 2]], c.px[i + 3]); } };
blit(fh, 0, 160); blit(fhg, 160, 160); blit(fv, 352, 160); blit(fvg, 368, 160);

// ── The signpost: a board on a post, a little house painted on it ──────
{
  const s = new Canvas(32, 48);
  s.rect(14, 22, 4, 26, C.wood[2]); s.rect(17, 22, 1, 26, C.wood[1]);
  s.rect(2, 4, 28, 20, C.wood[3]); s.rect(2, 4, 28, 2, C.wood[4]); s.rect(2, 22, 28, 2, C.wood[1]);
  for (let x = 4; x < 28; x += 6) for (let y = 7; y < 22; y++) if (rand(x, y, 31) < 0.3) s.put(x, y, C.wood[2]);
  // the house
  s.poly([[9, 14], [16, 8], [23, 14]], hex(0xc4553e));
  s.rect(11, 14, 10, 6, PAL.plaster[3]); s.rect(15, 16, 3, 4, C.wood[1]);
  s.outline(INK);
  blit(s, 320, 160);
}

// ── A building plot: a levelled dirt pad, stakes and string ────────────
{
  const g = at(0, 320);
  for (let y = 12; y < 100; y++) for (let x = 24; x < 136; x++) {
    const edge = Math.min(x - 24, 135 - x, y - 12, 99 - y);
    if (edge < 2 && rand(x, y, 41) < 0.5) continue;
    g.put(x, y, ramp(C.path, 0.5 + (rand(x, y, 42) - 0.5) * 0.35 - (edge < 3 ? 0.15 : 0), x, y));
  }
  for (const [x, y] of [[28, 16], [131, 16], [28, 95], [131, 95]]) { g.rect(x - 1, y - 8, 3, 9, C.wood[2]); g.put(x - 1, y - 8, C.wood[4]); g.put(x + 1, y, C.wood[1]); }
  for (let x = 29; x < 131; x++) { if (x % 3) { g.put(x, 11, PAL.white); g.put(x, 90, PAL.white); } }
  for (let y = 11; y < 91; y++) { if (y % 3) { g.put(28, y, PAL.white); g.put(131, y, PAL.white); } }
  // a few planks and a stone waiting
  g.rect(44, 70, 22, 3, C.wood[3]); g.rect(46, 74, 22, 3, C.wood[2]);
  g.rect(100, 66, 10, 7, PAL.stone[3]); g.rect(100, 66, 10, 2, PAL.stone[4]);
}

// ── The barn (96×80): red boards, a shingle roof, white-trimmed doors ──
const BARN = [hex(0x4a1412), hex(0x6a1e1a), hex(0x8c2a22), hex(0xa83a2c), hex(0xc4553e), hex(0xdc7a5c)];
{
  const c = new Canvas(96, 80);
  const bx0 = 4, bx1 = 91, bTop = 34, bBottom = 78, mid = 48;
  for (let y = bTop; y <= bBottom; y++) for (let x = bx0; x <= bx1; x++) {
    const k = (x - bx0) % 6;
    c.put(x, y, ramp(BARN, 0.6 + (k === 0 ? -0.35 : k === 1 ? 0.15 : 0) + (rand(x, y >> 2, 6) - 0.5) * 0.08, x, y));
  }
  for (let y = 2; y <= bTop + 2; y++) {
    const t = (y - 2) / bTop, half = t < 0.4 ? 16 + (t / 0.4) * 16 : 32 + ((t - 0.4) / 0.6) * 16;
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) {
      const row = (y - 2) % 5, off = (Math.floor((y - 2) / 5) % 2) * 3;
      c.put(x, y, ramp(PAL.roofBrown, 0.66 - (row === 4 ? 0.42 : (x + off) % 7 === 0 ? 0.2 : 0) + (t < 0.4 ? 0.08 : 0) + (x < mid ? 0.04 : -0.03), x, y));
    }
  }
  // hay loft
  c.rect(mid - 8, 18, 16, 13, PAL.wood[1]);
  for (let x = mid - 7; x < mid + 8; x++) for (let y = 25; y < 31; y++) c.put(x, y, ramp(C.straw, 0.6 + (rand(x, y, 2) - 0.5) * 0.4, x, y));
  for (let x = mid - 10; x <= mid + 10; x++) c.put(x, 16, PAL.white);
  // doors with white X bracing
  const dx0 = mid - 18, dx1 = mid + 18, dTop = 50;
  for (let y = dTop; y <= bBottom; y++) for (let x = dx0; x <= dx1; x++) c.put(x, y, ramp(BARN, 0.42 + ((x - dx0) % 4 === 0 ? -0.2 : 0), x, y));
  for (const [x0, x1] of [[dx0, mid], [mid, dx1]]) {
    for (let x = x0; x <= x1; x++) { c.put(x, dTop, PAL.white); c.put(x, bBottom, PAL.white); }
    for (let y = dTop; y <= bBottom; y++) { c.put(x0, y, PAL.white); c.put(x1, y, PAL.white); }
    const n = bBottom - dTop;
    for (let i = 0; i <= n; i++) { c.put(Math.round(x0 + ((x1 - x0) * i) / n), dTop + i, PAL.white); c.put(Math.round(x1 - ((x1 - x0) * i) / n), dTop + i, PAL.white); }
  }
  for (const wx of [bx0 + 6, bx1 - 17]) { c.rect(wx, 46, 12, 10, PAL.white); c.rect(wx + 1, 47, 10, 8, PAL.glass[2]); c.rect(wx + 5, 47, 1, 8, PAL.white); c.rect(wx + 1, 50, 10, 1, PAL.white); }
  for (const x of [bx0 + 1, bx1 - 1]) for (let y = bTop; y <= bBottom; y++) c.put(x, y, PAL.white);
  c.outline(INK);
  blit(c, 160, 320);
}

// ── The workshop (80×64): timber walls, a slate roof, a sawhorse out front ──
{
  const c = new Canvas(80, 64);
  const x0 = 4, x1 = 75, wallTop = 24, bottom = 62, mid = 40;
  for (let y = wallTop; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
    const k = (y - wallTop) % 5;
    c.put(x, y, ramp(PAL.log, 0.55 + (k === 0 ? -0.3 : k === 1 ? 0.15 : 0) + (rand(x >> 3, y, 7) - 0.5) * 0.1, x, y));
  }
  for (let y = 2; y <= wallTop + 3; y++) {
    const t = (y - 2) / (wallTop + 1), half = 20 + t * 22;
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) c.put(x, y, ramp(PAL.roofSlate, 0.6 - ((y - 2) % 4 === 3 ? 0.35 : 0) + (x < mid ? 0.05 : -0.04), x, y));
  }
  // a wide door, open, with planks leaning inside; a window; the sign with a saw
  c.rect(mid - 12, 38, 24, 25, PAL.wood[0]);
  for (let k = 0; k < 4; k++) c.rect(mid - 9 + k * 5, 42 + (k % 2) * 2, 3, 20 - (k % 2) * 2, PAL.wood[3 - (k % 2)]);
  for (let y = 38; y <= 62; y++) { c.put(mid - 13, y, PAL.wood[2]); c.put(mid + 12, y, PAL.wood[2]); }
  c.rect(x0 + 5, 34, 12, 10, PAL.wood[1]); c.rect(x0 + 6, 35, 10, 8, PAL.glassLit[2]); c.rect(x0 + 10, 35, 1, 8, PAL.wood[1]);
  c.rect(x1 - 20, 30, 16, 9, PAL.wood[3]); c.rect(x1 - 18, 34, 12, 1, PAL.stone[3]); for (let x = x1 - 18; x < x1 - 6; x += 2) c.put(x, 35, PAL.stone[2]);
  // the workbench against the wall
  c.rect(x1 - 22, 52, 18, 3, PAL.wood[3]); c.rect(x1 - 21, 55, 2, 7, PAL.wood[1]); c.rect(x1 - 7, 55, 2, 7, PAL.wood[1]); c.rect(x1 - 18, 50, 6, 2, PAL.stone[3]);
  c.outline(INK);
  blit(c, 256, 320);
}

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(sheet.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/parcels.png");
console.log("wrote public/assets/parcels.png");
