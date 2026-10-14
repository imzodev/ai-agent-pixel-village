#!/usr/bin/env node
// The Village Ranch: the village's own homestead east of the village, open to
// everyone. A well, washing on the line and a woodpile; a big red barn with
// its silo, hay and crates; a tool shed; the vegetable garden with its scarecrow, corn, wheat, sunflowers and pumpkins; beehives; a pond
// with reeds, lilies and ducks; apple, oak, birch and pine trees; lamp posts
// along the lanes; and, fenced off on the east side, a paddock for each kind
// of animal (cows, pigs and their mud, sheep, the llamas, the hens' coop).
//
// Drawn as one picture, then cut into 24×15 scenery stamps like the Common
// Field (scripts/draw-wheat-field.mjs). The layout is src/lib/villageRanch.json;
// the paddocks are the animals' wander zones (src/lib/villageRanch.ts).
//
//   node scripts/draw-village-ranch.mjs     (PREVIEW=ranch.png also writes the
//                                            whole picture; PREVIEW_ONLY=1 stops there)
//
// Writes public/assets/VillageRanch<n>.png + public/buildings/village_ranch_<n>.json
// per distinct stamp, src/lib/villageRanchStamps.json and replaces the
// village_ranch_* entries of public/buildings/buildings.json.
//
// Layers: flat things (lanes, soil, the pond, lily pads, grass detail) →
// GroundUpper; shadows → DecorationLowerShadow; everything standing →
// DecorationLower, and whatever of it isn't on a blocked tile (roofs, tree
// tops, lamp heads, sunflower heads) moves up to DecorationUpper1, so you walk
// behind it. Only the listed tiles block (fences, walls, trunks, props); water
// blocks through the Collision layer.

import fs from "node:fs";
import crypto from "node:crypto";
import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";
import { PAL, hex, ramp, shade, softShadow } from "./ds-art.mjs";

const L = JSON.parse(fs.readFileSync("src/lib/villageRanch.json", "utf8"));
const T = 16, SW = 24, SH = 15;
const COLS = L.stamps.cols * SW, ROWS = L.stamps.rows * SH;
const W = COLS * T, H = ROWS * T;
const { top: TOP, bottom: BOTTOM, left: LEFT, right: RIGHT } = L.fence;
const inSpan = (spans, v) => spans.some(([a, b]) => v >= a && v <= b);

// ── Palette ─────────────────────────────────────────────────────────────
const INK = PAL.ink;
const C = {
  barn: [hex(0x4a1412), hex(0x6a1e1a), hex(0x8c2a22), hex(0xa83a2c), hex(0xc4553e), hex(0xdc7a5c)],
  road: [hex(0x8a7048), hex(0x9a7e56), hex(0xb89a6c), hex(0xcfb487)],
  straw: [hex(0x8a6a2a), hex(0xb08a3a), hex(0xd4b050), hex(0xecd078), hex(0xf8eaa8)],
  mud: [hex(0x3e2a1a), hex(0x543a24), hex(0x6a4a2e), hex(0x7e5a38)],
  soil: [hex(0x3a2214), hex(0x4e3020), hex(0x64402a), hex(0x7a5236), hex(0x8e6442)],
  water: [hex(0x1e4a7a), hex(0x2c64a0), hex(0x3e80bc), hex(0x62a2d4), hex(0xa8d4f0)],
  shore: [hex(0x5a6a32), hex(0x7a8a42), hex(0x9aa852)],
  reed: [hex(0x2e5a24), hex(0x467a30), hex(0x6a9a3e), hex(0x8cb850)],
  leaf: PAL.leaf,
  pine: [hex(0x14382a), hex(0x1e4e34), hex(0x2a6640), hex(0x3a804c), hex(0x52a05a)],
  birch: [hex(0x3c6a2c), hex(0x5a8e38), hex(0x7cae46), hex(0xa2cc5c), hex(0xc8e480)],
  bark: [hex(0x3a2214), hex(0x52321e), hex(0x6e4628), hex(0x8a5e36)],
  birchBark: [hex(0xb8b8b0), hex(0xd8d8d0), hex(0xf0f0e8)],
  apple: [hex(0x8a1a1a), hex(0xc42c2c), hex(0xf05a4a)],
  berry: [hex(0x2a2a6a), hex(0x4a4aa8), hex(0x8a8ae0)],
  cabbage: [hex(0x2e6a3a), hex(0x4e9a4a), hex(0x7cc462), hex(0xb4e690)],
  carrot: [hex(0xa84a12), hex(0xe07a22), hex(0xf8a848)],
  corn: [hex(0x3a6a22), hex(0x5a8e2e), hex(0x7cae3e), hex(0xa0c858)],
  cob: [hex(0xb88a1e), hex(0xe8c040), hex(0xf8e078)],
  wheat: [hex(0x9a7a2a), hex(0xc8a03e), hex(0xe8c860), hex(0xf8e498)],
  pumpkin: [hex(0x8a3a0e), hex(0xc8601a), hex(0xec8a2a), hex(0xf8b058)],
  sunPetal: [hex(0xd8a018), hex(0xf8cc30), hex(0xfff070)],
  cream: [hex(0xb8a080), hex(0xd8c4a0), hex(0xece0c0), hex(0xf8f2dc)],
  shutter: [hex(0x1e3a6a), hex(0x2c5294), hex(0x4472b8)],
  silo: [hex(0x8a8a86), hex(0xb0b0aa), hex(0xd4d4cc), hex(0xeeeee6), hex(0xfcfcf4)],
  metal: [hex(0x4a5058), hex(0x6a7480), hex(0x949ea8), hex(0xc4ccd4)],
  hive: [hex(0xb8a070), hex(0xd8c490), hex(0xf0e2b4), hex(0xfcf6dc)],
  grassDk: hex(0x2f6a30), grassMid: hex(0x4a8e3e), grassLt: hex(0x7cc060),
  white: PAL.white, red: hex(0xd83a3a), yellow: hex(0xf8d850), pink: hex(0xf490b8), violet: hex(0xa080e0), blue: hex(0x5a8ce0),
};

const ground = new Canvas(W, H), shadow = new Canvas(W, H), lower = new Canvas(W, H), upper = new Canvas(W, H);
const blocked = new Set(); // "col,row" (ranch tiles)
const block = (col, row) => blocked.add(`${col},${row}`);
const blockRect = (c, r, w, h) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) block(x, y); };
const water = new Set();
const busy = new Set(); // tiles with something on them: no grass detail there
const mark = (c, r, w = 1, h = 1) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) busy.add(`${x},${y}`); };
const line = (c, x0, x1, y, col) => { for (let x = x0; x <= x1; x++) c.put(x, y, col); };
const vline = (c, x, y0, y1, col) => { for (let y = y0; y <= y1; y++) c.put(x, y, col); };
/** A filled ellipse shaded by a light from the upper left. */
function ball(c, cx, cy, rx, ry, colors, lift = 0) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry, d = nx * nx + ny * ny;
    if (d > 1) continue;
    c.put(x, y, ramp(colors, 0.62 + lift - nx * 0.28 - ny * 0.34 - d * 0.18, x, y));
  }
}
const groundShadow = (cx, cy, rx, ry, a = 90) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d <= 1) shadow.put(x, y, PAL.shadow, Math.round(a * (1 - d * 0.6))); } };

// ── Ground: lanes, garden soil, mud, straw ──────────────────────────────
function dirt(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const edge = Math.min(x - x0, x0 + w - 1 - x, y - y0, y0 + h - 1 - y);
    if (edge < 2 && rand(x, y, 3) < 0.55 - edge * 0.2) continue;
    ground.put(x, y, ramp(C.road, 0.6 + (rand(x, y, 8) - 0.5) * 0.4 - (edge < 2 ? 0.25 : 0), x, y));
    if (rand(x, y, 21) < 0.012) ground.put(x, y, C.road[0]); // pebbles
  }
}
for (const [c, r, w, h] of L.lanes.rects) { dirt(c * T - 2, r * T - 2, w * T + 4, h * T + 4); mark(c, r, w, h); }

