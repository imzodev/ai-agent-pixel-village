#!/usr/bin/env node
// Fenwick's Orchard Catch's spot in the village (src/lib/arcade/spots.ts): by the
// Wayfarer's Rest, a little apple tree heavy with fruit, a ladder against it, a
// basket of apples and pears, and Fenwick's cider press, under a sign.
//
//   node scripts/draw-catch-stall.mjs
//
// Writes public/assets/catchstall.png (src/game/arcadeArt.ts): 96×64 (6×4
// tiles). The sign's face is 86×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 96, H = 64;
const c = new Canvas(W, H);
const LEAF = [hex(0x2f6a2a), hex(0x3f8a34), hex(0x5aa844), hex(0x7cc25a)];
const APPLE = hex(0xd23a2a), PEAR = hex(0xb8c840), GOLDEN = hex(0xffcf3a);

softShadow(c, 6, 55, 84, 7, 70);

// The tree (middle): a trunk and a round crown dotted with fruit.
const tx = 48;
for (let y = 36; y < 58; y++) for (let x = tx - 3; x < tx + 3; x++) c.put(x, y, ramp(PAL.log, 0.25 + (x - tx + 3) * 0.12, x, y));
for (let y = 16; y < 42; y++) for (let x = tx - 18; x <= tx + 18; x++) {
  const dx = x - tx, dy = (y - 29) * 1.35;
  if (dx * dx + dy * dy <= 18 * 18) c.put(x, y, ramp(LEAF, 0.55 - (y - 29) * 0.02 + ((x * 5 + y * 3) % 9 === 0 ? 0.2 : 0), x, y));
}
for (const [x, y, col] of [[tx - 10, 24, APPLE], [tx + 6, 21, APPLE], [tx - 3, 32, PEAR], [tx + 12, 30, APPLE], [tx - 14, 33, APPLE], [tx + 3, 27, GOLDEN]]) {
  c.rect(x, y, 2, 2, col); c.put(x, y, hex(0xffffff));
}

// A ladder leaning on the tree (right of the trunk).
for (let i = 0; i < 22; i++) { c.put(tx + 14 - Math.floor(i / 3), 57 - i, PAL.wood[2]); c.put(tx + 19 - Math.floor(i / 3), 57 - i, PAL.wood[2]); }
for (let i = 2; i < 22; i += 4) c.hline(tx + 14 - Math.floor(i / 3), tx + 19 - Math.floor(i / 3), 57 - i, PAL.wood[1]);

// A basket of fruit (left).
const bx = 10, by = 47;
c.rect(bx, by, 18, 10, hex(0xb8843a));
for (let x = bx; x < bx + 18; x += 3) c.vline(x, by, by + 9, hex(0x7a5222));
c.rect(bx - 1, by - 1, 20, 2, hex(0x8a5a22));
for (let i = 0; i < 5; i++) c.ellipse(bx + 3 + i * 3, by - 2, 2, 2, i % 2 ? PEAR : APPLE);

// The cider press (right): a barrel under a beam and a screw.
const px = 78;
c.rect(px - 7, 44, 14, 13, hex(0x8a5a32));
for (let y = 46; y < 57; y += 4) c.hline(px - 7, px + 6, y, hex(0x3a2414));
c.vline(px, 34, 44, PAL.wood[1]);
c.rect(px - 8, 32, 17, 3, PAL.wood[2]);
c.rect(px + 7, 53, 3, 2, hex(0xc08a2a));

// The sign on two posts.
for (const x of [10, W - 13]) for (let y = 12; y < 26; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 5; x < W - 5; x++) {
  const edge = y === 1 || y === 14 || x === 5 || x === W - 6;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/catchstall.png");
console.log("wrote public/assets/catchstall.png");
