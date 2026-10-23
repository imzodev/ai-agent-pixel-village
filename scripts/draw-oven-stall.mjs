#!/usr/bin/env node
// Marigold's Oven's spot in the village (src/lib/arcade/spots.ts): a small brick
// bread oven by her bread table, its mouth glowing, a peel leaning on it and a
// tray of loaves cooling beside it, under a sign.
//
//   node scripts/draw-oven-stall.mjs
//
// Writes public/assets/ovenstall.png (src/game/arcadeArt.ts): 80×64 (5×4
// tiles). The sign's face is 70×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 80, H = 64;
const c = new Canvas(W, H);

softShadow(c, 8, 56, 64, 7, 70);

// The oven: a brick dome on a brick base.
const OX = 14, OW = 40;
for (let y = 36; y < 58; y++) for (let x = OX; x < OX + OW; x++) {
  const mortar = (y - 36) % 5 === 4 || (x + ((Math.floor((y - 36) / 5) % 2) * 4)) % 8 === 0;
  c.put(x, y, mortar ? PAL.brick[0] : ramp(PAL.brick, 0.5 + (x - OX) * -0.006, x, y));
}
for (let y = 20; y < 37; y++) for (let x = OX; x < OX + OW; x++) {
  const dx = (x - (OX + OW / 2 - 0.5)) / (OW / 2), dy = (y - 37) / 17;
  if (dx * dx + dy * dy > 1) continue;
  const mortar = (y - 20) % 5 === 4 || (x + ((Math.floor((y - 20) / 5) % 2) * 4)) % 8 === 0;
  c.put(x, y, mortar ? PAL.brick[0] : ramp(PAL.brick, 0.62 - dy * -0.2 - (x - OX) * 0.006, x, y));
}
// A chimney.
for (let y = 15; y < 24; y++) for (let x = 44; x < 49; x++) c.put(x, y, ramp(PAL.brick, 0.35 + (x - 44) * 0.06, x, y));
c.ellipse(46, 12, 3, 2, PAL.stone[3], 150);
c.ellipse(48, 8, 3.5, 2.5, PAL.stone[4], 110);

// The mouth, glowing.
for (let y = 32; y < 46; y++) for (let x = OX + 10; x < OX + 30; x++) {
  const dx = (x - (OX + 19.5)) / 10, dy = (y - 46) / 14;
  if (dx * dx + dy * dy > 1) continue;
  const heat = Math.max(0, 1 - Math.abs(dx) * 0.8 - (46 - y) / 16);
  c.put(x, y, heat > 0.45 ? hex(0xffb050) : heat > 0.2 ? hex(0xe0602a) : hex(0x2a1410));
}
c.ellipse(OX + 20, 43, 4, 1.5, hex(0xc8843a)); // a loaf inside

// A peel leaning on the right.
for (let i = 0; i < 26; i++) c.put(58 - i * 0.25, 57 - i, PAL.wood[2]);
c.rect(52, 26, 7, 6, PAL.wood[3]);

// A tray of loaves cooling (left).
c.rect(2, 50, 13, 2, PAL.iron);
for (const x of [4, 9]) { c.ellipse(x, 48, 2.6, 1.8, hex(0xc8843a)); c.put(x, 47, hex(0xf0d8a0)); }

// The sign on two posts.
for (const x of [8, W - 11]) for (let y = 12; y < 22; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 4; x < W - 4; x++) {
  const edge = y === 1 || y === 14 || x === 4 || x === W - 5;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/ovenstall.png");
console.log("wrote public/assets/ovenstall.png");