// pig mud
{
  const [mc, mr, mw, mh] = L.mud;
  const cx = (mc + mw / 2) * T, cy = (mr + mh / 2) * T, rx = (mw / 2) * T, ry = (mh / 2) * T;
  for (let y = mr * T - 4; y < (mr + mh) * T + 4; y++) for (let x = mc * T - 4; x < (mc + mw) * T + 4; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (rand(x >> 2, y >> 2, 5) - 0.5) * 0.3;
    if (d > 1) continue;
    ground.put(x, y, ramp(C.mud, 0.6 - d * 0.4 + (rand(x, y, 9) - 0.5) * 0.25, x, y));
    if (d < 0.5 && rand(x, y, 31) < 0.02) ground.put(x, y, C.mud[3]); // wet glints
  }
  mark(mc, mr, mw, mh);
}
// straw: the barn apron and the hen yard
const strew = (c, r, w, h, n, seed) => {
  for (let k = 0; k < n; k++) {
    const x = c * T + Math.floor(rand(k, seed) * w * T), y = r * T + Math.floor(rand(seed, k) * h * T);
    ground.put(x, y, C.straw[2 + (k % 2)]); ground.put(x + 1, y, C.straw[1]); if (k % 3 === 0) ground.put(x + 1, y + 1, C.straw[3]);
  }
};
strew(42, 12, 12, 3, 160, 41);
{ const [kc, kr, kw, kh] = L.paddocks.chicken; strew(kc, kr - 2, kw, kh + 2, 320, 43); }

// ── The pond ────────────────────────────────────────────────────────────
{
  const [pc, pr, pw, ph] = L.pond;
  const cx = (pc + pw / 2) * T, cy = (pr + ph / 2) * T, rx = (pw / 2) * T - 4, ry = (ph / 2) * T - 4;
  // a lumpy, kidney-ish outline
  const at = (x, y) => {
    const a = Math.atan2(y - cy, x - cx);
    const wob = 1 + 0.1 * Math.sin(a * 3 + 0.7) + 0.06 * Math.sin(a * 5 + 2.1);
    return (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) / (wob * wob);
  };
  for (let y = pr * T - 6; y < (pr + ph) * T + 6; y++) for (let x = pc * T - 6; x < (pc + pw) * T + 6; x++) {
    const d = at(x, y);
    if (d > 1.12) continue;
    if (d > 0.9) ground.put(x, y, ramp(C.shore, 0.75 - (d - 0.9) * 3 + (rand(x, y, 2) - 0.5) * 0.3, x, y));
    else {
      // deeper in the middle, a lit rim on the far (north) bank, soft ripples
      const depth = 1 - d;
      const rim = y < cy && d > 0.72 ? 0.18 : 0;
      const ripple = (y + Math.round(Math.sin(x / 9) * 2)) % 11 === 0 && rand(x >> 2, y, 6) < 0.6 ? 0.22 : 0;
      ground.put(x, y, ramp(C.water, 0.72 - depth * 0.45 + rim + ripple, x, y));
    }
  }
  for (let r = pr - 1; r < pr + ph + 1; r++) for (let c = pc - 1; c < pc + pw + 1; c++) {
    if (at(c * T + 8, r * T + 8) <= 0.9) water.add(`${c},${r}`);
    if (at(c * T + 8, r * T + 8) <= 1.12) mark(c, r);
  }
  // lily pads with a flower or two, and a glint of sky
  for (const [lx, ly, flower] of [[0.32, 0.38, true], [0.62, 0.56, false], [0.46, 0.7, true], [0.72, 0.34, false], [0.25, 0.62, false]]) {
    const x = Math.round(pc * T + lx * pw * T), y = Math.round(pr * T + ly * ph * T);
    ball(ground, x, y, 5, 3.5, C.cabbage); ground.put(x + 2, y - 1, C.water[1]); ground.put(x + 3, y - 1, C.water[1]); ground.put(x + 3, y, C.water[1]);
    if (flower) { for (const [dx, dy] of [[-1, -2], [0, -3], [1, -2], [0, -2]]) ground.put(x + dx, y + dy, dx === 0 && dy === -2 ? C.yellow : C.pink); }
  }
  for (let k = 0; k < 6; k++) { const x = Math.round(cx - rx * 0.4 + k * 5), y = Math.round(cy - ry * 0.25 + (k % 2)); ground.put(x, y, C.water[4]); ground.put(x + 1, y, C.water[4]); }
  // reeds and cattails round the banks (not the south bank, where the ducks come up)
  for (let k = 0; k < 34; k++) {
    const a = rand(k, 77) * Math.PI * 2;
    if (Math.sin(a) > 0.25) continue;
    const wob = 1 + 0.1 * Math.sin(a * 3 + 0.7) + 0.06 * Math.sin(a * 5 + 2.1);
    const x = Math.round(cx + Math.cos(a) * (rx + 3) * wob), y = Math.round(cy + Math.sin(a) * (ry + 3) * wob);
    for (let j = 0; j < 3; j++) {
      const hgt = 9 + ((k + j) % 4) * 2, bx = x + j * 2 - 2;
      vline(lower, bx, y - hgt, y, C.reed[1 + (j % 3)]);
      if (j === 1 && k % 2 === 0) { lower.rect(bx, y - hgt - 4, 2, 5, C.mud[2]); lower.put(bx, y - hgt - 4, C.mud[3]); }
    }
  }
}

// ── The garden: tilled beds and their crops ─────────────────────────────
function bed(c, r, w, h) {
  const x0 = c * T + 1, y0 = r * T + 2, x1 = (c + w) * T - 2, y1 = (r + h) * T - 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const furrow = (y - y0) % 8;
    ground.put(x, y, ramp(C.soil, (furrow === 6 ? 0.18 : furrow === 7 ? 0.32 : 0.62) + (rand(x, y, 12) - 0.5) * 0.25, x, y));
  }
  // a little timber edging
  line(ground, x0, x1, y0, C.bark[2]); line(ground, x0, x1, y1, C.bark[1]); vline(ground, x0, y0, y1, C.bark[2]); vline(ground, x1, y0, y1, C.bark[1]);
  line(ground, x0 - 1, x1 + 1, y0 - 1, INK); line(ground, x0 - 1, x1 + 1, y1 + 1, INK); vline(ground, x0 - 1, y0, y1, INK); vline(ground, x1 + 1, y0, y1, INK);
  mark(c, r, w, h);
}
// The beds are walkable soil: their crops are real nodes the game draws and
// players pick (src/lib/ranchPicks.ts), planted along each bed's back row.
for (const [c, r, w, h] of L.beds) bed(c, r, w, h);
for (const [c, r] of L.sunflowers) {
  const x = c * T + 8, y = r * T + 14;
  vline(lower, x, y - 26, y, C.corn[1]); vline(lower, x + 1, y - 26, y, C.corn[2]);
  for (const [lx, ly, d] of [[x - 1, y - 10, -1], [x + 2, y - 16, 1]]) for (let k = 0; k < 4; k++) lower.put(lx + d * k, ly + (k > 1 ? 1 : 0), C.corn[3]);
  for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; ball(lower, x + 0.5 + Math.cos(ang) * 5, y - 29 + Math.sin(ang) * 5, 2, 2, C.sunPetal); }
  ball(lower, x + 0.5, y - 29, 3.2, 3.2, C.mud, 0.1);
  block(c, r); mark(c, r);
}
{
  // the scarecrow: a straw-hatted fellow on a post, arms out
  const [c, r] = L.scarecrow, x = c * T + 8, y = r * T + 15;
  vline(lower, x, y - 22, y, C.bark[1]); vline(lower, x + 1, y - 22, y, C.bark[2]);
  line(lower, x - 9, x + 10, y - 17, C.bark[2]); line(lower, x - 9, x + 10, y - 16, C.bark[1]);
  shade(lower, x - 5, y - 19, 12, 9, [hex(0x2a4a8a), hex(0x3a62b0), hex(0x5a82d0)], (px) => 0.7 - (px - x) * 0.04); // patched shirt
  lower.rect(x - 1, y - 16, 3, 3, C.red);
  ball(lower, x + 0.5, y - 23, 4, 4, C.straw, 0.1); // sack head
  lower.put(x - 1, y - 24, INK); lower.put(x + 2, y - 24, INK); line(lower, x - 1, x + 2, y - 21, C.straw[0]);
  line(lower, x - 7, x + 8, y - 26, C.straw[1]); shade(lower, x - 3, y - 31, 8, 5, C.straw, () => 0.7); line(lower, x - 3, x + 4, y - 27, C.red); // hat with a band
  for (const [sx, sy] of [[x - 10, y - 17], [x + 11, y - 17], [x - 10, y - 15], [x + 11, y - 15]]) lower.put(sx, sy, C.straw[3]); // straw cuffs
  block(c, r); mark(c, r);
}
for (const [c, r] of L.beehives) {
  const x = c * T + 2, y = r * T + 2;
  groundShadow(x + 6, y + 14, 8, 2.5);
  for (let k = 0; k < 3; k++) shade(lower, x, y + k * 4, 13, 4, C.hive, (px) => 0.75 - (px - x) * 0.03 - (k === 2 ? 0.1 : 0));
  for (let k = 0; k < 3; k++) line(lower, x, x + 12, y + k * 4 + 3, C.hive[0]);
  line(lower, x - 1, x + 13, y - 1, C.barn[3]); line(lower, x - 1, x + 13, y - 2, C.barn[4]); // red lid
  lower.rect(x + 5, y + 10, 3, 1, INK); // entrance
  for (const [bx, by] of [[x + 15, y + 2], [x - 3, y + 6], [x + 14, y + 9]]) { lower.put(bx, by, C.yellow); lower.put(bx + 1, by, INK); }
  block(c, r); mark(c, r);
}
{
  const [c, r] = L.bucket[0], x = c * T + 4, y = r * T + 4;
  shade(lower, x, y, 9, 9, C.metal, (px) => 0.75 - (px - x) * 0.06);
  ball(lower, x + 4, y + 1, 4, 1.5, C.water, 0.1);
  line(lower, x + 1, x + 7, y - 3, C.metal[1]); lower.put(x, y - 2, C.metal[1]); lower.put(x + 8, y - 2, C.metal[1]);
  block(c, r); mark(c, r);
}

