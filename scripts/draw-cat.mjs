#!/usr/bin/env node
// Procedurally drawn orange tabby cat spritesheet, in the same format as
// the duck / rabbit / LPC chicken: 32×32 frames, 4 columns, rows =
// directions up / left / down / right. Block 0 (rows 0–3) = walk (a
// diagonal-gait stroll with a swaying tail), block 1 (rows 4–7) = groom
// (sits down and licks a raised paw). Cats don't graze, so the registry
// maps the server's "graze" rest state to "groom".
//
//   node scripts/draw-cat.mjs             → public/assets/animals/cat.png

import { blank, block, ellipse, outline as trace, put, rect, shiftX, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [48, 30, 24],
  fur: [232, 150, 86],
  furHi: [248, 190, 128],
  furLo: [192, 110, 60],
  stripe: [170, 90, 46],
  white: [246, 238, 226],
  earIn: [226, 150, 146],
  eye: [104, 160, 60],
  pupil: [22, 22, 20],
  nose: [214, 116, 124],
};
const outline = (fr) => trace(fr, C.outline);

/** Thick polyline through `pts` (used for the tail). */
function line(fr, pts, c, w = 2) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n;
      const y = y0 + ((y1 - y0) * s) / n;
      rect(fr, Math.round(x - (w - 1) / 2), Math.round(y - (w - 1) / 2), w, w, c);
    }
  }
}

/** Pointy ear: 3 rows tall, `dir` -1 leans left, 1 leans right. */
function ear(fr, x, y, dir, inner = true) {
  put(fr, x, y, C.fur);
  rect(fr, dir > 0 ? x - 1 : x, y + 1, 2, 1, C.fur);
  rect(fr, x - 1, y + 2, 3, 1, C.fur);
  if (inner) put(fr, x, y + 2, C.earIn);
}

// Walk: legs move in diagonal pairs; the tail tip sways.
const WALK = [0, 1, 2, 3].map((i) => ({ step: i, sway: [0, 1, 0, -1][i] }));
// Groom: sit → raise paw → lick → lick (head bobs).
const GROOM = [{ sit: true, paw: 0 }, { sit: true, paw: 1 }, { sit: true, paw: 2, lick: 0 }, { sit: true, paw: 2, lick: 1 }];

// ── Side view (facing left) ───────────────────────────────────────────
function side({ step = 0, sway = 0, sit = false, paw = 0, lick = 0 }) {
  const fr = blank();
  if (!sit) {
    const by = 20;
    // tail: rises from the rump in a gentle S, tip sways
    line(fr, [[23, by - 1], [26, by - 4], [26 + sway, by - 8], [25 + sway, by - 10]], C.fur);
    put(fr, 25 + sway, by - 10, C.stripe);
    // legs: front and back pairs, diagonal gait
    const off = [[0, 1], [1, 0], [0, 1], [1, 0]][step];
    const legs = [[11, off[0]], [13, off[1]], [20, off[1]], [22, off[0]]];
    for (const [lx, up] of legs) {
      rect(fr, lx, by + 2, 2, 5 - up, C.furLo);
      rect(fr, lx, by + 6 - up, 2, 1, C.white);
    }
    ellipse(fr, 17, by, 7.5, 3.6, C.fur, C.furLo);
    for (const sx of [15, 18, 21]) rect(fr, sx, by - 3, 1, 3, C.stripe);
    put(fr, 17, by - 3, C.furHi);
    // head
    const hx = 9, hy = by - 4;
    ear(fr, hx - 1, hy - 5, -1);
    ear(fr, hx + 2, hy - 5, 1, false);
    ellipse(fr, hx, hy, 3.3, 3, C.fur);
    put(fr, hx, hy - 2, C.stripe);
    put(fr, hx - 1, hy - 1, C.eye);
    rect(fr, hx - 3, hy + 1, 2, 1, C.white); // muzzle
    put(fr, hx - 3, hy, C.nose);
  } else {
    // sitting upright, tail wrapped along the ground
    line(fr, [[21, 27], [25, 27], [26, 25]], C.fur);
    ellipse(fr, 18, 21, 4.8, 6, C.fur, C.furLo); // haunch + back
    rect(fr, 13, 26, 5, 2, C.white); // front paws / chest
    ellipse(fr, 15, 20, 2.2, 4, C.white); // chest
    for (const sy of [17, 20, 23]) rect(fr, 20, sy, 2, 1, C.stripe);
    const hx = 14 - (paw === 2 ? 1 : 0);
    const hy = 12 + (paw === 2 ? 1 + lick : 0);
    ear(fr, hx - 1, hy - 5, -1);
    ear(fr, hx + 2, hy - 5, 1, false);
    ellipse(fr, hx, hy, 3.3, 3, C.fur);
    put(fr, hx, hy - 2, C.stripe);
    put(fr, hx - 1, hy - 1, paw === 2 ? C.furLo : C.eye); // eyes shut while licking
    rect(fr, hx - 3, hy + 1, 2, 1, C.white);
    put(fr, hx - 3, hy, C.nose);
    if (paw >= 1) {
      // raised front paw up to the mouth
      const py = paw === 1 ? 19 : 16 + lick;
      rect(fr, 11, py, 2, 4, C.fur);
      rect(fr, 11, py, 2, 1, C.white);
    }
  }
  return outline(shiftX(fr, 1));
}

