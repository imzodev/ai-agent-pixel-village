#!/usr/bin/env node
// Pip's Archery Butts' spot in the village (src/lib/arcade/spots.ts): by Pip's
// cabin, a straw butt on its stand with an arrow in the gold, a bow rack with a
// bow and a quiver, and a little scarecrow wearing the golden apple, under a sign.
//
//   node scripts/draw-archery-stall.mjs
//
// Writes public/assets/archerystall.png (src/game/arcadeArt.ts): 96×64 (6×4
// tiles). The sign's face is 86×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 96, H = 64;
const c = new Canvas(W, H);
const STRAW = [hex(0x9a7a3a), hex(0xc8a45a), hex(0xe8cf8a), hex(0xf6e6b4)];
const BLUE = hex(0x2f6fb8), RED = hex(0xd24a3a), GOLD = hex(0xf2c230), FACE = hex(0xf4f0e4);

softShadow(c, 6, 55, 84, 7, 70);

// The butt (right): a round straw boss on a three-legged stand, its face painted.
const bx = 66, by = 36, br = 13;
for (const [x0, x1] of [[bx - 6, bx - 11], [bx + 6, bx + 11], [bx, bx + 2]]) c.line(x0, by + 4, x1, 57, PAL.wood[1]);
c.ellipse(bx + 1, by + 1, br + 1, br + 1, STRAW[0]);
for (let y = by - br; y <= by + br; y++) for (let x = bx - br; x <= bx + br; x++) {
  const d = (x - bx) * (x - bx) + (y - by) * (y - by);
  if (d <= br * br) c.put(x, y, ramp(STRAW, 0.45 + ((x * 3 + y * 5) % 7 === 0 ? 0.3 : 0) - (y - by) * 0.01, x, y));
}
c.ellipse(bx, by, 10, 10, FACE);
c.ellipse(bx, by, 8, 8, BLUE);
c.ellipse(bx, by, 5, 5, RED);
c.ellipse(bx, by, 2, 2, GOLD);
// An arrow in the gold, its fletching standing off the face.
c.line(bx + 1, by - 1, bx + 9, by - 7, PAL.wood[1]);
c.put(bx + 9, by - 8, PAL.white); c.put(bx + 10, by - 7, PAL.white); c.put(bx + 8, by - 8, PAL.white);

// The bow rack (left): two posts and a rail, a bow hanging, a quiver leaning.
for (const x of [8, 26]) c.rect(x, 32, 2, 25, PAL.wood[2]);
c.rect(7, 33, 22, 2, PAL.wood[1]);
for (let i = 0; i <= 18; i++) {
  const t = i / 18, x = 12 + Math.round(6 * Math.sin(t * Math.PI)), y = 35 + i;
  c.put(x, y, PAL.wood[3]); c.put(x + 1, y, PAL.wood[2]);
}
c.vline(12, 35, 53, PAL.white);
c.rect(20, 42, 4, 12, PAL.log[1]); c.rect(20, 42, 4, 1, PAL.log[3]);
for (const x of [20, 22, 23]) { c.vline(x, 38, 41, PAL.wood[1]); c.put(x, 37, PAL.white); }

// The scarecrow (middle), the golden apple on its hat.
const sx = 41;
c.rect(sx, 34, 2, 23, PAL.wood[1]);
c.rect(sx - 7, 40, 16, 2, PAL.wood[2]);
c.rect(sx - 4, 39, 10, 9, hex(0x8a5a3a));
c.ellipse(sx + 1, 35, 3, 3, STRAW[2]);
c.rect(sx - 4, 31, 10, 2, STRAW[1]); c.rect(sx - 2, 28, 6, 3, STRAW[1]);
c.ellipse(sx + 1, 26, 2, 2, GOLD); c.put(sx + 1, 23, PAL.leaf[3]); c.put(sx, 25, hex(0xfff4c0));

// The sign on two posts.
for (const x of [10, W - 13]) for (let y = 12; y < 26; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 5; x < W - 5; x++) {
  const edge = y === 1 || y === 14 || x === 5 || x === W - 6;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/archerystall.png");
console.log("wrote public/assets/archerystall.png");