// ── Fences ──────────────────────────────────────────────────────────────
const wood = (t) => ramp(PAL.wood, t, 0, 0);
function post(x, y0, y1) {
  for (let y = y0; y <= y1; y++) { lower.put(x, y, wood(0.85)); lower.put(x + 1, y, wood(0.62)); lower.put(x + 2, y, wood(0.45)); lower.put(x + 3, y, wood(0.22)); }
  lower.put(x + 1, y0, wood(0.95)); lower.put(x + 2, y0, wood(0.8));
}
function hFence(col, row, postRight) {
  const x = col * T, y = row * T;
  for (let k = 0; k < T; k++) {
    for (const [ry, t] of [[y + 5, 0.82], [y + 6, 0.6], [y + 7, 0.3], [y + 10, 0.82], [y + 11, 0.6], [y + 12, 0.3]]) lower.put(x + k, ry, wood(t + (rand(x + k, ry, 4) - 0.5) * 0.12));
  }
  post(x + 1, y + 2, y + 14);
  if (postRight) post(x + 12, y + 2, y + 14);
  shadow.rect(x, y + 13, T, 2, PAL.shadow, 50);
  block(col, row); mark(col, row);
}
function vFence(col, row) {
  const x = col * T + 6, y = row * T;
  // two thin rails seen from above, and a stout post with a lit cap each tile
  for (let k = 0; k < T; k++) { lower.put(x, y + k, wood(0.7)); lower.put(x + 1, y + k, wood(0.38)); lower.put(x + 3, y + k, wood(0.7)); lower.put(x + 4, y + k, wood(0.38)); }
  for (let py = y + 2; py <= y + 10; py++) for (let k = 0; k < 6; k++) lower.put(x - 1 + k, py, wood(k === 0 ? 0.9 : k === 5 ? 0.18 : 0.62 - k * 0.06));
  for (let k = 0; k < 6; k++) { lower.put(x - 1 + k, y + 1, wood(0.95)); lower.put(x - 1 + k, y + 11, wood(0.15)); }
  shadow.rect(x + 3, y, 2, T, PAL.shadow, 45);
  block(col, row); mark(col, row);
}
const hRun = (row, c0, c1, gaps) => { for (let c = c0; c <= c1; c++) if (!inSpan(gaps, c)) hFence(c, row, c === c1 || gaps.some(([a]) => c === a - 1)); };
const vRun = (col, r0, r1, gaps) => { for (let r = r0; r <= r1; r++) if (!inSpan(gaps, r)) vFence(col, r); };
hRun(TOP, LEFT, RIGHT, L.gates.north);
hRun(BOTTOM, LEFT, RIGHT, L.gates.south);
vRun(LEFT, TOP + 1, BOTTOM - 1, L.gates.west);
vRun(RIGHT, TOP + 1, BOTTOM - 1, L.gates.east);
for (const [row, c0, c1, gaps] of L.inner.h) hRun(row, c0, c1, gaps);
for (const [col, r0, r1, gaps] of L.inner.v) vRun(col, r0, r1, gaps);

// ── Buildings ───────────────────────────────────────────────────────────
/** A window: frame, four panes with a lit corner, shutters (house) or trim. */
function windowAt(x, y, w, h, { shutters = false, box = false } = {}) {
  lower.rect(x - 1, y - 1, w + 2, h + 2, C.white);
  shade(lower, x, y, w, h, PAL.glass, (px, py) => 0.35 + (py - y) * 0.05 + ((px - x) + (py - y) < 4 ? 0.4 : 0));
  vline(lower, x + (w >> 1), y, y + h - 1, C.white); line(lower, x, x + w - 1, y + (h >> 1), C.white);
  if (shutters) for (const sx of [x - 6, x + w + 1]) { shade(lower, sx, y - 1, 5, h + 2, C.shutter, (px) => 0.7 - (px - sx) * 0.1); for (let k = y + 1; k < y + h; k += 3) line(lower, sx + 1, sx + 3, k, C.shutter[0]); }
  if (box) { shade(lower, x - 2, y + h + 1, w + 4, 3, PAL.wood, () => 0.45); for (let k = 0; k < w + 2; k += 2) { lower.put(x - 1 + k, y + h, k % 4 === 0 ? C.red : C.pink); lower.put(x + k, y + h - 1, C.cabbage[2]); } }
}

// The barn: red boards, a brown shingle roof, white-trimmed doors and windows, a hay loft.
{
  const [c, r, w, h] = L.barn;
  const bx0 = c * T + 2, bx1 = (c + w) * T - 3, bTop = (r + 5) * T, bBottom = (r + h) * T - 2;
  for (let y = bTop; y <= bBottom; y++) for (let x = bx0; x <= bx1; x++) {
    const k = (x - bx0) % 6;
    lower.put(x, y, ramp(C.barn, 0.6 + (k === 0 ? -0.35 : k === 1 ? 0.15 : 0) - (y - bTop) * 0.002 + (rand(x, y >> 2, 6) - 0.5) * 0.08, x, y));
  }
  const mid = Math.round((bx0 + bx1) / 2), rw = (bx1 - bx0) / 2 + 8, rTop = r * T + 4;
  for (let y = rTop; y <= bTop + 2; y++) {
    const t = (y - rTop) / (bTop + 2 - rTop);
    const half = t < 0.4 ? 26 + (t / 0.4) * (rw * 0.55 - 26) : rw * 0.55 + ((t - 0.4) / 0.6) * (rw * 0.45);
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) {
      const row = (y - rTop) % 5, off = (Math.floor((y - rTop) / 5) % 2) * 3;
      lower.put(x, y, ramp(PAL.roofBrown, 0.66 - (row === 4 ? 0.42 : (x + off) % 7 === 0 ? 0.2 : 0) + (t < 0.4 ? 0.08 : 0) + (x < mid ? 0.04 : -0.03) + (rand(x >> 2, y, 3) < 0.04 ? 0.25 : 0), x, y));
    }
  }
  line(lower, mid - 26, mid + 26, rTop - 1, INK);
  line(lower, Math.round(mid - rw), Math.round(mid + rw), bTop + 3, INK);
  // moss on the roof, and the weathervane
  for (let k = 0; k < 12; k++) { const x = mid - 40 + Math.floor(rand(k, 3) * 80), y = rTop + 10 + Math.floor(rand(3, k) * 30); lower.put(x, y, C.cabbage[1]); lower.put(x + 1, y, C.cabbage[2]); }
  vline(lower, mid, rTop - 16, rTop - 1, INK); line(lower, mid - 6, mid + 6, rTop - 12, INK); lower.rect(mid - 4, rTop - 16, 6, 2, INK); lower.put(mid + 2, rTop - 17, INK);
  // hay loft: dark doorway, a pulley beam, bales peeking out
  const lx = mid - 12, ly = bTop - 30;
  shade(lower, lx - 2, ly - 2, 28, 26, C.barn, () => 0.25);
  shade(lower, lx, ly, 24, 22, PAL.wood, () => 0.12);
  for (let x = lx + 1; x < lx + 23; x++) for (let y = ly + 12; y < ly + 22; y++) lower.put(x, y, ramp(C.straw, 0.6 + (rand(x, y, 2) - 0.5) * 0.4, x, y));
  line(lower, lx - 4, lx + 27, ly - 4, C.white); vline(lower, mid, ly - 10, ly - 4, PAL.wood[1]); line(lower, mid - 6, mid + 6, ly - 10, PAL.wood[2]);
  // big doors with white X bracing
  const white = C.white;
  const dx0 = mid - 26, dx1 = mid + 26, dTop = bTop + 22;
  for (let y = dTop; y <= bBottom; y++) for (let x = dx0; x <= dx1; x++) lower.put(x, y, ramp(C.barn, 0.42 + ((x - dx0) % 4 === 0 ? -0.2 : 0), x, y));
  for (const [x0, x1] of [[dx0, mid], [mid, dx1]]) {
    line(lower, x0, x1, dTop, white); line(lower, x0, x1, bBottom - 1, white); vline(lower, x0, dTop, bBottom, white); vline(lower, x1, dTop, bBottom, white);
    const n = bBottom - dTop;
    for (let i = 0; i <= n; i++) { lower.put(Math.round(x0 + ((x1 - x0) * i) / n), dTop + i, white); lower.put(Math.round(x1 - ((x1 - x0) * i) / n), dTop + i, white); }
  }
  for (const wx of [bx0 + 14, bx1 - 30]) windowAt(wx, bTop + 18, 16, 14);
  for (const x of [bx0 + 3, bx1 - 3]) vline(lower, x, bTop, bBottom, white);
  softShadow(shadow, bx0 - 2, bBottom + 1, bx1 - bx0 + 5, 9, 120);
  blockRect(c, r + 5, w, h - 5); mark(c, r, w, h);
}

