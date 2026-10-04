#!/usr/bin/env node
// "Wilds": original 16 px terrain tiles for the generated regions west of
// the village (src/lib/regions.ts), drawn in a detailed handheld-RPG style:
// soft bright palette, many-tone shading with ordered dithering, layered
// tree foliage, earth cliffs with grass overhangs and stone stairs,
// animated water, drop shadows, and multi-tile props (lamps, statues,
// benches, signboards).
//
//   node scripts/draw-wilds.mjs
//
// Writes public/assets/Wilds.png and src/lib/terrain/wildsTiles.json
// (tile names in sheet order + animation frame lists).
//
// Autotiles use a corner ("dual-grid") scheme: terrain lives on tile
// corners and each tile is drawn from its 4-corner mask (bit 1 = NW,
// 2 = NE, 4 = SW, 8 = SE); tiles only ever disagree at corners they share,
// so every combination joins seamlessly. Families: path_*, water_*
// (4 animation frames), gravel_*, tall_*, blend_* (village grass → Wilds
// grass). Trees stand on a 2-tile lattice, one tree per corner, so a tree
// tile holds a single quarter: tree_<kind>_<corner bit>.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas, rand } from "./canvas-art.mjs";

const T = 16, COLS = 16;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// ── Palette (soft, bright, DS-era) ──────────────────────────────────────
const P = {
  // grass ramp, dark → light
  g: [hex(0x3e7a3c), hex(0x4f9444), hex(0x62ac50), hex(0x74c05c), hex(0x8ad06c), hex(0xa8e084)],
  village: [51, 121, 3], villageDk: [42, 104, 8], villageLt: [72, 146, 18],
  // path / sand ramp
  s: [hex(0x9c7a4a), hex(0xbc9a60), hex(0xd4b67a), hex(0xe4ca92), hex(0xf0dcac), hex(0xf8ecc8)],
  // water ramp
  w: [hex(0x2a5ca8), hex(0x3470c0), hex(0x4486d4), hex(0x5c9ee4), hex(0x84bcf0), hex(0xc4e2fc), hex(0xf4fcff)],
  // earth (cliff faces) ramp
  e: [hex(0x5a3a22), hex(0x7a5030), hex(0x9a6a40), hex(0xb88454), hex(0xd4a06c), hex(0xe8bc88)],
  // stone ramp (stairs, statues, rocks)
  r: [hex(0x4a4a54), hex(0x6a6a74), hex(0x8a8a92), hex(0xa8a8ae), hex(0xc6c6ca), hex(0xe2e2e4)],
  // broadleaf foliage ramp
  l: [hex(0x1c4a30), hex(0x2a6a3c), hex(0x3c8a46), hex(0x56a850), hex(0x7cc460), hex(0xb0e080)],
  // pine foliage ramp
  pn: [hex(0x123a34), hex(0x1e5444), hex(0x2c7050), hex(0x40905c), hex(0x64b070), hex(0x98d088)],
  // bark ramp
  b: [hex(0x3a2414), hex(0x5a3820), hex(0x7a5030), hex(0x9a6a40), hex(0xb88a58)],
  // wood ramp (props)
  wd: [hex(0x4a2c18), hex(0x6e4426), hex(0x946036), hex(0xb8804a), hex(0xd8a468), hex(0xf0c890)],
  // tall grass ramp
  t: [hex(0x1e5a2c), hex(0x2c7838), hex(0x3e9844), hex(0x58b450), hex(0x84d068)],
  // cave
  cf: [hex(0x3a2c24), hex(0x54402e), hex(0x6e5438), hex(0x8a6c48), hex(0xa8885c)],
  ceil: [hex(0x140e10), hex(0x221a1a)],
  ink: hex(0x1e2a1e), inkWood: hex(0x2e1c10), inkStone: hex(0x262630),
  shadow: [0, 0, 0],
  red: hex(0xe84858), redLt: hex(0xff98a0), pink: hex(0xf8a8c8), white: hex(0xfcfcf4), yellow: hex(0xf8d850), orange: hex(0xf89838), blue: hex(0x78a8f8), violet: hex(0xb890f0),
  iron: hex(0x3c3c48), ironLt: hex(0x6a6a78), glass: hex(0xffe48c), glassLt: hex(0xfff8d8),
  crysA: [hex(0x2a6ab0), hex(0x48a0e0), hex(0x88d4f8), hex(0xe0f8ff)],
  crysB: [hex(0x6a3aa8), hex(0x9a64d8), hex(0xc8a0f4), hex(0xf4e4ff)],
  flame: hex(0xffb040), flameLt: hex(0xfff0a0),
};

// 4×4 Bayer matrix for ordered dithering between ramp tones.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** Pick a ramp colour for a continuous tone t (0..1), dithered at (x, y). */
function ramp(colors, t, x, y) {
  const f = Math.max(0, Math.min(0.9999, t)) * (colors.length - 1);
  const i = Math.floor(f);
  return colors[Math.min(colors.length - 1, i + (f - i > BAYER[((y & 3) << 2) | (x & 3)] ? 1 : 0))];
}

const names = [];
const tiles = [];
const anims = {};
function tile(name, draw) {
  const c = new Canvas(T, T);
  draw(c);
  names.push(name);
  tiles.push(c);
}
/** 1 px outline (`col`) on transparent pixels next to `test` pixels. */
function outlineIn(c, col, test) {
  const edge = [];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (test(x, y)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => test(x + dx, y + dy))) edge.push([x, y]);
  }
  for (const [x, y] of edge) c.put(x, y, col);
}
const opaque = (c) => (x, y) => x >= 0 && y >= 0 && x < T && y < T && c.alpha(x, y) > 200;
/** Soft elliptical drop shadow. */
function shadowEllipse(c, cx, cy, rx, ry, a = 90) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1) c.put(x, y, P.shadow, Math.round(a * (1 - d * 0.55)));
  }
}

// ── Corner-mask field ───────────────────────────────────────────────────
const bit = (m, b) => ((m & b) ? 1 : 0);
function field(m, x, y) {
  const s = (t) => t * t * (3 - 2 * t);
  const u = s((x + 0.5) / T), v = s((y + 0.5) / T);
  return bit(m, 1) * (1 - u) * (1 - v) + bit(m, 2) * u * (1 - v) + bit(m, 4) * (1 - u) * v + bit(m, 8) * u * v;
}
const MASKS = Array.from({ length: 15 }, (_, i) => i + 1);

// ── Grass ───────────────────────────────────────────────────────────────
/** Bright grass: soft dithered mottling plus blade clusters. */
function grassPx(x, y, seed) {
  // calm base with soft, large patches of a lighter tone
  // (one soft light patch per variant, off-centre, so tiles don't form a grid)
  const px = [4, 11, 7, 13][seed % 4], py = [10, 5, 3, 12][seed % 4];
  const patch = ((x - px) / 5) ** 2 + ((y - py) / 3.5) ** 2;
  let col = patch < 1 && BAYER[((y & 3) << 2) | (x & 3)] < 0.75 ? P.g[4] : P.g[3];
  // sparse grass tufts: a small dark "w" with lit tips
  const cell = (Math.floor(x / 8) + Math.floor(y / 8) * 3 + seed) % 4;
  const lx = x % 8, ly = y % 8;
  const ox = 2 + ((cell * 3) % 4), oy = 2 + ((cell * 5) % 4);
  if (cell !== 3) {
    if (ly === oy + 1 && (lx === ox || lx === ox + 2 || lx === ox + 4)) col = P.g[1];
    if (ly === oy && (lx === ox + 1 || lx === ox + 3)) col = P.g[2];
    if (ly === oy - 1 && (lx === ox + 1 || lx === ox + 3)) col = P.g[5];
  }
  if (rand(x, y, seed + 40) < 0.012) col = P.g[5];
  return col;
}
const villagePx = (x, y) => { const r = rand(x, y, 7); return r < 0.08 ? P.villageDk : r > 0.96 ? P.villageLt : P.village; };
for (let i = 0; i < 4; i++) tile(`grass_${i}`, (c) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, grassPx(x, y, i)); });
// Village grass → Wilds grass, dithered across the boundary (mask = Wilds).
for (const m of MASKS) tile(`blend_${m}`, (c) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const f = field(m, x, y);
    c.put(x, y, f > BAYER[((y & 3) << 2) | (x & 3)] * 0.6 + 0.2 ? grassPx(x, y, 0) : villagePx(x, y));
  }
});

// ── Ground decor (transparent) ──────────────────────────────────────────
/** A clump of two round flowers on leaves, drawn from a pixel pattern:
 *  L = lit petal, P = petal, C = centre, G = leaf, D = dark leaf/outline. */
