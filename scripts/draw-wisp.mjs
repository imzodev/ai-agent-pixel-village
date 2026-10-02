#!/usr/bin/env node
// Procedurally drawn Shade Wisp spritesheet (a tier-3 night enemy), in the
// shared format: 32×32 frames, 4 columns, rows = directions up / left /
// down / right. A cold spirit flame: a glowing round head with hollow eyes
// and a flickering tail that trails behind it, floating above a faint
// shadow. One block: the float/flicker cycle (it never touches the ground).
//
//   node scripts/draw-wisp.mjs            → public/assets/animals/wisp.png

import { blank, block, ellipse, outline as trace, poly, put, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [30, 22, 60],
  body: [142, 120, 226],
  bodyLo: [104, 82, 196],
  core: [206, 232, 255],
  glow: [176, 214, 255],
  eye: [28, 18, 52],
};
const outline = (fr) => trace(fr, C.outline);

const FLOAT = [0, 1, 2, 3].map((i) => ({ bob: [0, -1, -2, -1][i], flick: i }));

/** Faint ground shadow, drawn after outline so it isn't outlined. */
function shadow(fr, bob) {
  const rx = 5 + Math.min(0, bob);
  for (let x = -rx; x <= rx; x++) put(fr, 16 + x, 29, [20, 10, 40, Math.abs(x) >= rx - 1 ? 30 : 60]);
}

/** Flame tail: tapering lobes trailing from the head toward (tx, ty). */
function tail(fr, hx, hy, dx, dy, flick) {
  for (let k = 1; k <= 4; k++) {
    const w = (flick + k) % 2 ? 0.6 : 0;
    const r = 4.5 - k * 0.9 + w;
    ellipse(fr, hx + dx * k * 2.2 + (k % 2 ? w : -w), hy + dy * k * 2.2, r, r, k < 3 ? C.body : C.bodyLo);
  }
}

function draw({ bob, flick }, view) {
  const fr = blank();
  const hx = 16, hy = 13 + bob;
  if (view === "side") tail(fr, hx, hy, 1, 0.5, flick); // facing left: tail streams right
  else if (view === "front") tail(fr, hx, hy, 0, 1, flick); // tail hangs down behind
  else tail(fr, hx, hy, 0, 1, flick);
  ellipse(fr, hx, hy, 6.5, 6.5, C.body);
  ellipse(fr, hx - 1, hy - 1, 4, 4, C.glow);
  ellipse(fr, hx - 1.5, hy - 1.5, 2, 2, C.core);
  // flame crest
  poly(fr, [[hx - 3, hy - 5], [hx - 1 + (flick % 2), hy - 11], [hx + 1, hy - 5]], C.body);
  poly(fr, [[hx + 1, hy - 5], [hx + 3 - (flick % 2), hy - 9], [hx + 4, hy - 4]], C.bodyLo);
  if (view === "front") {
    for (const ex of [hx - 3, hx + 2]) { put(fr, ex, hy, C.eye); put(fr, ex + 1, hy, C.eye); put(fr, ex, hy + 1, C.eye); put(fr, ex + 1, hy + 1, C.eye); }
    put(fr, hx, hy + 4, C.eye); put(fr, hx - 1, hy + 4, C.eye); // small "o" mouth
  } else if (view === "side") {
    put(fr, hx - 4, hy, C.eye); put(fr, hx - 3, hy, C.eye); put(fr, hx - 4, hy + 1, C.eye); put(fr, hx - 3, hy + 1, C.eye);
  }
  const out = outline(fr);
  shadow(out, bob);
  return out;
}

const views = {
  side: (f) => draw(f, "side"),
  front: (f) => draw(f, "front"),
  back: (f) => draw(f, "back"),
};
await writeSheet("wisp", [block(views, FLOAT)]);
