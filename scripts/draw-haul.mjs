#!/usr/bin/env node
// Harvest Haul's art (src/components/haul/draw.ts): the cart (body, a wheel),
// Della's pony, the ten things you load (and the fragile ones broken), and the
// market stall. Drawn at 2× the game's units, so they stay sharp when scaled.
//
//   node scripts/draw-haul.mjs
//
// Writes public/assets/haul.png and src/lib/haul/sheet.json (where each frame
// is, in sheet pixels, and the scale). Sizes follow src/lib/haul/rules.ts:
// boxes are 2·hw × 2·hh units, circles 2·r.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp } from "./ds-art.mjs";

const S = 2;
const INK = PAL.ink;
const ORANGE = [hex(0x8a3a10), hex(0xc05a18), hex(0xe8802a), hex(0xf8a848), hex(0xffd08a)];
const GREEN = [hex(0x1c4a20), hex(0x2a6a2c), hex(0x46924a), hex(0x72b866), hex(0xb0e08a)];
const MELON = [hex(0x123a1c), hex(0x1e5a2a), hex(0x2e7a36), hex(0x4a9a46)];
const CHEESE = [hex(0x9a6a10), hex(0xd09a20), hex(0xf0c040), hex(0xffe27a)];
const STRAW = [hex(0x8a6a20), hex(0xb08a30), hex(0xd4b050), hex(0xf0d47a)];
const TIN = [hex(0x4a5260), hex(0x7a8494), hex(0xaab4c2), hex(0xdce4ec)];
const CREAM = [hex(0xc8b8a0), hex(0xe8dcc8), hex(0xfaf4ea), hex(0xffffff)];
const SACK = [hex(0x8a7454), hex(0xb09a74), hex(0xd4c09a), hex(0xeee0c0)];

/** Each frame: its size in game units and how to draw it (onto a canvas S× that). */
const FRAMES = [];
const frame = (name, w, h, draw) => FRAMES.push({ name, w, h, draw });

function ball(c, colors, ribs) {
  const r = c.w / 2;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const dx = (x + 0.5 - r) / r, dy = (y + 0.5 - r) / r, d2 = dx * dx + dy * dy;
    if (d2 > 1) continue;
    let t = 0.75 - dy * 0.3 - dx * 0.15 - d2 * 0.25;
    if (ribs && Math.abs(Math.sin(dx * ribs * 1.6)) < 0.18) t -= 0.25;
    c.put(x, y, ramp(colors, t, x, y));
  }
}

