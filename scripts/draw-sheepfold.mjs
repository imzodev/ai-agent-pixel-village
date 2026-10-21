#!/usr/bin/env node
// Whistle's sheepfold (src/lib/whistle/fold.ts): a sign on two posts over a
// little fenced pen with straw, its gate swung open at the bottom, and two
// sheep from the world's sheet inside.
//
//   node scripts/draw-sheepfold.mjs
//
// Writes public/assets/sheepfold.png (src/game/whistleArt.ts): 96×80 (6×5
// tiles). The sign's face is 80×12 at (8, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, ramp } from "./ds-art.mjs";

const W = 96, H = 80, TOP = 16; // the pen starts below the sign's row
const c = new Canvas(W, H);

// Straw floor.
for (let y = TOP + 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
  c.put(x, y, ramp([[0xb0, 0x90, 0x48], [0xcc, 0xac, 0x5c], [0xe0, 0xc4, 0x74], [0xee, 0xd8, 0x90]], 0.45 + (((x * 7 + y * 13) % 9) - 4) * 0.06, x, y));
}

/** A fence run: two rails between posts. */
function railH(x0, x1, y) {
  for (let x = x0; x <= x1; x++) { c.put(x, y, PAL.wood[3]); c.put(x, y + 1, PAL.wood[1]); c.put(x, y + 5, PAL.wood[3]); c.put(x, y + 6, PAL.wood[1]); }
}
function railV(x, y0, y1) {
  for (let y = y0; y <= y1; y++) { c.put(x, y, PAL.wood[3]); c.put(x + 1, y, PAL.wood[1]); }
}
function post(x, y) {
  for (let yy = y; yy < y + 10; yy++) for (let xx = x; xx < x + 3; xx++) c.put(xx, yy, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, yy));
  c.put(x + 1, y, PAL.wood[4]);
}

// Back and sides.
railH(2, W - 3, TOP + 1);
railV(3, TOP + 2, H - 6);
railV(W - 5, TOP + 2, H - 6);
// Front, with the gate's gap in the middle (32 px).
const g0 = W / 2 - 16, g1 = W / 2 + 16;
railH(2, g0, H - 10);
railH(g1, W - 3, H - 10);
for (const x of [1, 22, g0 - 2, g1 - 1, W - 25, W - 4]) post(x, H - 13);
for (const x of [1, W / 2 - 1, W - 4]) post(x, TOP - 2);
for (const y of [TOP + 20, TOP + 40]) { post(1, y); post(W - 4, y); }
// The gate, swung open against the front fence on the left.
for (let x = g0 - 14; x <= g0; x++) { c.put(x, H - 5, PAL.wood[4]); c.put(x, H - 2, PAL.wood[2]); }
c.line(g0 - 14, H - 5, g0, H - 2, PAL.wood[2]);

// The sign: a board on two posts over the back fence.
for (const x of [10, W - 13]) for (let y = 12; y < TOP + 2; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 6; x < W - 6; x++) {
  const edge = y === 1 || y === 14 || x === 6 || x === W - 7;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

// Two sheep from the world's sheet (128 px frames: row 1 faces left, row 2 faces you; block 1 grazes).
const sheet = "public/assets/animals/sheep.png";
const frame = (col, row) => sharp(sheet).extract({ left: col * 128, top: row * 128, width: 128, height: 128 }).resize(48, 48, { kernel: "nearest" }).png().toBuffer();
const base = await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
fs.mkdirSync("public/assets", { recursive: true });
await sharp(base).composite([
  { input: await frame(1, 5), left: 10, top: 22 },
  { input: await frame(2, 6), left: 46, top: 30 },
]).png().toFile("public/assets/sheepfold.png");
console.log("wrote public/assets/sheepfold.png");