const FLOWER = [
  "..LL..",
  ".LLPP.",
  "LLCCPP",
  "LPCCPP",
  ".PPPP.",
  "..GG..",
  ".GDDG.",
];
function flowerClump(c, cx, cy, petal, petalLt) {
  const centre = P.yellow === petal ? P.orange : P.yellow;
  const draw = (ox, oy) => FLOWER.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = { L: petalLt, P: petal, C: centre, G: P.g[1], D: P.g[0] }[ch];
    if (col) c.put(ox + x, oy + y, col);
  }));
  for (let x = -3; x <= 3; x++) c.put(cx + x, cy + 6, P.shadow, 50); // soft shadow under the clump
  draw(cx - 6, cy - 2);
  draw(cx, cy - 1);
}
for (const [name, a, b] of [["red", P.red, P.redLt], ["pink", P.pink, P.white], ["white", P.white, P.white], ["yellow", P.yellow, P.white], ["blue", P.blue, P.white]]) {
  tile(`flowers_${name}`, (c) => flowerClump(c, 8, 5, a, b));
}
tile("tuft_0", (c) => { for (const [x, y] of [[4, 9], [11, 4]]) { c.put(x, y, P.g[5]); c.put(x - 1, y + 1, P.g[4]); c.put(x + 1, y + 1, P.g[4]); c.put(x - 2, y + 2, P.g[1]); c.put(x + 2, y + 2, P.g[1]); c.put(x, y + 1, P.g[1]); } });
tile("tuft_1", (c) => { for (const [x, y] of [[7, 6], [3, 12], [12, 12]]) { c.put(x, y, P.g[5]); c.put(x - 1, y + 1, P.g[1]); c.put(x + 1, y + 1, P.g[1]); } });
tile("pebbles", (c) => { for (const [x, y] of [[4, 5], [10, 9], [6, 12]]) { c.put(x, y + 2, P.g[1]); c.put(x + 1, y + 2, P.g[1]); c.rect(x, y, 2, 2, P.r[3]); c.put(x, y, P.r[5]); c.put(x + 1, y + 1, P.r[2]); } });
tile("mushrooms", (c) => { for (const [x, y] of [[5, 8], [10, 11]]) { c.rect(x, y + 1, 2, 2, P.white); c.rect(x - 1, y - 1, 4, 2, P.red); c.put(x, y - 1, P.white); c.put(x + 2, y, P.inkWood); } });
tile("clover", (c) => { for (const [x, y] of [[4, 4], [9, 7], [5, 11], [12, 12]]) { c.put(x, y, P.g[5]); c.put(x + 1, y, P.g[4]); c.put(x, y + 1, P.g[4]); c.put(x + 1, y + 1, P.g[1]); } });
tile("cliff_shadow", (c) => { for (let y = 0; y < 7; y++) for (let x = 0; x < T; x++) c.put(x, y, P.shadow, Math.round(110 * (1 - y / 7))); });
tile("reeds", (c) => {
  for (const x of [2, 5, 8, 11, 14]) {
    const h = 6 + ((x * 7) % 4);
    for (let y = T - 1 - h; y < T - 1; y++) c.put(x, y, ramp(P.t, 0.4 + (y - (T - 1 - h)) / (h * 3), x, y));
    c.put(x, T - 2 - h, hex(0x8a5a30)); c.put(x, T - 1 - h, hex(0x6a4020)); c.put(x, T - h, hex(0x6a4020));
  }
});
tile("lilypad", (c) => {
  for (const [x, y] of [[5, 6], [11, 11]]) { c.ellipse(x, y, 3.2, 2.2, P.l[2]); c.ellipse(x - 0.5, y - 0.5, 2.2, 1.4, P.l[3]); c.put(x + 1, y - 1, P.w[3]); c.put(x + 2, y - 1, P.w[3]); }
  c.put(5, 4, P.pink); c.put(4, 5, P.pink); c.put(6, 5, P.pink); c.put(5, 5, P.yellow);
});
tile("flowerbed", (c) => {
  c.rect(1, 3, 14, 12, P.e[1]); c.rect(2, 4, 12, 10, P.e[0]);
  for (let y = 5; y < 13; y += 3) for (let x = 3; x < 13; x += 3) {
    const col = [P.red, P.yellow, P.pink, P.white, P.violet][(x + y) % 5];
    c.put(x, y + 1, P.l[2]); c.put(x + 1, y + 1, P.l[3]); c.put(x, y, col); c.put(x + 1, y, col); c.put(x, y - 1, P.white);
  }
  c.hline(1, 14, 3, P.e[3]);
});

// ── Path / sand (overlay) ───────────────────────────────────────────────
function pathTile(m, v) {
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y);
      if (f < 0.44) continue;
      const tone = 0.64 + 0.08 * Math.sin(x * 0.5 + v) * Math.cos(y * 0.45 + v) + (rand(x, y, 300 + v) - 0.5) * 0.06;
      let col = ramp(P.s, f < 0.52 ? 0.25 : tone, x, y);
      if (f < 0.48) col = P.s[0];
      c.put(x, y, col);
    }
    if (m === 15) for (let k = 0; k < 4; k++) {
      const x = Math.floor(rand(k, v, 31) * 13) + 1, y = Math.floor(rand(v, k, 32) * 13) + 1;
      c.put(x, y, P.s[1]); c.put(x + 1, y, P.r[3]); c.put(x, y - 1, P.s[5]);
    }
    for (let x = 0; x < T; x++) for (let y = 0; y < T; y++) { // grass blades over the rim
      const f = field(m, x, y);
      if (f >= 0.44 && f < 0.5 && rand(x, y, 33) < 0.4) c.put(x, y, rand(x, y, 34) < 0.5 ? P.g[2] : P.g[4]);
    }
  };
}
for (const m of MASKS) for (const v of m === 15 ? [0, 1, 2] : [0]) tile(m === 15 ? `path_15_${v}` : `path_${m}`, pathTile(m, v));

// ── Water (opaque, 4 animation frames) ──────────────────────────────────
function waterTile(m, v, frame) {
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y);
      let col;
      if (f < 0.34) col = grassPx(x, y, 1);
      else if (f < 0.42) col = ramp(P.s, 0.55, x, y);
      else if (f < 0.5) col = ramp(P.s, 0.35, x, y);
      else if (f < 0.56) col = P.s[1];
      else {
        // depth gradient from the shore, plus moving crests
        const depth = Math.min(1, (f - 0.56) / 0.4);
        col = ramp(P.w, 0.62 - depth * 0.45, x, y);
        const fx = (x + frame * 4 + v * 5) % 16, fy = (y + v * 3) % 8;
        if (fy === 2 && fx >= 3 && fx <= 7) col = P.w[5];
        if (fy === 3 && (fx === 2 || fx === 8)) col = P.w[4];
        const gx = (x + 16 - frame * 2 + 9 + v * 7) % 16, gy = (y + 5) % 8;
        if (gy === 6 && gx >= 1 && gx <= 3) col = P.w[4];
        // foam pulsing along the shore
        if (f < 0.62 + (frame % 2) * 0.03) col = (x + y + frame) % 3 === 0 ? P.w[5] : P.w[6];
      }
      c.put(x, y, col);
    }
  };
}
for (const m of MASKS) {
  for (const v of m === 15 ? [0, 1, 2] : [0]) {
    const base = m === 15 ? `water_15_${v}` : `water_${m}`;
    const frames = [base, `${base}_f1`, `${base}_f2`, `${base}_f3`];
    frames.forEach((name, k) => tile(name, waterTile(m, v, k)));
    anims[base] = frames;
  }
}

// ── Gravel (mountain pass floor, opaque) ────────────────────────────────
function gravelTile(m, v) {
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y);
      const r = rand(x, y, 50 + v);
      let col;
      if (f < 0.42) col = grassPx(x, y, 2);
      else if (f < 0.52) col = r < 0.5 ? ramp(P.s, 0.3, x, y) : grassPx(x, y, 2);
      else col = ramp(P.s, 0.42 + (r - 0.5) * 0.3, x, y);
      c.put(x, y, col);
    }
    if (m === 15) for (let k = 0; k < 4; k++) {
      const x = Math.floor(rand(k, v, 51) * 13) + 1, y = Math.floor(rand(v, k, 52) * 13) + 1;
      c.put(x, y + 2, P.s[0]); c.put(x + 1, y + 2, P.s[0]);
      c.rect(x, y, 2, 2, P.r[3]); c.put(x, y, P.r[5]); c.put(x + 1, y + 1, P.r[2]);
    }
  };
}
for (const m of MASKS) for (const v of m === 15 ? [0, 1, 2] : [0]) tile(m === 15 ? `gravel_15_${v}` : `gravel_${m}`, gravelTile(m, v));

