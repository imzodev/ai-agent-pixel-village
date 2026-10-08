#!/usr/bin/env node
// Procedurally drawn Sand Scorpion spritesheet (a tier-2 desert enemy), in
// the shared format at 48×48 frames, 4 columns, rows = directions up / left /
// down / right. A plated, granulated sandy shell (five tones, lit from the top
// left, dithered at the seams), a carapace with eyes, a segmented abdomen,
// jointed legs, serrated pincers on jointed arms and a curling tail ending in
// a bulbous telson and a curved stinger with a drop of venom.
// Block 0 = scuttle, block 1 = idle (tail sways, claws flex),
// block 2 = attack (claws snap, tail whips forward).
//
//   node scripts/draw-scorpion.mjs        → public/assets/animals/scorpion.png

import { blank, block, ellipse, line, outline as trace, poly, put, rect, setFrameSize, shiftX, writeSheet } from "./pixel-art.mjs";

setFrameSize(48);

const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const SHELL = [0x4a2c14, 0x7a4a22, 0xa8702f, 0xd09a4a, 0xecc47a].map(rgb);
const LEG = [0x2e1a0c, 0x4e2e16, 0x71461f, 0x946032].map(rgb);
const STING = [0x2a1408, 0x5a2a10, 0x8a4418, 0xc07a30].map(rgb);
const C = {
  outline: rgb(0x20100a),
  eye: rgb(0x0c0606),
  eyeHi: rgb(0xf0c060),
  venom: rgb(0xb8f050),
  venomHi: rgb(0xeaffa8),
};
const outline = (fr) => trace(fr, C.outline);

const WALK = [0, 1, 2, 3].map((i) => ({ step: i, sway: 0, strike: 0, snap: 0 }));
const IDLE = [0, 1, 2, 3].map((i) => ({ step: -1, sway: [0, 1, 2, 1][i], strike: 0, snap: i === 2 ? 1 : 0 }));
const ATTACK = [0, 1, 2, 3].map((i) => ({ step: -1, sway: 0, strike: [1, 2, 3, 1][i], snap: [0, 1, 2, 0][i] }));

const BAYER = [[0, 2], [3, 1]];
const hash = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/** Ellipse shaded from a ramp: lit from the top left, tones dithered at the seams. */
function shade(fr, cx, cy, rx, ry, ramp, bias = 0) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const l = 0.42 + (0.55 * nx + 0.6 * ny) * -0.5 + Math.sqrt(1 - d) * 0.35 + bias;
      const t = Math.max(0, Math.min(0.999, l)) * (ramp.length - 1);
      const lo = Math.floor(t), f = t - lo;
      const dith = (BAYER[y & 1][x & 1] + 0.5) / 4;
      put(fr, x, y, ramp[f > dith ? Math.min(lo + 1, ramp.length - 1) : lo]);
    }
  }
}

/** Granulated shell: scattered light and dark specks on what's already painted. */
function grain(fr, [x0, y0, x1, y1], seed, n = 40) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(x0 + hash(i, 1, seed) * (x1 - x0));
    const y = Math.round(y0 + hash(i, 2, seed) * (y1 - y0));
    const idx = SHELL.findIndex((c) => c === fr[y]?.[x]);
    if (idx < 0) continue;
    put(fr, x, y, SHELL[Math.max(0, Math.min(4, idx + (hash(i, 3, seed) > 0.5 ? 1 : -1)))]);
  }
}

/** Point on a cubic bezier. */
const bez = (p, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
};

/** A thin two-segment leg from (x, y) out to a knee and down to the ground. */
function leg(fr, x, y, kx, ky, fx, fy, ramp = LEG) {
  line(fr, [[x, y], [kx, ky]], ramp[2], 2);
  line(fr, [[kx, ky], [fx, fy]], ramp[1], 1);
  put(fr, kx, ky, ramp[3]); // knee joint catches the light
  put(fr, fx, fy, ramp[0]); // claw tip
}

/**
 * A pincer: the swollen hand with a fixed and a moving finger, the inner edges
 * toothed. `dir` = -1 faces left, `open` 0..2 opens the jaw.
 */
function claw(fr, cx, cy, dir, open) {
  shade(fr, cx, cy, 4, 3.2, SHELL, 0.06);
  // fixed finger (lower), tapering to a tip
  const tipLx = cx + dir * 9, tipLy = cy + 3;
  line(fr, [[cx + dir * 2, cy + 1], [tipLx, tipLy]], SHELL[2], 2);
  line(fr, [[cx + dir * 2, cy + 2], [tipLx, tipLy + 1]], SHELL[1], 1);
  // moving finger (upper), hooks down over it
  const mx = cx + dir * (9 - open), my = cy - 3 + open * 2;
  line(fr, [[cx + dir * 2, cy - 2], [cx + dir * 6, cy - 4 + open], [mx, my + 1]], SHELL[3], 2);
  put(fr, mx, my + 2, SHELL[0]); put(fr, tipLx, tipLy + 1, SHELL[0]);
  // teeth along the inner edge
  for (let i = 3; i <= 7; i += 2) put(fr, cx + dir * i, cy - 1 + (i > 5 ? 1 : 0) - (open ? 0 : 0), SHELL[0]);
}

