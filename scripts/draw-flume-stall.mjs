#!/usr/bin/env node
// Log Flume's spot in Hollowmere (src/lib/arcade/spots.ts): beside Ansel the
// woodcutter, a short wooden log chute with water running down it and a log
// riding it, a pile of logs, and an axe in a stump, under a sign.
//
//   node scripts/draw-flume-stall.mjs
//
// Writes public/assets/flumestall.png (src/game/arcadeArt.ts): 96×64 (6×4
// tiles). The sign's face is 86×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 96, H = 64;
const c = new Canvas(W, H);
const WATER = [hex(0x2a5a8a), hex(0x3a7ab0), hex(0x6aa8d8), hex(0xc8e6ff)];

softShadow(c, 6, 56, 84, 7, 70);

// The chute: a wooden trough sloping down to the right, on two trestles, water inside.
const y0 = 30, y1 = 46, x0 = 30, x1 = 92;
const at = (x) => y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
for (let x = x0; x < x1; x++) {
  const y = Math.round(at(x));
  c.put(x, y - 1, PAL.wood[4]);
  for (let yy = y; yy < y + 5; yy++) c.put(x, yy, ramp(WATER, 0.55 + ((x + yy * 2) % 9 === 0 ? 0.35 : 0) - (yy - y) * 0.06, x, yy));
  c.put(x, y + 5, PAL.wood[2]); c.put(x, y + 6, PAL.wood[1]);
}
for (const tx of [40, 78]) { const y = Math.round(at(tx)) + 7; for (let yy = y; yy < 58; yy++) { c.put(tx, yy, PAL.wood[1]); c.put(tx + 1, yy, PAL.wood[2]); } c.hline(tx - 3, tx + 4, 57, PAL.wood[0]); }
// A log riding the chute.
for (let x = 56; x < 70; x++) { const y = Math.round(at(x)); c.put(x, y, PAL.log[2]); c.put(x, y + 1, PAL.log[3]); c.put(x, y + 2, PAL.log[1]); }
c.put(69, Math.round(at(69)) + 1, hex(0xe8c890));
// Splash where it pours off the end.
for (const [dx, dy] of [[0, 0], [2, -2], [3, 1], [-1, 3], [4, 4]]) c.put(x1 - 3 + dx, y1 + 4 + dy, WATER[3]);

// A pile of logs (left), ends showing their rings.
for (const [lx, ly] of [[6, 48], [16, 48], [11, 41]]) {
  c.ellipse(lx + 4, ly + 4, 5, 5, PAL.log[1]);
  c.ellipse(lx + 4, ly + 4, 4, 4, hex(0xd8b078));
  c.ellipse(lx + 4, ly + 4, 2, 2, hex(0xa07848));
}
// A stump with an axe in it.
c.rect(24, 50, 8, 7, PAL.log[2]); c.ellipse(28, 50, 4, 1.5, hex(0xd8b078));
for (let i = 0; i < 9; i++) c.put(27 + i * 0.4, 49 - i, PAL.wood[1]);
c.rect(29, 39, 4, 3, PAL.stone[3]);

// The sign on two posts.
for (const x of [10, W - 13]) for (let y = 12; y < 26; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 5; x < W - 5; x++) {
  const edge = y === 1 || y === 14 || x === 5 || x === W - 6;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/flumestall.png");
console.log("wrote public/assets/flumestall.png");