frame("pumpkin", 26, 26, (c) => {
  ball(c, ORANGE, 3);
  c.rect(c.w / 2 - 2, 0, 4, 6, PAL.wood[1]); c.rect(c.w / 2 - 1, 0, 2, 5, PAL.leaf[3]);
  c.outline(INK);
});
frame("cabbage", 18, 18, (c) => {
  ball(c, GREEN, 0);
  for (let i = 0; i < 4; i++) c.line(c.w / 2, c.h / 2, 4 + i * 9, 6 + (i % 2) * 20, GREEN[4]);
  c.outline(INK);
});
frame("watermelon", 30, 30, (c) => {
  ball(c, MELON, 0);
  for (let x = 6; x < c.w - 4; x += 9) for (let y = 4; y < c.h - 4; y++) {
    const dx = (x - c.w / 2) / (c.w / 2), dy = (y - c.h / 2) / (c.h / 2);
    if (dx * dx + dy * dy < 0.85) { c.put(x + Math.round(Math.sin(y / 5) * 2), y, MELON[3]); c.put(x + 1 + Math.round(Math.sin(y / 5) * 2), y, MELON[3]); }
  }
  c.outline(INK);
});
frame("cheese", 32, 14, (c) => {
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const edge = x < 3 || x >= c.w - 3 ? (y < 3 || y >= c.h - 3) : false;
    if (!edge) c.put(x, y, ramp(CHEESE, 0.75 - (y / c.h) * 0.4, x, y));
  }
  c.rect(0, 3, c.w, 3, CHEESE[3]);
  for (const [x, y, r] of [[14, 16, 3], [36, 12, 2], [48, 18, 3], [26, 20, 2]]) c.ellipse(x, y, r, r - 1, CHEESE[1]);
  c.outline(INK);
});
function basket(c) {
  for (let y = Math.floor(c.h * 0.45); y < c.h; y++) for (let x = 2; x < c.w - 2; x++) c.put(x, y, ((x + y) % 4 < 2) ? STRAW[1] : STRAW[2]);
  c.hline(1, c.w - 2, Math.floor(c.h * 0.45), STRAW[0]);
}
frame("eggs", 22, 14, (c) => {
  for (const x of [8, 18, 28, 36]) c.ellipse(x, c.h * 0.42, 5, 6, CREAM[2]);
  for (const x of [8, 18, 28, 36]) c.put(x - 2, c.h * 0.32, CREAM[3]);
  basket(c);
  c.outline(INK);
});
frame("eggs_broken", 22, 14, (c) => {
  for (const x of [8, 28]) c.ellipse(x, c.h * 0.48, 5, 4, CREAM[1]);
  c.ellipse(19, c.h * 0.42, 6, 3, hex(0xf8c020)); c.ellipse(36, c.h * 0.46, 4, 2, hex(0xf8c020));
  basket(c);
  for (let y = c.h * 0.45; y < c.h - 2; y++) c.put(14 + (y % 3), y, hex(0xf0b818));
  c.outline(INK);
});
frame("hay", 44, 22, (c) => {
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.put(x, y, ramp(STRAW, 0.7 - (y / c.h) * 0.35 + (((x * 7 + y * 3) % 5) - 2) * 0.05, x, y));
  for (let y = 0; y < c.h; y += 3) for (let x = (y * 5) % 7; x < c.w; x += 7) c.put(x, y, STRAW[0]);
  for (const x of [22, 64]) c.rect(x, 0, 3, c.h, PAL.wood[1]);
  c.outline(INK);
});
frame("crate", 28, 24, (c) => {
  c.rect(0, 10, c.w, c.h - 10, PAL.wood[3]);
  for (let y = 14; y < c.h; y += 9) c.hline(0, c.w - 1, y, PAL.wood[1]);
  c.rect(0, 10, 4, c.h - 10, PAL.wood[2]); c.rect(c.w - 4, 10, 4, c.h - 10, PAL.wood[2]);
  for (const x of [8, 20, 32, 44]) c.ellipse(x, 10, 6, 6, x % 24 === 8 ? PAL.red : hex(0xc83040));
  for (const x of [8, 32]) c.put(x - 2, 6, PAL.pink);
  c.outline(INK);
});
frame("flour", 30, 18, (c) => {
  c.poly([[2, 6], [8, 1], [c.w - 8, 1], [c.w - 2, 6], [c.w - 1, c.h - 2], [1, c.h - 2]], SACK[2]);
  for (let y = 4; y < c.h - 2; y++) for (let x = 2; x < c.w - 2; x++) if (c.alpha(x, y) && (x + y) % 9 === 0) c.put(x, y, SACK[1]);
  c.rect(20, 14, 20, 8, CREAM[2]); c.rect(22, 16, 16, 1, SACK[0]); c.rect(22, 19, 12, 1, SACK[0]);
  c.outline(INK);
});
frame("churn", 16, 28, (c) => {
  c.rect(6, 0, c.w - 12, 6, TIN[2]); c.rect(4, 6, c.w - 8, 4, TIN[1]);
  for (let y = 10; y < c.h; y++) for (let x = 2; x < c.w - 2; x++) c.put(x, y, ramp(TIN, 0.85 - Math.abs(x - c.w / 2) / c.w * 1.4, x, y));
  for (const y of [22, 44]) c.hline(2, c.w - 3, y, TIN[0]);
  c.outline(INK);
});
function cake(c, broken) {
  const tiers = [[4, 48, 72], [12, 28, 48], [20, 10, 30]];
  if (!broken) {
    for (const [x0, y0, y1] of tiers) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < c.w - x0; x++) c.put(x, y, ramp(CREAM, 0.8 - (y - y0) / (y1 - y0) * 0.3, x, y));
      for (let x = x0; x < c.w - x0; x += 4) c.put(x, y0 + 2, PAL.pink);
    }
    c.ellipse(c.w / 2, 7, 4, 4, PAL.red);
  } else {
    c.poly([[2, c.h - 1], [8, 40], [18, 30], [30, 38], [44, 26], [c.w - 2, c.h - 1]], CREAM[2]);
    c.poly([[6, c.h - 1], [12, 52], [26, 46], [40, 54], [c.w - 6, c.h - 1]], CREAM[1]);
    for (const [x, y] of [[16, 36], [34, 44], [24, 56]]) c.rect(x, y, 3, 2, PAL.pink);
    c.ellipse(40, 22, 3, 3, PAL.red);
  }
  c.rect(0, c.h - 4, c.w, 4, TIN[3]);
  c.outline(INK);
}
frame("cake", 24, 36, (c) => cake(c, false));
frame("cake_broken", 24, 36, (c) => cake(c, true));