/** Telson: swollen bulb and a curved stinger pointing along (dx, dy), with venom. */
function telson(fr, x, y, dx, dy) {
  shade(fr, x, y, 3.4, 3, STING, 0.16);
  const n = Math.hypot(dx, dy) || 1;
  const ux = dx / n, uy = dy / n;
  // stinger: a short hooked barb
  const bx = x + ux * 4, by = y + uy * 4;
  const hx = bx + ux * 3 - uy * 1.5, hy = by + uy * 3 + ux * 1.5;
  line(fr, [[x + ux * 2, y + uy * 2], [bx, by], [hx, hy]], STING[2], 2);
  put(fr, Math.round(hx + ux), Math.round(hy + uy), STING[3]);
  put(fr, Math.round(hx + ux), Math.round(hy + uy + 1), C.venom); // drop of venom
  put(fr, Math.round(hx + ux), Math.round(hy + uy + 2), C.venomHi);
  put(fr, Math.round(x - 1), Math.round(y - 1), STING[3]); // glint on the bulb
}

/** Tail segments along a bezier: shaded rings tapering to the telson. */
function tail(fr, pts, n = 6, r0 = 3.6, r1 = 2.6) {
  const centers = [];
  for (let i = 0; i < n; i++) centers.push(bez(pts, i / (n - 1) * 0.92));
  centers.forEach(([x, y], i) => {
    const r = r0 + (r1 - r0) * (i / (n - 1));
    shade(fr, x, y, r, r, SHELL, 0.02);
    put(fr, Math.round(x - r * 0.4), Math.round(y - r * 0.5), SHELL[4]); // ring highlight
    put(fr, Math.round(x + r * 0.5), Math.round(y + r * 0.5), SHELL[0]); // ring seam
  });
  const a = bez(pts, 0.92), b = bez(pts, 1);
  return { at: b, dir: [b[0] - a[0], b[1] - a[1]] };
}

const groundShadow = (fr, cx, cy, rx, ry) => {
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d <= 1 && !fr[y]?.[x]) put(fr, x, y, [0, 0, 0, d < 0.5 ? 70 : 38]);
  }
};

// ── side view (faces left) ────────────────────────────────────────────────
function side({ step, sway, strike, snap }) {
  const fr = blank();
  const y = 31;
  const lift = (k) => (step >= 0 && (k + step) % 2 ? 2 : 0);
  const reach = (k) => (step >= 0 ? [-1, 0, 1, 0][(k + step) % 4] : 0);

  // far legs (darker), then near legs
  const dark = LEG.map((c) => c.map((v) => Math.round(v * 0.7)));
  for (let k = 0; k < 4; k++) leg(fr, 15 + k * 4, y + 1, 12 + k * 4 + reach(k + 1), y + 3, 9 + k * 4 + reach(k + 1), 41 - lift(k + 1), dark);

  // abdomen: overlapping plates tapering back to the tail root
  for (let i = 4; i >= 0; i--) {
    const x = 20 + i * 2.9, ry = 6.2 - i * 0.55;
    shade(fr, x, y - 1 + i * 0.2, 4.6, ry, SHELL, 0.04);
    for (let k = -2; k <= 2; k++) put(fr, Math.round(x - 4.2), Math.round(y - 1 + k), SHELL[0]); // plate seam
  }
  // carapace (head shield) with a raised ridge and eyes
  shade(fr, 14, y - 1, 8.5, 6.2, SHELL, 0.1);
  shade(fr, 14, y - 4, 6, 2.4, SHELL, 0.18);
  put(fr, 11, y - 5, C.eye); put(fr, 12, y - 5, C.eye); put(fr, 11, y - 6, C.eyeHi);
  put(fr, 8, y - 2, C.eye); put(fr, 8, y - 3, C.eyeHi); // lateral eye
  grain(fr, [8, y - 7, 36, y + 5], 4, 70);

  // near legs
  for (let k = 0; k < 4; k++) leg(fr, 14 + k * 4, y + 3, 9 + k * 4 + reach(k), y + 4, 6 + k * 4 + reach(k), 42 - lift(k));

  // pincer arm: shoulder → elbow → hand, jaw flexes
  line(fr, [[9, y], [5, y - 2], [3, y - 5]], SHELL[2], 3);
  put(fr, 4, y - 3, SHELL[4]);
  claw(fr, 3, y - 7 - (snap ? 1 : 0), -1, snap);

  // tail: up from the rump, arching over the back, stinger forward
  const t = [[30, y - 1], [38 - sway, y - 9], [35 - strike * 3 + sway, y - 24 + strike * 2], [22 - strike * 6 + sway, y - 20 + strike * 5]];
  const tip = tail(fr, t, 6, 3.2, 2.2);
  telson(fr, tip.at[0], tip.at[1], tip.dir[0], tip.dir[1] + 0.6 + strike * 0.5);

  return groundedShift(outline(fr), 9, 22, 42, 17, 2);
}

