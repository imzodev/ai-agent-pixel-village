#!/usr/bin/env node
// Procedurally drawn Bog Lurker spritesheet (a tier-3 swamp enemy), in the
// shared format: 32×32 frames, 4 columns, rows = directions up / left /
// down / right. A squat, warty swamp toad-beast with moss on its back and
// glowing eyes. Block 0 = hop, block 1 = idle (throat pulses), block 2 =
// attack (it lunges with its mouth wide).
//
//   node scripts/draw-lurker.mjs          → public/assets/animals/lurker.png

import { blank, block, ellipse, outline as trace, put, rect, writeSheet } from "./pixel-art.mjs";

const C = {
  outline: [16, 26, 14],
  skin: [86, 112, 58],
  skinLo: [58, 80, 40],
  belly: [168, 170, 104],
  moss: [52, 120, 52],
  wart: [120, 144, 78],
  eye: [250, 220, 80],
  pupil: [30, 20, 6],
  mouth: [110, 30, 40],
};
const outline = (fr) => trace(fr, C.outline);
const HOP = [0, 1, 2, 3].map((i) => ({ hop: [0, 2, 3, 1][i], throat: 0, gape: 0 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ hop: 0, throat: [0, 1, 2, 1][i], gape: 0 }));
const ATTACK = [0, 1, 2, 3].map((i) => ({ hop: [0, 1, 0, 0][i], throat: 0, gape: [1, 3, 3, 1][i] }));

function side({ hop, throat, gape }) {
  const fr = blank();
  const y = 21 - hop;
  rect(fr, 20, y + 3, 6, 4, C.skinLo); // folded hind leg
  rect(fr, 8, y + 4, 3, 4, C.skinLo); // front leg
  ellipse(fr, 16, y, 10, 6, C.skin, C.skinLo);
  ellipse(fr, 13, y + 3, 6, 2 + throat * 0.5, C.belly);
  for (const [x, yy] of [[18, y - 3], [22, y - 1], [15, y - 4], [20, y - 5]]) put(fr, x, yy, C.wart);
  for (let x = 14; x <= 24; x++) put(fr, x, y - 6 + ((x * 3) % 2), C.moss); // moss along the back
  // head and mouth (left)
  ellipse(fr, 8, y - 1, 5, 4, C.skin);
  rect(fr, 3, y + 1, 6, 1 + gape, C.mouth);
  put(fr, 7, y - 4, C.eye); put(fr, 8, y - 4, C.eye); put(fr, 7, y - 4, C.pupil);
  return outline(fr);
}
function front({ hop, throat, gape }, face) {
  const fr = blank();
  const y = 21 - hop;
  for (const s of [-1, 1]) rect(fr, 16 + s * 9 - 2, y + 3, 4, 4, C.skinLo);
  ellipse(fr, 16, y, 10, 7, C.skin, C.skinLo);
  if (face) {
    ellipse(fr, 16, y + 3, 6, 2 + throat * 0.6, C.belly);
    rect(fr, 11, y + 1, 10, 1 + gape, C.mouth);
    for (const s of [-1, 1]) { ellipse(fr, 16 + s * 5, y - 5, 2.5, 2.5, C.skin); put(fr, 16 + s * 5, y - 6, C.eye); put(fr, 16 + s * 5 + (s < 0 ? 1 : -1), y - 6, C.eye); put(fr, 16 + s * 5, y - 5, C.pupil); }
  } else {
    for (let x = 9; x <= 23; x++) put(fr, x, y - 5 + ((x * 3) % 2), C.moss);
    for (const [x, yy] of [[12, y - 2], [19, y], [15, y + 2], [21, y - 3]]) put(fr, x, yy, C.wart);
  }
  return outline(fr);
}
const views = { side, front: (f) => front(f, true), back: (f) => front(f, false) };
await writeSheet("lurker", [block(views, HOP), block(views, IDLE), block(views, ATTACK)]);
