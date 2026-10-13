#!/usr/bin/env node
// The Village Ranch: a big fenced public ranch east of the village where the
// village's farm animals live, each kind in its own paddock (cows and the
// barn, pigs and their mud, sheep, the llamas, the ducks' pond, the hen
// coop). Drawn as one picture, then cut into 24×15 scenery stamps like the
// Common Field (scripts/draw-wheat-field.mjs). The layout is
// src/lib/villageRanch.json; the animals' paddocks are their wander zones
// (src/lib/villageRanch.ts, src/lib/seed.ts).
//
//   node scripts/draw-village-ranch.mjs
//
// Writes public/assets/VillageRanch<n>.png + public/buildings/village_ranch_<n>.json
// per distinct stamp, src/lib/villageRanchStamps.json and replaces the
// village_ranch_* entries of public/buildings/buildings.json. Layers: paths,
// mud, straw and the pond → GroundUpper; shadows → DecorationLowerShadow;
// fences, troughs, bales, the barn's and coop's walls → DecorationLower
// (block); roofs and tops → DecorationUpper1 (you walk behind them). Water
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

const BARN = [hex(0x4a1412), hex(0x6a1e1a), hex(0x8c2a22), hex(0xa83a2c), hex(0xc4553e), hex(0xdc7a5c)];
const ROAD = { base: hex(0xb89a6c), dk: hex(0x9a7e56), lt: hex(0xcfb487), edge: hex(0x8a7048) };
const STRAW = [hex(0x8a6a2a), hex(0xb08a3a), hex(0xd4b050), hex(0xecd078), hex(0xf8eaa8)];
const MUD = [hex(0x3e2a1a), hex(0x543a24), hex(0x6a4a2e), hex(0x7e5a38)];
const WATER = [hex(0x1e4a7a), hex(0x2c64a0), hex(0x3e80bc), hex(0x62a2d4), hex(0xa8d4f0)];
const SHORE = [hex(0x6a7a3a), hex(0x8a9a48), hex(0xa8b45a)];
const REED = [hex(0x2e5a24), hex(0x467a30), hex(0x6a9a3e)];

const ground = new Canvas(W, H), shadow = new Canvas(W, H), lower = new Canvas(W, H), upper = new Canvas(W, H);
const blocked = new Set(); // "col,row" (ranch tiles)
const block = (col, row) => blocked.add(`${col},${row}`);
const water = new Set(); // pond tiles: block through the Collision layer only
const line = (c, x0, x1, y, col) => { for (let x = x0; x <= x1; x++) c.put(x, y, col); };
const vline = (c, x, y0, y1, col) => { for (let y = y0; y <= y1; y++) c.put(x, y, col); };

// ── Ground: trodden paths, mud, straw ───────────────────────────────────
/** Trodden dirt with ragged, grassy edges (pixels). */
function dirt(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const edge = Math.min(x - x0, x0 + w - 1 - x, y - y0, y0 + h - 1 - y);
    if (edge < 2 && rand(x, y, 3) < 0.55 - edge * 0.2) continue;
    ground.put(x, y, ramp([ROAD.edge, ROAD.dk, ROAD.base, ROAD.lt], 0.55 + (rand(x, y, 8) - 0.5) * 0.35 - (edge < 2 ? 0.2 : 0), x, y));
  }
}
// The lane north–south through the inner fences' middle gaps, the barn apron
// and a spur in from each gate.
const [g0, g1] = L.gates.south[0];
dirt(g0 * T + 2, (L.barn[1] + L.barn[3]) * T - 6, (g1 - g0 + 1) * T - 4, (BOTTOM + 1) * T - (L.barn[1] + L.barn[3]) * T + 6);
dirt(L.barn[0] * T + 4 * T, (L.barn[1] + L.barn[3] - 1) * T, (L.barn[2] - 8) * T, 2 * T); // barn apron
for (const [a, b] of L.gates.west) dirt(0, (a + 1) * T, (g0 + 1) * T, (b - a - 1) * T);
// a little path to the coop door
const [cc, cr, cw, ch] = L.coop;
dirt((cc + cw - 3) * T, (cr + ch) * T - 4, 3 * T, 2 * T);
dirt(g1 * T, (cr + ch + 1) * T - 4, (cc + cw - g1) * T, T + 4);

