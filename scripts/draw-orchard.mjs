#!/usr/bin/env node
// Grapevines for vineyards (src/lib/crops.ts): one frame per growth stage,
// the base at the bottom centre (setOrigin(0.5, 1), like draw-tree.mjs).
//
//   vines.png — 32×40 frames, row 0 red grapes, row 1 white grapes:
//               0 bare trellis · 1 cutting · 2 young vine · 3 leafy
//               (mature, no fruit) · 4 hung with bunches
// A vine's harvest drops it back to stage 3 (it fruits again). Fruit trees
// come from the "[LPC] Fruit Trees" sheet (public/assets/trees/fruit-trees.png).
//
//   node scripts/draw-orchard.mjs   → public/assets/trees/vines.png

import fs from "node:fs";
import sharp from "sharp";
import { Canvas, rand } from "./canvas-art.mjs";

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x22301e),
  post: hex(0x8a6a44), postDk: hex(0x5e4428), wire: hex(0x6a6a74),
  leaf: hex(0x4f9a43), leafDk: hex(0x357433), leafLt: hex(0x78c25e), leafHi: hex(0xa0dc7a),
  vine: hex(0x6e4a2c),
  red: [hex(0x3a0e2a), hex(0x5e1a46), hex(0x86306a), hex(0xb05a92)],
  white: [hex(0x6a7a20), hex(0x94a836), hex(0xbccc5a), hex(0xe0ec98)],
};

function clump(c, cx, cy, rx, ry, seed) {
  c.ellipse(cx, cy, rx, ry, P.leafDk);
  c.ellipse(cx - 1, cy - 1, rx - 1, ry - 1.5, P.leaf);
  c.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.5, ry * 0.4, P.leafLt);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (!c.alpha(x, y)) continue;
    const r = rand(x, y, seed);
    if (r < 0.06) c.put(x, y, P.leafDk);
    else if (r > 0.96 && y < cy) c.put(x, y, P.leafHi);
  }
}
function shadow(c, cx, base, rx) { for (let x = -rx; x <= rx; x++) c.put(cx + x, base + 1, P.ink, Math.abs(x) >= rx - 1 ? 40 : 70); }

// ── Vines on a trellis ─────────────────────────────────────────────────
const VW = 32, VH = 40, VX = 16, VB = 38;
function trellis(c) {
  for (const px of [3, 28]) { c.rect(px, 8, 2, VB - 7, P.post); c.vline(px + 1, 8, VB, P.postDk); }
  for (const wy of [12, 22]) c.hline(4, 28, wy, P.wire);
}
/** A bunch of grapes hanging at (x, y). */
function bunch(c, x, y, cols) {
  // single 2×2 berries in a tapering cluster, drawn over the outlined vine
  const berries = [[-3, 0], [-1, 0], [1, 0], [3, 0], [-2, 2], [0, 2], [2, 2], [-1, 4], [1, 4], [0, 6]];
  for (const [dx, dy] of berries) {
    c.put(x + dx, y + dy, cols[2]); c.put(x + dx + 1, y + dy, cols[1]);
    c.put(x + dx, y + dy + 1, cols[1]); c.put(x + dx + 1, y + dy + 1, cols[0]);
  }
  for (const [dx, dy] of berries.slice(0, 4)) c.put(x + dx, y + dy, cols[3]); // light on the top row
  c.put(x, y - 1, P.vine); c.put(x, y - 2, P.vine);
}
function vineFrame(stage, cols) {
  const c = new Canvas(VW, VH);
  trellis(c);
  if (stage >= 1) { // the stem
    const top = stage === 1 ? VB - 8 : stage === 2 ? 20 : 12;
    for (let y = top; y <= VB; y++) c.put(VX + (y % 6 < 3 ? 0 : 1), y, P.vine);
  }
  if (stage === 1) { clump(c, VX + 2, VB - 9, 3, 2, 1); }
  if (stage === 2) { for (let x = 9; x <= 23; x++) c.put(x, 22, P.vine); clump(c, 11, 20, 4, 3, 2); clump(c, 21, 20, 4, 3, 3); }
  if (stage >= 3) {
    for (const wy of [12, 22]) for (let x = 5; x <= 27; x++) c.put(x, wy, P.vine);
    for (const [cx, cy, s] of [[8, 11, 4], [16, 9, 5], [24, 11, 6], [10, 21, 7], [22, 21, 8], [16, 19, 9]]) clump(c, cx, cy, 5, 4, s);
  }
  c.outline(P.ink);
  if (stage === 4) for (const [bx, by] of [[9, 15], [20, 14], [12, 25], [23, 25]]) bunch(c, bx, by, cols);
  shadow(c, VX, VB, 12);
  return c;
}

async function sheet(file, rows, fw, fh) {
  const cols = Math.max(...rows.map((r) => r.length));
  const buf = Buffer.alloc(fw * cols * fh * rows.length * 4);
  rows.forEach((row, ry) => row.forEach((f, i) => {
    for (let y = 0; y < fh; y++) Buffer.from(f.px.buffer, y * fw * 4, fw * 4).copy(buf, ((ry * fh + y) * fw * cols + i * fw) * 4);
  }));
  fs.mkdirSync("public/assets/trees", { recursive: true });
  await sharp(buf, { raw: { width: fw * cols, height: fh * rows.length, channels: 4 } }).png().toFile(file);
  console.log(`wrote ${file} (${rows.length}×${cols} frames of ${fw}×${fh})`);
}

const stages = [0, 1, 2, 3, 4];
await sheet("public/assets/trees/vines.png", [stages.map((s) => vineFrame(s, P.red)), stages.map((s) => vineFrame(s, P.white))], VW, VH);