// The cart's body: bed planks and a low side at each end (rules.ts: BED_HW 78, SIDE_HH 9 → 156 × 28).
frame("cart", 156, 28, (c) => {
  const bedY = 36; // the bed's top, in sheet pixels (2 × 18)
  for (let y = bedY; y < bedY + 20; y++) for (let x = 0; x < c.w; x++) c.put(x, y, ramp(PAL.wood, 0.7 - (y - bedY) / 20 * 0.4 + ((x % 24) === 0 ? -0.2 : 0), x, y));
  c.hline(0, c.w - 1, bedY, PAL.wood[4]);
  for (const x0 of [0, c.w - 12]) {
    for (let y = 0; y < bedY; y++) for (let x = x0; x < x0 + 12; x++) c.put(x, y, ramp(PAL.wood, 0.6 + (x - x0) * 0.02, x, y));
    c.rect(x0 + 3, 4, 6, 3, PAL.iron);
  }
  c.outline(INK);
});
frame("wheel", 24, 24, (c) => {
  const r = c.w / 2;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
    if (d <= r && d > r - 5) c.put(x, y, PAL.wood[1]);
    else if (d <= 4) c.put(x, y, PAL.iron);
  }
  for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; c.line(r, r, r + Math.cos(a) * (r - 4), r + Math.sin(a) * (r - 4), PAL.wood[2]); }
  c.outline(INK);
});
frame("pony", 42, 36, (c) => {
  const B = [hex(0x5a3218), hex(0x7e4a26), hex(0xa06a3a), hex(0xc08a54)];
  c.ellipse(36, 34, 26, 14, B[2]);                       // body
  for (const x of [16, 26, 46, 56]) c.rect(x, 42, 6, 28, B[1]); // legs
  c.poly([[54, 30], [66, 6], [80, 10], [82, 22], [70, 26], [62, 40]], B[2]); // neck and head
  c.rect(76, 14, 3, 3, INK);
  c.poly([[54, 22], [64, 4], [68, 8], [58, 28]], B[0]);   // mane
  c.poly([[8, 28], [0, 52], [6, 54], [12, 34]], B[0]);    // tail
  c.hline(30, 70, 30, PAL.iron);                          // harness
  c.outline(INK);
});
frame("stall", 90, 70, (c) => {
  for (let y = 0; y < 30; y++) for (let x = 0; x < c.w; x++) c.put(x, y, Math.floor(x / 20) % 2 ? PAL.white : PAL.red);
  for (let x = 0; x < c.w; x += 20) c.ellipse(x + 10, 30, 10, 6, Math.floor(x / 20) % 2 ? PAL.white : PAL.red);
  for (const x of [8, c.w - 14]) c.rect(x, 30, 6, c.h - 30, PAL.wood[2]);
  c.rect(0, 96, c.w, 44, PAL.wood[3]); c.hline(0, c.w - 1, 96, PAL.wood[4]);
  c.rect(40, 50, 100, 14, PAL.plaster[3]); // the sign board
  c.outline(INK);
});

// Pack the frames in rows, 2 px apart.
const SHEET_W = 512;
let x = 0, y = 0, rowH = 0;
const placed = FRAMES.map((f) => {
  const w = f.w * S, h = f.h * S;
  if (x + w > SHEET_W) { x = 0; y += rowH + 2; rowH = 0; }
  const at = { ...f, x, y, pw: w, ph: h };
  x += w + 2; rowH = Math.max(rowH, h);
  return at;
});
const H = y + rowH;
const sheet = new Canvas(SHEET_W, H);
for (const f of placed) {
  const c = new Canvas(f.pw, f.ph);
  f.draw(c);
  for (let yy = 0; yy < f.ph; yy++) for (let xx = 0; xx < f.pw; xx++) {
    const a = c.alpha(xx, yy);
    if (a) sheet.put(f.x + xx, f.y + yy, c.px.slice((yy * f.pw + xx) * 4, (yy * f.pw + xx) * 4 + 3), a);
  }
}
fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(sheet.px), { raw: { width: SHEET_W, height: H, channels: 4 } }).png().toFile("public/assets/haul.png");
fs.writeFileSync("src/lib/haul/sheet.json", JSON.stringify({ scale: S, frames: Object.fromEntries(placed.map((f) => [f.name, [f.x, f.y, f.pw, f.ph]])) }, null, 1) + "\n");
console.log(`wrote public/assets/haul.png (${SHEET_W}×${H}) and src/lib/haul/sheet.json`);
