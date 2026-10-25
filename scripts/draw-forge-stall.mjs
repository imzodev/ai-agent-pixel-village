#!/usr/bin/env node
// Bjorn's Forge's spot in Hollowmere (src/lib/arcade/spots.ts): a small open-
// fronted smithy with a stone forge glowing at the left, an anvil under it, a
// half-finished blade on a stand and Bjorn's hammer leaning on a post, under a
// sign.
//
//   node scripts/draw-forge-stall.mjs
//
// Writes public/assets/forgestall.png (src/game/arcadeArt.ts): 80×64 (5×4
// tiles). The sign's face is 70×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 80, H = 64;
const c = new Canvas(W, H);

softShadow(c, 8, 56, 64, 7, 70);

// The smithy's back wall (open at the front).
for (let y = 16; y < 52; y++) for (let x = 6; x < 74; x++) {
  const mortar = (y % 6 === 5) || (x % 9 === 0);
  c.put(x, y, mortar ? PAL.stone[1] : ramp(PAL.stone, 0.42 + ((x + y * 5) % 11 === 0 ? -0.07 : 0), x, y));
}

// The stone forge, glowing at the left.
const OX = 10, OW = 26;
for (let y = 32; y < 52; y++) for (let x = OX; x < OX + OW; x++) {
  const mortar = (y % 5 === 4) || ((x + (y % 10 === 4 ? 3 : 0)) % 8 === 0);
  c.put(x, y, mortar ? PAL.stone[0] : ramp(PAL.stone, 0.5 + (x - OX) * 0.008, x, y));
}
for (let y = 36; y < 48; y++) for (let x = OX + 5; x < OX + 21; x++) {
  const dx = (x - (OX + 12.5)) / 8, dy = (y - 48) / 12;
  if (dx * dx + dy * dy > 1) continue;
  const heat = Math.max(0, 1 - Math.abs(dx) * 0.9 - (48 - y) / 14);
  c.put(x, y, heat > 0.5 ? hex(0xffd070) : heat > 0.22 ? hex(0xf08030) : hex(0x5a1c0c));
}
for (let y = 24; y < 33; y++) for (let x = OX + 8; x < OX + 18; x++) c.put(x, y, ramp(PAL.stone, 0.35 + (x - OX) * 0.02, x, y));

// The anvil under the sign, centre.
c.rect(38, 40, 22, 5, PAL.ironLt);
c.rect(43, 45, 11, 5, PAL.iron);
c.rect(40, 50, 17, 4, hex(0x2c2c34));
c.rect(35, 37, 7, 4, hex(0x8a8a98));

// A half-finished blade on a stand, right.
c.rect(62, 33, 2, 18, PAL.wood[2]);
c.rect(57, 30, 12, 3, hex(0xc8ccd4));
c.rect(57, 30, 12, 1, hex(0xe8ecf4));

// Bjorn's hammer leaning on the post.
c.rect(66, 44, 3, 14, PAL.wood[2]);
c.rect(62, 40, 11, 6, PAL.ironLt);

// A coal bucket.
c.rect(6, 50, 8, 6, PAL.iron);
c.rect(7, 52, 6, 3, hex(0x1a1410));

// The sign on two posts.
for (const x of [8, W - 11]) for (let y = 12; y < 22; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 4; x < W - 4; x++) {
  const edge = y === 1 || y === 14 || x === 4 || x === W - 5;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/forgestall.png");
console.log("wrote public/assets/forgestall.png");