// The silo: a white cylinder with hoops and a red dome.
{
  const [c, r, w, h] = L.silo;
  const x0 = c * T + 6, x1 = (c + w) * T - 7, top = (r + 2) * T, bottom = (r + h) * T - 2, mid = (x0 + x1) / 2, half = (x1 - x0) / 2;
  for (let y = top; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
    const n = (x - mid) / half; // −1 … 1 across the curve
    const hoop = (y - top) % 14 === 0 ? -0.3 : (y - top) % 14 === 1 ? 0.1 : 0;
    lower.put(x, y, ramp(C.silo, 0.72 - n * 0.32 - n * n * 0.22 + hoop, x, y));
  }
  for (let y = top - 14; y < top + 2; y++) {
    const t = (y - (top - 14)) / 16, hw = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)) * (half + 2);
    for (let x = Math.round(mid - hw); x <= Math.round(mid + hw); x++) lower.put(x, y, ramp(PAL.roofRed, 0.72 - ((x - mid) / (half + 2)) * 0.35 - (y % 4 === 0 ? 0.15 : 0), x, y));
  }
  line(lower, x0 - 1, x1 + 1, top + 1, INK);
  lower.rect(Math.round(mid) - 1, top - 17, 3, 3, C.metal[2]);
  // ladder up the side, a little hatch at the bottom
  for (let y = top + 4; y < bottom - 4; y++) { lower.put(x1 - 5, y, C.metal[1]); lower.put(x1 - 1, y, C.metal[1]); if (y % 4 === 0) line(lower, x1 - 5, x1 - 1, y, C.metal[2]); }
  shade(lower, Math.round(mid) - 6, bottom - 16, 12, 15, PAL.wood, (px) => 0.4 + ((px & 3) === 0 ? -0.15 : 0));
  softShadow(shadow, x0 - 2, bottom + 1, x1 - x0 + 5, 7, 110);
  blockRect(c, r + h - 3, w, 3); mark(c, r, w, h);
}

// The tool shed: grey-brown boards, a mossy roof, a door and a window.
{
  const [c, r, w, h] = L.shed;
  const x0 = c * T + 4, x1 = (c + w) * T - 5, wallTop = (r + 2) * T + 6, bottom = (r + h) * T - 2;
  for (let y = wallTop; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
    const k = (x - x0) % 5;
    lower.put(x, y, ramp(C.cream, 0.5 + (k === 0 ? -0.35 : k === 1 ? 0.12 : 0) + (rand(x, y >> 3, 7) - 0.5) * 0.08, x, y));
  }
  const roofTop = r * T + 4;
  for (let y = roofTop; y <= wallTop + 3; y++) {
    const inset = Math.round(((wallTop + 3 - y) / (wallTop + 3 - roofTop)) * 10);
    for (let x = x0 - 5 + inset; x <= x1 + 5 - inset; x++) {
      const row = (y - roofTop) % 5;
      lower.put(x, y, ramp(PAL.roofBrown, 0.6 - (row === 4 ? 0.4 : 0) + (rand(x >> 1, y, 5) < 0.06 ? 0.3 : 0), x, y));
      if (rand(x >> 2, y >> 1, 9) < 0.05) lower.put(x, y, C.cabbage[1]);
    }
  }
  line(lower, x0 - 5, x1 + 5, wallTop + 4, INK);
  const dx = x0 + 10;
  shade(lower, dx, bottom - 26, 18, 26, PAL.wood, (px) => 0.38 + ((px - dx) % 6 === 0 ? -0.15 : 0));
  line(lower, dx, dx + 17, bottom - 13, PAL.wood[3]); for (let i = 0; i < 13; i++) lower.put(dx + Math.round(i * 1.35), bottom - 13 + i, PAL.wood[3]);
  windowAt(x1 - 30, wallTop + 10, 16, 12);
  // tools leaning on the wall: a rake and a pitchfork
  for (const [tx, tine] of [[x1 + 2, 4], [x0 - 4, 3]]) { vline(lower, tx, bottom - 30, bottom, PAL.wood[2]); for (let k = 0; k < tine; k++) vline(lower, tx - 2 + k * 2, bottom - 34, bottom - 30, C.metal[2]); line(lower, tx - 2, tx + 2 * tine - 2, bottom - 30, C.metal[1]); }
  softShadow(shadow, x0 - 2, bottom + 1, x1 - x0 + 5, 7, 100);
  blockRect(c, r + 3, w, h - 3); mark(c, r, w, h);
}

// The well: a round stone wall, a little red roof on posts, a bucket on the rope.
{
  const [c, r, w, h] = L.well;
  const cx = (c + w / 2) * T, base = (r + h) * T - 4;
  for (let y = base - 14; y <= base; y++) for (let x = cx - 18; x <= cx + 18; x++) {
    const n = (x - cx) / 18, row = (y - (base - 14)) % 5, off = (Math.floor((y - base) / 5) & 1) * 4;
    lower.put(x, y, ramp(PAL.stone, 0.62 - n * 0.25 - (row === 4 ? 0.3 : (x + off) % 9 === 0 ? 0.2 : 0), x, y));
  }
  ball(lower, cx, base - 15, 18, 4, PAL.stone, 0.1); ball(lower, cx, base - 15, 14, 2.5, C.water, -0.35);
  for (const px of [cx - 16, cx + 13]) shade(lower, px, base - 40, 4, 26, PAL.wood, (x) => 0.7 - (x - px) * 0.12);
  for (let y = base - 50; y <= base - 38; y++) { const half = 6 + (y - (base - 50)) * 1.6; for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) lower.put(x, y, ramp(PAL.roofRed, 0.72 - ((y - base) % 4 === 0 ? 0.3 : 0) - (x - cx) * 0.006, x, y)); }
  line(lower, cx - 13, cx + 13, base - 33, PAL.wood[2]); vline(lower, cx, base - 33, base - 25, C.straw[0]);
  shade(lower, cx - 3, base - 25, 7, 6, C.metal, (x) => 0.7 - (x - cx) * 0.05);
  groundShadow(cx, base + 2, 20, 3, 80);
  blockRect(c, r + 1, w, h - 1); mark(c, r, w, h);
}

