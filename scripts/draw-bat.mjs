#!/usr/bin/env node
// Procedurally drawn bat spritesheet (an enemy), in the same format as the
// other animals: 32×32 frames, 4 columns, rows = directions up / left /
// down / right. One block: a wing-flap cycle (up → mid → down → mid) with
// the body bobbing on the beat. The registry plays it fast while flying
// and slower while hovering, so a bat never freezes in mid-air. A soft
// translucent shadow on the ground sells that it's airborne.
//
//   node scripts/draw-bat.mjs             → public/assets/animals/bat.png

import { blank, block, ellipse, outline as trace, poly, put, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [24, 18, 32],
  body: [58, 44, 80],
  bodyHi: [86, 66, 116],
  wing: [110, 76, 142],
  wingLo: [84, 56, 110],
  bone: [48, 34, 66],
  earIn: [206, 124, 154],
  eye: [248, 225, 108],
  fang: [246, 244, 236],
  shadow: [0, 0, 0, 70],
};
const outline = (fr) => trace(fr, C.outline);

// Flap cycle: wing pose and body bob per frame.
const FLAP = [
  { wing: "up", bob: 1 },
  { wing: "mid", bob: 0 },
  { wing: "down", bob: -1 },
  { wing: "mid", bob: 0 },
];

/** Soft ground shadow, smaller when the bat is higher. Drawn after outline. */
function shadow(fr, bob) {
  const rx = 6 - Math.max(0, -bob);
  for (let x = -rx; x <= rx; x++) {
    const edge = Math.abs(x) >= rx - 1;
    put(fr, 16 + x, 28, [0, 0, 0, edge ? 40 : 70]);
    if (!edge) put(fr, 16 + x, 29, [0, 0, 0, 40]);
  }
}

/** One membrane wing: filled polygon + finger bones from the elbow. */
function wing(fr, s, e, t, p1, p2, h, fill, bones) {
  poly(fr, [s, e, t, p1, p2, h], fill);
  for (const [a, b] of [[s, e], [e, t], [e, p1], [e, p2]]) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    for (let i = 0; i <= n; i++) put(fr, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, bones);
  }
}

// Left-wing geometry (front/back views) per pose; the right wing mirrors it.
const FRONT_WING = {
  up:   { e: [8, 6],  t: [3, 3],  p1: [5, 10], p2: [9, 11] },
  mid:  { e: [7, 11], t: [3, 13], p1: [5, 17], p2: [8, 16] },
  down: { e: [8, 18], t: [4, 24], p1: [8, 22], p2: [10, 21] },
};

function frontOrBack({ wing: pose, bob }, face) {
  const fr = blank();
  const y = (v) => v + bob;
  const g = FRONT_WING[pose];
  for (const m of [1, -1]) { // left wing, then its mirror
    const X = (v) => (m === 1 ? v : 32 - v);
    wing(fr, [X(13), y(13)], [X(g.e[0]), y(g.e[1])], [X(g.t[0]), y(g.t[1])], [X(g.p1[0]), y(g.p1[1])], [X(g.p2[0]), y(g.p2[1])], [X(13), y(18)], face ? C.wing : C.wingLo, C.bone);
  }
  ellipse(fr, 16, y(15), 3.6, 4.6, C.body);
  // ears
  poly(fr, [[13, y(12)], [12, y(7)], [15, y(10)]], C.body);
  poly(fr, [[19, y(12)], [20, y(7)], [17, y(10)]], C.body);
  if (face) {
    ellipse(fr, 16, y(16.5), 2, 2.8, C.bodyHi); // belly
    put(fr, 13, y(10), C.earIn);
    put(fr, 19, y(10), C.earIn);
    put(fr, 14, y(14), C.eye);
    put(fr, 18, y(14), C.eye);
    put(fr, 15, y(18), C.fang);
    put(fr, 17, y(18), C.fang);
  } else {
    put(fr, 16, y(13), C.bodyHi); // back highlight
    put(fr, 16, y(14), C.bodyHi);
  }
  const out = outline(fr);
  shadow(out, bob);
  return out;
}

// Side view (facing left). Both wings are drawn behind the body — at this
// size the head, eye and belly must stay readable — the far one darker and
// offset so the pair reads as two wings.
const SIDE_WING = {
  up:   { e: [16, 7],  t: [20, 2],  p1: [21, 8],  p2: [19, 11] },
  mid:  { e: [19, 11], t: [25, 11], p1: [23, 15], p2: [20, 15] },
  down: { e: [16, 19], t: [19, 24], p1: [21, 20], p2: [19, 17] },
};

function side({ wing: pose, bob }) {
  const fr = blank();
  const y = (v) => v + bob;
  const g = SIDE_WING[pose];
  const W = (dx, dy, fill) => wing(fr, [14 + dx, y(13 + dy)], [g.e[0] + dx, y(g.e[1] + dy)], [g.t[0] + dx, y(g.t[1] + dy)], [g.p1[0] + dx, y(g.p1[1] + dy)], [g.p2[0] + dx, y(g.p2[1] + dy)], [17 + dx, y(15 + dy)], fill, C.bone);
  W(3, -1, C.wingLo); // far wing
  W(0, 0, C.wing); // near wing
  ellipse(fr, 15, y(15), 4.2, 3.4, C.body);
  ellipse(fr, 15, y(16), 2.6, 2, C.bodyHi);
  ellipse(fr, 11, y(13), 2.6, 2.4, C.body); // head
  poly(fr, [[10, y(12)], [11, y(8)], [13, y(11)]], C.body); // ear
  put(fr, 11, y(10), C.earIn);
  put(fr, 10, y(13), C.eye);
  put(fr, 9, y(15), C.fang);
  const out = outline(fr);
  shadow(out, bob);
  return out;
}

const views = {
  side,
  front: (f) => frontOrBack(f, true),
  back: (f) => frontOrBack(f, false),
};
await writeSheet("bat", [block(views, FLAP)]);
