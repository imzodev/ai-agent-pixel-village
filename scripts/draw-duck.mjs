#!/usr/bin/env node
// Procedurally drawn mallard duck spritesheet, in the same format as the
// LPC chicken (public/assets/animals/chicken.png):
//
//   32×32 frames, 4 columns (animation frames), rows = directions
//   up / left / down / right. Block 0 (rows 0–3) = walk (waddle),
//   block 1 (rows 4–7) = eat (dabble: head down to the ground and back).
//
//   node scripts/draw-duck.mjs            → public/assets/animals/duck.png
//
// Each frame is painted from simple shapes (ellipses, rects), then a dark
// outline is traced around the silhouette like the LPC art. The right-
// facing rows are mirrors of the left-facing ones.

import { blank, block, ellipse, outline as trace, put, rect, shiftX, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [38, 32, 30],
  head: [52, 120, 66],
  headHi: [88, 162, 100],
  headLo: [32, 82, 44],
  ring: [236, 232, 224],
  chest: [134, 80, 52],
  chestLo: [106, 60, 40],
  body: [200, 194, 186],
  bodyLo: [162, 156, 148],
  wing: [142, 126, 110],
  wingLo: [112, 98, 86],
  spec: [66, 96, 176],
  tail: [66, 60, 56],
  tailHi: [236, 232, 224],
  bill: [236, 180, 60],
  billLo: [196, 140, 40],
  foot: [232, 140, 52],
  eye: [20, 20, 22],
};

const outline = (fr) => trace(fr, C.outline);

// ── Side view (facing left) ───────────────────────────────────────────
// `bob` lifts the body 1px mid-stride; `step` 0..3 places the feet;
// `dip` 0..3 lowers the head for dabbling.
function side({ bob = 0, step = 0, dip = 0 }) {
  const fr = blank();
  const by = 20 - bob; // body centre y
  // feet (drawn first so the body overlaps their tops)
  const fx = [[13, 16], [12, 17], [13, 16], [14, 15]][step];
  const lift = [[0, 0], [1, 0], [0, 0], [0, 1]][step];
  rect(fr, fx[0] - 1, 27 - lift[0], 3, 1, C.foot);
  rect(fr, fx[0], 25 - lift[0], 1, 2, C.foot);
  rect(fr, fx[1] - 1, 27 - lift[1], 3, 1, C.foot);
  rect(fr, fx[1], 25 - lift[1], 1, 2, C.foot);
  // tail: short, slightly raised (raised more while dabbling)
  const tUp = dip >= 2 ? 2 : 0;
  rect(fr, 24, by - 3 - tUp, 3, 2, C.tail);
  put(fr, 26, by - 4 - tUp, C.tailHi);
  // body: low horizontal ellipse, darker belly
  ellipse(fr, 17, by, 8, 5, C.body, C.bodyLo);
  // wing with blue speculum
  ellipse(fr, 18.5, by - 1, 5.5, 2.6, C.wing, C.wingLo);
  rect(fr, 15, by + 1, 3, 1, C.spec);
  // chest
  ellipse(fr, 11, by + 0.5, 2.6, 3.4, C.chest, C.chestLo);
  // neck + head: moves forward/down with `dip`
  const hx = 8 - [0, 2, 3, 2][dip]; // last frame: nibble back 1px
  const hy = by - 8 + [0, 5, 10, 10][dip];
  const nx = (hx + 11) / 2;
  const ny = (hy + by - 2) / 2;
  ellipse(fr, nx, ny, 1.6, 2.4, C.head);
  put(fr, Math.round(nx) + 1, Math.round(ny) + 2, C.ring); // white collar
  put(fr, Math.round(nx), Math.round(ny) + 2, C.ring);
  ellipse(fr, hx, hy, 3.2, 2.8, C.head);
  put(fr, hx - 1, hy - 2, C.headHi);
  put(fr, hx, hy - 2, C.headHi);
  put(fr, hx + 1, hy + 2, C.headLo);
  put(fr, hx - 1, hy - 1, C.eye);
  // flat, wide bill
  const bx = hx - 3;
  rect(fr, bx - 3, hy, 3, 1, C.bill);
  rect(fr, bx - 2, hy + 1, 2, 1, C.billLo);
  // Centre the art: the dabbling bill reaches x≈0 otherwise.
  return outline(shiftX(fr, 2));
}