// The hens' coop: white boards, a red roof, nest windows, a ramp.
{
  const [cc, cr, cw, ch] = L.coop;
  const cx0 = cc * T + 4, cx1 = (cc + cw - 1) * T + 10, wTop = (cr + 2) * T + 6, cBottom = (cr + ch - 1) * T + 14, rTop = cr * T;
  for (let y = wTop; y <= cBottom; y++) for (let x = cx0; x <= cx1; x++) {
    const k = (x - cx0) % 5;
    lower.put(x, y, ramp(PAL.board, 0.72 + (k === 0 ? 0.2 : k === 4 ? -0.3 : 0), x, y));
  }
  const mid = (cx0 + cx1) / 2;
  for (let y = rTop; y <= wTop + 2; y++) {
    const half = ((y - rTop) / (wTop + 2 - rTop)) * ((cx1 - cx0) / 2 + 8);
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) lower.put(x, y, ramp(PAL.roofRed, 0.75 - ((y - rTop) % 6 === 5 ? 0.5 : 0) - (x - mid) * 0.003, x, y));
  }
  line(lower, Math.round(mid - ((cx1 - cx0) / 2 + 8)), Math.round(mid + ((cx1 - cx0) / 2 + 8)), wTop + 3, INK);
  for (const nx of [cx0 + 10, cx0 + 40, cx0 + 70]) {
    shade(lower, nx, wTop + 8, 14, 10, PAL.glassLit, (px, py) => 0.35 + (py - wTop - 8) * 0.03);
    for (let x = nx + 1; x < nx + 13; x++) lower.put(x, wTop + 16, C.straw[3]);
  }
  const hatch = cx1 - 22;
  shade(lower, hatch, cBottom - 12, 10, 12, PAL.wood, () => 0.25);
  for (let k = 0; k < 12; k++) line(ground, hatch - 1 + k, hatch + 9 + k, cBottom + 1 + Math.floor(k / 3), k % 3 === 0 ? PAL.wood[1] : PAL.wood[3]);
  softShadow(shadow, cx0 - 2, cBottom + 1, cx1 - cx0 + 5, 6, 100);
  blockRect(cc, cr + 3, cw, ch - 3); mark(cc, cr, cw, ch);
}

// The doghouse: little red walls, a dark arch, a bowl.
{
  const [c, r] = L.doghouse, x0 = c * T + 2, y0 = r * T + 6, x1 = x0 + 27, bottom = (r + 2) * T - 2;
  shade(lower, x0, y0 + 8, 28, bottom - y0 - 7, C.barn, (px) => 0.62 + ((px - x0) % 5 === 0 ? -0.25 : 0));
  for (let y = y0 - 4; y <= y0 + 9; y++) { const half = 6 + (y - (y0 - 4)) * 1.3; for (let x = Math.round(x0 + 14 - half); x <= Math.round(x0 + 14 + half); x++) lower.put(x, y, ramp(PAL.roofBrown, 0.62 - ((y - y0) % 4 === 0 ? 0.3 : 0), x, y)); }
  ball(lower, x0 + 14, bottom - 6, 6, 7, [INK, hex(0x1a1410)]);
  lower.rect(x0 + 8, bottom - 6, 13, 7, INK);
  ball(lower, x1 + 6, bottom - 1, 4, 2, C.metal); lower.rect(x1 + 4, bottom - 2, 4, 1, C.mud[2]);
  groundShadow(x0 + 14, bottom + 2, 16, 2.5);
  blockRect(c, r, 2, 2); mark(c, r, 3, 2);
}