// the pigs' mud wallow
const [mc, mr, mw, mh] = L.mud;
{
  const cx = (mc + mw / 2) * T, cy = (mr + mh / 2) * T, rx = (mw / 2) * T, ry = (mh / 2) * T;
  for (let y = mr * T; y < (mr + mh) * T; y++) for (let x = mc * T; x < (mc + mw) * T; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (rand(x >> 2, y >> 2, 5) - 0.5) * 0.25;
    if (d > 1) continue;
    ground.put(x, y, ramp(MUD, 0.55 - d * 0.35 + (rand(x, y, 9) - 0.5) * 0.3, x, y));
  }
}
// straw in the barn apron and the hen yard
const strew = (c, r, w, h, n, seed) => {
  for (let k = 0; k < n; k++) {
    const x = c * T + Math.floor(rand(k, seed) * w * T), y = r * T + Math.floor(rand(seed, k) * h * T);
    ground.put(x, y, STRAW[2 + (k % 2)]); ground.put(x + 1, y, STRAW[1]);
  }
};
strew(L.barn[0] + 3, L.barn[1] + L.barn[3], L.barn[2] - 6, 2, 90, 41);
const [kc, kr, kw, kh] = L.paddocks.chicken;
strew(kc, kr, kw, kh, 220, 43);

// ── The pond (GroundUpper, blocked through Collision) ───────────────────
const [pc, pr, pw, ph] = L.pond;
{
  const cx = (pc + pw / 2) * T, cy = (pr + ph / 2) * T, rx = (pw / 2) * T - 2, ry = (ph / 2) * T - 2;
  const at = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (rand(x >> 3, y >> 3, 7) - 0.5) * 0.12;
  for (let y = pr * T; y < (pr + ph) * T; y++) for (let x = pc * T; x < (pc + pw) * T; x++) {
    const d = at(x, y);
    if (d > 1.08) continue;
    if (d > 0.86) ground.put(x, y, ramp(SHORE, 0.6 - (d - 0.86) * 2 + (rand(x, y, 2) - 0.5) * 0.3, x, y)); // muddy, grassy bank
    else ground.put(x, y, ramp(WATER, 0.35 + (1 - d) * 0.35 + ((y + (x >> 3)) % 9 === 0 ? 0.25 : 0) + (rand(x, y, 4) - 0.5) * 0.08, x, y));
  }
  // lily pads and a glint
  for (const [lx, ly] of [[0.3, 0.35], [0.62, 0.55], [0.45, 0.72]]) {
    const x = Math.round(pc * T + lx * pw * T), y = Math.round(pr * T + ly * ph * T);
    ground.ellipse(x, y, 4, 3, REED[2]); ground.put(x + 1, y - 1, REED[1]); ground.put(x - 2, y - 2, PAL.pink);
  }
  // water tiles: the ones whose middle is in the water
  for (let r = pr; r < pr + ph; r++) for (let c = pc; c < pc + pw; c++) if (at(c * T + 8, r * T + 8) <= 0.86) water.add(`${c},${r}`);
  // reeds on the bank (on top: you walk behind them)
  for (let k = 0; k < 26; k++) {
    const a = rand(k, 77) * Math.PI * 2, x = Math.round(cx + Math.cos(a) * (rx + 2)), y = Math.round(cy + Math.sin(a) * (ry + 2));
    if (Math.sin(a) > 0.3) continue; // keep the near bank open
    for (let j = 0; j < 3; j++) vline(upper, x + j * 2 - 2, y - 8 - ((k + j) % 3) * 2, y, REED[j % 3]);
    upper.rect(x - 1, y - 11, 2, 3, MUD[1]);
  }
}