// ── Front view (facing down, towards the camera) ──────────────────────
function front({ bob = 0, step = 0, dip = 0 }) {
  const fr = blank();
  const by = 20 - bob;
  const lift = [[0, 0], [1, 0], [0, 0], [0, 1]][step];
  rect(fr, 12, 27 - lift[0], 3, 1, C.foot);
  rect(fr, 13, 25 - lift[0], 1, 2, C.foot);
  rect(fr, 17, 27 - lift[1], 3, 1, C.foot);
  rect(fr, 18, 25 - lift[1], 1, 2, C.foot);
  ellipse(fr, 16, by, 6.5, 5.5, C.body, C.bodyLo);
  ellipse(fr, 10.5, by, 1.6, 3.5, C.wing, C.wingLo);
  ellipse(fr, 21.5, by, 1.6, 3.5, C.wing, C.wingLo);
  ellipse(fr, 16, by - 1, 3.5, 3.5, C.chest, C.chestLo);
  const hy = by - 8 + [0, 3, 6, 6][dip];
  rect(fr, 14, hy + 3, 4, 1, C.ring);
  ellipse(fr, 16, hy, 3.3, 3.1, C.head);
  put(fr, 15, hy - 2, C.headHi);
  put(fr, 16, hy - 2, C.headHi);
  put(fr, 14, hy - 1, C.eye);
  put(fr, 18, hy - 1, C.eye);
  const bdy = dip === 3 ? 1 : 0;
  rect(fr, 14, hy + 1 + bdy, 4, 1, C.bill);
  rect(fr, 14, hy + 2 + bdy, 4, 1, C.billLo);
  return outline(fr);
}

// ── Back view (facing up, away from the camera) ───────────────────────
function back({ bob = 0, step = 0, dip = 0 }) {
  const fr = blank();
  const by = 20 - bob;
  const lift = [[0, 0], [1, 0], [0, 0], [0, 1]][step];
  rect(fr, 12, 27 - lift[0], 3, 1, C.foot);
  rect(fr, 17, 27 - lift[1], 3, 1, C.foot);
  // head first when dabbling: it dips behind the body
  const hy = by - 8 + [0, 3, 5, 5][dip];
  const drawHead = () => {
    ellipse(fr, 16, hy, 3.3, 3.1, C.head);
    put(fr, 15, hy - 2, C.headHi);
    rect(fr, 14, hy + 3, 4, 1, C.ring);
  };
  if (dip >= 2) drawHead();
  ellipse(fr, 16, by, 6.5, 5.5, C.body, C.bodyLo);
  ellipse(fr, 13, by, 3, 4, C.wing, C.wingLo);
  ellipse(fr, 19, by, 3, 4, C.wing, C.wingLo);
  rect(fr, 13, by + 1, 2, 1, C.spec);
  rect(fr, 18, by + 1, 2, 1, C.spec);
  const tUp = dip >= 2 ? 1 : 0;
  rect(fr, 15, by + 4 - tUp, 3, 2, C.tail);
  put(fr, 16, by + 3 - tUp, C.tailHi);
  if (dip < 2) drawHead();
  return outline(fr);
}

// Animation frames: walk = waddle (bob + alternating feet),
// eat = dabble (head down, nibble, stays down; the scene loops it).
const WALK = [0, 1, 2, 3].map((i) => ({ bob: i % 2, step: i }));
const EAT = [{ dip: 0 }, { dip: 1 }, { dip: 2 }, { dip: 3 }];

const views = { side, front, back };
await writeSheet("duck", [block(views, WALK), block(views, EAT)]);