// ── Little things ───────────────────────────────────────────────────────
for (const [c, r] of L.lamps) {
  const x = c * T + 7, base = r * T + 15;
  groundShadow(x + 1, base, 5, 2, 80);
  shade(lower, x - 2, base - 3, 6, 3, C.metal, () => 0.35);
  for (let y = base - 30; y < base - 2; y++) { lower.put(x, y, C.metal[1]); lower.put(x + 1, y, C.metal[0]); }
  shade(lower, x - 3, base - 38, 8, 8, PAL.glassLit, (px, py) => 0.85 - (py - (base - 38)) * 0.04);
  line(lower, x - 4, x + 5, base - 39, C.metal[0]); line(lower, x - 3, x + 4, base - 40, C.metal[0]); line(lower, x - 4, x + 5, base - 30, C.metal[0]);
  vline(lower, x - 4, base - 38, base - 31, C.metal[0]); vline(lower, x + 5, base - 38, base - 31, C.metal[0]); lower.put(x, base - 42, C.metal[1]);
  block(c, r); mark(c, r);
}
{
  // washing on the line between two posts
  const [c, r, len] = L.clothesline, x0 = c * T + 4, x1 = (c + len) * T - 4, base = r * T + 15;
  for (const px of [x0, x1]) { vline(lower, px, base - 26, base, PAL.wood[1]); vline(lower, px + 1, base - 26, base, PAL.wood[3]); line(lower, px - 3, px + 4, base - 26, PAL.wood[2]); }
  for (let x = x0; x <= x1; x++) lower.put(x, base - 24 + Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 3), C.white);
  const shirts = [[C.blue, 10, 12], [C.red, 9, 10], [C.white, 11, 13], [C.yellow, 9, 9], [C.violet, 10, 12], [C.pink, 8, 10]];
  let x = x0 + 8;
  for (const [col, w, h] of shirts) {
    if (x + w > x1 - 4) break;
    const sag = Math.round(Math.sin(((x + w / 2 - x0) / (x1 - x0)) * Math.PI) * 3);
    const y = base - 23 + sag;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) lower.put(xx, yy, col);
    line(lower, x, x + w - 1, y + h - 1, PAL.shadow); vline(lower, x + w - 1, y, y + h - 1, PAL.shadow);
    lower.put(x + 2, y, C.straw[0]); lower.put(x + w - 3, y, C.straw[0]);
    x += w + 6;
  }
  block(c, r); block(c + len - 1, r); mark(c, r, len);
}
{
  // a stack of firewood under a little lean-to, and a chopping stump with an axe
  const [c, r] = L.firewood, x0 = c * T + 1, base = r * T + 15;
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - (row === 2 ? 1 : 0); k++) {
    const lx = x0 + 3 + k * 7 + (row === 2 ? 3 : 0), ly = base - 4 - row * 6;
    ball(lower, lx, ly, 3.5, 3.2, PAL.log); ball(lower, lx, ly, 1.8, 1.6, C.straw, -0.1);
  }
  line(lower, x0 - 1, x0 + 30, base - 21, PAL.roofBrown[2]); line(lower, x0 - 1, x0 + 30, base - 22, PAL.roofBrown[3]);
  groundShadow(x0 + 14, base + 1, 16, 2.5);
  block(c, r); block(c + 1, r); mark(c, r, 2);
  const [sc, sr] = L.stump, sx = sc * T + 8, sb = sr * T + 13;
  shade(lower, sx - 7, sb - 8, 14, 8, PAL.log, (px) => 0.6 - Math.abs(px - sx) * 0.04);
  ball(lower, sx, sb - 9, 7, 2.5, C.straw, 0.05); ball(lower, sx, sb - 9, 3, 1, C.straw, -0.2);
  line(lower, sx - 1, sx + 6, sb - 18, PAL.wood[3]); for (let k = 0; k < 4; k++) lower.put(sx - 1 + k, sb - 18 + k, PAL.wood[2]);
  shade(lower, sx - 3, sb - 13, 4, 4, C.metal, () => 0.7);
  block(sc, sr); mark(sc, sr);
}
{
  const [c, r] = L.wheelbarrow, x = c * T + 2, y = r * T + 6;
  shade(lower, x, y, 18, 7, C.barn, (px, py) => 0.62 - (py - y) * 0.05);
  for (const dx of [3, 8, 13]) ball(lower, x + dx, y - 1, 3, 2.5, C.pumpkin);
  ball(lower, x + 2, y + 9, 3, 3, C.metal, -0.1); line(lower, x + 17, x + 26, y + 3, PAL.wood[2]); vline(lower, x + 16, y + 6, y + 10, PAL.wood[1]);
  groundShadow(x + 12, y + 11, 13, 2);
  block(c, r); block(c + 1, r); mark(c, r, 2);
}
for (const [c, r] of L.crates) {
  const x = c * T + 1, y = r * T + 2;
  shade(lower, x, y, 14, 13, PAL.wood, (px, py) => 0.62 - (py - y) * 0.02 + ((py - y) % 5 === 0 ? -0.25 : 0));
  for (let i = 0; i < 13; i++) lower.put(x + i, y + i, PAL.wood[1]);
  lower.rect(x, y, 14, 1, PAL.wood[4]);
  block(c, r); mark(c, r);
}
for (const [c, r] of L.sacks) {
  const x = c * T + 8, y = r * T + 9;
  ball(lower, x, y, 6, 6, C.cream, -0.05); lower.rect(x - 2, y - 8, 5, 3, C.cream[1]); line(lower, x - 3, x + 3, y - 6, C.straw[0]);
  lower.put(x - 1, y, C.cream[0]); lower.put(x + 1, y + 2, C.cream[0]);
  block(c, r); mark(c, r);
}
for (const [c, r] of L.hay) {
  const x = c * T, y = r * T + 3;
  for (let py = y; py < y + 12; py++) for (let px = x; px < x + 16; px++) lower.put(px, py, ramp(C.straw, 0.74 - (py - y) * 0.035 + (rand(px, py, 4) - 0.5) * 0.25, px, py));
  for (const by of [y + 3, y + 8]) line(lower, x, x + 15, by, C.straw[0]);
  for (let k = 0; k < 6; k++) lower.put(x + Math.floor(rand(k, c) * 16), y - 1, C.straw[3]);
  softShadow(shadow, x - 1, y + 12, 18, 3, 80);
  block(c, r); mark(c, r);
}
for (const [c, r] of L.hayroll) {
  const x = c * T + 8, y = r * T + 8;
  shade(lower, x - 9, y - 8, 15, 15, C.straw, (px, py) => 0.66 - (py - y) * 0.03 + (rand(px, py, 3) - 0.5) * 0.2);
  ball(lower, x + 6, y, 4, 7.5, C.straw, 0.1);
  for (let k = 1; k < 4; k++) ball(lower, x + 6, y, k, k * 1.8, [C.straw[1 + (k % 2)], C.straw[1 + (k % 2)]]);
  softShadow(shadow, x - 10, y + 7, 22, 3, 80);
  block(c, r); block(c + 1, r); mark(c, r, 2);
}
for (const [c, r] of L.milkcan) {
  const x = c * T + 4, y = r * T + 2;
  shade(lower, x, y + 4, 9, 10, C.metal, (px) => 0.82 - (px - x) * 0.06);
  ball(lower, x + 4, y + 3, 3, 2, C.metal, 0.1); lower.rect(x + 3, y, 3, 2, C.metal[2]);
  line(lower, x, x + 8, y + 8, C.metal[1]);
  block(c, r); mark(c, r);
}
for (const [c, r] of L.troughs) {
  const x0 = c * T + 2, y0 = r * T + 4;
  shade(lower, x0, y0, 28, 9, PAL.wood, (px, py) => 0.55 - (py - y0) * 0.04);
  shade(lower, x0 + 2, y0 + 1, 24, 3, PAL.glass, () => 0.6);
  for (const lx of [x0 + 2, x0 + 24]) vline(lower, lx, y0 + 9, y0 + 11, PAL.wood[1]);
  softShadow(shadow, x0 - 1, y0 + 11, 30, 3, 90);
  block(c, r); block(c + 1, r); mark(c, r, 2);
}
for (const [c, r] of L.logs) {
  const x = c * T + 2, y = r * T + 6;
  shade(lower, x, y, 26, 8, PAL.log, (px, py) => 0.68 - (py - y) * 0.06 + ((px * 7) % 11 === 0 ? -0.2 : 0));
  ball(lower, x + 26, y + 4, 3, 4, C.straw, -0.05); ball(lower, x + 26, y + 4, 1.5, 2, C.straw, -0.25);
  for (const k of [6, 15]) { lower.put(x + k, y - 1, C.cabbage[2]); lower.put(x + k + 1, y - 2, C.cabbage[1]); } // a sprout or two
  softShadow(shadow, x, y + 8, 28, 3, 80);
  block(c, r); block(c + 1, r); mark(c, r, 2);
}
for (const [c, r] of L.rocks) {
  const x = c * T + 8, y = r * T + 9;
  groundShadow(x + 1, y + 5, 8, 2.5);
  ball(lower, x, y, 7, 5.5, PAL.stone); ball(lower, x + 5, y + 2, 4, 3.5, PAL.stone, -0.08);
  lower.put(x - 3, y - 2, PAL.stone[5]); lower.put(x - 2, y - 3, PAL.stone[5]);
  if (c % 2) { lower.put(x - 4, y + 1, C.cabbage[1]); lower.put(x + 1, y - 4, C.cabbage[2]); } // moss
  block(c, r); mark(c, r);
}
for (const [c, r] of L.mushrooms) {
  for (const [dx, dy, s] of [[4, 10, 3], [10, 12, 2.2], [7, 6, 2]]) {
    const x = c * T + dx, y = r * T + dy;
    vline(ground, x, y, y + 3, C.cream[3]); ball(ground, x, y, s, s * 0.7, [hex(0x8a1a1a), hex(0xc42c2c), hex(0xe85a4a)]);
    ground.put(x - 1, y - 1, C.white); ground.put(x + 1, y, C.white);
  }
  mark(c, r);
}
for (const [c, r] of L.bench) {
  const x = c * T + 1, y = r * T + 4;
  shade(lower, x, y, 28, 4, PAL.wood, () => 0.7); shade(lower, x, y - 7, 28, 3, PAL.wood, () => 0.62);
  for (const lx of [x + 3, x + 23]) { vline(lower, lx, y - 7, y + 9, PAL.wood[1]); vline(lower, lx + 1, y + 4, y + 9, PAL.wood[1]); }
  softShadow(shadow, x, y + 9, 30, 3, 80);
  block(c, r); block(c + 1, r); mark(c, r, 2);
}