// ── Front view (facing down, towards the camera) ──────────────────────
function front({ step = 0, sway = 0, sit = false, paw = 0, lick = 0 }) {
  const fr = blank();
  // tail tip peeking out beside the body
  line(fr, [[21, 24], [23, 20 + sway], [23, 17 + sway]], C.fur);
  const by = sit ? 21 : 22;
  const lift = sit ? [0, 0] : [[0, 1], [1, 0], [0, 1], [1, 0]][step];
  ellipse(fr, 16, by, sit ? 4.8 : 5, sit ? 6 : 5, C.fur, C.furLo);
  ellipse(fr, 16, by, 2.4, 3.5, C.white); // chest
  rect(fr, 13, 26 - lift[0], 2, 2, C.white); // front paws
  rect(fr, 17, 26 - lift[1], 2, 2, C.white);
  const hy = (sit ? 13 : 14) + (paw === 2 ? 1 + lick : 0);
  ear(fr, 13, hy - 5, -1);
  ear(fr, 19, hy - 5, 1);
  ellipse(fr, 16, hy, 3.8, 3.2, C.fur);
  rect(fr, 15, hy - 3, 1, 2, C.stripe);
  rect(fr, 17, hy - 3, 1, 2, C.stripe);
  const shut = paw === 2;
  put(fr, 14, hy - 1, shut ? C.furLo : C.eye);
  put(fr, 18, hy - 1, shut ? C.furLo : C.eye);
  rect(fr, 15, hy + 1, 3, 1, C.white);
  put(fr, 16, hy, C.nose);
  if (paw >= 1) {
    const py = paw === 1 ? 20 : hy + 2 - lick;
    rect(fr, 18, py, 2, 3, C.white);
  }
  return outline(fr);
}

// ── Back view (facing up, away from the camera) ───────────────────────
function back({ step = 0, sway = 0, sit = false, paw = 0, lick = 0 }) {
  const fr = blank();
  const by = sit ? 21 : 22;
  const lift = sit ? [0, 0] : [[0, 1], [1, 0], [0, 1], [1, 0]][step];
  rect(fr, 12, 26 - lift[0], 2, 2, C.furLo); // hind feet
  rect(fr, 18, 26 - lift[1], 2, 2, C.furLo);
  ellipse(fr, 16, by, sit ? 5.2 : 5, sit ? 6 : 5, C.fur, C.furLo);
  for (const sy of [by - 3, by, by + 3]) rect(fr, 14, sy, 5, 1, C.stripe);
  const hy = (sit ? 13 : 14) + (paw === 2 ? 1 + lick : 0);
  ear(fr, 13, hy - 5, -1, false);
  ear(fr, 19, hy - 5, 1, false);
  ellipse(fr, 16, hy, 3.8, 3.2, C.fur);
  rect(fr, 15, hy - 2, 3, 1, C.stripe);
  // tail: raised while walking, curled round the base when sitting
  if (sit) line(fr, [[12, 27], [16, 28], [21, 27]], C.fur);
  else {
    // curves out to the side so it reads against the body
    line(fr, [[18, by + 2], [21, by - 1], [22 + sway, by - 5], [21 + sway, by - 7]], C.fur);
    put(fr, 21 + sway, by - 7, C.stripe);
  }
  return outline(fr);
}

const views = { side, front, back };
await writeSheet("cat", [block(views, WALK), block(views, GROOM)]);
