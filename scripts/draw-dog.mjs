#!/usr/bin/env node
// Procedurally drawn brown dog spritesheet, in the same format as the
// other animals: 32×32 frames, 4 columns, rows = directions up / left /
// down / right. Block 0 (rows 0–3) = walk (diagonal-gait trot, tail
// wagging), block 1 (rows 4–7) = sit (sits, pants with its tongue out,
// wags its tail on the ground). Dogs don't graze, so the registry maps
// the server's "graze" rest state to "sit".
//
//   node scripts/draw-dog.mjs             → public/assets/animals/dog.png

import { blank, block, ellipse, line, outline as trace, put, rect, shiftX, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [42, 28, 20],
  fur: [166, 106, 52],
  furHi: [198, 140, 78],
  furLo: [126, 78, 38],
  ear: [98, 60, 30],
  tan: [228, 192, 142],
  collar: [204, 58, 58],
  tag: [242, 202, 72],
  nose: [30, 24, 22],
  tongue: [230, 112, 122],
  eye: [24, 18, 16],
};
const outline = (fr) => trace(fr, C.outline);

// Walk: legs in diagonal pairs, tail wagging side to side.
const WALK = [0, 1, 2, 3].map((i) => ({ step: i, wag: [0, 1, 0, -1][i] }));
// Sit: tongue out on alternate frames (panting), tail sweeping the ground.
const SIT = [0, 1, 2, 3].map((i) => ({ sit: true, pant: i % 2, wag: [0, 1, 0, -1][i] }));

// ── Side view (facing left) ───────────────────────────────────────────
function side({ step = 0, wag = 0, sit = false, pant = 0 }) {
  const fr = blank();
  let hx, hy;
  if (!sit) {
    const by = 19;
    // tail: up and slightly back, wagging
    line(fr, [[23, by - 1], [24 + wag, by - 5], [25 + wag, by - 7]], C.fur);
    const off = [[0, 1], [1, 0], [0, 1], [1, 0]][step];
    for (const [lx, up] of [[11, off[0]], [13, off[1]], [20, off[1]], [22, off[0]]]) {
      rect(fr, lx, by + 2, 2, 6 - up, C.furLo);
      rect(fr, lx, by + 7 - up, 2, 1, C.tan); // paws
    }
    ellipse(fr, 17, by, 7.5, 3.8, C.fur, C.furLo);
    put(fr, 17, by - 3, C.furHi);
    put(fr, 19, by - 3, C.furHi);
    ellipse(fr, 11.5, by + 1, 2, 2.6, C.tan); // chest
    ellipse(fr, 10.5, by - 3, 2.2, 3, C.fur); // neck
    rect(fr, 11, by - 4, 1, 3, C.collar);
    put(fr, 11, by - 1, C.tag);
    hx = 8; hy = by - 6;
  } else {
    // sitting: haunch on the ground, front legs straight, tail sweeping
    line(fr, [[21, 27], [24, 27 - (wag > 0 ? 1 : 0)], [25, 26 + wag]], C.fur);
    ellipse(fr, 19, 22, 5, 5, C.fur, C.furLo); // haunch
    rect(fr, 16, 26, 5, 2, C.furLo); // hind foot
    rect(fr, 13, 18, 2, 9, C.furLo); // front legs
    rect(fr, 13, 27, 2, 1, C.tan);
    ellipse(fr, 14.5, 18.5, 3, 4, C.fur); // chest / shoulders
    ellipse(fr, 13.5, 19, 1.8, 3, C.tan);
    rect(fr, 14, 13, 1, 3, C.collar);
    put(fr, 14, 16, C.tag);
    hx = 11; hy = 10;
  }
  // head with a longer snout, floppy ear and a black nose
  ellipse(fr, hx, hy, 3.3, 3, C.fur);
  put(fr, hx, hy - 2, C.furHi);
  rect(fr, hx - 5, hy, 3, 2, C.tan); // snout
  put(fr, hx - 5, hy, C.nose);
  put(fr, hx - 1, hy - 1, C.eye);
  if (sit && pant) {
    put(fr, hx - 4, hy + 2, C.tongue);
    put(fr, hx - 3, hy + 2, C.tongue);
  }
  ellipse(fr, hx + 1.5, hy + 1, 1.3, 2.6, C.ear); // floppy ear
  return outline(shiftX(fr, 1));
}

// ── Front view (facing down, towards the camera) ──────────────────────
function front({ step = 0, wag = 0, sit = false, pant = 0 }) {
  const fr = blank();
  // tail tip wagging beside the body
  if (sit) line(fr, [[20, 27], [23 + wag, 26]], C.fur);
  else line(fr, [[20, 21], [22 + wag, 17]], C.fur);
  const by = sit ? 21 : 22;
  const lift = sit ? [0, 0] : [[0, 1], [1, 0], [0, 1], [1, 0]][step];
  ellipse(fr, 16, by, 5.2, sit ? 6 : 5, C.fur, C.furLo);
  ellipse(fr, 16, by, 2.4, 3.6, C.tan); // chest
  rect(fr, 13, 26 - lift[0], 2, 2, C.tan); // front paws
  rect(fr, 17, 26 - lift[1], 2, 2, C.tan);
  const hy = sit ? 12 : 14;
  rect(fr, 13, hy + 3, 7, 1, C.collar);
  put(fr, 16, hy + 4, C.tag);
  ellipse(fr, 16, hy, 3.8, 3.3, C.fur);
  put(fr, 15, hy - 2, C.furHi);
  ellipse(fr, 11.6, hy + 1, 1.4, 3, C.ear); // floppy ears
  ellipse(fr, 20.4, hy + 1, 1.4, 3, C.ear);
  put(fr, 14, hy - 1, C.eye);
  put(fr, 18, hy - 1, C.eye);
  rect(fr, 14, hy + 1, 5, 2, C.tan); // muzzle
  rect(fr, 15, hy + 1, 2, 1, C.nose);
  if (sit && pant) rect(fr, 15, hy + 3, 2, 1, C.tongue);
  return outline(fr);
}

// ── Back view (facing up, away from the camera) ───────────────────────
function back({ step = 0, wag = 0, sit = false }) {
  const fr = blank();
  const by = sit ? 21 : 22;
  const lift = sit ? [0, 0] : [[0, 1], [1, 0], [0, 1], [1, 0]][step];
  rect(fr, 12, 26 - lift[0], 2, 2, C.furLo); // hind feet
  rect(fr, 18, 26 - lift[1], 2, 2, C.furLo);
  ellipse(fr, 16, by, 5.2, sit ? 6 : 5, C.fur, C.furLo);
  put(fr, 15, by - 3, C.furHi);
  put(fr, 17, by - 3, C.furHi);
  const hy = sit ? 12 : 14;
  ellipse(fr, 16, hy, 3.8, 3.3, C.fur);
  ellipse(fr, 11.6, hy + 1, 1.4, 3, C.ear);
  ellipse(fr, 20.4, hy + 1, 1.4, 3, C.ear);
  put(fr, 16, hy - 2, C.furHi);
  rect(fr, 14, hy + 4, 5, 1, C.collar); // collar on the neck, below the head
  // tail: raised and wagging while walking, sweeping the ground when sitting
  if (sit) line(fr, [[16, 27], [19 + wag, 28], [22 + wag, 27]], C.fur);
  else line(fr, [[19, by], [22, by - 3], [23 + wag, by - 6]], C.fur); // curves out so it reads
  return outline(fr);
}

const views = { side, front, back };
await writeSheet("dog", [block(views, WALK), block(views, SIT)]);
