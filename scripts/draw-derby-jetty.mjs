#!/usr/bin/env node
// Fishing Derby's spot in the village (src/lib/arcade/spots.ts): a little
// jetty of planks on the Western Meadow pond's bank, with a bait barrel, a
// rod leaning on a post, a bucket with a fish's tail in it and a pennant, and
// a sign over it.
//
//   node scripts/draw-derby-jetty.mjs
//
// Writes public/assets/derbyjetty.png (src/game/arcadeArt.ts): 96×64 (6×4
// tiles). The sign's face is 84×12 at (6, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp, softShadow } from "./ds-art.mjs";

const W = 96, H = 64;
const c = new Canvas(W, H);

// Shadow under the deck.
softShadow(c, 6, 54, 84, 8, 70);
// The deck: planks across, on posts.
const DECK = { x: 6, y: 26, w: 84, h: 28 };
for (let y = DECK.y; y < DECK.y + DECK.h; y++) for (let x = DECK.x; x < DECK.x + DECK.w; x++) {
  const seam = (y - DECK.y) % 7 === 6;
  const nail = (y - DECK.y) % 7 === 3 && (x === DECK.x + 3 || x === DECK.x + DECK.w - 4);
  c.put(x, y, seam ? PAL.wood[1] : nail ? PAL.iron : ramp(PAL.wood, 0.55 + ((x * 3 + y) % 11 === 0 ? -0.08 : 0) + (y - DECK.y) * 0.004, x, y));
}
for (const x of [DECK.x + 1, DECK.x + DECK.w - 5]) for (let y = DECK.y + DECK.h; y < DECK.y + DECK.h + 6; y++) for (let xx = x; xx < x + 4; xx++) c.put(xx, y, ramp(PAL.log, 0.25 + (xx - x) * 0.15, xx, y));

// The bait barrel (left).
for (let y = 30; y < 48; y++) for (let x = 12; x < 26; x++) {
  const band = y === 33 || y === 44;
  c.put(x, y, band ? PAL.iron : ramp(PAL.log, 0.32 - Math.abs(x - 19) * 0.03, x, y));
}
c.ellipse(19, 30, 7, 2, PAL.wood[0]);
c.ellipse(19, 30, 5, 1.2, hex(0x5a3a22));

// A bucket with a fish's tail sticking out (middle).
for (let y = 38; y < 49; y++) for (let x = 42; x < 54; x++) c.put(x, y, ramp(PAL.stone, 0.45 + (x - 42) * 0.03, x, y));
c.hline(42, 53, 38, PAL.ironLt);
c.ellipse(48, 38, 6, 1.5, hex(0x2a4a7a));
c.poly([[46, 37], [49, 31], [52, 30], [50, 34], [51, 37]], hex(0x8aa050));
c.poly([[49, 31], [53, 28], [52, 31]], hex(0x6a8040));

// A rod leaning on the right post, its line hanging down.
for (let i = 0; i < 30; i++) c.put(84 - i * 0.55, 50 - i * 1.1, PAL.wood[0]);
c.put(83, 49, PAL.iron); c.put(84, 49, PAL.iron);
for (let y = 18; y < 40; y++) c.put(68 + Math.round((y - 18) * 0.05), y, PAL.white, 150);
c.rect(67, 40, 3, 2, PAL.red); c.rect(67, 42, 3, 1, PAL.white);

// A pennant on a pole (left edge).
for (let y = 16; y < 30; y++) c.put(8, y, PAL.wood[1]);
c.poly([[9, 17], [17, 19.5], [9, 22]], PAL.yellow);

// The sign on two posts.
for (const x of [10, W - 13]) for (let y = 12; y < 26; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 5; x < W - 5; x++) {
  const edge = y === 1 || y === 14 || x === 5 || x === W - 6;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/derbyjetty.png");
console.log("wrote public/assets/derbyjetty.png");