// ── Tall grass (overlay): separate tufts of slender blades ──────────────
// One tuft per 8×8 cell (the lattice divides the tile, so patches tile
// seamlessly); a tuft appears where its cell is inside the patch.
function blade(c, x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
    c.put(x, y, t < 0.25 ? P.t[4] : t < 0.6 ? P.t[3] : P.t[2]);
    if (t > 0.45) c.put(x + 1, y, P.t[1]); // thicker, shaded base
  }
}
function tallTile(m) {
  return (c) => {
    for (let cy = 0; cy < T; cy += 8) for (let cx = 0; cx < T; cx += 8) {
      if (field(m, cx + 3.5, cy + 3.5) < 0.5) continue;
      const bx = cx + 3, by = cy + 7;
      for (let x = bx - 3; x <= bx + 4; x++) c.put(x, by, P.shadow, 60); // shadow at the root
      blade(c, bx - 2, cy + 1, bx, by);
      blade(c, bx + 4, cy + 2, bx + 2, by);
      blade(c, bx + 1, cy, bx + 1, by);
      blade(c, bx - 3, cy + 4, bx - 1, by);
      blade(c, bx + 5, cy + 5, bx + 3, by);
    }
    outlineIn(c, P.t[0], opaque(c));
  };
}
for (const m of MASKS) tile(`tall_${m}`, tallTile(m));

// ── Trees (2×2 per lattice corner) ──────────────────────────────────────
// A tree is drawn around its corner at (cx, cy) in tile pixels: crown,
// trunk and shadow, clipped to the tile.
const CORNER_POS = { 1: [0, 0], 2: [16, 0], 4: [0, 16], 8: [16, 16] };
/** Broadleaf: overlapping leaf clusters, each shaded from the top-left. */
const CLUSTERS = [
  [-8, -5, 7], [0, -9, 7.5], [8, -5, 7], [-10, 2, 6], [10, 2, 6], [-4, 2, 7], [4, 1, 7], [0, -2, 6.5], [-6, 7, 5.5], [6, 7, 5.5], [0, 6, 6],
];
function broadleaf(c, cx, cy) {
  const ty = cy - 2; // crown centre sits a little above the corner
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = ((x + 0.5 - cx) / 10) ** 2 + ((y + 0.5 - (cy + 13.5)) / 2.6) ** 2;
    if (d <= 1) c.put(x, y, P.shadow, Math.round(95 * (1 - d * 0.5)));
  }
  for (let y = cy + 7; y <= cy + 14; y++) for (let x = cx - 3; x <= cx + 2; x++) {
    if (x < 0 || x >= T || y < 0 || y >= T) continue;
    const t = (x - (cx - 3)) / 5;
    let col = ramp(P.b, 0.85 - t * 0.7, x, y);
    if ((y + x) % 4 === 0 && t > 0.2 && t < 0.8) col = P.b[1]; // bark grooves
    c.put(x, y, col);
  }
  for (const [x, y] of [[cx - 4, cy + 13], [cx - 5, cy + 14], [cx + 3, cy + 13], [cx + 4, cy + 14]]) if (x >= 0 && x < T && y >= 0 && y < T) c.put(x, y, P.b[1]); // roots
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - ty;
    let best = null;
    for (const [ox, oy, r] of CLUSTERS) { // the front-most cluster shades the pixel
      const dx = px - ox, dy = py - oy;
      if (dx * dx + dy * dy <= r * r) best = [dx / r, dy / r];
    }
    if (!best) continue;
    const [nx, ny] = best;
    const light = -(nx * 0.6 + ny * 0.8); // lit from the top-left
    const rim = Math.hypot(nx, ny);
    let t = 0.5 + light * 0.4 - Math.max(0, rim - 0.75) * 0.9;
    t -= Math.max(0, py - 4) * 0.025; // darker toward the crown's base
    c.put(x, y, ramp(P.l, t, x, y));
    if (rim < 0.45 && light > 0.35 && ((x + y) & 3) === 0) c.put(x, y, P.l[5]); // glints
  }
}
/** Pine: three stacked tiers of drooping boughs. */
function pine(c, cx, cy) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = ((x + 0.5 - cx) / 8) ** 2 + ((y + 0.5 - (cy + 13.5)) / 2.4) ** 2;
    if (d <= 1) c.put(x, y, P.shadow, Math.round(95 * (1 - d * 0.5)));
  }
  for (let y = cy + 8; y <= cy + 14; y++) for (let x = cx - 2; x <= cx + 1; x++) {
    if (x < 0 || x >= T || y < 0 || y >= T) continue;
    c.put(x, y, ramp(P.b, 0.8 - (x - cx + 2) * 0.22, x, y));
  }
  const tiers = [[-15, -5, 5], [-8, 2, 9], [-2, 9, 13]]; // [top, bottom, half width] relative to the corner
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy;
    let hit = null;
    for (const [top, bot, hw] of tiers) {
      if (py < top || py > bot) continue;
      const t = (py - top) / (bot - top);
      const w = hw * (0.25 + 0.75 * t) + Math.sin(px * 1.3) * 0.6;
      if (Math.abs(px) <= w) hit = [px / w, t];
    }
    if (!hit) continue;
    const [sx, tv] = hit;
    let tone = 0.62 - sx * 0.3 - tv * 0.28;
    if (tv > 0.82) tone -= 0.25; // underside of each tier
    c.put(x, y, ramp(P.pn, tone, x, y));
    if (sx < -0.2 && tv < 0.5 && ((x + 2 * y) % 5 === 0)) c.put(x, y, P.pn[5]);
  }
}
for (const [kind, draw] of [["oak", broadleaf], ["pine", pine]]) {
  for (const b of [1, 2, 4, 8]) {
    tile(`tree_${kind}_${b}`, (c) => {
      const [cx, cy] = CORNER_POS[b];
      draw(c, cx, cy);
      outlineIn(c, P.ink, opaque(c)); // foliage + trunk (not the soft shadow)
    });
  }
}

// ── Earth cliffs with grass overhangs, and stone stairs ─────────────────
// Faces are 2 rows (route plateaus) or 3 rows (mountain terraces): top
// (grass overhang draping over the edge), mid (earth), base (earth
// darkening to its foot). _l / _r end caps round off a face's ends.
function cliff(c, row, end) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const gy = row === "top" ? y : row === "mid" ? y + 16 : y + 32;
    const crack = (x * 5 + Math.floor(gy / 7) * 3) % 11 === 0;
    let t = 0.62 - (gy / 48) * 0.35 + (rand(x, gy, 70) - 0.5) * 0.12 + Math.sin(x * 1.7 + gy * 0.4) * 0.06;
    if (crack) t -= 0.25;
    if (gy % 12 === 0 && rand(x, gy, 71) < 0.7) t += 0.18; // lit rock ledges
    if (row === "base" && y >= 12) t -= (y - 11) * 0.09;
    c.put(x, y, ramp(P.e, t, x, y));
  }
  if (row === "top") {
    for (let x = 0; x < T; x++) { // grass overhang with tufts draping down
      const drape = 3 + Math.round(1.2 * Math.sin(x * 1.1) + (rand(x, 72) < 0.2 ? 1 : 0));
      for (let y = 0; y < drape; y++) c.put(x, y, ramp(P.g, 0.75 - y * 0.12, x, y));
      c.put(x, drape, P.g[0]);
      c.put(x, drape + 1, P.e[0]); // shadow under the overhang
    }
  }
  if (row === "base") for (let x = 0; x < T; x++) c.put(x, T - 1, P.e[0]);
  if (end === "l") for (let y = 0; y < T; y++) { c.put(0, y, P.ink); c.put(1, y, ramp(P.e, 0.25, 1, y)); if (row !== "top" || y > 5) c.put(2, y, ramp(P.e, 0.4, 2, y)); }
  if (end === "r") for (let y = 0; y < T; y++) { c.put(T - 1, y, P.ink); c.put(T - 2, y, P.e[0]); c.put(T - 3, y, ramp(P.e, 0.25, T - 3, y)); }
}
for (const row of ["top", "mid", "base"]) for (const end of ["m", "l", "r"]) tile(`cliff_${row}${end === "m" ? "" : "_" + end}`, (c) => cliff(c, row, end));
// Lips: the edge of raised ground seen from above, with an earth rim.
function lip(c, side) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, grassPx(x, y, 3));
  for (let i = 0; i < T; i++) {
    const d = 3 + (rand(i, side.length + 9) < 0.35 ? 1 : 0);
    for (let k = 0; k < d; k++) {
      const col = k === 0 ? P.ink : k === 1 ? P.e[1] : P.g[1];
      if (side === "n") c.put(i, k, col);
      if (side === "w") c.put(k, i, col);
      if (side === "e") c.put(T - 1 - k, i, col);
    }
  }
}
for (const side of ["n", "w", "e"]) tile(`lip_${side}`, (c) => lip(c, side));
// Highland: terrace-top grass, now and then with a rock or a patch of bare
// earth showing through (variant 0 is plain, so terraces don't look tiled).
for (let i = 0; i < 3; i++) tile(`highland_${i}`, (c) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, grassPx(x, y, 4 + i));
  if (i === 1) { // a half-buried rock
    const x = 5, y = 6;
    for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 7; xx++) {
      const d = ((xx - 3) / 3.4) ** 2 + ((yy - 2) / 2.4) ** 2;
      if (d <= 1) c.put(x + xx, y + yy, ramp(P.r, 0.78 - yy * 0.13 - xx * 0.03, x + xx, y + yy));
    }
    c.hline(x + 1, x + 5, y + 5, P.g[0]);
  }
  if (i === 2) { // a patch of bare earth
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = ((x - 9) / 5) ** 2 + ((y - 9) / 3.4) ** 2;
      if (d <= 1) c.put(x, y, ramp(P.e, 0.7 - d * 0.25, x, y));
    }
  }
});
// Stone stairs cut into a face (walkable): 2 tiles wide, one per face row.
function stairs(c, side) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const yy = y % 4;
    let t = yy === 0 ? 0.92 : yy === 3 ? 0.25 : 0.6;
    if (side === "l" && x < 2) t -= 0.35;
    if (side === "r" && x > 13) t -= 0.35;
    c.put(x, y, ramp(P.r, t + (rand(x, y, 76) - 0.5) * 0.08, x, y));
  }
  if (side === "l") c.vline(0, 0, T - 1, P.inkStone);
  if (side === "r") c.vline(T - 1, 0, T - 1, P.inkStone);
}
for (const row of ["top", "mid", "base"]) for (const side of ["l", "r"]) tile(`stairs_${row}_${side}`, (c) => stairs(c, side));

