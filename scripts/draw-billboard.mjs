#!/usr/bin/env node
// Billboards (src/lib/billboards.ts): a board on two posts with a window the
// advertiser's poster fills, and the paper notice an empty board shows.
//
//   node scripts/draw-billboard.mjs
//
// Writes public/assets/billboard.png (src/game/billboardArt.ts). Frames, all
// 112×80 (the board's 7×5 tiles), side by side:
//   x 0:   wood   (roadside and town boards)
//   x 112: gilt   (the village plaza's)
//   x 224: notice (a pinned paper "your ad here" sheet, for the window)
// The window is 96×48 at (8, 6) (POSTER_WINDOW): the poster is drawn over it.

import fs from "node:fs";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";
import { PAL, hex, ramp } from "./ds-art.mjs";

const FW = 112, FH = 80, W = FW * 3, H = FH;
const WIN = { x: 8, y: 6, w: 96, h: 48 };
const sheet = new Canvas(W, H);
const INK = PAL.ink;
const GILT = [hex(0x6a4a14), hex(0x9a7020), hex(0xc89a30), hex(0xe8c050), hex(0xfce488)];

function blit(c, ox) {
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const a = c.alpha(x, y);
    if (a) sheet.put(ox + x, y, c.px.slice((y * FW + x) * 4, (y * FW + x) * 4 + 3), a);
  }
}

/** The board: two posts, a frame round the window, a little roof, grass at the feet. */
function board(trim) {
  const c = new Canvas(FW, FH);
  // posts
  for (const px of [18, FW - 24]) {
    for (let y = WIN.y + WIN.h; y < FH - 2; y++) for (let x = px; x < px + 6; x++) c.put(x, y, ramp(PAL.log, 0.35 + (x - px) * 0.1, x, y));
    c.rect(px - 1, FH - 4, 8, 2, PAL.log[0]);
  }
  // braces between the posts
  for (let x = 24; x < FW - 24; x++) { c.put(x, WIN.y + WIN.h + 8, PAL.wood[1]); c.put(x, WIN.y + WIN.h + 9, PAL.wood[0]); }
  // backing board behind the window
  c.rect(WIN.x - 2, WIN.y - 2, WIN.w + 4, WIN.h + 4, PAL.wood[0]);
  // the frame
  const t = 4;
  for (let y = WIN.y - t; y < WIN.y + WIN.h + t; y++) for (let x = WIN.x - t; x < WIN.x + WIN.w + t; x++) {
    const inside = x >= WIN.x && x < WIN.x + WIN.w && y >= WIN.y && y < WIN.y + WIN.h;
    if (inside) continue;
    const top = y < WIN.y, left = x < WIN.x;
    const tone = top || left ? 0.75 : 0.35;
    c.put(x, y, ramp(trim, tone + ((x + y) % 7 === 0 ? 0.1 : 0), x, y));
  }
  // corner studs
  for (const [x, y] of [[WIN.x - 3, WIN.y - 3], [WIN.x + WIN.w + 1, WIN.y - 3], [WIN.x - 3, WIN.y + WIN.h + 1], [WIN.x + WIN.w + 1, WIN.y + WIN.h + 1]]) {
    c.rect(x, y, 2, 2, PAL.iron); c.put(x, y, PAL.ironLt);
  }
  // a little roof over it
  for (let x = WIN.x - 6; x < WIN.x + WIN.w + 6; x++) { c.put(x, 0, PAL.wood[1]); c.put(x, 1, PAL.wood[3]); }
  // a tuft of grass at each foot
  for (const px of [16, FW - 26]) for (let k = 0; k < 10; k++) c.put(px + k, FH - 5 - (k % 3), PAL.leaf[2 + (k % 2)]);
  c.outline(INK);
  // the window is left empty: the poster or the notice goes there
  for (let y = WIN.y; y < WIN.y + WIN.h; y++) for (let x = WIN.x; x < WIN.x + WIN.w; x++) c.put(x, y, PAL.wood[0]);
  return c;
}

/** The notice: cream paper pinned in the window, a big "AD" mark and lines of writing. */
function notice() {
  const c = new Canvas(FW, FH);
  for (let y = WIN.y + 2; y < WIN.y + WIN.h - 2; y++) for (let x = WIN.x + 4; x < WIN.x + WIN.w - 4; x++) {
    c.put(x, y, ramp(PAL.plaster, 0.75 - ((y - WIN.y) / WIN.h) * 0.2 + ((x * 3 + y) % 11 === 0 ? -0.08 : 0), x, y));
  }
  // pins
  for (const x of [WIN.x + 8, WIN.x + WIN.w - 10]) { c.rect(x, WIN.y + 4, 2, 2, PAL.red); c.put(x, WIN.y + 4, PAL.pink); }
  // writing (squiggle lines) under where the game prints its text
  for (const y of [WIN.y + 34, WIN.y + 38]) for (let x = WIN.x + 16; x < WIN.x + WIN.w - 16; x++) if ((x + y) % 5 !== 0) c.put(x, y, PAL.inkSoft);
  return c;
}

blit(board(PAL.wood), 0);
blit(board(GILT), FW);
blit(notice(), FW * 2);

fs.mkdirSync("public/assets", { recursive: true });
await sharp(Buffer.from(sheet.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile("public/assets/billboard.png");
console.log("wrote public/assets/billboard.png");