// Open-fronted shelters in the paddocks: a shingle roof on four posts.
for (const [c, r, w, h] of L.shelters) {
  const x0 = c * T + 2, x1 = (c + w) * T - 3, top = r * T + 2, bottom = (r + h) * T - 2;
  ground.rect(x0 + 2, top + 18, x1 - x0 - 3, bottom - top - 18, PAL.shadow, 60);
  strew(c, r + 1, w, h - 1, 50, c * 3 + r);
  for (const px of [x0 + 2, x1 - 4]) shade(lower, px, top + 14, 3, bottom - top - 14, PAL.wood, (x) => 0.65 - (x - px) * 0.15);
  for (let y = top; y <= top + 16; y++) for (let x = x0 - 3; x <= x1 + 3; x++) lower.put(x, y, ramp(PAL.roofBrown, 0.68 - ((y - top) % 4 === 3 ? 0.4 : 0) - (y - top) * 0.01 + (rand(x >> 1, y, 7) < 0.05 ? 0.25 : 0), x, y));
  line(lower, x0 - 3, x1 + 3, top + 17, INK);
  shade(lower, x0 + 8, bottom - 12, 20, 10, C.straw, (x, y) => 0.7 - (y - (bottom - 12)) * 0.03 + (rand(x, y, 2) - 0.5) * 0.3); // a heap of hay inside
  block(c, r + h - 1); block(c + w - 1, r + h - 1); mark(c, r, w, h);
}
// Big haystacks: a domed mound of loose hay, combed by the wind.
for (const [c, r] of L.haystacks) {
  const cx = (c + 1) * T, base = r * T + 14;
  groundShadow(cx + 2, base + 1, 18, 4, 100);
  for (let y = base - 26; y <= base; y++) {
    const t = (y - (base - 26)) / 26, half = Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)) * 15 + t * 2;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) lower.put(x, y, ramp(C.straw, 0.82 - t * 0.35 - ((x - cx) / (half + 1)) * 0.22 + ((x * 3 + y) % 7 === 0 ? -0.18 : 0), x, y));
  }
  for (let k = 0; k < 10; k++) { const x = cx - 14 + Math.floor(rand(k, c) * 28); vline(lower, x, base - 2 - Math.floor(rand(c, k) * 4), base, C.straw[3]); }
  vline(lower, cx, base - 34, base - 24, PAL.wood[1]); // the pole
  block(c, r); block(c + 1, r); mark(c, r - 1, 2, 2);
}
// A hay cart: plank bed piled with hay, two spoked wheels, shafts on the ground.
for (const [c, r] of L.cart) {
  const x0 = c * T + 2, y0 = r * T;
  groundShadow(x0 + 14, y0 + 15, 18, 2.5);
  shade(lower, x0, y0 + 2, 28, 7, PAL.wood, (x, y) => 0.62 - (y - y0) * 0.03 + ((x - x0) % 7 === 0 ? -0.2 : 0));
  for (let y = y0 - 6; y < y0 + 3; y++) for (let x = x0 + 1; x < x0 + 27; x++) if (rand(x, y, 5) < 0.95 - (y0 - y) * 0.06) lower.put(x, y, ramp(C.straw, 0.7 + (rand(x, y, 6) - 0.5) * 0.4, x, y));
  for (const wx of [x0 + 5, x0 + 22]) { ball(lower, wx, y0 + 10, 4.5, 4.5, PAL.wood, -0.1); ball(lower, wx, y0 + 10, 1.5, 1.5, C.metal); for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) lower.put(wx + dx, y0 + 10 + dy, PAL.wood[1]); }
  line(lower, x0 + 28, x0 + 38, y0 + 9, PAL.wood[2]); line(lower, x0 + 28, x0 + 38, y0 + 11, PAL.wood[1]);
  block(c, r); block(c + 1, r); mark(c, r, 3, 1);
}
// A picnic table with two benches and a checked cloth.
for (const [c, r] of L.picnic) {
  const x0 = c * T + 2, y0 = r * T + 4;
  groundShadow(x0 + 20, y0 + 18, 24, 4, 80);
  shade(lower, x0 - 2, y0 - 4, 44, 3, PAL.wood, () => 0.6); // far bench
  for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 40; x++) lower.put(x, y, ((x >> 2) + (y >> 2)) % 2 ? C.red : C.white); // the cloth
  line(lower, x0, x0 + 39, y0 + 10, C.barn[1]);
  ball(lower, x0 + 10, y0 + 4, 3, 2, C.straw, 0.1); ball(lower, x0 + 26, y0 + 5, 4, 2.5, C.apple); lower.rect(x0 + 32, y0 + 2, 3, 5, C.cream[3]); // a loaf, apples, a jug
  for (const lx of [x0 + 3, x0 + 35]) vline(lower, lx, y0 + 11, y0 + 15, PAL.wood[1]);
  shade(lower, x0 - 2, y0 + 15, 44, 3, PAL.wood, () => 0.7); // near bench
  blockRect(c, r, 3, 1); mark(c, r - 1, 3, 2);
}
// Flower beds: dense little clumps of wild flowers on the grass.
for (const [c, r, w, h] of L.flowerbeds) {
  const cols = [C.pink, C.white, C.yellow, C.violet, C.red, C.blue];
  for (let k = 0; k < w * h * 9; k++) {
    const x = c * T + Math.floor(rand(k, c, 41) * w * T), y = r * T + Math.floor(rand(r, k, 42) * h * T);
    const col = cols[Math.floor(rand(k, 43) * cols.length)];
    ground.put(x, y + 1, C.grassDk); ground.put(x - 1, y + 2, C.grassMid); ground.put(x + 1, y + 2, C.grassMid);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ground.put(x + dx, y + dy - 1, col);
    ground.put(x, y - 1, col === C.yellow ? C.carrot[1] : C.yellow);
  }
  mark(c, r, w, h);
}
// The dock: grey planks out over the pond from its south bank; you can stand on it.
{
  const [c, r, w, h] = L.dock, x0 = c * T + 2, x1 = (c + w) * T - 3, y0 = r * T, y1 = (r + h) * T - 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground.put(x, y, ramp(C.metal.map((v, i) => [C.cream[0], C.cream[1], C.cream[2], C.cream[3]][i]), 0.6 - ((y - y0) % 6 === 5 ? 0.45 : 0) + (rand(x >> 2, y, 3) - 0.5) * 0.15, x, y));
  vline(ground, x0 - 1, y0, y1, INK); vline(ground, x1 + 1, y0, y1, INK); line(ground, x0 - 1, x1 + 1, y0 - 1, INK);
  for (const px of [x0 - 1, x1 - 2]) { lower.rect(px, y0 - 6, 3, 8, PAL.wood[1]); lower.put(px + 1, y0 - 6, PAL.wood[3]); }
  for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) water.delete(`${x},${y}`);
  mark(c, r, w, h);
}

// ── Trees and bushes ────────────────────────────────────────────────────
/** A clumpy round canopy: several shaded blobs, lit from the upper left. */
function canopy(cx, cy, rad, colors, seed) {
  const blobs = [[0, 0, 1]];
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + rand(seed, k) * 0.6; blobs.push([Math.cos(a) * rad * 0.55, Math.sin(a) * rad * 0.45, 0.55 + rand(k, seed) * 0.15]); }
  for (const [dx, dy, s] of blobs.sort((a, b) => a[1] - b[1])) ball(lower, cx + dx, cy + dy, rad * s, rad * s * 0.88, colors, dy < 0 ? 0.06 : -0.04);
  for (let k = 0; k < rad * 3; k++) { // leafy highlights and dark nooks
    const a = rand(k, seed, 1) * Math.PI * 2, d = rand(seed, k, 2) * rad * 0.9;
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.85);
    if (lower.alpha(x, y) < 200) continue;
    lower.put(x, y, y < cy ? colors[colors.length - 1] : colors[0]);
  }
}
function trunk(x, base, hgt, w, colors) {
  for (let y = base - hgt; y <= base; y++) for (let k = 0; k < w; k++) lower.put(x + k, y, ramp(colors, 0.65 - (k / w) * 0.5 + (rand(x + k, y >> 1, 3) - 0.5) * 0.15, x + k, y));
  lower.put(x - 1, base, colors[1]); lower.put(x + w, base, colors[0]); // roots
}
for (const [kind, c, r] of L.trees) {
  const x = c * T + 8, base = r * T + 14;
  if (kind === "pine") {
    groundShadow(x + 2, base + 1, 11, 3, 100);
    trunk(x - 2, base, 10, 4, C.bark);
    for (let tier = 0; tier < 4; tier++) {
      const top = base - 46 + tier * 9, half0 = 4 + tier * 3, half1 = 11 + tier * 3;
      for (let y = top; y <= top + 14; y++) {
        const half = half0 + ((y - top) / 14) * (half1 - half0);
        for (let px = Math.round(x - half); px <= Math.round(x + half); px++) lower.put(px, y, ramp(C.pine, 0.66 - (px - x) / (half + 1) * 0.3 - (y - top) * 0.02 + (rand(px, y, 4) - 0.5) * 0.12, px, y));
      }
    }
    block(c, r); mark(c, r);
    continue;
  }
  const big = kind === "oak";
  groundShadow(x + 3, base + 1, big ? 22 : 16, big ? 5 : 4, 105);
  if (kind === "birch") {
    trunk(x - 2, base, 26, 4, C.birchBark);
    for (let y = base - 24; y < base; y += 5) { lower.put(x - 2 + ((y >> 2) & 1), y, INK); lower.put(x, y + 2, INK); lower.put(x + 1, y + 2, INK); }
    canopy(x, base - 34, 13, C.birch, c * 7 + r);
  } else {
    trunk(x - (big ? 4 : 2), base, big ? 20 : 16, big ? 8 : 5, C.bark);
    canopy(x, base - (big ? 34 : 28), big ? 22 : 16, C.leaf, c * 7 + r);
    if (kind === "apple") for (let k = 0; k < 11; k++) { // red apples in the leaves, a couple fallen
      const a = rand(k, c, r) * Math.PI * 2, d = rand(r, k, c) * 13;
      const ax = Math.round(x + Math.cos(a) * d), ay = Math.round(base - 28 + Math.sin(a) * d * 0.8);
      ball(lower, ax, ay, 1.8, 1.8, C.apple); lower.put(ax - 1, ay - 1, C.apple[2]);
    }
    if (kind === "apple") for (const [fx, fy] of [[x - 10, base + 4], [x + 12, base + 2]]) ball(ground, fx, fy, 1.8, 1.6, C.apple);
  }
  block(c, r); if (big) block(c - 1, r);
  mark(c - 1, r - 2, 3, 3);
}
for (const [kind, c, r] of L.bushes) {
  const x = c * T + 8, y = r * T + 9;
  groundShadow(x + 1, y + 6, 9, 2.5);
  canopy(x, y, 7, C.leaf, c * 13 + r);
  for (let k = 0; k < 7; k++) {
    const bx = Math.round(x - 5 + rand(k, c) * 10), by = Math.round(y - 4 + rand(r, k) * 8);
    if (kind === "berry") ball(lower, bx, by, 1.4, 1.4, C.berry);
    else { lower.put(bx, by, k % 2 ? C.pink : C.white); lower.put(bx + 1, by, C.yellow); }
  }
  block(c, r); mark(c, r);
}