// ── Props (blocking, transparent background) ────────────────────────────
function rockProp(c, big) {
  shadowEllipse(c, 8, 14, big ? 7 : 5.5, 1.8, 95);
  const rx = big ? 7 : 5.5, ry = big ? 5.5 : 4.2, cy = big ? 9 : 10;
  const inR = (x, y) => ((x + 0.5 - 8) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!inR(x, y)) continue;
    const nx = (x + 0.5 - 8) / rx, ny = (y + 0.5 - cy) / ry;
    c.put(x, y, ramp(P.r, 0.55 - nx * 0.25 - ny * 0.35, x, y));
  }
  c.put(6, cy - 2, P.r[5]); c.put(7, cy - 3, P.r[5]); c.hline(9, 11, cy + 1, P.r[1]);
  outlineIn(c, P.inkStone, inR);
}
tile("boulder", (c) => rockProp(c, true));
tile("rock_small", (c) => rockProp(c, false));
tile("bush", (c) => {
  shadowEllipse(c, 8, 14, 7, 1.8, 90);
  const inB = (x, y) => ((x + 0.5 - 8) / 7) ** 2 + ((y + 0.5 - 9) / 5.2) ** 2 <= 1;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!inB(x, y)) continue;
    const nx = (x + 0.5 - 8) / 7, ny = (y + 0.5 - 9) / 5.2;
    const bump = Math.sin(x * 1.4) * Math.cos(y * 1.6) * 0.12;
    c.put(x, y, ramp(P.l, 0.62 - nx * 0.2 - ny * 0.35 + bump, x, y));
  }
  for (const [x, y] of [[5, 8], [9, 7], [11, 10]]) { c.put(x, y, P.red); c.put(x, y - 1, P.redLt); } // berries
  outlineIn(c, P.ink, inB);
});
tile("stump", (c) => {
  shadowEllipse(c, 8, 14, 6, 1.6, 90);
  for (let y = 8; y <= 13; y++) for (let x = 4; x <= 11; x++) c.put(x, y, ramp(P.b, 0.85 - (x - 4) * 0.1, x, y));
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = ((x + 0.5 - 8) / 4) ** 2 + ((y + 0.5 - 8) / 2) ** 2;
    if (d <= 1) c.put(x, y, d < 0.3 ? P.wd[3] : d < 0.65 ? P.wd[4] : P.wd[3]);
  }
  outlineIn(c, P.inkWood, opaque(c));
});
tile("shrub", (c) => {
  shadowEllipse(c, 8, 14, 6, 1.6, 80);
  const dry = [hex(0x5a6a2a), hex(0x7a8a3a), hex(0x9cac4c), hex(0xc4d070)];
  const inS = (x, y) => ((x + 0.5 - 8) / 6) ** 2 + ((y + 0.5 - 10) / 4.2) ** 2 <= 1;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (inS(x, y)) c.put(x, y, ramp(dry, 0.6 - (x - 8) * 0.04 - (y - 10) * 0.08, x, y));
  outlineIn(c, P.ink, inS);
});
function crystal(c, C) {
  shadowEllipse(c, 8, 14, 6, 1.6, 80);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const d = Math.hypot(x - 8, y - 9); if (d < 8) c.put(x, y, C[2], Math.round(40 * (1 - d / 8))); }
  const shards = [[[4, 14], [3, 5], [6.5, 14]], [[6.5, 14], [8, 1], [10, 14]], [[9.5, 14], [12.5, 4], [13, 14]]];
  for (const s of shards) c.poly(s, C[1]);
  c.poly([[7, 14], [8, 1], [8.5, 14]], C[3]); c.poly([[3.6, 13], [3, 5], [4.6, 13]], C[2]);
  c.vline(10, 6, 13, C[0]); c.vline(12, 7, 13, C[0]);
  outlineIn(c, P.inkStone, opaque(c));
}
tile("crystal_blue", (c) => crystal(c, P.crysA));
tile("crystal_purple", (c) => crystal(c, P.crysB));
tile("stalagmite", (c) => {
  shadowEllipse(c, 8, 14, 5.5, 1.5, 100);
  c.poly([[3, 14], [7, 1], [9, 1], [13, 14]], P.cf[2]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (c.alpha(x, y) > 200) c.put(x, y, ramp(P.cf, 0.75 - (x - 4) * 0.07, x, y));
  c.hline(4, 12, 10, P.cf[1]);
  outlineIn(c, P.inkStone, opaque(c));
});
tile("crate", (c) => {
  shadowEllipse(c, 8, 14.5, 6.5, 1.4, 100);
  for (let y = 3; y <= 13; y++) for (let x = 2; x <= 13; x++) c.put(x, y, ramp(P.wd, 0.62 - (y - 3) * 0.025 - (x - 2) * 0.012, x, y));
  c.hline(2, 13, 3, P.wd[5]); c.hline(2, 13, 13, P.wd[1]);
  c.line(3, 4, 12, 12, P.wd[1]); c.line(3, 12, 12, 4, P.wd[1]); c.vline(2, 3, 13, P.wd[4]);
  outlineIn(c, P.inkWood, opaque(c));
});
tile("barrel", (c) => {
  shadowEllipse(c, 8, 14.5, 6, 1.4, 100);
  for (let y = 4; y <= 13; y++) for (let x = 3; x <= 12; x++) {
    if (Math.abs(y - 8.5) > 4 && (x === 3 || x === 12)) continue;
    c.put(x, y, ramp(P.wd, 0.75 - (x - 3) * 0.06, x, y));
  }
  for (const y of [6, 11]) c.hline(3, 12, y, P.iron);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const d = ((x + 0.5 - 8) / 4.6) ** 2 + ((y + 0.5 - 4) / 1.6) ** 2; if (d <= 1) c.put(x, y, d < 0.5 ? P.wd[3] : P.wd[4]); }
  outlineIn(c, P.inkWood, opaque(c));
});
tile("puddle", (c) => { c.ellipse(8, 9, 6, 3, P.w[1]); c.ellipse(8, 8.6, 5, 2.2, P.w[2]); c.hline(6, 8, 8, P.w[5]); });
tile("rubble", (c) => { for (const [x, y] of [[4, 6], [9, 4], [11, 10], [5, 12]]) { c.put(x, y + 2, P.cf[0]); c.put(x + 1, y + 2, P.cf[0]); c.rect(x, y, 2, 2, P.cf[3]); c.put(x, y, P.cf[4]); } });
tile("glowshrooms", (c) => {
  for (const [x, y] of [[5, 9], [10, 11], [8, 6]]) {
    for (let k = -3; k <= 3; k++) c.put(x + k, y + 2, P.crysA[2], 35);
    c.rect(x, y, 1, 3, P.white); c.ellipse(x, y, 2.2, 1.2, P.crysA[1]); c.put(x, y - 1, P.crysA[3]);
  }
});
tile("rail_h", (c) => {
  for (let x = 1; x < T; x += 4) { c.rect(x, 4, 2, 9, P.wd[1]); c.put(x, 4, P.wd[3]); }
  for (const y of [5, 10]) { c.hline(0, T - 1, y, P.r[4]); c.hline(0, T - 1, y + 1, P.r[1]); }
});
tile("rail_v", (c) => {
  for (let y = 1; y < T; y += 4) { c.rect(4, y, 9, 2, P.wd[1]); c.put(4, y, P.wd[3]); }
  for (const x of [5, 10]) { c.vline(x, 0, T - 1, P.r[4]); c.vline(x + 1, 0, T - 1, P.r[1]); }
});

