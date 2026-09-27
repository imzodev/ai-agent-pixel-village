#!/usr/bin/env node
// Build "Brick House": the two-storey house layout (scripts/house-layout.mjs)
// with brick walls on both floors and a terracotta roof, baked into its own
// spritesheet.
//
//   node scripts/build-brick-house.mjs
//
// Writes public/assets/House2.png + public/buildings/house_2.json (see
// scripts/bake-building.mjs).
//
// The shared tilesets have no full brick wall — only a 3-course brick
// strip under some plaster panels. So the walls are painted here: every
// cream plaster pixel (and the existing strip) is replaced by running-bond
// brick in the strip's own palette, laid out in template coordinates so the
// courses continue seamlessly across tiles. Timber frame, outlines,
// windows and the door are left untouched. The brown roof planks are
// recoloured to terracotta.

import { bakeBuilding } from "./bake-building.mjs";
import { twoStoreyHouse } from "./house-layout.mjs";

const T = 16;
const key = (r, g, b) => (r << 16) | (g << 8) | b;
const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

// Wall pixels to repaint: plaster face, its inner shadow tones, and the
// brick strip's own colours (so old and new bricks don't mis-align).
const LIT = new Set([0xddccb8, 0xd1bca4, 0xccad95, 0xc0a687, 0xb39572, 0xb47f61, 0xa4613e, 0xc0967a, 0x95431c].map((h) => h));
const SHADOW = new Set([0xb9a996, 0x998b7a]);
// Brick shades from the strip (weighted: mostly mid tones), and mortar.
const BRICKS = [0xb47f61, 0xa4613e, 0xb47f61, 0xa4613e, 0xc0967a, 0x95431c].map(rgb);
const MORTAR = rgb(0xc4ac92);

/** Deterministic per-brick shade. */
function brickShade(course, n) {
  let h = Math.imul(course * 73856093 ^ n * 19349663, 0x9e3779b1) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0; // keep it unsigned
  return BRICKS[h % BRICKS.length];
}

function brickAt(X, Y, shadow) {
  const course = Math.floor(Y / 4);
  const offset = (course & 1) * 4;
  const isMortar = Y % 4 === 3 || (X + offset) % 8 === 7;
  let c = isMortar ? MORTAR : brickShade(course, Math.floor((X + offset) / 8));
  if (!isMortar && Y % 4 === 0) c = c.map((v) => Math.min(255, v + 12)); // lit top edge
  if (shadow) c = c.map((v) => Math.round(v * 0.84));
  return c;
}

// Terracotta for the brown roof planks (by exact source colour).
const ROOF = new Map([
  [0x724320, 0x96402c], // mid plank
  [0xa06131, 0xbf5a3c], // lit plank
  [0x4a2c16, 0x6a281c], // shade
  [0x2b190c, 0x3e1610], // deep shade
  [0x9c794d, 0xcc7e60], // highlight
  [0x88673f, 0xae6448],
]);

function paint({ layer, row, col, where }, px) {
  if (where.name === "Roofs") {
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const to = ROOF.get(key(px[i], px[i + 1], px[i + 2]));
      if (to !== undefined) [px[i], px[i + 1], px[i + 2]] = rgb(to);
    }
    return px;
  }
  // Wall panels: plaster (cols 19-22) and plaster-on-brick (cols 31-34), rows 8-10.
  const panel = where.name === "Walls" && where.r >= 8 && where.r <= 10 &&
    ((where.c >= 19 && where.c <= 22) || (where.c >= 31 && where.c <= 34));
  if (!panel || !layer.startsWith("Decoration")) return undefined;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      if (!px[i + 3]) continue;
      const k = key(px[i], px[i + 1], px[i + 2]);
      const shadow = SHADOW.has(k);
      if (!shadow && !LIT.has(k)) continue; // frame, outline, windows: keep
      [px[i], px[i + 1], px[i + 2]] = brickAt(col * T + x, row * T + y, shadow);
    }
  }
  return px;
}

const template = twoStoreyHouse({
  upperWindow: [32, 8], // Walls.png: multi-pane glass window over a wood base
  groundPanelShift: 12, // the brick-base panel: no middle rail or plank base, so it bricks up solid
});
await bakeBuilding(template, { name: "House2", jsonName: "house_2", paint });