// a sign by the north-west gate: a board with a little cow and hen, on a post
{
  const r = L.gates.west[0][0] - 1, c = 0, SX = c * T, SY = (r - 1) * T + 1;
  lower.rect(c * T + 6, r * T, 3, 14, PAL.wood[1]);
  for (let y = SY; y < SY + 12; y++) for (let x = SX; x < SX + 22; x++) lower.put(x, y, ramp(PAL.wood, 0.78 - (y - SY) * 0.02, x, y));
  for (let y = SY + 12; y < r * T; y++) for (let x = c * T + 6; x < c * T + 9; x++) lower.put(x, y, PAL.wood[1]);
  for (const [px, py, col] of [[SX + 5, SY + 5, C.white], [SX + 6, SY + 5, C.white], [SX + 6, SY + 4, C.red], [SX + 7, SY + 6, C.yellow], [SX + 13, SY + 5, C.white], [SX + 14, SY + 5, INK], [SX + 15, SY + 5, C.white], [SX + 16, SY + 6, C.white], [SX + 14, SY + 7, INK]]) lower.put(px, py, col);
  block(c, r); mark(c, r);
}

// ── Grass detail on the open ground: darker patches, tufts, wild flowers ──
for (let r = TOP + 1; r < BOTTOM; r++) for (let c = LEFT + 1; c < RIGHT; c++) {
  if (busy.has(`${c},${r}`)) continue;
  const x0 = c * T, y0 = r * T;
  // soft patches of longer, darker grass, blotchy across tiles
  for (let y = y0; y < y0 + T; y += 2) for (let x = x0 + ((y >> 1) & 1); x < x0 + T; x += 2) {
    const n = Math.sin(x / 23 + Math.cos(y / 17) * 1.7) + Math.cos(y / 19 - x / 41);
    if (n > 1.05) ground.put(x, y, C.grassDk, 70);
  }
  const k = rand(c, r, 15);
  if (k < 0.22) { // a tuft of grass
    const x = x0 + 3 + Math.floor(rand(c, r, 16) * 9), y = y0 + 6 + Math.floor(rand(r, c, 17) * 6);
    ground.put(x, y - 3, C.grassLt); ground.put(x - 2, y - 2, C.grassMid); ground.put(x + 2, y - 2, C.grassMid); ground.put(x - 1, y - 1, C.grassMid); ground.put(x + 1, y - 1, C.grassMid); ground.put(x, y - 1, C.grassDk);
  } else if (k < 0.28) { // a little flower
    const x = x0 + 4 + Math.floor(rand(c, r, 18) * 8), y = y0 + 5 + Math.floor(rand(r, c, 19) * 8);
    const col = [C.white, C.yellow, C.pink, C.violet][Math.floor(rand(c, r, 20) * 4)];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ground.put(x + dx, y + dy, col);
    ground.put(x, y, col === C.yellow ? C.carrot[1] : C.yellow); ground.put(x, y + 2, C.grassDk);
  }
}

lower.outline(INK);

// Anything standing that isn't on a blocked tile (roofs, tree tops, lamp heads,
// washing) moves up to DecorationUpper1: drawn the same, you walk behind it,
// and it never makes an invisible wall (src/lib/chunkCollision.ts).
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (blocked.has(`${Math.floor(x / T)},${Math.floor(y / T)}`)) continue;
  const i = (y * W + x) * 4;
  if (lower.px[i + 3] === 0) continue;
  if (upper.px[i + 3] === 0) upper.px.set(lower.px.subarray(i, i + 4), i);
  lower.px.fill(0, i, i + 4);
}

// PREVIEW=<file.png>: the whole ranch on grass as one picture, to look at.
if (process.env.PREVIEW) {
  const { default: sharp } = await import("sharp");
  const pic = new Canvas(W, H);
  pic.rect(0, 0, W, H, hex(0x5fa04e));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rand(x >> 1, y >> 1, 11) < 0.18) pic.put(x, y, hex(0x569648));
  for (const c of [ground, shadow, lower, upper]) pic.over(c);
  const scale = Number(process.env.PREVIEW_SCALE ?? 1);
  await sharp(Buffer.from(pic.px), { raw: { width: W, height: H, channels: 4 } }).resize(W * scale, H * scale, { kernel: "nearest" }).png().toFile(process.env.PREVIEW);
  console.log(`preview: ${process.env.PREVIEW}`);
}
if (process.env.PREVIEW_ONLY) process.exit(0);

// ── Cut into stamps, bake each distinct one ─────────────────────────────
function crop(c, x0, y0) {
  const out = new Canvas(SW * T, SH * T);
  for (let y = 0; y < out.h; y++) {
    const from = ((y0 + y) * c.w + x0) * 4;
    out.px.set(c.px.subarray(from, from + out.w * 4), y * out.w * 4);
  }
  return out;
}
const variants = new Map();
const stamps = [];
for (let sr = 0; sr < L.stamps.rows; sr++) for (let sc = 0; sc < L.stamps.cols; sc++) {
  const x0 = sc * SW * T, y0 = sr * SH * T;
  const layers = { GroundUpper: crop(ground, x0, y0), DecorationLowerShadow: crop(shadow, x0, y0), DecorationLower: crop(lower, x0, y0), DecorationUpper1: crop(upper, x0, y0) };
  const collision = [];
  for (let r = 0; r < SH; r++) for (let c = 0; c < SW; c++) {
    const k = `${sc * SW + c},${sr * SH + r}`;
    if (blocked.has(k) || water.has(k)) collision.push([r, c]);
  }
  const h = crypto.createHash("sha1");
  for (const cv of Object.values(layers)) h.update(cv.px);
  h.update(JSON.stringify(collision));
  const key = h.digest("hex");
  if (!variants.has(key)) {
    const n = variants.size;
    variants.set(key, n);
    await bakeCanvases({ name: `VillageRanch${n}`, jsonName: `village_ranch_${n}`, layers, collision, door: [7, 12] }); // door unused: scenery has no building row
  }
  stamps.push({ key: `village_ranch_${sc}_${sr}`, file: `/buildings/village_ranch_${variants.get(key)}.json`, tx: L.origin.tx + sc * SW, ty: L.origin.ty + sr * SH });
}

for (const f of fs.readdirSync("public/buildings")) {
  const m = /^village_ranch_(\d+)\.json$/.exec(f);
  if (m && Number(m[1]) >= variants.size) fs.rmSync(`public/buildings/${f}`);
}
for (const f of fs.readdirSync("public/assets")) {
  const m = /^VillageRanch(\d+)\.png$/.exec(f);
  if (m && Number(m[1]) >= variants.size) fs.rmSync(`public/assets/${f}`);
}

fs.writeFileSync("src/lib/villageRanchStamps.json", JSON.stringify({
  _doc: "Written by scripts/draw-village-ranch.mjs: the Village Ranch's stamps and their tilesets.",
  tilesets: [...variants.values()].map((n) => `VillageRanch${n}`),
  stamps,
  water: [...water].map((k) => k.split(",").map(Number)),
}, null, 1) + "\n");

const raw = fs.readFileSync("public/buildings/buildings.json", "utf8");
const manifest = JSON.parse(raw);
const list = Array.isArray(manifest) ? manifest : manifest.buildings;
const kept = list.filter((b) => !b.key.startsWith("village_ranch_"));
const after = kept.map((b) => b.key).lastIndexOf(kept.filter((b) => b.key.startsWith("wheat_field_")).at(-1)?.key);
kept.splice(after + 1, 0, ...stamps.map((s) => ({
  key: s.key, file: s.file, kind: "scenery", color: "#a83a2c", menu: [], tx: s.tx, ty: s.ty,
  name: "The Village Ranch", description: "The village's own homestead, open to everyone: the vegetable garden, the big barn and silo, the pond, and the cows, pigs, sheep, Paco and Luna the llamas, the ducks and the hens.", reservable: false,
})));
if (Array.isArray(manifest)) manifest.splice(0, manifest.length, ...kept); else manifest.buildings = kept;
const indent = /^\{\n( +)"/.exec(raw)?.[1].length ?? 2;
fs.writeFileSync("public/buildings/buildings.json", JSON.stringify(manifest, null, indent) + "\n");
console.log(`${stamps.length} stamps, ${variants.size} distinct, ${water.size} water tiles; buildings.json updated`);
