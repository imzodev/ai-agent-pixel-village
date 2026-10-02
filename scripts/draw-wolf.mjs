#!/usr/bin/env node
// Procedurally drawn grey wolf spritesheet (a tier-2 enemy that hunts
// players in Whisperwood). Bigger and more detailed than the 32 px
// critters: 48×48 frames, 6 columns, rows = directions up / left / down /
// right. A lean grey wolf with a shaggy dark ridge along the neck and back,
// a pale muzzle and belly, amber eyes and a bushy tail.
//
//   block 0 (rows 0–3)  = walk   (6 frames, trotting gait)
//   block 1 (rows 4–7)  = idle   (4 frames, breathing, ear and tail flick)
//   block 2 (rows 8–11) = attack (6 frames: crouch, lunge with a snarl, recover)
//
//   node scripts/draw-wolf.mjs            → public/assets/animals/wolf.png

import { blank, block, ellipse, line, outline as trace, poly, put, rect, setFrameSize, writeSheet } from "./pixel-art.mjs";

setFrameSize(48);

const C = {
  outline: [20, 22, 28],
  ridge: [52, 54, 62], // shaggy dark back / scruff
  furLo: [78, 80, 90],
  fur: [108, 110, 120],
  furHi: [140, 142, 152],
  pale: [178, 180, 186], // muzzle, chest, belly
  paleLo: [150, 152, 160],
  eye: [240, 184, 40],
  pupil: [30, 20, 10],
  nose: [16, 16, 20],
  mouth: [112, 26, 32],
  tooth: [244, 240, 228],
  claw: [36, 36, 42],
  shadow: [0, 0, 0, 70],
};
const outline = (fr) => trace(fr, C.outline);
const GROUND = 44;

// ─── poses ──────────────────────────────────────────────────────────────
// t: gait phase (0..1, one stride); bob: body lift; lunge: forward reach
// (px toward the head); crouch: body lowered; snarl: 0 closed .. 2 wide;
// tail / ear: small flicks.
const WALK = [0, 1, 2, 3, 4, 5].map((i) => ({ t: i / 6, stride: 1, bob: [0, 1, 1, 0, 1, 1][i], lunge: 0, crouch: 0, snarl: 0, tail: [0, 1, 1, 0, -1, -1][i], ear: 0 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ t: 0, stride: 0, bob: [0, 0, 1, 1][i], lunge: 0, crouch: 0, snarl: 0, tail: [0, 1, 0, -1][i], ear: i === 2 ? 1 : 0 }));
const ATTACK = [
  { crouch: 2, lunge: -2, snarl: 1 },
  { crouch: 3, lunge: -3, snarl: 1 },
  { crouch: 1, lunge: 3, snarl: 2 },
  { crouch: 0, lunge: 5, snarl: 2, bite: true },
  { crouch: 1, lunge: 2, snarl: 1 },
  { crouch: 1, lunge: 0, snarl: 0 },
].map((p) => ({ t: 0.25, stride: 0.5, bob: 0, tail: 1, ear: -1, bite: false, ...p }));

// ─── side view (facing left; the right row is mirrored) ─────────────────
/** One leg from hip/shoulder (x, y) to the paw, swinging with phase `ph`. */
function sideLeg(fr, x, y, ph, stride, front, near) {
  const swing = Math.sin(ph * Math.PI * 2) * 3.5 * stride;
  const lift = Math.max(0, Math.cos(ph * Math.PI * 2)) * 2.2 * stride;
  const px = x + swing, py = GROUND - lift;
  // Front legs are straight; hind legs have the backward hock.
  const kx = front ? x + swing * 0.5 : x + 2 + swing * 0.3;
  const ky = front ? y + (py - y) * 0.55 : y + (py - y) * 0.5;
  const c = near ? C.fur : C.furLo;
  line(fr, [[x, y], [kx, ky]], c, front ? 3 : 4);
  line(fr, [[kx, ky], [px, py - 1]], c, 2);
  rect(fr, Math.round(px) - 2, Math.round(py) - 1, 3, 2, near ? C.paleLo : C.furLo); // paw
  put(fr, Math.round(px) - 2, Math.round(py), C.claw);
}

