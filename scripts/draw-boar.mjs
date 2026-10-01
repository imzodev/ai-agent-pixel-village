#!/usr/bin/env node
// Procedurally drawn Bramble Boar spritesheet (a tier-2 enemy), in the
// shared format: 32×32 frames, 4 columns, rows = directions up / left /
// down / right. A stocky bristly boar with pale tusks and bramble twigs
// tangled in its mane. Block 0 (rows 0–3) = trot, block 1 (rows 4–7) =
// idle (snout down, rooting, tail flick).
//
//   node scripts/draw-boar.mjs            → public/assets/animals/boar.png

import { blank, block, ellipse, line, outline as trace, poly, put, rect, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [34, 22, 16],
  fur: [122, 78, 50],
  furLo: [92, 56, 36],
  furHi: [150, 102, 66],
  mane: [66, 40, 26],
  snout: [196, 142, 120],
  nostril: [92, 50, 40],
  tusk: [240, 232, 210],
  eye: [24, 16, 12],
  hoof: [46, 32, 26],
  twig: [90, 118, 52],
};
const outline = (fr) => trace(fr, C.outline);

const TROT = [0, 1, 2, 3].map((i) => ({ step: i, bob: i % 2, root: 0, tail: i % 2 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ step: -1, bob: 0, root: [0, 1, 2, 1][i], tail: i === 2 ? 1 : 0 }));

/** Four short legs; `step` lifts the diagonal pairs in turn. */
function legs(fr, xs, base, step) {
  xs.forEach((x, i) => {
    const lift = step >= 0 && (i + step) % 2 === 0 ? 1 : 0;
    rect(fr, x, base - 5 - lift, 3, 5, i < 2 ? C.furLo : C.fur);
    rect(fr, x, base - lift, 3, 1, C.hoof);
  });
}

/** Bristly mane ridge along the back with a couple of bramble twigs. */
function mane(fr, x0, x1, y) {
  for (let x = x0; x <= x1; x++) put(fr, x, y - ((x % 2) ? 1 : 0), C.mane);
  put(fr, x0 + 3, y - 2, C.twig); put(fr, x0 + 4, y - 3, C.twig);
  put(fr, x1 - 3, y - 2, C.twig); put(fr, x1 - 2, y - 3, C.twig);
}

function side({ step, bob, root, tail }) {
  const fr = blank();
  const y = 18 - bob;
  legs(fr, [9, 12, 19, 22], 28, step);
  ellipse(fr, 16, y, 9, 6, C.fur, C.furLo); // body
  ellipse(fr, 18, y - 2, 5, 2, C.furHi);
  mane(fr, 9, 21, y - 6);
  // head (facing left), dipped while rooting
  const hy = y + 1 + root;
  ellipse(fr, 7, hy, 4.5, 4, C.fur, C.furLo);
  rect(fr, 1, hy, 4, 3, C.snout);
  put(fr, 1, hy + 1, C.nostril);
  put(fr, 3, hy - 1, C.tusk); put(fr, 3, hy - 2, C.tusk); // tusk
  put(fr, 7, hy - 2, C.eye);
  poly(fr, [[8, hy - 4], [10, hy - 7], [11, hy - 3]], C.furLo); // ear
  // tail
  line(fr, [[25, y - 2], [27, y - 4 + tail]], C.mane, 1);
  return outline(fr);
}

function front({ step, bob, root }, face) {
  const fr = blank();
  const y = 17 - bob;
  legs(fr, [10, 13, 16, 19], 28, step);
  ellipse(fr, 16, y, 8, 7, C.fur, C.furLo);
  mane(fr, 11, 21, y - 7);
  poly(fr, [[9, y - 5], [8, y - 10], [12, y - 7]], C.furLo); // ears
  poly(fr, [[23, y - 5], [24, y - 10], [20, y - 7]], C.furLo);
  if (face) {
    const sy = y + 2 + root;
    put(fr, 13, y - 2, C.eye); put(fr, 19, y - 2, C.eye);
    rect(fr, 13, sy, 7, 4, C.snout);
    put(fr, 14, sy + 1, C.nostril); put(fr, 18, sy + 1, C.nostril);
    put(fr, 12, sy + 2, C.tusk); put(fr, 12, sy + 1, C.tusk); // tusks curl up
    put(fr, 20, sy + 2, C.tusk); put(fr, 20, sy + 1, C.tusk);
  } else {
    ellipse(fr, 16, y - 1, 4, 3, C.furHi); // rump
    put(fr, 16, y + 4, C.mane); put(fr, 16, y + 5, C.mane); // tail
  }
  return outline(fr);
}

const views = {
  side,
  front: (f) => front(f, true),
  back: (f) => front(f, false),
};
await writeSheet("boar", [block(views, TROT), block(views, IDLE)]);
