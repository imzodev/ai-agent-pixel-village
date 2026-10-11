#!/usr/bin/env node
// The Common Field: a big fenced wheat field north of the village where
// anyone can gather. Drawn as one picture (tilled soil in furrows inside a
// split-rail fence with gates, hay bales and signs), then cut into 24×15
// scenery stamps, since a building template is one 24×15 stamp. Identical
// stamps (the field's middle) share one template. The layout is
// src/lib/commonField.json; the wheat itself is resource nodes planted on the
// furrows by src/lib/seed.ts (src/lib/commonField.ts) — this art leaves room.
//
//   node scripts/draw-wheat-field.mjs
//
// Writes public/assets/WheatField<n>.png + public/buildings/wheat_field_<n>.json
// per distinct stamp, src/lib/commonFieldStamps.json (the stamps and their
// tilesets) and replaces the wheat_field_* entries of
// public/buildings/buildings.json. Layers: soil → GroundUpper (walkable);
// fence, bales and sign bases → DecorationLower (block); their tops →
// DecorationUpper1 (Y-sorted).

import fs from "node:fs";
import crypto from "node:crypto";
import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";

const L = JSON.parse(fs.readFileSync("src/lib/commonField.json", "utf8"));
const T = 16, SW = 24, SH = 15;
const COLS = L.stamps.cols * SW, ROWS = L.stamps.rows * SH;
const W = COLS * T, H = ROWS * T;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x2a2220),
  soil: hex(0x8a5a36), soilDk: hex(0x6a4228), soilLt: hex(0xa67048), furrow: hex(0x553420),
  wood: hex(0x9a6a40), woodDk: hex(0x6a4428), woodLt: hex(0xbe8a58),
  hay: hex(0xe2c062), hayDk: hex(0xb8923e), hayLt: hex(0xf4dc90), twine: hex(0x8a5a30),
  board: hex(0xc89a62), wheat: hex(0xf0c850), stalk: hex(0x7a9a3a),
};
const { top: TOP, bottom: BOTTOM, left: LEFT, right: RIGHT } = L.fence;
const inGate = (spans, v) => spans.some(([a, b]) => v >= a && v <= b);
// Speckles repeat per stamp, so the field's middle stamps come out identical.
const speck = (x, y) => rand((x % (SW * T)) >> 1, y % (SH * T));

// ── Soil (GroundUpper): tilled furrows inside the fence ─────────────────
const soil = new Canvas(W, H);
const SX0 = (LEFT + 1) * T - 4, SX1 = RIGHT * T + 3, SY0 = (TOP + 1) * T - 4, SY1 = BOTTOM * T + 3;
for (let y = SY0; y <= SY1; y++) for (let x = SX0; x <= SX1; x++) {
  // Furrows run east–west, two per tile: a dark trench, then a lit ridge.
  const k = y % 8;
  const base = k === 4 ? P.furrow : k === 5 ? P.soilDk : k === 7 ? P.soilLt : P.soil;
  const r = speck(x, y);
  soil.put(x, y, k !== 4 && k !== 5 && r < 0.12 ? P.soilDk : k !== 4 && k !== 5 && r > 0.94 ? P.soilLt : base);
}
// A ragged, softer edge into the grass.
for (let x = SX0; x <= SX1; x++) for (const y of [SY0, SY1]) if (speck(x, y) < 0.5) soil.put(x, y, P.soilDk, 120);
for (let y = SY0; y <= SY1; y++) for (const x of [SX0, SX1]) if (speck(x, y) < 0.5) soil.put(x, y, P.soilDk, 120);

// ── Fence, gates, bales, signs ──────────────────────────────────────────
const lower = new Canvas(W, H), upper = new Canvas(W, H);
const at = (col, row) => [col * T, row * T];
const blocked = new Set(); // "col,row" (field tiles)
const block = (col, row) => blocked.add(`${col},${row}`);

/** A horizontal fence tile: a post at its left (and right, at an end), two rails across. */
function hFence(col, row, postRight) {
  const [x, y] = at(col, row);
  lower.rect(x, y + 6, T, 2, P.wood); lower.hline(x, x + T - 1, y + 6, P.woodLt);
  lower.rect(x, y + 11, T, 2, P.wood); lower.hline(x, x + T - 1, y + 11, P.woodLt);
  for (const px of postRight ? [1, 12] : [1]) { lower.rect(x + px, y + 3, 3, 12, P.woodDk); lower.vline(x + px, y + 3, y + 14, P.wood); }
  block(col, row);
}
/** A vertical fence tile: a post at its top, two rails down. */
function vFence(col, row) {
  const [x, y] = at(col, row);
  lower.rect(x + 5, y, 2, T, P.wood); lower.vline(x + 5, y, y + T - 1, P.woodLt);
  lower.rect(x + 9, y, 2, T, P.wood); lower.vline(x + 9, y, y + T - 1, P.woodLt);
  lower.rect(x + 6, y + 1, 4, 5, P.woodDk); lower.hline(x + 6, x + 9, y + 1, P.wood);
  block(col, row);
}
for (let c = LEFT; c <= RIGHT; c++) {
  const endBefore = (spans) => spans.some(([a]) => c === a - 1);
  if (!inGate(L.gates.north, c)) hFence(c, TOP, c === RIGHT || endBefore(L.gates.north));
  if (!inGate(L.gates.south, c)) hFence(c, BOTTOM, c === RIGHT || endBefore(L.gates.south));
}
for (let r = TOP + 1; r < BOTTOM; r++) {
  if (!inGate(L.gates.west, r)) vFence(LEFT, r);
  if (!inGate(L.gates.east, r)) vFence(RIGHT, r);
}