/** Shift a frame right by `dx` and lay its ground shadow. */
function groundedShift(fr, dx, cx, cy, rx, ry) {
  const moved = shiftX(fr, dx);
  groundShadow(moved, cx + dx, cy, rx, ry);
  return moved;
}

// ── front / back ──────────────────────────────────────────────────────────
function front({ step, sway, strike, snap }, face) {
  const fr = blank();
  const y = 33;
  const lift = (k, s) => (step >= 0 && (k + step + (s > 0 ? 1 : 0)) % 2 ? 2 : 0);

  // legs splay out to each side
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    leg(fr, 24 + s * 6, y - 2 + k * 2, 24 + s * (12 + k), y - 6 + k * 3, 24 + s * (14 + k * 2.5), 37 + k - lift(k, s));
  }

  if (face) {
    // tail rises behind the body and curls forward over the head
    const t = [[24, y - 3], [24 + sway * 2, y - 18], [24 + sway, y - 30], [24, y - 24 + strike * 4]];
    const tip = tail(fr, t, 6, 3.6, 2.6);
    telson(fr, tip.at[0], tip.at[1] + 1, 0, 1 + strike * 0.4);
  }

  // abdomen peeking behind, then the carapace
  shade(fr, 24, y - 4, 7.5, 9, SHELL, 0.04);
  for (let k = 0; k < 4; k++) rect(fr, 18, y - 8 + k * 3, 12, 1, SHELL[1]); // plate seams
  if (face) {
    shade(fr, 24, y + 1, 9.5, 6.5, SHELL, 0.12);
    shade(fr, 24, y - 3, 6, 2.2, SHELL, 0.2);
    for (const ex of [-2, 2]) { put(fr, 24 + ex - 1, y - 3, C.eye); put(fr, 24 + ex, y - 3, C.eye); put(fr, 24 + ex - 1, y - 4, C.eyeHi); }
    put(fr, 17, y, C.eye); put(fr, 31, y, C.eye);
    // arms and pincers out in front, either side
    for (const s of [-1, 1]) {
      line(fr, [[24 + s * 7, y + 1], [24 + s * 11, y + 4]], SHELL[2], 3);
      const cx = 24 + s * 13, cy = y + 7 - (snap ? 1 : 0);
      shade(fr, cx, cy, 4.2, 3.6, SHELL, 0.08);
      line(fr, [[cx - s * 1, cy + 1], [cx + s * (2 + snap), cy + 6]], SHELL[2], 2); // fixed finger
      line(fr, [[cx + s * 1, cy - 1], [cx + s * (4 - snap), cy + 4]], SHELL[3], 2); // moving finger
      put(fr, cx + s * (2 + snap), cy + 7, SHELL[0]); put(fr, cx + s * (4 - snap), cy + 5, SHELL[0]);
    }
  } else {
    // seen from behind: tail grows out of the abdomen and arches up and over
    grain(fr, [17, y - 9, 31, y + 8], 7, 40);
    const t = [[24, y + 1], [24 + sway * 2, y - 14], [24 + sway, y - 26], [24, y - 22 + strike * 4]];
    const tip = tail(fr, t, 6, 4, 2.8);
    telson(fr, tip.at[0], tip.at[1] + 1, 0, 1 + strike * 0.4);
    for (const s of [-1, 1]) { // claws flexed out at the sides
      const cx = 24 + s * 13, cy = y + 3;
      shade(fr, cx, cy, 3.6, 3.2, SHELL, 0.02);
      line(fr, [[cx, cy + 1], [cx + s * 2, cy + 6]], SHELL[2], 2);
    }
  }
  grain(fr, [17, y - 9, 31, y + 8], face ? 3 : 8, 50);
  const out = outline(fr);
  groundShadow(out, 24, 42, 17, 2);
  return out;
}

const views = { side, front: (f) => front(f, true), back: (f) => front(f, false) };
await writeSheet("scorpion", [block(views, WALK), block(views, IDLE), block(views, ATTACK)]);