// Two-row props: <name>_base (blocks) and <name>_top (Y-sorted over you).
tile("lamp_top", (c) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d > 5 && d < 8) c.put(x, y, P.glass, Math.round(50 * (1 - (d - 5) / 3))); }
  c.rect(4, 3, 8, 9, P.iron); c.rect(5, 4, 6, 7, P.glass); c.rect(5, 4, 2, 3, P.glassLt);
  c.poly([[3, 4], [8, 0], [13, 4]], P.iron); c.hline(6, 9, 1, P.ironLt);
  c.rect(7, 12, 2, 4, P.iron);
  outlineIn(c, P.inkStone, opaque(c));
});
tile("lamp_base", (c) => {
  shadowEllipse(c, 8, 14.5, 4.5, 1.2, 90);
  c.rect(7, 0, 2, 13, P.iron); c.vline(7, 0, 12, P.ironLt);
  c.rect(5, 12, 6, 3, P.iron); c.hline(5, 10, 12, P.ironLt);
  outlineIn(c, P.inkStone, opaque(c));
});
tile("statue_top", (c) => {
  // a stone traveller with a raised lantern
  const S = P.r;
  c.ellipse(8, 5, 3, 3, S[3]);
  c.poly([[4, 16], [5, 8], [11, 8], [12, 16]], S[2]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (c.alpha(x, y) > 200) c.put(x, y, ramp(S, 0.72 - (x - 4) * 0.05 - (y - 2) * 0.01, x, y));
  c.put(7, 4, S[5]); c.put(6, 5, S[5]);
  c.rect(11, 3, 2, 6, S[2]); c.rect(11, 1, 3, 3, P.glass);
  outlineIn(c, P.inkStone, opaque(c));
});
tile("statue_base", (c) => {
  shadowEllipse(c, 8, 14.5, 7, 1.6, 100);
  for (let y = 0; y <= 6; y++) for (let x = 4; x <= 12; x++) c.put(x, y, ramp(P.r, 0.65 - (x - 4) * 0.06, x, y));
  for (let y = 7; y <= 13; y++) for (let x = 2; x <= 14; x++) c.put(x, y, ramp(P.r, (y === 7 ? 0.95 : 0.55) - (x - 2) * 0.03, x, y));
  c.hline(4, 12, 10, P.r[1]); c.hline(5, 11, 11, P.r[4]); // inscription
  outlineIn(c, P.inkStone, opaque(c));
});
for (const side of ["l", "r"]) tile(`bench_${side}`, (c) => { // 2 tiles wide
  const x0 = side === "l" ? 2 : 0, x1 = side === "l" ? 15 : 13;
  shadowEllipse(c, side === "l" ? 16 : 0, 14, 14, 1.6, 90);
  for (let x = x0; x <= x1; x++) { c.put(x, 3, P.wd[4]); c.put(x, 4, P.wd[3]); c.put(x, 5, P.wd[2]); c.put(x, 8, P.wd[5]); c.put(x, 9, P.wd[3]); c.put(x, 10, P.wd[2]); }
  for (const x of [3, 12]) { c.rect(x, 5, 2, 9, P.iron); c.vline(x, 5, 13, P.ironLt); }
  outlineIn(c, P.inkWood, opaque(c));
});
for (const part of ["tl", "tr", "bl", "br"]) tile(`board_${part}`, (c) => { // 2×2 notice board
  const left = part[1] === "l", top = part[0] === "t";
  if (top) {
    const x0 = left ? 1 : 0, x1 = left ? 15 : 14;
    for (let y = 3; y < T; y++) for (let x = x0; x <= x1; x++) c.put(x, y, ramp(P.wd, y === 3 ? 0.95 : 0.6 - (y - 3) * 0.02, x, y));
    for (let y = 5; y < T; y++) for (let x = x0 + 2; x <= x1 - 2; x++) c.put(x, y, ramp([hex(0xc8d4b8), hex(0xe4ecd8), hex(0xf4f8ec)], 0.6 - (y - 5) * 0.02, x, y));
    for (let y = 7; y < T; y += 3) c.hline(x0 + 3, x1 - 4, y, hex(0x5a6a5a));
    c.hline(x0, x1, 2, P.wd[1]);
  } else {
    const px = left ? 3 : 11;
    shadowEllipse(c, left ? 16 : 0, 14, 14, 1.6, 80);
    for (let y = 0; y <= 4; y++) for (let x = left ? 1 : 0; x <= (left ? 15 : 14); x++) c.put(x, y, ramp(P.wd, 0.5 - y * 0.06, x, y));
    c.rect(px, 5, 3, 9, P.wd[2]); c.vline(px, 5, 13, P.wd[4]);
  }
  outlineIn(c, P.inkWood, opaque(c));
});
tile("sign", (c) => {
  shadowEllipse(c, 8, 14.5, 4.5, 1.2, 90);
  c.rect(7, 9, 2, 6, P.wd[1]);
  for (let y = 3; y <= 9; y++) for (let x = 2; x <= 13; x++) c.put(x, y, ramp(P.wd, y === 3 ? 0.95 : 0.6 - (y - 3) * 0.04, x, y));
  c.hline(4, 11, 5, P.wd[1]); c.hline(4, 9, 7, P.wd[1]);
  outlineIn(c, P.inkWood, opaque(c));
});
tile("mailbox", (c) => {
  shadowEllipse(c, 8, 14.5, 4.5, 1.2, 90);
  c.rect(7, 9, 2, 6, P.wd[1]);
  for (let y = 3; y <= 9; y++) for (let x = 4; x <= 11; x++) c.put(x, y, ramp([hex(0xa02a3a), P.red, P.redLt], 0.7 - (y - 3) * 0.08, x, y));
  c.rect(11, 2, 1, 4, P.yellow); c.hline(5, 10, 6, hex(0x701a28));
  outlineIn(c, P.inkWood, opaque(c));
});
tile("fence_h", (c) => {
  shadowEllipse(c, 8, 14.5, 9, 1.2, 60);
  for (const y0 of [5, 9]) for (let x = 0; x < T; x++) { c.put(x, y0, P.wd[4]); c.put(x, y0 + 1, P.wd[2]); }
  for (const x of [2, 11]) { for (let y = 2; y <= 13; y++) for (let k = 0; k < 3; k++) c.put(x + k, y, ramp(P.wd, 0.8 - k * 0.25, x + k, y)); c.hline(x, x + 2, 2, P.wd[5]); }
  outlineIn(c, P.inkWood, opaque(c));
});
tile("crate_wood", (c) => {
  shadowEllipse(c, 8, 14.5, 6.5, 1.4, 100);
  for (let y = 4; y <= 13; y++) for (let x = 2; x <= 13; x++) c.put(x, y, ramp(P.wd, 0.6 - (y - 4) * 0.02, x, y));
  c.vline(5, 5, 12, P.wd[1]); c.vline(10, 5, 12, P.wd[1]); c.hline(2, 13, 8, P.wd[1]); c.hline(2, 13, 4, P.wd[5]);
  outlineIn(c, P.inkWood, opaque(c));
});

// ── Bridge, pier ────────────────────────────────────────────────────────
const deck = (c, v) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const plank = Math.floor(x / 4), px = x % 4;
    let t = 0.62 + (rand(plank, v, 80) - 0.5) * 0.2 - (px === 3 ? 0.4 : 0) + (px === 0 ? 0.15 : 0);
    if ((y + plank * 5) % 13 === 0 && px === 1) t -= 0.25; // knots
    c.put(x, y, ramp(P.wd, t, x, y));
  }
  for (let x = 1; x < T; x += 4) { c.put(x, 2, P.inkWood); c.put(x, 13, P.inkWood); }
};
tile("bridge_deck", (c) => deck(c, 1));
const rail = (c, y0) => {
  for (let x = 0; x < T; x++) c.put(x, y0 + 6, P.shadow, 70);
  for (let x = 0; x < T; x++) { c.put(x, y0, P.wd[5]); c.put(x, y0 + 1, P.wd[3]); c.put(x, y0 + 2, P.wd[1]); }
  for (const x of [2, 10]) for (let y = y0 - 3; y <= y0 + 5; y++) for (let k = 0; k < 3; k++) c.put(x + k, y, ramp(P.wd, 0.8 - k * 0.25, x + k, y));
};
tile("bridge_rail_n", (c) => { rail(c, 9); outlineIn(c, P.inkWood, opaque(c)); });
tile("bridge_rail_s", (c) => { rail(c, 4); outlineIn(c, P.inkWood, opaque(c)); });
const post = (c, y0) => {
  shadowEllipse(c, 8, y0 + 9.5, 5, 1.4, 90);
  for (let y = y0; y <= y0 + 8; y++) for (let x = 5; x <= 10; x++) c.put(x, y, ramp(P.wd, 0.85 - (x - 5) * 0.12, x, y));
  c.hline(5, 10, y0, P.wd[5]); c.hline(5, 10, y0 + 2, P.wd[1]);
  outlineIn(c, P.inkWood, opaque(c));
};
tile("bridge_post_n", (c) => post(c, 5));
tile("bridge_post_s", (c) => post(c, 1));
tile("pier_deck", (c) => deck(c, 2));
tile("pier_end", (c) => { deck(c, 3); for (const x of [1, 12]) { c.rect(x, 10, 3, 6, P.wd[1]); c.put(x, 10, P.wd[4]); } });

