#!/usr/bin/env node
// Procedurally drawn Bramble Boar spritesheet (a tier-2 enemy), in the
// shared format but at 48×48 frames, 4 columns, rows = directions up / left /
// down / right. A heavy, bristly boar: shaded fur (five tones, lit from the
// top left, dithered where the tones meet), fur strokes, a ridge of dark
// bristles with bramble twigs and leaves, curved ivory tusks, split hooves.
// Block 0 (rows 0–3) = trot, block 1 (rows 4–7) = idle (snout down, rooting,
// ear and tail flicks).
//
//   node scripts/draw-boar.mjs            → public/assets/animals/boar.png

import { blank, block, ellipse, line, outline as trace, poly, put, rect, setFrameSize, shiftX, writeSheet } from "./pixel-art.mjs";

setFrameSize(48);

const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

// Fur ramp, darkest → lightest, plus the rest of the palette.
const FUR = [0x3e2418, 0x5c3822, 0x7e5032, 0x9c6a42, 0xbc8a5a].map(rgb);
const MANE = [0x1e120c, 0x2e1b12, 0x442a1a, 0x5c3a24].map(rgb);
const SNOUT = [0x8a4e44, 0xb0705e, 0xcf927c, 0xe6b49c].map(rgb);
const IVORY = [0x9a8a68, 0xcfc29e, 0xf0e8cc, 0xfffaea].map(rgb);
const C = {
  outline: rgb(0x1c100a),
  nostril: rgb(0x3a1c18),
  eye: rgb(0x14090a),
  eyeRim: rgb(0xe8a040),
  glint: rgb(0xfff4d8),
  hoof: rgb(0x2c1e18),
  hoofHi: rgb(0x4a362a),
  earIn: rgb(0xb06e60),
  twig: rgb(0x6a4a2a),
  twigHi: rgb(0x8c6a3c),
  leaf: rgb(0x5a8a36),
  leafHi: rgb(0x86b44e),
  leafLo: rgb(0x3a6226),
};
const outline = (fr) => trace(fr, C.outline);

const TROT = [0, 1, 2, 3].map((i) => ({ step: i, bob: [0, 1, 0, 1][i], root: 0, tail: i % 2, ear: 0 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ step: -1, bob: 0, root: [0, 1, 2, 1][i], tail: i === 2 ? 1 : 0, ear: i === 3 ? 1 : 0 }));

const BAYER = [[0, 2], [3, 1]];
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Ellipse shaded from a ramp: lit from the top left, tones dithered at the seams. */
function shade(fr, cx, cy, rx, ry, ramp, { bias = 0, light = [-0.55, -0.6] } = {}) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const z = Math.sqrt(1 - d);
      let l = 0.5 + light[0] * nx * -0.5 * -1 + light[1] * ny * -0.5 * -1;
      l = 0.42 - (light[0] * nx + light[1] * ny) * 0.5 + z * 0.35 + bias;
      const t = Math.max(0, Math.min(0.999, l)) * (ramp.length - 1);
      const lo = Math.floor(t), f = t - lo;
      const dith = (BAYER[y & 1][x & 1] + 0.5) / 4;
      put(fr, x, y, ramp[f > dith ? Math.min(lo + 1, ramp.length - 1) : lo]);
    }
  }
}

/** Short dark fur strokes scattered over what's already painted, inside `box`. */
function strokes(fr, [x0, y0, x1, y1], seed, dir = 1, n = 22) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + hash(i, 1, seed) * (x1 - x0));
    const y = Math.round(y0 + hash(i, 2, seed) * (y1 - y0));
    const cur = fr[y]?.[x];
    if (!cur) continue;
    const idx = FUR.findIndex((c) => c === cur);
    if (idx < 1) continue;
    put(fr, x, y, FUR[idx - 1]);
    if (fr[y + 1]?.[x + dir] === cur) put(fr, x + dir, y + 1, FUR[idx - 1]);
    if (idx < 4 && hash(i, 3, seed) > 0.6 && fr[y - 1]?.[x - dir] === cur) put(fr, x - dir, y - 1, FUR[idx + 1]);
  }
}

