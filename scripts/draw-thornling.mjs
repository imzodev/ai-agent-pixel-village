#!/usr/bin/env node
// Procedurally drawn thornling spritesheet (an enemy), in the shared format:
// 32×32 frames, 4 columns, rows = directions up / left / down / right.
// A walking bramble: a round thorny leaf-ball with glowing yellow eyes,
// twig arms and root legs. Block 0 (rows 0–3) = waddle on its roots,
// block 1 (rows 4–7) = idle sway (leaves rustle, arms twitch).
//
//   node scripts/draw-thornling.mjs       → public/assets/animals/thornling.png

import { blank, block, ellipse, line, outline as trace, poly, put, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [28, 32, 20],
  leaf: [79, 122, 58],
  leafHi: [118, 166, 82],
  leafLo: [54, 88, 40],
  thorn: [222, 204, 158],
  bark: [96, 72, 46],
  barkLo: [70, 52, 34],
  eye: [248, 225, 108],
  pupil: [60, 36, 16],
  mouth: [38, 30, 20],
};
const outline = (fr) => trace(fr, C.outline);

// Waddle: which root is lifted, body bob. Idle: sway and rustle phase.
const WALK = [0, 1, 2, 3].map((i) => ({ step: i, bob: i % 2, sway: 0, rustle: i }));
const IDLE = [0, 1, 2, 3].map((i) => ({ step: -1, bob: 0, sway: [0, 1, 0, -1][i], rustle: i }));

/** Thorns: pale spikes pointing outward around the leaf-ball. */
function thorns(fr, cx, cy, r, count, phase) {
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + phase * 0.05;
    const bx = cx + Math.cos(a) * (r - 1), by = cy + Math.sin(a) * (r - 1);
    const tx = cx + Math.cos(a) * (r + 3), ty = cy + Math.sin(a) * (r + 3);
    const nx = -Math.sin(a) * 1.2, ny = Math.cos(a) * 1.2;
    poly(fr, [[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]], C.thorn);
  }
}

/** The leaf-ball body with rustling highlight clusters. */
function body(fr, cx, cy, rustle) {
  ellipse(fr, cx, cy, 7.5, 7, C.leaf, C.leafLo);
  const spots = [[-3, -3], [2, -4], [4, 0], [-4, 1], [0, 2], [-1, -1]];
  spots.forEach(([dx, dy], i) => {
    if ((i + rustle) % 3 === 0) return; // rustle: highlights come and go
    put(fr, cx + dx, cy + dy, C.leafHi);
    put(fr, cx + dx + 1, cy + dy, C.leafHi);
  });
}

function legs(fr, cx, base, step, spread) {
  const lift = [[0, 0], [2, 0], [0, 0], [0, 2]][Math.max(0, step)] ?? [0, 0];
  line(fr, [[cx - spread, base - 5], [cx - spread - 1, base - lift[0]]], C.bark, 2);
  line(fr, [[cx + spread, base - 5], [cx + spread + 1, base - lift[1]]], C.barkLo, 2);
}

function front({ step, bob, sway, rustle }, face) {
  const fr = blank();
  const cx = 16 + sway, cy = 15 - bob;
  legs(fr, 16, 28 - bob, step, 3);
  // twig arms, twitching with the rustle
  const armUp = rustle % 2;
  line(fr, [[cx - 7, cy + 1], [cx - 11, cy - 2 - armUp]], C.bark, 1);
  line(fr, [[cx + 7, cy + 1], [cx + 11, cy - 2 - (1 - armUp)]], C.bark, 1);
  thorns(fr, cx, cy, 7.5, 9, rustle);
  body(fr, cx, cy, rustle);
  if (face) {
    for (const ex of [cx - 3, cx + 2]) { // glowing eyes with a slit pupil
      put(fr, ex, cy, C.eye); put(fr, ex + 1, cy, C.eye);
      put(fr, ex, cy + 1, C.eye); put(fr, ex + 1, cy + 1, C.pupil);
    }
    put(fr, cx - 1, cy + 4, C.mouth); put(fr, cx, cy + 4, C.mouth); put(fr, cx + 1, cy + 4, C.mouth); // frown
    put(fr, cx - 2, cy + 5, C.mouth); put(fr, cx + 2, cy + 5, C.mouth);
  }
  return outline(fr);
}

function side({ step, bob, sway, rustle }) {
  const fr = blank();
  const cx = 16 + sway, cy = 15 - bob;
  legs(fr, 16, 28 - bob, step, 2);
  line(fr, [[cx - 6, cy + 1], [cx - 10, cy - 2 - (rustle % 2)]], C.bark, 1); // front arm
  thorns(fr, cx, cy, 7, 8, rustle);
  body(fr, cx, cy, rustle);
  put(fr, cx - 5, cy, C.eye); put(fr, cx - 4, cy, C.eye); put(fr, cx - 4, cy + 1, C.pupil); put(fr, cx - 5, cy + 1, C.eye);
  put(fr, cx - 5, cy + 4, C.mouth); put(fr, cx - 4, cy + 4, C.mouth);
  return outline(fr);
}

const views = {
  side,
  front: (f) => front(f, true),
  back: (f) => front(f, false),
};
await writeSheet("thornling", [block(views, WALK), block(views, IDLE)]);