// ── Fences: the outer one and the paddocks' ─────────────────────────────
const P = { wood: hex(0x9a6a40), woodDk: hex(0x6a4428), woodLt: hex(0xbe8a58) };
function hFence(col, row, postRight) {
  const x = col * T, y = row * T;
  lower.rect(x, y + 6, T, 2, P.wood); lower.hline(x, x + T - 1, y + 6, P.woodLt);
  lower.rect(x, y + 11, T, 2, P.wood); lower.hline(x, x + T - 1, y + 11, P.woodLt);
  for (const px of postRight ? [1, 12] : [1]) { lower.rect(x + px, y + 3, 3, 12, P.woodDk); lower.vline(x + px, y + 3, y + 14, P.wood); }
  block(col, row);
}
function vFence(col, row) {
  const x = col * T, y = row * T;
  lower.rect(x + 5, y, 2, T, P.wood); lower.vline(x + 5, y, y + T - 1, P.woodLt);
  lower.rect(x + 9, y, 2, T, P.wood); lower.vline(x + 9, y, y + T - 1, P.woodLt);
  lower.rect(x + 6, y + 1, 4, 5, P.woodDk); lower.hline(x + 6, x + 9, y + 1, P.wood);
  block(col, row);
}
const hRun = (row, c0, c1, gaps) => {
  for (let c = c0; c <= c1; c++) if (!inSpan(gaps, c)) hFence(c, row, c === c1 || gaps.some(([a]) => c === a - 1));
};
const vRun = (col, r0, r1, gaps) => { for (let r = r0; r <= r1; r++) if (!inSpan(gaps, r)) vFence(col, r); };
hRun(TOP, LEFT, RIGHT, L.gates.north);
hRun(BOTTOM, LEFT, RIGHT, L.gates.south);
vRun(LEFT, TOP + 1, BOTTOM - 1, L.gates.west);
vRun(RIGHT, TOP + 1, BOTTOM - 1, L.gates.east);
for (const [row, c0, c1, gaps] of L.inner.h) hRun(row, c0, c1, gaps);
for (const [col, r0, r1, gaps] of L.inner.v) vRun(col, r0, r1, gaps);

// ── The barn: red boards, gambrel roof, white-trimmed X doors, a hay loft ──
{
  const [c, r, w, h] = L.barn;
  const bx0 = c * T + 2, bx1 = (c + w) * T - 3, bTop = (r + 4) * T, bBottom = (r + h - 1) * T + 14;
  for (let y = bTop; y <= bBottom; y++) for (let x = bx0; x <= bx1; x++) {
    const k = (x - bx0) % 6;
    lower.put(x, y, ramp(BARN, 0.6 + (k === 0 ? -0.35 : k === 1 ? 0.15 : 0) - (y - bTop) * 0.002 + (rand(x, y >> 2, 6) - 0.5) * 0.08, x, y));
  }
  const mid = Math.round((bx0 + bx1) / 2), rw = (bx1 - bx0) / 2 + 8, rTop = r * T + 2;
  for (let y = rTop; y <= bTop + 2; y++) {
    const t = (y - rTop) / (bTop + 2 - rTop);
    const half = t < 0.4 ? 20 + (t / 0.4) * (rw * 0.55 - 20) : rw * 0.55 + ((t - 0.4) / 0.6) * (rw * 0.45);
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) upper.put(x, y, ramp(PAL.roofSlate, 0.72 - ((y - rTop) % 7 === 6 ? 0.5 : 0) + (t < 0.4 ? 0.08 : 0), x, y));
    upper.put(Math.round(mid - half) - 1, y, PAL.ink); upper.put(Math.round(mid + half) + 1, y, PAL.ink);
  }
  line(upper, mid - 20, mid + 20, rTop - 1, PAL.ink);
  // hay loft with bales peeking out, a weathervane on the ridge
  shade(upper, mid - 12, bTop - 22, 24, 18, PAL.wood, () => 0.2);
  for (let x = mid - 11; x < mid + 11; x++) for (let y = bTop - 13; y < bTop - 6; y++) upper.put(x, y, ramp(STRAW, 0.6 + (rand(x, y, 2) - 0.5) * 0.4, x, y));
  vline(upper, mid, rTop - 12, rTop - 1, PAL.ink); line(upper, mid - 5, mid + 5, rTop - 9, PAL.ink); upper.put(mid + 6, rTop - 10, PAL.ink); upper.put(mid + 6, rTop - 8, PAL.ink);
  // two big doors with white X bracing
  const white = PAL.white;
  for (const dc of [mid - 44, mid + 4]) {
    const dx0 = dc, dx1 = dc + 40, dTop = bTop + 18;
    for (let y = dTop; y <= bBottom; y++) for (let x = dx0; x <= dx1; x++) lower.put(x, y, ramp(BARN, 0.45 + ((x - dx0) % 4 === 0 ? -0.2 : 0), x, y));
    for (const [x0, x1] of [[dx0, dx0 + 20], [dx0 + 20, dx1]]) {
      line(lower, x0, x1, dTop, white); line(lower, x0, x1, bBottom - 1, white); vline(lower, x0, dTop, bBottom, white); vline(lower, x1, dTop, bBottom, white);
      const n = bBottom - dTop;
      for (let i = 0; i <= n; i++) { lower.put(Math.round(x0 + ((x1 - x0) * i) / n), dTop + i, white); lower.put(Math.round(x1 - ((x1 - x0) * i) / n), dTop + i, white); }
    }
  }
  for (const x of [bx0 + 3, bx1 - 3]) vline(lower, x, bTop, bBottom, white);
  vline(lower, bx0, bTop, bBottom, PAL.ink); vline(lower, bx1, bTop, bBottom, PAL.ink); line(lower, bx0, bx1, bBottom, PAL.ink);
  softShadow(shadow, bx0 - 2, bBottom + 1, bx1 - bx0 + 5, 8, 110);
  for (let rr = r + 5; rr < r + h; rr++) for (let cc2 = c; cc2 < c + w; cc2++) block(cc2, rr); // the walls (the roof you walk behind)
}