/** A leg: tapered fur column, knee bulge, split dark hoof. `far` legs sit in shadow. */
function leg(fr, x, top, base, { far = false, w = 5, flip = 1, swing = 0 } = {}) {
  const ramp = far ? FUR.map((c) => c.map((v) => Math.round(v * 0.62))) : FUR;
  for (let y = top; y < base - 3; y++) {
    const k = (y - top) / Math.max(1, base - 3 - top);
    const wy = Math.round(w - k * 1.4);
    const sx = Math.round(x + swing * k);
    for (let i = 0; i < wy; i++) {
      const t = i / Math.max(1, wy - 1);
      const tone = far ? 1 + (t < 0.4 ? 1 : 0) : t < 0.34 ? 3 : t < 0.7 ? 2 : 1;
      put(fr, sx + i, y, ramp[Math.max(0, tone - (k > 0.75 ? 0 : 0))]);
    }
    if (!far && y > top + 3 && y % 3 === 0) put(fr, sx + wy - 1, y, ramp[0]); // fetlock hair
  }
  const hx = Math.round(x + swing);
  const hw = w - 1;
  rect(fr, hx, base - 3, hw, 3, C.hoof);
  put(fr, hx + Math.floor(hw / 2), base - 3, C.outline); // cloven split
  put(fr, hx + Math.floor(hw / 2), base - 2, C.outline);
  rect(fr, hx, base - 3, 1, 1, C.hoofHi);
  if (!far) rect(fr, hx + 1, base - 3, Math.floor(hw / 2) - 1, 1, C.hoofHi);
}

/** Bristle ridge: spikes of dark mane along a path, with tips catching the light. */
function bristles(fr, pts, seed, tall = 4) {
  pts.forEach(([x, y], i) => {
    const h = tall - 1 + Math.round(hash(i, 5, seed) * 2);
    const lean = i % 2 ? 1 : 0;
    for (let k = 0; k < h; k++) put(fr, x + (k > h - 2 ? lean : 0), y - k, k > h - 2 ? MANE[3] : k > 1 ? MANE[2] : MANE[1]);
  });
}

function twig(fr, x, y, dx = 1) {
  line(fr, [[x, y], [x + dx * 3, y - 4], [x + dx * 4, y - 6]], C.twig, 1);
  put(fr, x + dx * 3, y - 4, C.twigHi);
  line(fr, [[x + dx * 2, y - 3], [x - dx, y - 6]], C.twig, 1);
  // leaves
  put(fr, x + dx * 5, y - 7, C.leafHi); put(fr, x + dx * 4, y - 7, C.leaf); put(fr, x + dx * 5, y - 6, C.leaf); put(fr, x + dx * 4, y - 5, C.leafLo);
  put(fr, x - dx * 2, y - 7, C.leaf); put(fr, x - dx, y - 7, C.leafHi); put(fr, x - dx * 2, y - 6, C.leafLo);
}

/** Soft ground shadow, drawn after the outline so it isn't traced. */
function groundShadow(fr, cx, cy, rx, ry) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1 && !fr[y]?.[x]) put(fr, x, y, [0, 0, 0, d < 0.5 ? 70 : 38]);
    }
  }
}