// ── Caverns ─────────────────────────────────────────────────────────────
for (let i = 0; i < 3; i++) tile(`cave_floor_${i}`, (c) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, ramp(P.cf, 0.55 + Math.sin(x * 0.8 + i) * Math.cos(y * 0.6 + i) * 0.1 + (rand(x, y, 90 + i) - 0.5) * 0.25, x, y));
  for (let k = 0; k < 2; k++) { const x = 2 + Math.floor(rand(k, i, 91) * 11), y = 2 + Math.floor(rand(i, k, 92) * 11); c.rect(x, y, 2, 1, P.cf[4]); c.put(x, y + 1, P.cf[0]); }
});
tile("cave_ceiling", (c) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, rand(x, y, 93) < 0.1 ? P.ceil[1] : P.ceil[0]); });
function caveFace(c, row) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const gy = row * T + y;
    const crack = (x * 5 + Math.floor(gy / 6) * 3) % 9 === 0;
    let t = 0.6 - (gy / 32) * 0.3 + (rand(x, gy, 94) - 0.5) * 0.15 - (crack ? 0.25 : 0);
    if (gy % 10 === 0 && rand(x, gy, 95) < 0.7) t += 0.2;
    if (gy <= 1) t = gy === 0 ? 0 : 0.85;
    if (gy >= 29) t = 0.05;
    c.put(x, y, ramp(P.cf, t, x, y));
  }
}
tile("cave_face_top", (c) => caveFace(c, 0));
tile("cave_face_base", (c) => caveFace(c, 1));
tile("cave_torch", (c) => {
  caveFace(c, 1);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const d = Math.hypot(x - 7.5, y - 4); if (d > 3 && d < 8) c.put(x, y, P.flame, Math.round(50 * (1 - (d - 3) / 5))); }
  c.rect(7, 7, 2, 6, P.wd[1]); c.rect(5, 6, 6, 2, P.wd[3]);
  c.ellipse(7.5, 3.5, 2.6, 3.2, P.flame); c.ellipse(7.5, 4, 1.2, 1.8, P.flameLt);
});

// ── The open continent (src/lib/continent.ts): biome grounds, water,
// trees and props. Appended after everything above, so the GIDs of every
// earlier tile (authored chunks, the heartland) never change.
const B = {
  sand: [hex(0xa8844c), hex(0xc8a464), hex(0xdcbc7c), hex(0xead096), hex(0xf4e2b4), hex(0xfcf2d8)],
  snow: [hex(0x8094b4), hex(0xa4b4cc), hex(0xc4d0e0), hex(0xdce6f0), hex(0xeef4fa), hex(0xffffff)],
  mud: [hex(0x2e2a1a), hex(0x423c24), hex(0x58502e), hex(0x6c6438), hex(0x847a48), hex(0x9c9260)],
  dark: [hex(0x14301e), hex(0x1c4028), hex(0x265232), hex(0x30643a), hex(0x3e7646), hex(0x548a54)],
  red: [hex(0x5a2418), hex(0x7a3420), hex(0x9a4a2c), hex(0xb8643c), hex(0xd08050), hex(0xe8a070)],
  swampW: [hex(0x2e4a36), hex(0x3a5c40), hex(0x4a704a), hex(0x5e8656), hex(0x7a9c66), hex(0xa4bc84)],
  deep: [hex(0x14306c), hex(0x1c4088), hex(0x2454a4), hex(0x3068bc), hex(0x4884d0), hex(0x88b8ec)],
  palm: [hex(0x1e4a24), hex(0x2c6a2c), hex(0x40883a), hex(0x5aa448), hex(0x80c060), hex(0xb0dc80)],
  snowPine: [hex(0x123a34), hex(0x1e5444), hex(0x2c7050), hex(0xd4e0ec), hex(0xeef4fa), hex(0xffffff)],
  darkLeaf: [hex(0x0e2418), hex(0x163422), hex(0x20462c), hex(0x2c5a36), hex(0x3c7044), hex(0x5a8a56)],
  cactus: [hex(0x1e4a28), hex(0x2c6434), hex(0x3c8042), hex(0x569a50), hex(0x7cb868)],
  bone: [hex(0x8c8478), hex(0xb8b0a0), hex(0xdcd6c8), hex(0xf6f2e8)],
};
/** Opaque ground autotile over grass: `inside(x, y, v)` where the field is set, a ragged dithered rim. */
function groundTile(m, v, inside, rim) {
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y), d = BAYER[((y & 3) << 2) | (x & 3)];
      if (f < 0.4) c.put(x, y, grassPx(x, y, (v + 1) % 4));
      else if (f < 0.5) c.put(x, y, f - 0.4 > d * 0.1 ? rim(x, y) : grassPx(x, y, (v + 1) % 4));
      else c.put(x, y, inside(x, y, v));
    }
  };
}
function groundFamily(name, inside, rim) {
  for (const m of MASKS) for (const v of m === 15 ? [0, 1, 2] : [0]) tile(m === 15 ? `${name}_15_${v}` : `${name}_${m}`, groundTile(m, v, inside, rim));
}
const sandPx = (x, y, v) => {
  const dune = Math.sin((x + v * 5) * 0.45 + y * 0.9) * 0.08; // wind ripples
  return ramp(B.sand, 0.6 + dune + (rand(x, y, 400 + v) - 0.5) * 0.1, x, y);
};
groundFamily("sand", sandPx, (x, y) => ramp(B.sand, 0.3, x, y));
const snowPx = (x, y, v) => {
  let t = 0.72 + Math.sin(x * 0.35 + v) * Math.cos(y * 0.4 + v * 2) * 0.08 + (rand(x, y, 410 + v) - 0.5) * 0.06;
  if (rand(x, y, 411 + v) < 0.02) t = 1; // glints
  return ramp(B.snow, t, x, y);
};
groundFamily("snow", snowPx, (x, y) => ramp(B.snow, 0.45, x, y));
const mudPx = (x, y, v) => {
  const wet = Math.sin(x * 0.6 + v * 2) * Math.cos(y * 0.7 - v) > 0.55;
  return ramp(B.mud, (wet ? 0.25 : 0.55) + (rand(x, y, 420 + v) - 0.5) * 0.2, x, y);
};
groundFamily("mud", mudPx, (x, y) => ramp(B.mud, 0.4, x, y));
const darkPx = (x, y, v) => {
  const cell = (Math.floor(x / 5) + Math.floor(y / 5) * 3 + v) % 5;
  let t = 0.5 + (rand(x, y, 430 + v) - 0.5) * 0.25;
  if (cell === 0 && (x + y) % 3 === 0) t = 0.85; // moss flecks
  return ramp(B.dark, t, x, y);
};
groundFamily("darkgrass", darkPx, (x, y) => ramp(B.dark, 0.6, x, y));
const redPx = (x, y, v) => {
  const crack = ((x * 3 + y * 7 + v * 5) % 13 === 0) || ((x + v) % 9 === 0 && y % 5 === 2);
  return ramp(B.red, (crack ? 0.2 : 0.6) + (rand(x, y, 440 + v) - 0.5) * 0.2 + Math.sin(y * 0.8) * 0.05, x, y);
};
groundFamily("redrock", redPx, (x, y) => ramp(B.red, 0.35, x, y));

// Murky swamp water (4 frames), mud shores.
function swampTile(m, v, frame) {
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y);
      let col;
      if (f < 0.4) col = mudPx(x, y, v);
      else if (f < 0.52) col = ramp(B.mud, 0.2, x, y);
      else {
        const depth = Math.min(1, (f - 0.52) / 0.4);
        col = ramp(B.swampW, 0.62 - depth * 0.3, x, y);
        const fx = (x + frame * 2 + v * 5) % 16, fy = (y + v * 3) % 10;
        if (fy === 3 && fx >= 4 && fx <= 6) col = B.swampW[4]; // slow, scummy ripples
        if (rand(x + frame * 3, y, 450 + v) < 0.03) col = B.swampW[5]; // bubbles / scum
      }
      c.put(x, y, col);
    }
  };
}
for (const m of MASKS) for (const v of m === 15 ? [0, 1, 2] : [0]) {
  const base = m === 15 ? `swamp_15_${v}` : `swamp_${m}`;
  const frames = [base, `${base}_f1`, `${base}_f2`, `${base}_f3`];
  frames.forEach((name, k) => tile(name, swampTile(m, v, k)));
  anims[base] = frames;
}
// Open ocean (full tiles only, 4 frames): deep blue with long swells.
for (const v of [0, 1, 2]) {
  const frames = [`deep_${v}`, `deep_${v}_f1`, `deep_${v}_f2`, `deep_${v}_f3`];
  frames.forEach((name, k) => tile(name, (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let col = ramp(B.deep, 0.42 + Math.sin((x + k * 4 + v * 6) * 0.39 + y * 0.2) * 0.1 + (rand(x, y, 460 + v) - 0.5) * 0.05, x, y);
      const fx = (x + k * 4 + v * 7) % 16, fy = (y + v * 5) % 8;
      if (fy === 2 && fx >= 2 && fx <= 6) col = B.deep[5];
      c.put(x, y, col);
    }
  }));
  anims[`deep_${v}`] = frames;
}

