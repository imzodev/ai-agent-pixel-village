#!/usr/bin/env node
// Procedurally drawn cottontail rabbit spritesheet, in the same format as
// the duck / LPC chicken: 32×32 frames, 4 columns, rows = directions
// up / left / down / right. Block 0 (rows 0–3) = walk (a hop cycle),
// block 1 (rows 4–7) = eat (head down, nibbling the grass).
//
//   node scripts/draw-rabbit.mjs          → public/assets/animals/rabbit.png

import { blank, block, ellipse, outline as trace, put, rect, shiftX, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [44, 32, 26],
  fur: [168, 124, 86],
  furHi: [204, 164, 120],
  furLo: [128, 92, 62],
  earIn: [224, 152, 150],
  white: [238, 232, 222],
  nose: [214, 120, 128],
  eye: [22, 18, 18],
};
const outline = (fr) => trace(fr, C.outline);

// Hop cycle: crouch → push off → airborne → land.
//   lift  = how far the whole rabbit rises
//   reach = front paws / body stretched forward
const HOP = [
  { lift: 0, reach: 0 },
  { lift: 2, reach: 1 },
  { lift: 3, reach: 2 },
  { lift: 1, reach: 0 },
];
// Nibble: head lowers to the grass, then chews (nose twitch).
const NIBBLE = [{ dip: 0 }, { dip: 2 }, { dip: 3, chew: 0 }, { dip: 3, chew: 1 }];

// ── Side view (facing left) ───────────────────────────────────────────
function side({ lift = 0, reach = 0, dip = 0, chew = 0 }) {
  const fr = blank();
  const by = 22 - lift; // body centre y
  // long hind foot flat on the ground (tucked while airborne)
  if (lift < 3) rect(fr, 17, 27 - lift, 6, 1, C.furLo);
  else rect(fr, 19, 25 - lift, 4, 1, C.furLo);
  // rounded haunch + body, darker underside
  ellipse(fr, 21, by, 5, 4.6, C.fur, C.furLo);
  ellipse(fr, 16.5 - reach * 0.5, by + 0.5, 5.5 + reach * 0.5, 3.8, C.fur, C.furLo);
  put(fr, 20, by - 3, C.furHi);
  put(fr, 18, by - 3, C.furHi);
  // white cotton tail
  ellipse(fr, 26, by - 1, 1.6, 1.6, C.white);
  // front paws (reach forward mid-hop)
  const px = 12 - reach;
  rect(fr, px, 26 - lift, 2, 1 + (lift ? 0 : 1), C.furLo);
  // head: lowers and tilts forward while eating
  const hx = 10.5 - [0, 1.5, 3, 3][dip];
  const hy = by - 5 + [0, 3, 7, 7][dip];
  ellipse(fr, hx, hy, 3.4, 2.9, C.fur);
  put(fr, hx, hy - 2, C.furHi);
  put(fr, hx + 1, hy - 2, C.furHi);
  put(fr, hx - 1, hy - 1, C.eye);
  put(fr, hx - 3 + (chew ? 1 : 0), hy + 1, C.nose);
  put(fr, hx - 1, hy + 2, C.white); // muzzle
  // ears: long, swept back; flatten along the back while eating
  if (dip < 2) {
    ellipse(fr, hx + 2.5, hy - 5, 1.2, 3.4, C.furLo); // far ear
    ellipse(fr, hx + 1.2, hy - 5.2, 1.3, 3.6, C.fur); // near ear
    put(fr, hx + 1, hy - 6, C.earIn);
    put(fr, hx + 1, hy - 5, C.earIn);
  } else {
    ellipse(fr, hx + 4.5, hy - 2.5, 3.4, 1.1, C.furLo);
    ellipse(fr, hx + 4, hy - 3, 3.6, 1.2, C.fur);
    put(fr, hx + 4, hy - 3, C.earIn);
  }
  return outline(shiftX(fr, 2));
}

// ── Front view (facing down, towards the camera) ──────────────────────
function front({ lift = 0, reach = 0, dip = 0, chew = 0 }) {
  const fr = blank();
  const by = 22 - lift;
  // hind feet at the sides, front paws in the middle
  rect(fr, 11, 27 - lift, 3, 1, C.furLo);
  rect(fr, 18, 27 - lift, 3, 1, C.furLo);
  ellipse(fr, 16, by, 5.5, 5, C.fur, C.furLo);
  ellipse(fr, 16, by + 1, 2.5, 3, C.white); // white chest / belly
  rect(fr, 14, 27 - lift - reach, 1, 1, C.furLo);
  rect(fr, 17, 27 - lift - reach, 1, 1, C.furLo);
  const hy = by - 7 + [0, 2, 4, 4][dip];
  // ears first so the head overlaps their base
  const earLen = dip >= 2 ? 2.2 : 3.4;
  const earY = hy - 3 - earLen;
  ellipse(fr, 14.4, earY, 1.2, earLen, C.fur);
  ellipse(fr, 17.6, earY, 1.2, earLen, C.fur);
  put(fr, 14.4, earY, C.earIn);
  put(fr, 17.6, earY, C.earIn);
  if (earLen > 3) { put(fr, 14.4, earY - 1, C.earIn); put(fr, 17.6, earY - 1, C.earIn); }
  ellipse(fr, 16, hy, 3.5, 3, C.fur);
  put(fr, 15, hy - 2, C.furHi);
  put(fr, 14, hy - 1, C.eye);
  put(fr, 18, hy - 1, C.eye);
  rect(fr, 15, hy + 1, 3, 1, C.white); // muzzle
  put(fr, 16, hy + (chew ? 2 : 1), C.nose);
  return outline(fr);
}

// ── Back view (facing up, away from the camera) ───────────────────────
function back({ lift = 0, dip = 0 }) {
  const fr = blank();
  const by = 22 - lift;
  rect(fr, 11, 27 - lift, 3, 1, C.furLo);
  rect(fr, 18, 27 - lift, 3, 1, C.furLo);
  const hy = by - 7 + [0, 2, 4, 4][dip];
  const earLen = dip >= 2 ? 2.2 : 3.4;
  const drawHead = () => {
    ellipse(fr, 14.4, hy - 3 - earLen, 1.2, earLen, C.fur); // backs of the ears
    ellipse(fr, 17.6, hy - 3 - earLen, 1.2, earLen, C.fur);
    ellipse(fr, 16, hy, 3.5, 3, C.fur);
    put(fr, 16, hy - 2, C.furHi);
  };
  if (dip >= 2) drawHead(); // lowered head disappears behind the body
  ellipse(fr, 16, by, 5.5, 5, C.fur, C.furLo);
  put(fr, 14, by - 3, C.furHi);
  put(fr, 18, by - 3, C.furHi);
  ellipse(fr, 16, by + 3.5, 1.9, 1.7, C.white); // cotton tail
  if (dip < 2) drawHead();
  return outline(fr);
}

const views = { side, front, back };
await writeSheet("rabbit", [block(views, HOP), block(views, NIBBLE)]);