// ── side view (faces left) ────────────────────────────────────────────────
function side({ step, bob, root, tail, ear }) {
  const fr = blank();
  const y = 26 - bob;
  const lift = (i) => (step >= 0 && (i + step) % 2 === 0 ? 2 : 0);
  const swing = (i) => (step >= 0 ? [-2, 0, 2, 0][(step + i) % 4] : 0);

  // far legs (behind the body), then body
  leg(fr, 14, y + 5, 43 - lift(1), { far: true, swing: swing(1) });
  leg(fr, 33, y + 5, 43 - lift(3), { far: true, swing: swing(3) });

  shade(fr, 31, y + 1, 11, 9, FUR); // rump / haunch
  shade(fr, 22, y, 15, 10, FUR, { bias: 0.04 }); // barrel
  shade(fr, 16, y - 2, 10, 9, FUR, { bias: 0.08 }); // heavy shoulder hump
  // belly shadow & underside
  for (let x = 12; x <= 38; x++) for (let k = 0; k < 2; k++) {
    const yy = y + 9 - Math.round(Math.abs(x - 25) / 13 * 2.5) - k;
    if (fr[yy]?.[x]) put(fr, x, yy, FUR[k ? 1 : 0]);
  }
  // haunch crease & shoulder line
  for (let i = 0; i < 7; i++) put(fr, 29 + (i > 4 ? 1 : 0), y - 3 + i, FUR[1]);
  for (let i = 0; i < 6; i++) put(fr, 21 - Math.round(i / 3), y - 6 + i, FUR[1]);
  strokes(fr, [12, y - 9, 40, y + 9], 11, -1, 40);

  // near legs
  leg(fr, 9, y + 5, 43 - lift(0), { w: 6, swing: swing(0) });
  leg(fr, 28, y + 5, 43 - lift(2), { w: 6, swing: swing(2) });

  // tail: thin whip with a tuft
  const ty = y - 2 - tail;
  line(fr, [[41, y - 3], [43, ty - 3], [43, ty - 7 + tail]], MANE[2], 1);
  put(fr, 42, ty - 8 + tail, MANE[3]); put(fr, 43, ty - 9 + tail, MANE[3]); put(fr, 44, ty - 8 + tail, MANE[2]);

  // bristle ridge from the nape to the rump
  const ridge = [];
  for (let x = 13; x <= 38; x += 2) ridge.push([x, y - 11 + Math.round(Math.abs(x - 19) / 9) - (x < 24 ? 1 : 0) + (x > 30 ? Math.round((x - 30) / 3) : 0)]);
  bristles(fr, ridge, 3, 5);
  twig(fr, 20, y - 12, 1);
  twig(fr, 33, y - 9, 1);

  // head, dipped while rooting
  const hy = y + 3 + root;
  shade(fr, 10, hy, 9, 8, FUR, { bias: 0.1 }); // skull and jowl
  shade(fr, 17, hy - 2, 5, 6, FUR, { bias: 0.06 }); // neck
  // snout: long, blunt, pink disc at the end
  rect(fr, 3, hy - 1, 6, 6, FUR[3]);
  rect(fr, 3, hy + 4, 6, 1, FUR[2]);
  shade(fr, 3, hy + 2, 3, 4, SNOUT, { bias: 0.1 });
  put(fr, 2, hy + 1, C.nostril); put(fr, 3, hy + 1, C.nostril); put(fr, 2, hy + 2, C.nostril);
  rect(fr, 4, hy + 4, 5, 1, SNOUT[0]); // mouth line
  // curved tusk rising from the lower jaw
  const tusk = [[4, hy + 4], [3, hy + 3], [2, hy + 2], [1, hy], [1, hy - 1]];
  tusk.forEach(([tx, ty2], i) => put(fr, tx, ty2, IVORY[Math.min(3, 1 + (i > 2 ? 1 : 0) + (i === 4 ? 1 : 0))]));
  put(fr, 4, hy + 3, IVORY[0]); put(fr, 5, hy + 4, IVORY[0]);
  // cheek tufts
  for (let i = 0; i < 4; i++) put(fr, 9 + i, hy + 6 + (i % 2), FUR[1]);
  // seam where the jowl meets the shoulder
  for (let i = 0; i < 9; i++) put(fr, 15 + (i > 5 ? 1 : 0), hy - 6 + i, FUR[0]);
  // brow ridge, eye with rim and glint
  rect(fr, 8, hy - 3, 5, 1, FUR[1]);
  put(fr, 8, hy - 2, C.eyeRim); put(fr, 9, hy - 2, C.eye); put(fr, 10, hy - 2, C.eye);
  put(fr, 9, hy - 1, C.eye); put(fr, 8, hy - 3, C.glint);
  // ear: pointed, with a lining, flicks in idle
  const ey = hy - 8 - ear;
  poly(fr, [[12, hy - 5], [13, ey], [18, hy - 5 - ear]], FUR[1]);
  poly(fr, [[13, hy - 5], [14, ey + 2], [16, hy - 5]], C.earIn);
  put(fr, 13, ey, FUR[3]);

  const out = outline(fr);
  const moved = shiftX(out, 3);
  groundShadow(moved, 28, 44, 18, 2);
  return moved;
}

