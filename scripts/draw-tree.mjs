#!/usr/bin/env node
// Choppable oak: an original 4-frame sheet, one frame per growth stage of
// the `oak_tree` resource node (src/lib/crops.ts). Frame = node stage:
//   0 stump · 1 sapling · 2 young tree · 3 full oak
// Frames are 48×64 with the trunk base at the bottom centre (x 24, y 62),
// matching the node sprite's setOrigin(0.5, 1).
//
//   node scripts/draw-tree.mjs            → public/assets/trees/oak.png

import fs from "node:fs";
import sharp from "sharp";
import { Canvas, rand } from "./canvas-art.mjs";

const FW = 48, FH = 64, CX = 24, BASE = 62;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x22301e),
  bark: hex(0x7a5232), barkDk: hex(0x5a3a22), barkLt: hex(0x98693f),
  ring: hex(0xd8b37c), ringDk: hex(0xb48a58),
  leaf: hex(0x4f9a43), leafDk: hex(0x357433), leafLt: hex(0x78c25e), leafHi: hex(0xa0dc7a),
};

/** Trunk from the base up to `top`, `w` px wide, with bark streaks and roots. */
function trunk(c, top, w, roots) {
  const x0 = CX - Math.floor(w / 2);
  c.rect(x0, top, w, BASE - top + 1, P.bark);
  c.vline(x0, top, BASE, P.barkLt);
  c.vline(x0 + w - 1, top, BASE, P.barkDk);
  for (let y = top + 2; y < BASE; y += 5) c.put(x0 + 1 + ((y >> 1) % Math.max(1, w - 2)), y, P.barkDk);
  if (roots) {
    c.poly([[x0 - 4, BASE + 1], [x0, BASE - 4], [x0 + 1, BASE + 1]], P.bark);
    c.poly([[x0 + w + 3, BASE + 1], [x0 + w - 1, BASE - 4], [x0 + w - 2, BASE + 1]], P.barkDk);
  }
}

/** Leafy clump: base colour, darker underside, lit top-left, speckles. */
function clump(c, cx, cy, rx, ry, seed) {
  c.ellipse(cx, cy, rx, ry, P.leafDk);
  c.ellipse(cx - 1, cy - 1, rx - 1, ry - 1.5, P.leaf);
  c.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.5, ry * 0.4, P.leafLt);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (!c.alpha(x, y)) continue;
      const r = rand(x, y, seed);
      if (r < 0.06) c.put(x, y, P.leafDk);
      else if (r > 0.96 && y < cy) c.put(x, y, P.leafHi);
    }
  }
}

function shadow(c, rx) {
  for (let x = -rx; x <= rx; x++) {
    const edge = Math.abs(x) >= rx - 1;
    c.put(CX + x, BASE + 1, P.ink, edge ? 40 : 70);
  }
}

function stump() {
  const c = new Canvas(FW, FH);
  trunk(c, 54, 12, true);
  c.ellipse(CX, 54, 6, 2.5, P.ring); // cut face with growth rings
  c.ellipse(CX, 54, 3.5, 1.5, P.ringDk);
  c.put(CX, 54, P.ring);
  c.put(CX + 7, 49, P.leafLt); c.put(CX + 8, 50, P.leaf); c.put(CX + 7, 51, P.leafDk); // a new shoot
  c.outline(P.ink);
  shadow(c, 9);
  return c;
}

function sapling() {
  const c = new Canvas(FW, FH);
  trunk(c, 44, 2, false);
  clump(c, CX, 40, 7, 6, 1);
  clump(c, CX + 3, 45, 4, 3, 2);
  c.outline(P.ink);
  shadow(c, 6);
  return c;
}

function young() {
  const c = new Canvas(FW, FH);
  trunk(c, 36, 4, false);
  clump(c, CX, 30, 12, 10, 3);
  clump(c, CX - 5, 36, 7, 5, 4);
  clump(c, CX + 6, 35, 7, 5, 5);
  c.outline(P.ink);
  shadow(c, 9);
  return c;
}

function full() {
  const c = new Canvas(FW, FH);
  trunk(c, 38, 7, true);
  clump(c, CX - 11, 30, 10, 9, 6);
  clump(c, CX + 11, 30, 10, 9, 7);
  clump(c, CX, 22, 17, 14, 8);
  clump(c, CX - 3, 12, 11, 9, 9);
  clump(c, CX + 6, 34, 9, 6, 10);
  clump(c, CX - 7, 36, 8, 5, 11);
  c.outline(P.ink);
  shadow(c, 12);
  return c;
}

const frames = [stump(), sapling(), young(), full()];
const sheet = Buffer.alloc(FW * frames.length * FH * 4);
frames.forEach((f, i) => {
  for (let y = 0; y < FH; y++) {
    Buffer.from(f.px.buffer, y * FW * 4, FW * 4).copy(sheet, (y * FW * frames.length + i * FW) * 4);
  }
});
fs.mkdirSync("public/assets/trees", { recursive: true });
const out = "public/assets/trees/oak.png";
await sharp(sheet, { raw: { width: FW * frames.length, height: FH, channels: 4 } }).png().toFile(out);
console.log(`wrote ${out} (${frames.length} frames of ${FW}×${FH})`);