// Trees of the new biomes (same lattice: one quarter per tile).
function palm(c, cx, cy) {
  shadowEllipse(c, cx + 2, cy + 13.5, 8, 2.2, 90);
  for (let y = cy - 6; y <= cy + 14; y++) { // curved, ringed trunk
    const k = (y - (cy - 6)) / 20, x0 = Math.round(cx + 3 - k * k * 4);
    for (let x = x0 - 1; x <= x0 + 1; x++) if (x >= 0 && x < T && y >= 0 && y < T) c.put(x, y, ramp(P.b, (y % 3 === 0 ? 0.3 : 0.75) - (x - x0) * 0.2, x, y));
  }
  const top = [cx + 3, cy - 7];
  for (const [ang, len] of [[-2.6, 11], [-2.1, 12], [-1.4, 9], [-0.6, 12], [-0.1, 11], [0.5, 9], [3.0, 10]]) {
    for (let i = 0; i <= len; i++) {
      const x = Math.round(top[0] + Math.cos(ang) * i), y = Math.round(top[1] + Math.sin(ang) * i + (i * i) / 18);
      if (x < 0 || y < 0 || x >= T || y >= T) continue;
      c.put(x, y, ramp(B.palm, 0.75 - i / len * 0.5, x, y));
      if (y + 1 < T && i > 2) c.put(x, y + 1, ramp(B.palm, 0.3, x, y + 1));
    }
  }
  for (const [x, y] of [[top[0] - 1, top[1] + 1], [top[0] + 1, top[1] + 2]]) if (x >= 0 && y >= 0 && x < T && y < T) c.put(x, y, hex(0x6a4020)); // coconuts
}
function snowPine(c, cx, cy) {
  pine(c, cx, cy);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { // snow on the top of each bough tier
    if (c.alpha(x, y) < 200) continue;
    const above = y > 0 ? c.alpha(x, y - 1) : 0;
    if (above < 200 || rand(x, y, 470) < 0.18) {
      const px = c.px, i = (y * T + x) * 4;
      if (px[i + 1] > px[i] + 10) c.put(x, y, ramp(B.snow, 0.8 + rand(x, y, 471) * 0.2, x, y)); // foliage only, not trunk
    }
  }
}
function deadTree(c, cx, cy) {
  shadowEllipse(c, cx, cy + 13.5, 7, 2, 80);
  const branch = (x0, y0, ang, len, w) => {
    for (let i = 0; i <= len; i++) {
      const x = Math.round(x0 + Math.cos(ang) * i), y = Math.round(y0 + Math.sin(ang) * i);
      for (let k = 0; k < w; k++) if (x + k >= 0 && x + k < T && y >= 0 && y < T) c.put(x + k, y, ramp(P.b, 0.65 - k * 0.25 - i / len * 0.2, x, y));
    }
  };
  branch(cx - 1, cy + 14, -Math.PI / 2, 17, 3); // trunk
  branch(cx, cy + 2, -2.4, 9, 2); branch(cx, cy - 1, -0.7, 8, 2); branch(cx, cy + 6, -0.3, 6, 1); branch(cx - 1, cy - 3, -1.9, 7, 1);
  branch(cx - 6, cy - 4, -2.0, 3, 1); branch(cx + 5, cy - 6, -1.0, 3, 1);
}
function darkTree(c, cx, cy) {
  broadleaf(c, cx, cy);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { // re-tone the crown into the darkwood palette
    const i = (y * T + x) * 4, px = c.px;
    if (px[i + 3] < 200) continue;
    const idx = P.l.findIndex((col) => col[0] === px[i] && col[1] === px[i + 1] && col[2] === px[i + 2]);
    if (idx >= 0) c.put(x, y, B.darkLeaf[idx]);
  }
}
for (const [kind, draw] of [["palm", palm], ["snowpine", snowPine], ["dead", deadTree], ["dark", darkTree]]) {
  for (const b of [1, 2, 4, 8]) tile(`tree_${kind}_${b}`, (c) => { const [cx, cy] = CORNER_POS[b]; draw(c, cx, cy); outlineIn(c, P.ink, opaque(c)); });
}

// Biome props. Blocking ones sit in `lower`, walkable decor in `upper`.
tile("cactus", (c) => {
  shadowEllipse(c, 8, 14, 5, 1.5, 80);
  const arm = (x0, y0, x1, y1) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = x0; x <= x1; x++) c.put(x, y, ramp(B.cactus, 0.75 - (x - x0) * 0.25, x, y)); };
  arm(6, 2, 9, 14); arm(2, 6, 4, 9); arm(2, 9, 6, 10); arm(11, 4, 13, 8); arm(9, 8, 13, 9);
  for (const [x, y] of [[7, 4], [8, 7], [7, 10], [3, 7], [12, 6]]) c.put(x, y, B.cactus[4]);
  c.put(7, 1, P.pink); c.put(8, 1, P.yellow);
  outlineIn(c, P.ink, opaque(c));
});
tile("desert_rock", (c) => {
  shadowEllipse(c, 8, 13, 7, 2, 90);
  for (let y = 4; y <= 13; y++) for (let x = 2; x <= 13; x++) {
    const d = ((x - 7.5) / 6) ** 2 + ((y - 9) / 5) ** 2;
    if (d <= 1) c.put(x, y, ramp(B.red, 0.8 - (x - 2) * 0.03 - (y - 4) * 0.05 + ((x + y) % 5 === 0 ? -0.2 : 0), x, y));
  }
  outlineIn(c, P.inkStone, opaque(c));
});
tile("bones", (c) => {
  for (const [x, y, len] of [[3, 10, 6], [8, 6, 5]]) { c.hline(x, x + len, y, B.bone[2]); c.put(x - 1, y - 1, B.bone[3]); c.put(x - 1, y + 1, B.bone[3]); c.put(x + len + 1, y - 1, B.bone[3]); c.put(x + len + 1, y + 1, B.bone[3]); c.hline(x, x + len, y + 1, B.bone[0]); }
  c.ellipse(11.5, 11.5, 2.5, 2, B.bone[2]); c.put(11, 11, P.ink); c.put(12, 11, P.ink); // a little skull
});
tile("shells", (c) => {
  for (const [x, y, col] of [[4, 5, P.pink], [11, 9, B.bone[3]], [6, 12, P.orange]]) { c.ellipse(x, y, 2, 1.5, col); c.put(x, y + 1, B.bone[0]); c.put(x - 1, y, B.bone[3]); }
});
tile("driftwood", (c) => {
  shadowEllipse(c, 8, 12, 7, 1.6, 80);
  for (let x = 1; x <= 14; x++) { const y = 9 + Math.round(Math.sin(x * 0.5)); c.put(x, y, ramp(B.bone, 0.5, x, y)); c.put(x, y + 1, ramp(B.bone, 0.2, x, y)); }
  c.put(4, 7, B.bone[1]); c.put(5, 8, B.bone[1]); c.put(11, 7, B.bone[1]);
  outlineIn(c, P.inkWood, opaque(c));
});
tile("snow_rock", (c) => {
  shadowEllipse(c, 8, 13, 7, 2, 80);
  for (let y = 4; y <= 13; y++) for (let x = 2; x <= 13; x++) {
    const d = ((x - 7.5) / 6) ** 2 + ((y - 9.5) / 5) ** 2;
    if (d > 1) continue;
    c.put(x, y, y < 8 - Math.abs(x - 8) * 0.3 ? ramp(B.snow, 0.85, x, y) : ramp(P.r, 0.6 - (x - 2) * 0.03, x, y));
  }
  outlineIn(c, P.inkStone, opaque(c));
});
tile("snowdrift", (c) => { for (const [x, y, r] of [[5, 9, 4], [11, 12, 3]]) c.ellipse(x, y, r, r * 0.45, B.snow[4]); c.put(5, 8, B.snow[5]); c.put(11, 11, B.snow[5]); });
tile("fern", (c) => {
  for (const [ox, oy] of [[5, 11], [11, 13]]) for (const ang of [-2.6, -2.0, -1.57, -1.1, -0.5]) {
    for (let i = 0; i < 6; i++) { const x = Math.round(ox + Math.cos(ang) * i), y = Math.round(oy + Math.sin(ang) * i * 0.8); c.put(x, y, ramp(B.darkLeaf, 0.9 - i * 0.08, x, y)); }
  }
});
tile("dead_bush", (c) => {
  for (const ang of [-2.5, -2.0, -1.5, -1.0, -0.6]) for (let i = 0; i < 6; i++) { const x = Math.round(8 + Math.cos(ang) * i), y = Math.round(13 + Math.sin(ang) * i); c.put(x, y, hex(0x8a6a40)); }
});
tile("giant_mushroom_top", (c) => {
  for (let y = 3; y < T; y++) for (let x = 0; x < T; x++) {
    const d = ((x - 7.5) / 8) ** 2 + ((y - 13) / 9) ** 2;
    if (d <= 1 && y < 15) c.put(x, y, ramp([hex(0x6a1e3a), hex(0x8a2a4a), hex(0xb03a5e), hex(0xd05a7a), hex(0xec8aa0)], 0.75 - y * 0.03 - (x - 7) * 0.02, x, y));
  }
  for (const [x, y] of [[4, 7], [10, 6], [7, 10], [12, 11], [3, 12]]) { c.put(x, y, P.white); c.put(x + 1, y, P.white); }
  outlineIn(c, P.ink, opaque(c));
});
tile("giant_mushroom_base", (c) => {
  shadowEllipse(c, 8, 14, 6, 1.6, 90);
  for (let y = 0; y < 14; y++) for (let x = 6; x <= 9; x++) c.put(x, y, ramp(B.bone, 0.85 - (x - 6) * 0.2, x, y));
  for (let x = 1; x < 15; x++) c.put(x, 0, ramp([hex(0x6a1e3a), hex(0x8a2a4a)], 0.5, x, 0)); // cap's rim
  outlineIn(c, P.ink, opaque(c));
});
// Terrace tops for snowy peaks and red mesas (variant 0 plain).
for (let i = 0; i < 3; i++) tile(`snowhigh_${i}`, (c) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, snowPx(x, y, i));
  if (i === 1) for (let y = 6; y <= 10; y++) for (let x = 4; x <= 10; x++) if (((x - 7) / 3.5) ** 2 + ((y - 8) / 2.5) ** 2 <= 1) c.put(x, y, ramp(P.r, 0.6 - (y - 6) * 0.08, x, y));
  if (i === 2) for (const [x, y] of [[3, 4], [11, 9], [6, 13]]) { c.put(x, y, P.r[2]); c.put(x + 1, y, P.r[3]); }
});
for (let i = 0; i < 3; i++) tile(`redhigh_${i}`, (c) => {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) c.put(x, y, redPx(x, y, i + 3));
  if (i === 1) for (const [x, y] of [[4, 5], [10, 10]]) { c.rect(x, y, 3, 2, B.red[5]); c.hline(x, x + 2, y + 2, B.red[0]); }
});