// ── The hen coop: white boards, red roof, nest window, ramp ─────────────
{
  const cx0 = cc * T + 4, cx1 = (cc + cw - 1) * T + 10, wTop = (cr + 2) * T + 6, cBottom = (cr + ch - 1) * T + 14, rTop = cr * T;
  for (let y = wTop; y <= cBottom; y++) for (let x = cx0; x <= cx1; x++) {
    const k = (x - cx0) % 5;
    lower.put(x, y, ramp(PAL.board, 0.7 + (k === 0 ? 0.2 : k === 4 ? -0.3 : 0), x, y));
  }
  const mid = (cx0 + cx1) / 2;
  for (let y = rTop; y <= wTop + 2; y++) {
    const half = ((y - rTop) / (wTop + 2 - rTop)) * ((cx1 - cx0) / 2 + 8);
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) upper.put(x, y, ramp(PAL.roofRed, 0.75 - ((y - rTop) % 6 === 5 ? 0.5 : 0) - (x - mid) * 0.003, x, y));
    upper.put(Math.round(mid - half) - 1, y, PAL.ink); upper.put(Math.round(mid + half) + 1, y, PAL.ink);
  }
  line(upper, cx0 - 9, cx1 + 9, wTop + 3, PAL.ink);
  for (const nx of [cx0 + 10, cx0 + 40, cx0 + 70]) {
    shade(lower, nx, wTop + 8, 14, 10, PAL.glassLit, (px, py) => 0.35 + (py - wTop - 8) * 0.03);
    for (let x = nx + 1; x < nx + 13; x++) lower.put(x, wTop + 16, STRAW[3]);
  }
  const hatch = cx1 - 22;
  shade(lower, hatch, cBottom - 12, 10, 12, PAL.wood, () => 0.25);
  vline(lower, cx0, wTop + 2, cBottom, PAL.ink); vline(lower, cx1, wTop + 2, cBottom, PAL.ink); line(lower, cx0, cx1, cBottom, PAL.ink);
  softShadow(shadow, cx0 - 2, cBottom + 1, cx1 - cx0 + 5, 6, 100);
  for (let rr = cr + 3; rr < cr + ch; rr++) for (let c2 = cc; c2 < cc + cw; c2++) block(c2, rr);
}