/** A round hay bale in its tile. */
function bale(col, row) {
  const [x, y] = at(col, row);
  const b = new Canvas(W, H);
  b.ellipse(x + 8, y + 7, 8, 8, P.hay);
  b.ellipse(x + 8, y + 9, 7, 5, P.hayDk);
  b.ellipse(x + 7, y + 5, 5, 3, P.hayLt);
  for (let k = -6; k <= 6; k += 3) b.put(x + 8 + k, y + 7 + (k % 2), P.hayDk);
  b.vline(x + 4, y + 1, y + 14, P.twine); b.vline(x + 12, y + 1, y + 14, P.twine);
  b.outline(P.ink);
  lower.over(b);
  block(col, row);
}
for (const [c, r] of L.bales) bale(c, r);

/** A sign: a post (lower) and a board with a wheat sheaf (upper, the tile above). */
function sign(col, row) {
  const [x, y] = at(col, row);
  lower.rect(x + 7, y + 1, 3, 13, P.woodDk);
  const [ux, uy] = at(col, row - 1);
  upper.rect(ux + 1, uy + 2, 14, 10, P.board);
  upper.rect(ux + 1, uy + 2, 14, 2, P.woodLt);
  upper.hline(ux + 1, ux + 14, uy + 11, P.woodDk);
  for (const dx of [-3, 0, 3]) { upper.vline(ux + 8 + dx, uy + 5, uy + 10, P.stalk); upper.rect(ux + 7 + dx, uy + 4, 2, 3, P.wheat); }
  upper.hline(ux + 5, ux + 11, uy + 8, P.twine);
  upper.rect(ux + 7, uy + 12, 3, 4, P.woodDk);
  block(col, row);
}
for (const [c, r] of L.signs) sign(c, r);

lower.outline(P.ink);
upper.outline(P.ink);

// Any tile with DecorationLower art blocks (src/lib/chunkCollision.ts), so an
// outline pixel or a bale's edge spilling into a gate or onto the soil would
// make an invisible wall. Move what spilled onto open tiles up to
// DecorationUpper1 (drawn the same, never blocks): only the fence, bale and
// sign tiles stay solid.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (blocked.has(`${Math.floor(x / T)},${Math.floor(y / T)}`)) continue;
  const i = (y * W + x) * 4;
  if (lower.px[i + 3] === 0) continue;
  if (upper.px[i + 3] === 0) upper.px.set(lower.px.subarray(i, i + 4), i);
  lower.px.fill(0, i, i + 4);
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
const variants = new Map(); // content hash → variant index
const stamps = [];
for (let sr = 0; sr < L.stamps.rows; sr++) for (let sc = 0; sc < L.stamps.cols; sc++) {
  const x0 = sc * SW * T, y0 = sr * SH * T;
  const layers = { GroundUpper: crop(soil, x0, y0), DecorationLower: crop(lower, x0, y0), DecorationUpper1: crop(upper, x0, y0) };
  const collision = [];
  for (let r = 0; r < SH; r++) for (let c = 0; c < SW; c++) if (blocked.has(`${sc * SW + c},${sr * SH + r}`)) collision.push([r, c]);
  const h = crypto.createHash("sha1");
  for (const cv of Object.values(layers)) h.update(cv.px);
  h.update(JSON.stringify(collision));
  const key = h.digest("hex");
  if (!variants.has(key)) {
    const n = variants.size;
    variants.set(key, n);
    await bakeCanvases({ name: `WheatField${n}`, jsonName: `wheat_field_${n}`, layers, collision, door: [7, 12] }); // door unused: scenery has no building row
  }
  stamps.push({ key: `wheat_field_${sc}_${sr}`, file: `/buildings/wheat_field_${variants.get(key)}.json`, tx: L.origin.tx + sc * SW, ty: L.origin.ty + sr * SH });
}

// Old stamp files from a previous layout.
for (const f of fs.readdirSync("public/buildings")) {
  const m = /^wheat_field(?:_(\d+))?\.json$/.exec(f);
  if (m && !(m[1] != null && Number(m[1]) < variants.size)) fs.rmSync(`public/buildings/${f}`);
}
for (const f of fs.readdirSync("public/assets")) {
  const m = /^WheatField(\d*)\.png$/.exec(f);
  if (m && !(m[1] !== "" && Number(m[1]) < variants.size)) fs.rmSync(`public/assets/${f}`);
}

fs.writeFileSync("src/lib/commonFieldStamps.json", JSON.stringify({
  _doc: "Written by scripts/draw-wheat-field.mjs: the Common Field's stamps and their tilesets.",
  tilesets: [...variants.values()].map((n) => `WheatField${n}`),
  stamps,
}, null, 1) + "\n");

// Replace the field's entries in the buildings manifest (everything else untouched).
const raw = fs.readFileSync("public/buildings/buildings.json", "utf8");
const manifest = JSON.parse(raw);
const list = Array.isArray(manifest) ? manifest : manifest.buildings;
const kept = list.filter((b) => !b.key.startsWith("wheat_field_"));
const at0 = Math.max(0, kept.findIndex((b) => b.key === "waystone_meadow") + 1);
kept.splice(at0, 0, ...stamps.map((s) => ({
  key: s.key, file: s.file, kind: "scenery", color: "#c8a050", menu: [], tx: s.tx, ty: s.ty,
  name: "The Common Field", description: "A great fenced wheat field anyone may gather from. Hollis grinds the sheaves into flour.", reservable: false,
})));
if (Array.isArray(manifest)) manifest.splice(0, manifest.length, ...kept); else manifest.buildings = kept;
const indent = /^\{\n( +)"/.exec(raw)?.[1].length ?? 2;
fs.writeFileSync("public/buildings/buildings.json", JSON.stringify(manifest, null, indent) + "\n");
console.log(`${stamps.length} stamps, ${variants.size} distinct; buildings.json updated`);