// ── Shores that match the land (src/lib/continent.ts) ───────────────────
// The first water family has grass and a sand bank on its land side; these
// give the same water the continent's other grounds, so a swamp bank is mud
// to the water's edge and a beach has no grass halo. Appended, so every
// earlier GID stays put.
const SHORE_LANDS = {
  sand: { land: sandPx, rim: (x, y) => ramp(B.sand, 0.22, x, y), edge: (x, y) => ramp(B.sand, 0.08, x, y) },
  mud: { land: mudPx, rim: (x, y) => ramp(B.mud, 0.18, x, y), edge: (x, y) => ramp(B.mud, 0.05, x, y) },
  darkgrass: { land: darkPx, rim: (x, y) => ramp(B.mud, 0.3, x, y), edge: (x, y) => ramp(B.mud, 0.12, x, y) },
  snow: { land: snowPx, rim: (x, y) => ramp(B.snow, 0.3, x, y), edge: (x, y) => ramp(B.snow, 0.12, x, y) },
  redrock: { land: redPx, rim: (x, y) => ramp(B.red, 0.22, x, y), edge: (x, y) => ramp(B.red, 0.08, x, y) },
};
/** Open water at (x, y) for a field value past the shore (depth, crests, foam), as in waterTile. */
function waterPx(f, x, y, v, frame) {
  const depth = Math.min(1, (f - 0.56) / 0.4);
  let col = ramp(P.w, 0.62 - depth * 0.45, x, y);
  const fx = (x + frame * 4 + v * 5) % 16, fy = (y + v * 3) % 8;
  if (fy === 2 && fx >= 3 && fx <= 7) col = P.w[5];
  if (fy === 3 && (fx === 2 || fx === 8)) col = P.w[4];
  const gx = (x + 16 - frame * 2 + 9 + v * 7) % 16, gy = (y + 5) % 8;
  if (gy === 6 && gx >= 1 && gx <= 3) col = P.w[4];
  if (f < 0.62 + (frame % 2) * 0.03) col = (x + y + frame) % 3 === 0 ? P.w[5] : P.w[6];
  return col;
}
function shoreTile(kind, m, frame) {
  const L = SHORE_LANDS[kind];
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y), d = BAYER[((y & 3) << 2) | (x & 3)];
      let col;
      if (f < 0.4) col = L.land(x, y, 0);
      else if (f < 0.47) col = f - 0.4 > d * 0.07 ? L.rim(x, y) : L.land(x, y, 0); // wet, dithered into the land
      else if (f < 0.56) col = L.edge(x, y);
      else col = waterPx(f, x, y, 0, frame);
      c.put(x, y, col);
    }
  };
}
for (const kind of Object.keys(SHORE_LANDS)) for (const m of MASKS) {
  if (m === 15) continue;
  const base = `water_${kind}_${m}`;
  const frames = [base, `${base}_f1`, `${base}_f2`, `${base}_f3`];
  frames.forEach((name, k) => tile(name, shoreTile(kind, m, k)));
  anims[base] = frames;
}
// Murky swamp water fading into the clear river: every corner is water; the
// mask marks the clear corners.
function swampMixTile(m, frame) {
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y), d = BAYER[((y & 3) << 2) | (x & 3)];
      const clear = f > 0.42 + d * 0.16; // a dithered band between the two
      let col;
      if (clear) col = waterPx(0.56 + Math.min(0.4, f * 0.4), x, y, 1, frame);
      else {
        col = ramp(B.swampW, 0.5 + f * 0.25, x, y);
        const fx = (x + frame * 2 + 5) % 16, fy = (y + 3) % 10;
        if (fy === 3 && fx >= 4 && fx <= 6) col = B.swampW[4];
        if (rand(x + frame * 3, y, 460) < 0.03) col = B.swampW[5];
      }
      c.put(x, y, col);
    }
  };
}
for (const m of MASKS) {
  if (m === 15) continue;
  const base = `swamp_mix_${m}`;
  const frames = [base, `${base}_f1`, `${base}_f2`, `${base}_f3`];
  frames.forEach((name, k) => tile(name, swampMixTile(m, k)));
  anims[base] = frames;
}

// ── Ground meeting ground (src/lib/continent.ts) ────────────────────────
// The ground families above are drawn over grass, so where two other
// grounds meet (snow and a beach's sand, mud and sand, …) the gap showed
// grass. `<top>_on_<base>_<mask>`: the higher-priority ground over the
// other, same ragged dithered rim. Appended, so earlier GIDs stay put.
const GROUNDS = {
  snow: { px: snowPx, rim: (x, y) => ramp(B.snow, 0.45, x, y) },
  sand: { px: sandPx, rim: (x, y) => ramp(B.sand, 0.3, x, y) },
  redrock: { px: redPx, rim: (x, y) => ramp(B.red, 0.35, x, y) },
  mud: { px: mudPx, rim: (x, y) => ramp(B.mud, 0.4, x, y) },
  darkgrass: { px: darkPx, rim: (x, y) => ramp(B.dark, 0.6, x, y) },
};
const GROUND_PRIORITY = ["snow", "sand", "redrock", "mud", "darkgrass"]; // as GROUND_ORDER in continent.ts
function groundOnTile(top, base, m) {
  const A = GROUNDS[top], Bk = GROUNDS[base];
  return (c) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const f = field(m, x, y), d = BAYER[((y & 3) << 2) | (x & 3)];
      if (f < 0.4) c.put(x, y, Bk.px(x, y, 1));
      else if (f < 0.5) c.put(x, y, f - 0.4 > d * 0.1 ? A.rim(x, y) : Bk.px(x, y, 1));
      else c.put(x, y, A.px(x, y, 0));
    }
  };
}
GROUND_PRIORITY.forEach((top, i) => {
  for (const base of GROUND_PRIORITY.slice(i + 1)) for (const m of MASKS) {
    if (m !== 15) tile(`${top}_on_${base}_${m}`, groundOnTile(top, base, m));
  }
});

// ── Sheet + names ───────────────────────────────────────────────────────
const rows = Math.ceil(tiles.length / COLS);
const W = COLS * T, H = rows * T;
const sheet = Buffer.alloc(W * H * 4);
tiles.forEach((c, i) => {
  const x0 = (i % COLS) * T, y0 = Math.floor(i / COLS) * T;
  for (let y = 0; y < T; y++) Buffer.from(c.px.buffer, y * T * 4, T * 4).copy(sheet, ((y0 + y) * W + x0) * 4);
});
if (new Set(names).size !== names.length) throw new Error("duplicate tile names");
await sharp(sheet, { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/Wilds.png");
fs.writeFileSync(new URL("../src/lib/terrain/wildsTiles.json", import.meta.url), JSON.stringify({ columns: COLS, width: W, height: H, names, anims }) + "\n");
console.log(`wrote public/assets/Wilds.png (${W}×${H}, ${names.length} tiles, ${Object.keys(anims).length} animated)`);
