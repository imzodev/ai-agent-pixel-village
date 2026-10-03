#!/usr/bin/env node
// Procedurally drawn Sand Scorpion spritesheet (a tier-2 desert enemy), in
// the shared format: 32×32 frames, 4 columns, rows = directions up / left /
// down / right. A sandy segmented body, scuttling legs, raised pincers and
// a curled stinger. Block 0 = scuttle, block 1 = idle (stinger sways),
// block 2 = attack (stinger strikes forward).
//
//   node scripts/draw-scorpion.mjs        → public/assets/animals/scorpion.png

import { blank, block, ellipse, line, outline as trace, put, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [44, 26, 12],
  shell: [206, 150, 74],
  shellLo: [160, 104, 46],
  shellHi: [238, 196, 120],
  leg: [120, 78, 36],
  sting: [70, 30, 30],
  eye: [20, 10, 10],
};
const outline = (fr) => trace(fr, C.outline);
const WALK = [0, 1, 2, 3].map((i) => ({ step: i, sway: 0, strike: 0 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ step: -1, sway: [0, 1, 0, -1][i], strike: 0 }));
const ATTACK = [0, 1, 2, 3].map((i) => ({ step: -1, sway: 0, strike: [1, 2, 3, 1][i] }));

/** Side view, facing left: tail curls up over the back toward the head. */
function side({ step, sway, strike }) {
  const fr = blank();
  const y = 22;
  for (let k = 0; k < 4; k++) { // legs, alternating
    const lift = step >= 0 && (k + step) % 2 ? 1 : 0;
    line(fr, [[11 + k * 3, y + 1], [9 + k * 3, y + 5 - lift]], C.leg, 1);
  }
  ellipse(fr, 16, y, 7, 3, C.shell, C.shellLo); // body segments
  for (const x of [12, 15, 18]) put(fr, x, y - 2, C.shellHi);
  // pincers out front
  line(fr, [[9, y], [5, y - 2], [3, y - 4]], C.shellLo, 2);
  put(fr, 2, y - 5, C.shell); put(fr, 4, y - 6, C.shell); put(fr, 2, y - 3, C.shell);
  put(fr, 9, y - 1, C.eye);
  // tail: segments arching up and over, stinger tip pointing forward
  const tail = [[22, y - 1], [25, y - 4], [26, y - 8], [24 + sway - strike, y - 11 - (strike > 1 ? 1 : 0)], [20 - strike * 2, y - 12 + (strike > 2 ? 2 : 0)]];
  line(fr, tail, C.shell, 2);
  const [sx, sy] = tail[tail.length - 1];
  put(fr, sx - 1, sy + 1, C.sting); put(fr, sx - 2, sy + 2, C.sting);
  return outline(fr);
}
/** Front / back view: pincers either side, tail standing up behind. */
function front({ step, sway, strike }, face) {
  const fr = blank();
  const y = 22;
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
    const lift = step >= 0 && (k + step + (s > 0 ? 1 : 0)) % 2 ? 1 : 0;
    line(fr, [[16 + s * 4, y - 1 + k * 2], [16 + s * 9, y + 1 + k * 2 - lift]], C.leg, 1);
  }
  // tail up behind (drawn first when facing us)
  if (face) line(fr, [[16, y - 4], [16 + sway, y - 11], [16 + sway, y - 13 + strike * 2]], C.shellLo, 2);
  ellipse(fr, 16, y, 5, 4, C.shell, C.shellLo);
  if (face) {
    for (const s of [-1, 1]) { line(fr, [[16 + s * 4, y + 2], [16 + s * 7, y + 5]], C.shellLo, 2); put(fr, 16 + s * 8, y + 6, C.shell); put(fr, 16 + s * 6, y + 7, C.shell); }
    put(fr, 15, y + 1, C.eye); put(fr, 17, y + 1, C.eye);
  } else {
    line(fr, [[16, y + 2], [16 + sway, y - 9], [16 + sway, y - 12 + strike * 2]], C.shell, 2);
    put(fr, 16 + sway, y - 13 + strike * 2, C.sting);
  }
  return outline(fr);
}
const views = { side, front: (f) => front(f, true), back: (f) => front(f, false) };
await writeSheet("scorpion", [block(views, WALK), block(views, IDLE), block(views, ATTACK)]);