function side({ t, stride, bob, lunge, crouch, snarl, tail, ear, bite }) {
  const fr = blank();
  const dy = -bob + crouch; // body offset (down = +)
  const hx = -lunge; // head/chest reach (left = toward the head)

  // far legs first (darker), then body, then near legs
  sideLeg(fr, 17 + hx * 0.5, 31 + dy, t + 0.5, stride, true, false);
  sideLeg(fr, 32, 31 + dy, t, stride, false, false);

  // tail: bushy, hanging in a low curve
  const ty = 24 + dy;
  poly(fr, [[35, ty - 1], [40, ty + 1 - tail], [44, ty + 6 - tail], [45, ty + 11 - tail], [42, ty + 12 - tail], [39, ty + 7], [35, ty + 4]], C.fur);
  poly(fr, [[39, ty + 3], [43, ty + 7 - tail], [44, ty + 11 - tail], [42, ty + 11 - tail], [39, ty + 7]], C.furLo);
  put(fr, 43, ty + 11 - tail, C.ridge); put(fr, 44, ty + 10 - tail, C.ridge);

  // torso: deep chest, tucked waist, rounded haunch
  const cx = hx * 0.6;
  poly(fr, [[12 + cx, 25 + dy], [17 + cx, 20 + dy], [27, 21 + dy], [34, 20 + dy], [38, 23 + dy], [38, 29 + dy], [34, 33 + dy], [27, 31 + dy], [21 + cx, 34 + dy], [14 + cx, 33 + dy], [11 + cx, 29 + dy]], C.fur);
  // shading: lower body darker, belly + chest pale, shoulder/haunch highlights
  poly(fr, [[14 + cx, 30 + dy], [21 + cx, 31 + dy], [27, 29 + dy], [34, 30 + dy], [34, 33 + dy], [27, 31 + dy], [21 + cx, 34 + dy], [14 + cx, 33 + dy]], C.furLo);
  poly(fr, [[11 + cx, 27 + dy], [13 + cx, 26 + dy], [15 + cx, 33 + dy], [12 + cx, 32 + dy]], C.paleLo); // pale chest front
  line(fr, [[22 + cx, 32 + dy], [27, 30 + dy]], C.paleLo, 1); // belly
  ellipse(fr, 18 + cx, 25 + dy, 3, 2.5, C.furHi); // shoulder
  ellipse(fr, 33, 25 + dy, 3, 2.5, C.furHi); // haunch
  // shaggy dark ridge: a jagged mane of tufts swept back along the spine
  const TUFT = [0, 1, 2, 1, 0, 1, 3, 1, 0, 2, 1, 0, 1, 2, 0, 1, 2, 1, 0, 1, 1, 0, 1, 0];
  for (let x = 14; x <= 37; x++) {
    const sx = x + (x < 24 ? cx : 0);
    const top = (x < 18 ? 22 - (18 - x) * 0.5 : x > 34 ? 21 + (x - 34) : 20.5) + dy;
    const tuft = x < 30 ? TUFT[x - 14] : TUFT[x - 14] >> 1;
    for (let k = -tuft; k <= 2; k++) put(fr, sx + (k < 0 ? 1 : 0), top + k, C.ridge);
    if (tuft >= 2) put(fr, sx + 1, top - tuft + 1, C.furLo); // tuft tip catches a little light
  }
  // fur texture: short strokes swept back and down
  for (const [x, y] of [[20, 24], [24, 23], [28, 24], [22, 27], [26, 27], [30, 26], [35, 27], [17, 28]]) {
    const sx = x + (x < 24 ? cx : 0);
    line(fr, [[sx, y + dy], [sx + 2, y + 1 + dy]], C.furLo, 1);
    put(fr, sx - 1, y - 1 + dy, C.furHi);
  }

  // near legs
  sideLeg(fr, 15 + hx * 0.5, 31 + dy, t, stride, true, true);
  sideLeg(fr, 34, 31 + dy, t + 0.5, stride, false, true);

  // neck scruff + head
  const hy = 17 + dy + (crouch > 0 ? 2 : 0); // head lowers when crouching
  const H = hx;
  poly(fr, [[10 + H, 30 + dy], [9 + H, 22 + dy], [11 + H, hy + 1], [16 + H * 0.6, 19 + dy], [18 + H * 0.6, 24 + dy]], C.fur);
  // scruff tufts (dark, jagged) behind the head
  poly(fr, [[13 + H, hy - 1], [15 + H, hy - 3], [16 + H, hy], [18 + H * 0.6, hy - 1], [19 + H * 0.6, 21 + dy], [16 + H * 0.6, 22 + dy], [13 + H, hy + 3]], C.ridge);
  ellipse(fr, 9 + H, hy + 1, 4.5, 4, C.fur);
  ellipse(fr, 10 + H, hy, 2.5, 1.5, C.furHi); // brow / skull highlight
  // muzzle: long, pale underneath; jaw drops when snarling
  const jaw = snarl;
  poly(fr, [[6 + H, hy - 1], [1 + H, hy + 1], [1 + H, hy + 3], [6 + H, hy + 4]], C.fur);
  poly(fr, [[6 + H, hy + 3], [1 + H, hy + 3 + jaw], [2 + H, hy + 5 + jaw], [8 + H, hy + 5]], C.pale); // lower jaw / cheek
  if (snarl > 0) {
    line(fr, [[2 + H, hy + 3], [6 + H, hy + 3 + jaw * 0.5]], C.mouth, 1 + (snarl > 1 ? 1 : 0));
    put(fr, 2 + H, hy + 2, C.tooth); put(fr, 4 + H, hy + 2, C.tooth); // upper fangs
    put(fr, 3 + H, hy + 3 + jaw, C.tooth); // lower fang
    if (snarl > 1) { put(fr, 5 + H, hy + 2, C.tooth); put(fr, 2 + H, hy + 4 + jaw, C.tooth); }
    line(fr, [[3 + H, hy - 1], [6 + H, hy]], C.ridge, 1); // wrinkled snout
  } else {
    line(fr, [[2 + H, hy + 3], [6 + H, hy + 3]], C.ridge, 1); // closed lips
  }
  put(fr, 1 + H, hy + 1, C.nose); put(fr, 0 + H, hy + 1, C.nose); put(fr, 1 + H, hy + 2, C.nose);
  // eye: amber with a dark pupil, angled brow
  put(fr, 7 + H, hy - 1, C.eye); put(fr, 6 + H, hy - 1, C.eye); put(fr, 6 + H, hy - 1, C.pupil);
  put(fr, 6 + H, hy - 2, C.ridge); put(fr, 7 + H, hy - 2, C.ridge); put(fr, 8 + H, hy - 2, C.ridge);
  // ears: tall and pointed; pinned back in an attack, flick when idle
  const back = ear < 0 ? 2 : 0;
  poly(fr, [[9 + H + back, hy - 3], [10 + H + back * 2, hy - 8 + ear + back], [12 + H + back, hy - 3]], C.furLo);
  poly(fr, [[11 + H + back, hy - 3], [13 + H + back * 2, hy - 8 + back], [14 + H + back, hy - 2]], C.fur);
  put(fr, 12 + H + back * 2, hy - 5 + back, C.pale);
  if (bite) {
    // a spray of spittle / impact sparks off the snout
    put(fr, -1 + H, hy + 5, C.tooth); put(fr, -2 + H, hy + 3, C.tooth); put(fr, -2 + H, hy + 7, C.pale);
  }
  return withShadow(outline(fr), 24, 6 + Math.abs(lunge) * 0.4);
}

