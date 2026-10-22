#!/usr/bin/env node
// Harvest Haul's spot in the village (src/lib/arcade/spots.ts): Della's cart,
// loaded with produce, with a sign over it, by the Village Ranch. Put together
// from the game's own sheet (public/assets/haul.png, scripts/draw-haul.mjs).
//
//   node scripts/draw-haul.mjs && node scripts/draw-haul-stall.mjs
//
// Writes public/assets/haulstall.png (src/game/arcadeArt.ts): 112×64 (7×4
// tiles). The sign's face is 96×12 at (8, 2); the game writes on it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, ramp } from "./ds-art.mjs";

const W = 112, H = 64;
const sheet = JSON.parse(fs.readFileSync("src/lib/haul/sheet.json", "utf8"));
const cut = (name, w) => {
  const [x, y, fw, fh] = sheet.frames[name];
  return sharp("public/assets/haul.png").extract({ left: x, top: y, width: fw, height: fh }).resize({ width: w, kernel: "nearest" }).png().toBuffer({ resolveWithObject: true });
};

// The sign on two posts.
const c = new Canvas(W, H);
for (const x of [12, W - 15]) for (let y = 12; y < 22; y++) for (let xx = x; xx < x + 3; xx++) c.put(xx, y, ramp(PAL.log, 0.3 + (xx - x) * 0.2, xx, y));
for (let y = 1; y < 15; y++) for (let x = 6; x < W - 6; x++) {
  const edge = y === 1 || y === 14 || x === 6 || x === W - 7;
  c.put(x, y, edge ? PAL.wood[1] : ramp(PAL.wood, 0.62 + ((x + y * 3) % 7 === 0 ? -0.06 : 0), x, y));
}
c.outline(PAL.ink);
const base = await sharp(Buffer.from(c.px), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

// The cart, its wheels, and a heap of the kind of load it carries: each
// item stands on the bed (BED) or on the one below it (its bottom edge given).
const cart = await cut("cart", 96), wheel = await cut("wheel", 16);
const CART_TOP = 26, BED = CART_TOP + Math.round(cart.info.height * 18 / 28);
const load = [["hay", 30, 12, BED], ["crate", 18, 44, BED], ["churn", 9, 64, BED], ["pumpkin", 15, 76, BED], ["watermelon", 16, 15, BED - 15], ["cabbage", 11, 46, BED - 14], ["eggs", 14, 28, BED - 15]];
const layers = [{ input: cart.data, left: 8, top: CART_TOP }];
for (const [name, w, x, bottom] of load) { const f = await cut(name, w); layers.push({ input: f.data, left: x, top: bottom - f.info.height }); }
for (const x of [18, 70]) layers.push({ input: wheel.data, left: x, top: BED + 4 });
fs.mkdirSync("public/assets", { recursive: true });
await sharp(base).composite(layers).png().toFile("public/assets/haulstall.png");
console.log("wrote public/assets/haulstall.png");