// ── front / back ──────────────────────────────────────────────────────────
function front({ step, bob, root, tail, ear }, face) {
  const fr = blank();
  const y = 26 - bob;
  const lift = (i) => (step >= 0 && (i + step) % 2 === 0 ? 2 : 0);

  // hind legs peek out behind the forelegs
  leg(fr, 12, y + 8, 41, { far: true, w: 5 });
  leg(fr, 31, y + 8, 41, { far: true, w: 5 });

  shade(fr, 24, y + 2, 15, 12, FUR, { bias: 0.04 });
  strokes(fr, [11, y - 10, 38, y + 13], face ? 5 : 6, 1, 52);

  // forelegs
  leg(fr, 14, y + 8, 43 - lift(0), { w: 7 });
  leg(fr, 27, y + 8, 43 - lift(1), { w: 7 });

  if (face) {
    // bristle crown and twigs
    const crown = [];
    for (let x = 12; x <= 36; x += 2) crown.push([x, y - 9 + Math.round(Math.abs(x - 24) / 5)]);
    bristles(fr, crown, 8, 5);
    twig(fr, 15, y - 8, -1);
    twig(fr, 32, y - 7, 1);
    const hy = y + 1 + root;
    // head
    shade(fr, 24, hy, 11, 10, FUR, { bias: 0.12 });
    // brow and cheeks
    rect(fr, 15, hy - 5, 7, 1, FUR[1]); rect(fr, 26, hy - 5, 7, 1, FUR[1]);
    // eyes: amber rim, dark pupil, glint
    for (const ex of [17, 29]) {
      rect(fr, ex, hy - 4, 3, 3, C.eyeRim);
      rect(fr, ex + (ex < 24 ? 1 : 0), hy - 3, 2, 2, C.eye);
      put(fr, ex + (ex < 24 ? 1 : 0), hy - 3, C.glint);
    }
    // snout disc
    shade(fr, 24, hy + 5, 6, 4.5, SNOUT, { bias: 0.1 });
    rect(fr, 21, hy + 4, 2, 2, C.nostril); rect(fr, 26, hy + 4, 2, 2, C.nostril);
    put(fr, 21, hy + 3, SNOUT[3]); put(fr, 26, hy + 3, SNOUT[3]);
    rect(fr, 21, hy + 8, 7, 1, SNOUT[0]);
    // tusks curling up either side of the snout
    for (const s of [-1, 1]) {
      const bx = 24 + s * 8;
      [[0, 8], [0, 7], [s * 1, 6], [s * 1, 5], [s * 1, 4], [0, 3]].forEach(([dx, dy], i) =>
        put(fr, bx + dx, hy + dy - 0, IVORY[i > 3 ? 3 : i > 1 ? 2 : 1]));
      put(fr, bx - s, hy + 8, IVORY[0]); put(fr, bx - s, hy + 7, IVORY[0]);
    }
    // ears
    for (const s of [-1, 1]) {
      const ex = 24 + s * 10, ey = hy - 12 - (s > 0 ? ear : 0);
      poly(fr, [[ex - s * 3, hy - 6], [ex + s * 1, ey], [ex + s * 5, hy - 5]], FUR[1]);
      poly(fr, [[ex - s * 1, hy - 6], [ex + s * 1, ey + 2], [ex + s * 3, hy - 5]], C.earIn);
    }
  } else {
    // rump: rounded haunches, split by a crease, with the tail
    const crown = [];
    for (let x = 12; x <= 36; x += 2) crown.push([x, y - 9 + Math.round(Math.abs(x - 24) / 5)]);
    bristles(fr, crown, 9, 5);
    twig(fr, 31, y - 8, 1);
    for (let i = 0; i < 10; i++) put(fr, 24, y - 2 + i, FUR[0]);
    shade(fr, 18, y + 5, 6, 6, FUR, { bias: 0.1 }); shade(fr, 30, y + 5, 6, 6, FUR, { bias: -0.02 });
    for (let i = 0; i < 10; i++) put(fr, 24, y - 2 + i, FUR[0]);
    line(fr, [[24, y + 3], [24 + (tail ? 2 : -2), y + 8], [24 + (tail ? 3 : -3), y + 12]], MANE[2], 1);
    rect(fr, 24 + (tail ? 2 : -3), y + 12, 2, 2, MANE[3]);
    // ears seen from behind
    for (const s of [-1, 1]) {
      const ex = 24 + s * 10, ey = y - 14 - (s > 0 ? ear : 0);
      poly(fr, [[ex - s * 3, y - 8], [ex + s * 1, ey], [ex + s * 5, y - 7]], FUR[1]);
      put(fr, ex + s, ey + 1, FUR[3]);
    }
  }
  const out = outline(fr);
  groundShadow(out, 24, 44, 14, 2);
  return out;
}

const views = {
  side,
  front: (f) => front(f, true),
  back: (f) => front(f, false),
};
await writeSheet("boar", [block(views, TROT), block(views, IDLE)]);