// ─── front / back views ─────────────────────────────────────────────────
function front({ t, stride, bob, crouch, snarl, tail, ear, lunge }) {
  const fr = blank();
  const dy = -bob + crouch;
  const step = (ph) => Math.max(0, Math.cos(ph * Math.PI * 2)) * 2 * stride;
  // hind legs peeking out behind, then the front legs
  for (const [x, ph] of [[18, t + 0.5], [27, t]]) rect(fr, x, 34 + dy, 3, GROUND - 34 - dy - step(ph), C.furLo);
  // body behind the chest
  ellipse(fr, 24, 28 + dy, 9, 7, C.fur, C.furLo);
  // tail swishing behind
  poly(fr, [[30, 26 + dy], [35 + tail, 24 + dy], [37 + tail, 29 + dy], [32, 30 + dy]], C.furLo);
  for (const [x, ph] of [[19, t], [26, t + 0.5]]) {
    const l = step(ph);
    rect(fr, x, 31 + dy, 3, GROUND - 31 - dy - l, C.fur);
    rect(fr, x - 1, GROUND - 2 - l, 5, 2, C.paleLo);
    put(fr, x, GROUND - 1 - l, C.claw); put(fr, x + 2, GROUND - 1 - l, C.claw);
  }
  // chest ruff
  poly(fr, [[19, 24 + dy], [29, 24 + dy], [27, 33 + dy], [24, 35 + dy], [21, 33 + dy]], C.pale);
  for (const x of [20, 23, 26]) put(fr, x + 1, 33 + dy, C.paleLo);
  // head, lowered and pushed forward in an attack
  const hy = 18 + dy + (crouch > 0 ? 2 : 0) + Math.max(0, lunge) * 0.4;
  // scruff ring
  ellipse(fr, 24, hy + 3, 9, 6, C.ridge);
  ellipse(fr, 24, hy, 7, 6, C.fur);
  ellipse(fr, 24, hy - 2, 4, 2, C.furHi);
  // ears
  const back = ear < 0 ? 2 : 0;
  poly(fr, [[17 - back, hy - 3], [17 - back, hy - 10 + ear + back], [21, hy - 5]], C.fur);
  poly(fr, [[31 + back, hy - 3], [31 + back, hy - 10 + back], [27, hy - 5]], C.fur);
  put(fr, 18 - back, hy - 6 + back, C.pale); put(fr, 30 + back, hy - 6 + back, C.pale);
  // eyes + brow
  for (const x of [20, 27]) { put(fr, x, hy - 1, C.eye); put(fr, x + 1, hy - 1, C.eye); put(fr, x + (x < 24 ? 1 : 0), hy - 1, C.pupil); }
  line(fr, [[19, hy - 3], [22, hy - 2]], C.ridge, 1); line(fr, [[29, hy - 3], [26, hy - 2]], C.ridge, 1);
  // muzzle
  rect(fr, 21, hy + 1, 6, 5, C.pale);
  rect(fr, 22, hy + 1, 4, 2, C.nose);
  if (snarl > 0) {
    rect(fr, 21, hy + 4, 6, 1 + snarl, C.mouth);
    put(fr, 21, hy + 4, C.tooth); put(fr, 26, hy + 4, C.tooth);
    put(fr, 22, hy + 4 + snarl, C.tooth); put(fr, 25, hy + 4 + snarl, C.tooth);
  } else {
    line(fr, [[22, hy + 4], [25, hy + 4]], C.ridge, 1);
  }
  return withShadow(outline(fr), 24, 8);
}

