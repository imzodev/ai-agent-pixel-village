#!/usr/bin/env node
// Procedurally drawn slime spritesheet (an enemy), in the shared format:
// 32×32 frames, 4 columns, rows = directions up / left / down / right.
// Block 0 (rows 0–3) = hop (squash → stretch → airborne → land), block 1
// (rows 4–7) = idle jiggle. A translucent jelly dome with a shine, eyes on
// the facing side, and a ground shadow while it's in the air.
//
//   node scripts/draw-slime.mjs           → public/assets/animals/slime.png

import { blank, block, outline as trace, put, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [22, 54, 32],
  body: [108, 207, 122],
  bodyLo: [72, 164, 94],
  deep: [50, 124, 70],
  core: [150, 226, 150],
  shine: [236, 252, 232],
  eye: [26, 48, 30],
  eyeHi: [250, 252, 248],
};
const outline = (fr) => trace(fr, C.outline);
const GROUND = 27; // resting base line

// Body shape per frame: half-width rx, height ry, lift off the ground.
const HOP = [
  { rx: 10.5, ry: 7, lift: 0 }, // squash (gather)
  { rx: 7.5, ry: 11, lift: 1 }, // stretch (push off)
  { rx: 8.5, ry: 9.5, lift: 4 }, // airborne
  { rx: 11, ry: 6.5, lift: 0 }, // land (splat)
];
const IDLE = [
  { rx: 9.5, ry: 8.5, lift: 0 },
  { rx: 10, ry: 8, lift: 0 },
  { rx: 9.5, ry: 8.5, lift: 0 },
  { rx: 9, ry: 9, lift: 0 },
];

/** A jelly dome: the top half of an ellipse standing on its base line. */
function dome(fr, cx, base, rx, ry) {
  for (let y = Math.floor(base - ry); y <= base; y++) {
    // Skip a 1–2 px crown row: outlined, it reads as a nub on top.
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y - base) / ry) ** 2));
    if (half < 1.5) continue;
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - base) / ry) ** 2;
      if (d > 1) continue;
      let c = C.body;
      if (y >= base - 1) c = C.deep; // underside
      else if (y >= base - ry * 0.35) c = C.bodyLo;
      else if (d < 0.35 && y > base - ry * 0.8) c = C.core; // lighter jelly inside
      put(fr, x, y, c);
    }
  }
  // shine: a little glint high on the dome
  const sx = Math.round(cx - rx * 0.45), sy = Math.round(base - ry * 0.72);
  put(fr, sx, sy, C.shine); put(fr, sx + 1, sy, C.shine); put(fr, sx, sy + 1, C.shine);
}

/** 2×3 eye with a glint. */
function eye(fr, x, y) {
  for (let j = 0; j < 3; j++) { put(fr, x, y + j, C.eye); put(fr, x + 1, y + j, C.eye); }
  put(fr, x, y, C.eyeHi);
}

function shadow(fr, { rx, lift }) {
  if (lift <= 0) return;
  const w = Math.round(rx) - 1;
  for (let x = -w; x <= w; x++) put(fr, 16 + x, GROUND + 1, [0, 0, 0, Math.abs(x) >= w - 1 ? 40 : 70]);
}

function draw(f, face) {
  const fr = blank();
  const base = GROUND - f.lift;
  dome(fr, 16, base, f.rx, f.ry);
  const ey = Math.round(base - f.ry * 0.6);
  if (face === "front") {
    eye(fr, 12, ey); eye(fr, 18, ey);
    put(fr, 15, ey + 4, C.eye); put(fr, 16, ey + 4, C.eye); put(fr, 14, ey + 3, C.eye); put(fr, 17, ey + 3, C.eye); // smile
  }
  if (face === "side") {
    const ex = Math.round(16 - f.rx * 0.6);
    eye(fr, ex, ey);
    put(fr, ex - 1, ey + 4, C.eye); put(fr, ex, ey + 4, C.eye); // smile
  }
  const out = outline(fr);
  shadow(out, f);
  return out;
}

const views = {
  side: (f) => draw(f, "side"),
  front: (f) => draw(f, "front"),
  back: (f) => draw(f, "back"),
};
await writeSheet("slime", [block(views, HOP), block(views, IDLE)]);
