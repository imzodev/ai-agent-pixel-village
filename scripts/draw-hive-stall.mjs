#!/usr/bin/env node
// Beehive Builder's spot in the village (src/lib/arcade/spots.ts): three white
// hive boxes on a plank stand beside the Village Ranch's own hives, a honey pot
// and a few bees, under a sign.
//
//   node scripts/draw-hive-stall.mjs
//
// Writes public/assets/hivestall.png (src/game/arcadeArt.ts): 80×64 (5×4
// tiles). The sign's face is 70×12 at (5, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 80, H = 64;
const c = new Canvas(W, H);

softShadow(c, 4, 56, 72, 7, 70);
// The plank stand.
c.rect(6, 52, 68, 3, PAL.wood[2]);
c.rect(6, 55, 68, 1, PAL.wood[0]);
for (const x of [8, 38, 70]) c.rect(x, 56, 2, 4, PAL.wood[1]);

// Three hives: a roof, two stacked boxes each, an entrance slit.
const WHITE = [hex(0xb8b4a8), hex(0xd8d4c8), hex(0xeeeae0), hex(0xfcfaf2)];
for (const [x, boxes] of [[9, 2], [30, 3], [51, 2]]) {
  const w = 19, top = 52 - boxes * 9;
  for (let b = 0; b < boxes; b++) {
    const y = top + b * 9;
    for (let yy = y; yy < y + 9; yy++) for (let xx = x; xx < x + w; xx++) c.put(xx, yy, ramp(WHITE, 0.75 - (xx - x) * 0.02 - (yy === y + 8 ? 0.4 : 0), xx, yy));
    c.hline(x + 2, x + w - 3, y + 2, WHITE[1]); // the handhold
  }
  c.rect(x - 1, top - 3, w + 2, 3, PAL.roofBrown[2]);
  c.hline(x - 1, x + w, top - 3, PAL.roofBrown[4]);
  c.rect(x + 6, 50, 7, 1, PAL.ink); // the entrance
}

// A honey pot on the stand.
c.ellipse(74, 48, 4, 4, hex(0xe8a830));
c.rect(71, 43, 7, 2, PAL.wood[3]);
c.put(73, 47, hex(0xffe08c)); c.put(74, 46, hex(0xffe08c));

// Bees.
for (const [x, y] of [[20, 26], [45, 22], [62, 29], [27, 33], [56, 18]]) {
  c.put(x, y, PAL.yellow); c.put(x + 1, y, PAL.ink); c.put(x + 2, y, PAL.yellow);
  c.put(x + 1, y - 1, PAL.white, 200);
}

// The sign on two posts.
for (const x of [8, W - 11]) for (let y = 12; y < 20; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 4; x < W - 4; x++) {
  const edge = y === 1 || y === 14 || x === 4 || x === W - 5;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/hivestall.png");
console.log("wrote public/assets/hivestall.png");