function back({ t, stride, bob, crouch, tail, ear }) {
  const fr = blank();
  const dy = -bob + crouch;
  const step = (ph) => Math.max(0, Math.cos(ph * Math.PI * 2)) * 2 * stride;
  // front legs (far) peek out under the belly
  for (const [x, ph] of [[19, t + 0.5], [26, t]]) rect(fr, x, 32 + dy, 3, GROUND - 32 - dy - step(ph), C.furLo);
  // head + ears beyond the shoulders
  const hy = 17 + dy + (crouch > 0 ? 2 : 0);
  ellipse(fr, 24, hy, 6, 5, C.fur);
  const back = ear < 0 ? 2 : 0;
  poly(fr, [[18 - back, hy - 2], [18 - back, hy - 9 + ear + back], [22, hy - 4]], C.fur);
  poly(fr, [[30 + back, hy - 2], [30 + back, hy - 9 + back], [26, hy - 4]], C.fur);
  put(fr, 19 - back, hy - 6 + back, C.furLo); put(fr, 29 + back, hy - 6 + back, C.furLo);
  // scruff, shoulders and a broad rump
  ellipse(fr, 24, hy + 5, 8, 4, C.ridge);
  ellipse(fr, 24, 26 + dy, 8, 6, C.fur);
  ellipse(fr, 24, 31 + dy, 10, 6, C.fur, C.furLo);
  // shaggy dark saddle down the spine, tufts flaring out
  for (let y = hy + 4; y <= 30 + dy; y++) {
    const w = 1 + ((y * 5) % 3 === 0 ? 1 : 0);
    rect(fr, 24 - w, y, w * 2 + 1, 1, C.ridge);
  }
  for (const [x, y] of [[19, 27], [29, 27], [18, 31], [30, 31]]) line(fr, [[x, y + dy], [x + (x < 24 ? -1 : 1), y + 2 + dy]], C.furLo, 1);
  ellipse(fr, 19, 32 + dy, 3, 3, C.furHi); ellipse(fr, 29, 32 + dy, 3, 3, C.furHi); // haunches
  for (const [x, ph] of [[17, t], [28, t + 0.5]]) {
    const l = step(ph);
    rect(fr, x, 34 + dy, 4, GROUND - 34 - dy - l, C.fur);
    rect(fr, x + 1, 37 + dy, 2, 2, C.furLo); // hock
    rect(fr, x, GROUND - 2 - l, 4, 2, C.paleLo);
  }
  // bushy tail hanging down the middle, swishing
  poly(fr, [[21, 31 + dy], [27, 31 + dy], [28 + tail, 37 + dy], [25 + tail, 42 + dy], [23 + tail, 42 + dy], [20 + tail, 37 + dy]], C.fur);
  line(fr, [[24, 33 + dy], [24 + tail, 40 + dy]], C.furLo, 1);
  rect(fr, 23 + tail, 41 + dy, 3, 1, C.ridge);
  return withShadow(outline(fr), 24, 9);
}

/** Soft ground shadow under the feet (drawn after the outline). */
function withShadow(fr, cx, rx) {
  for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
    for (const y of [GROUND, GROUND + 1]) if (!fr[y][x]) fr[y][x] = C.shadow;
  }
  return fr;
}

const views = { side, front, back };
await writeSheet("wolf", [block(views, WALK), block(views, IDLE), block(views, ATTACK)]);
