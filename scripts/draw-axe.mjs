#!/usr/bin/env node
// Held woodcutter's axe as LPC weapon layers (576×512, 64×64 frames, rows
// walk up/left/down/right then slash up/left/down/right), derived frame by
// frame from the LPC dagger so the axe sits in the hand on every pose:
//   - the dagger's grip (its brown handle pixels) anchors the axe,
//   - the blade pixels near the grip give the direction it points,
//   - the dagger near the hand is replaced by a longer haft with a wedge
//     head at its end; the swing trail further out is kept.
// Both the front layer and the behind layer (up-facing poses) are made.
// LPC sheets are gitignored, so `npm run fetch:lpc` runs this after the download.
//
//   node scripts/draw-axe.mjs    → public/lpc/weapon_axe.png, weapon_axe_behind.png

import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Canvas } from "./canvas-art.mjs";

// Also run by scripts/fetch-lpc.mjs, so paths don't depend on the cwd.
const LPC = fileURLToPath(new URL("../public/lpc/", import.meta.url));

const W = 576, H = 512, FR = 64;
const HANDLE = new Set(["114,62,42", "65,30,5"]);
const BLADE = new Set(["114,107,126", "196,181,159", "177,153,152", "77,74,93"]);
const NEAR = 9; // px from the grip that still counts as the dagger itself
const C = {
  ink: [29, 19, 30],
  haft: [140, 94, 56], haftDk: [96, 60, 34], haftLt: [176, 128, 80],
  head: [120, 124, 136], headDk: [78, 80, 94], edge: [222, 226, 232],
};

async function readRaw(file) {
  const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return data;
}

/** Axe for one frame, or null when the dagger isn't drawn in it. */
function axeFrame(src, fx, fy) {
  const px = [];
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const i = ((fy + y) * W + fx + x) * 4;
    if (!src[i + 3]) continue;
    px.push({ x, y, rgba: [src[i], src[i + 1], src[i + 2], src[i + 3]], key: `${src[i]},${src[i + 1]},${src[i + 2]}` });
  }
  const grip = px.filter((p) => HANDLE.has(p.key));
  if (grip.length === 0) return null;
  const gx = grip.reduce((s, p) => s + p.x, 0) / grip.length;
  const gy = grip.reduce((s, p) => s + p.y, 0) / grip.length;
  const near = px.filter((p) => BLADE.has(p.key) && Math.hypot(p.x - gx, p.y - gy) <= NEAR);
  if (near.length === 0) return null;
  let dx = near.reduce((s, p) => s + p.x, 0) / near.length - gx;
  let dy = near.reduce((s, p) => s + p.y, 0) / near.length - gy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  // Perpendicular for the head: the side facing away from the body centre.
  let nx = -dy, ny = dx;
  const tipX = gx + dx * 10, tipY = gy + dy * 10;
  if ((tipX + nx - 32) ** 2 + (tipY + ny - 40) ** 2 < (tipX - nx - 32) ** 2 + (tipY - ny - 40) ** 2) { nx = -nx; ny = -ny; }

  const c = new Canvas(FR, FR);
  // Haft: from just behind the hand to past where the dagger tip was.
  const at = (t, s = 0) => [gx + dx * t + nx * s, gy + dy * t + ny * s];
  for (let t = -3; t <= 12; t += 0.25) {
    const [x, y] = at(t);
    c.put(x, y, C.haft);
    const [x2, y2] = at(t, -0.8);
    c.put(x2, y2, C.haftDk);
    if (t > 0 && t < 8) { const [x3, y3] = at(t, 0.6); c.put(x3, y3, C.haftLt); }
  }
  // Head: a wedge flaring out from the haft end, cutting edge outermost.
  c.poly([at(7, 0), at(12.5, 0), at(13.5, 5.5), at(6, 5.5)], C.head);
  c.poly([at(9.5, -1.5), at(12.5, -1.5), at(12.5, 0.5), at(9.5, 0.5)], C.headDk); // poll behind the haft
  for (let t = 6; t <= 13.5; t += 0.25) { const [x, y] = at(t, 5.5); c.put(x, y, C.edge); }
  c.outline(C.ink);

  // Keep the swing trail: everything of the dagger layer away from the hand.
  for (const p of px) {
    if (Math.hypot(p.x - gx, p.y - gy) <= NEAR + 2) continue;
    if (c.alpha(p.x, p.y)) continue;
    c.put(p.x, p.y, p.rgba.slice(0, 3), p.rgba[3]);
  }
  return c;
}

async function build(srcFile, outFile) {
  const src = await readRaw(srcFile);
  const out = Buffer.alloc(W * H * 4);
  let n = 0;
  for (let fy = 0; fy < H; fy += FR) for (let fx = 0; fx < W; fx += FR) {
    const c = axeFrame(src, fx, fy);
    if (!c) continue;
    n++;
    for (let y = 0; y < FR; y++) Buffer.from(c.px.buffer, y * FR * 4, FR * 4).copy(out, ((fy + y) * W + fx) * 4);
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(outFile);
  console.log(`wrote ${outFile} (${n} frames)`);
}

await build(`${LPC}weapon_dagger.png`, `${LPC}weapon_axe.png`);
await build(`${LPC}weapon_dagger_behind.png`, `${LPC}weapon_axe_behind.png`);
