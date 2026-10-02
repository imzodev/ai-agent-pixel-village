#!/usr/bin/env node
// The Old Rootking (world boss): an original 64×64 sheet in the animal
// registry format — 4 columns, rows up / left / down / right. The boss
// stands its ground, so every row is the same front view: a huge gnarled
// stump with a mossy, leafy crown, glowing amber eyes and root arms, in a
// 4-frame idle (crown sways, arms creak, eyes pulse).
//
//   node scripts/draw-rootking.mjs        → public/assets/animals/rootking.png

import sharp from "sharp";
import { Canvas, rand } from "./canvas-art.mjs";

const FR = 64;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x1e1610),
  bark: hex(0x6e4a2e), barkDk: hex(0x4e3220), barkLt: hex(0x8e6440),
  moss: hex(0x4f8a3a), mossDk: hex(0x34622a), leaf: hex(0x6fae4a), leafLt: hex(0x96cf68),
  eye: hex(0xffc84a), eyeHi: hex(0xfff2b0), maw: hex(0x2a1a10),
  shadow: hex(0x000000),
};

function frame(i) {
  const c = new Canvas(FR, FR);
  const sway = [0, 1, 0, -1][i];
  const creak = [0, 1, 2, 1][i];
  // Root tendrils spreading on the ground.
  for (const [dx, len] of [[-18, 9], [-10, 6], [10, 6], [18, 9]]) {
    const sx = 32 + dx * 0.5, dir = Math.sign(dx);
    c.poly([[sx - 2, 56], [sx + 2, 56], [sx + dir * len + dir, 61], [sx + dir * len - dir, 61]], P.barkDk);
  }
  // Trunk body: wide at the base, narrowing up.
  c.poly([[14, 60], [50, 60], [46, 26], [18, 26]], P.bark);
  for (let y = 26; y < 60; y++) {
    for (let x = 14; x < 51; x++) {
      if (!c.alpha(x, y)) continue;
      const r = rand(x, y);
      if ((x + (y >> 2)) % 7 === 0) c.put(x, y, P.barkDk); // bark grooves
      else if (r < 0.05) c.put(x, y, P.barkLt);
    }
  }
  c.vline(18, 26, 59, P.barkLt);
  // Root arms, creaking up and down.
  c.poly([[16, 34], [6, 40 - creak], [4, 46 - creak], [8, 46 - creak], [17, 41]], P.barkDk);
  c.poly([[48, 34], [58, 40 - (2 - creak)], [60, 46 - (2 - creak)], [56, 46 - (2 - creak)], [47, 41]], P.barkDk);
  // Face: glowing eyes (pulse) and a jagged maw.
  const glow = i % 2 ? P.eyeHi : P.eye;
  c.ellipse(25, 38, 3.5, 2.5, P.ink); c.ellipse(25, 38, 2.5, 1.6, glow);
  c.ellipse(39, 38, 3.5, 2.5, P.ink); c.ellipse(39, 38, 2.5, 1.6, glow);
  c.poly([[24, 46], [40, 46], [37, 52], [34, 49], [32, 53], [30, 49], [27, 52]], P.maw);
  // Mossy, leafy crown, swaying.
  c.ellipse(32 + sway, 22, 20, 11, P.mossDk);
  c.ellipse(31 + sway, 20, 18, 9, P.moss);
  for (let k = 0; k < 14; k++) {
    const x = 16 + Math.floor(rand(k, 3) * 32) + sway, y = 12 + Math.floor(rand(3, k) * 14);
    c.ellipse(x, y, 3, 2.5, rand(k, k) < 0.5 ? P.leaf : P.leafLt);
  }
  // Moss dripping over the brow.
  for (const x of [20, 26, 33, 40, 45]) c.vline(x + sway, 28, 30 + (x % 3), P.mossDk);
  c.outline(P.ink);
  // Ground shadow (after outline so it isn't outlined).
  for (let x = -22; x <= 22; x++) c.put(32 + x, 62, P.shadow, Math.abs(x) > 18 ? 35 : 70);
  return c;
}

const frames = [0, 1, 2, 3].map(frame);
const W = FR * 4, H = FR * 4; // 4 identical direction rows
const out = Buffer.alloc(W * H * 4);
for (let row = 0; row < 4; row++) {
  frames.forEach((f, col) => {
    for (let y = 0; y < FR; y++) Buffer.from(f.px.buffer, y * FR * 4, FR * 4).copy(out, ((row * FR + y) * W + col * FR) * 4);
  });
}
const file = "public/assets/animals/rootking.png";
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
console.log(`wrote ${file} (${W}×${H})`);