// ── Troughs, hay bales, the sign ────────────────────────────────────────
for (const [c, r] of L.troughs) {
  const x0 = c * T + 2, y0 = r * T + 4;
  shade(lower, x0, y0, 28, 9, PAL.wood, (px, py) => 0.55 - (py - y0) * 0.04);
  shade(lower, x0 + 2, y0 + 1, 24, 3, PAL.glass, () => 0.6);
  line(lower, x0 - 1, x0 + 28, y0 - 1, PAL.ink); line(lower, x0 - 1, x0 + 28, y0 + 9, PAL.ink);
  softShadow(shadow, x0 - 1, y0 + 10, 30, 3, 90);
  block(c, r); block(c + 1, r);
}
for (const [c, r] of L.bales) {
  const x = c * T, y = r * T + 3;
  for (let py = y; py < y + 11; py++) for (let px = x; px < x + 16; px++) lower.put(px, py, ramp(STRAW, 0.7 - (py - y) * 0.035 + (rand(px, py, 4) - 0.5) * 0.25, px, py));
  for (const by of [y + 3, y + 8]) line(lower, x, x + 15, by, STRAW[0]);
  block(c, r);
}
{
  // by the north-west gate: a board with a little cow and hen, on a post
  const [c, r] = L.sign, SX = c * T, SY = (r - 1) * T + 1;
  lower.rect(c * T + 6, r * T, 3, 14, P.woodDk);
  for (let y = SY; y < SY + 12; y++) for (let x = SX; x < SX + 22; x++) upper.put(x, y, ramp(PAL.wood, 0.78 - (y - SY) * 0.02, x, y));
  for (let y = SY + 12; y < r * T; y++) for (let x = c * T + 6; x < c * T + 9; x++) upper.put(x, y, P.woodDk);
  for (const [px, py, col] of [[SX + 5, SY + 5, PAL.white], [SX + 6, SY + 5, PAL.white], [SX + 6, SY + 4, PAL.red], [SX + 7, SY + 6, PAL.yellow], [SX + 13, SY + 5, PAL.white], [SX + 14, SY + 5, PAL.ink], [SX + 15, SY + 5, PAL.white], [SX + 16, SY + 6, PAL.white], [SX + 14, SY + 7, PAL.ink]]) upper.put(px, py, col);
  block(c, r);
}

lower.outline(PAL.ink);
upper.outline(PAL.ink);

// Any tile with DecorationLower art blocks (src/lib/chunkCollision.ts), so an
// outline pixel spilling into a gate or a lane would make an invisible wall.
// Move what spilled onto open tiles up to DecorationUpper1 (drawn the same,
// never blocks).
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
  pic.rect(0, 0, W, H, hex(0x6fae5f));
  for (let y = 0; y < H; y += 2) for (let x = (y >> 1) % 2; x < W; x += 9) if (rand(x, y, 11) < 0.3) pic.put(x, y, hex(0x5f9c50));
  for (const c of [ground, shadow, lower, upper]) pic.over(c);
  await sharp(Buffer.from(pic.px), { raw: { width: W, height: H, channels: 4 } }).png().toFile(process.env.PREVIEW);
  console.log(`preview: ${process.env.PREVIEW}`);
}

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
  name: "The Village Ranch", description: "The village's own ranch, open to everyone: the cows and the big barn, the pigs, the sheep, Paco and Luna the llamas, the duck pond and the hen coop.", reservable: false,
})));
if (Array.isArray(manifest)) manifest.splice(0, manifest.length, ...kept); else manifest.buildings = kept;
const indent = /^\{\n( +)"/.exec(raw)?.[1].length ?? 2;
fs.writeFileSync("public/buildings/buildings.json", JSON.stringify(manifest, null, indent) + "\n");
console.log(`${stamps.length} stamps, ${variants.size} distinct, ${water.size} water tiles; buildings.json updated`);
