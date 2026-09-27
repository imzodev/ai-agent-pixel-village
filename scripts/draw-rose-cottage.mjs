#!/usr/bin/env node
// "Rose Cottage": an original house drawn from scratch (no shared tilesets).
//
//   node scripts/draw-rose-cottage.mjs
//
// Writes public/assets/RoseCottage.png + public/buildings/rose_cottage.json
// via bakeCanvases() in scripts/bake-building.mjs.
//
// The whole scene is painted on 384×240 canvases (the 24×15-tile template)
// and routed to template layers so it behaves like the other buildings:
//   - house rows 0–9  → DecorationUpper1 (Y-sorted: covers a player behind it)
//   - house row 10 (foundation) + fence + bushes → DecorationLower (blocks
//     movement, anchors the sorted roof above it)
//   - flower beds + stepping-stone path → GroundUpper (walkable)
//   - soft shadow → DecorationLowerShadow
// Collision additionally covers the house body; the door is the
// Interactive tile.

import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";

const W = 384, H = 240;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x2e2228),
  slate: hex(0x4a628c), slateLt: hex(0x6680ac), slateDk: hex(0x34466a), slateHi: hex(0x8aa2c8),
  cream: hex(0xeedeb4), creamLt: hex(0xf8eed0), creamDk: hex(0xcebA8e),
  trim: hex(0xf6f4ec), trimDk: hex(0xcecbc2),
  glass: hex(0x78b0d6), glassLt: hex(0xb0d6ec), glassDk: hex(0x5484b0),
  shutter: hex(0x4e805c), shutterDk: hex(0x365e42),
  door: hex(0x3c7880), doorDk: hex(0x28565e), doorLt: hex(0x5a969c), gold: hex(0xe8c456),
  wood: hex(0x8c5c38), woodDk: hex(0x64402a),
  red: hex(0xd64a56), pink: hex(0xec8aaa), yellow: hex(0xf0ce54), white: hex(0xfaf6ee), violet: hex(0x9c78d0),
  leaf: hex(0x52a048), leafDk: hex(0x3a7a3a), leafLt: hex(0x7cc466),
  stone: hex(0x96928c), stoneDk: hex(0x706c68), stoneLt: hex(0xb2aea8),
  brick: hex(0xa4543c), brickDk: hex(0x7c3c2e), mortar: hex(0xc4aa96),
  path: hex(0xbab2a0), pathDk: hex(0x968e7e), pathLt: hex(0xd2cab8),
  soil: hex(0x74523a), soilDk: hex(0x5c402c),
  lamp: hex(0xffd87a),
};

// House body spans x 96..287 (template columns 6..17).
const X0 = 96, X1 = 287;
// The foundation ends at y 174 so its 1-px outline (y 175) stays in tile
// row 10: anything painted on DecorationLower blocks its whole tile.
const WALL_TOP = 106, WALL_BOT = 167, FOUND_BOT = 174;

// ── House ───────────────────────────────────────────────────────────────
const house = new Canvas(W, H);

// Chimney (drawn first; the roof covers its base).
house.rect(248, 24, 16, 50, P.brick);
for (let y = 24; y < 74; y += 4) {
  house.hline(248, 263, y + 3, P.mortar);
  for (let x = 248 + ((y / 4) % 2 ? 4 : 0); x < 264; x += 8) house.put(x, y, P.mortar), house.put(x, y + 1, P.mortar), house.put(x, y + 2, P.mortar);
}
house.vline(263, 24, 73, P.brickDk);
house.rect(245, 19, 22, 5, P.stoneDk);
house.hline(245, 266, 19, P.stoneLt);

// Main roof: front plane of a hip roof, scalloped slate shingles.
const roof = new Canvas(W, H);
roof.poly([[84, 108], [300, 108], [268, 42], [116, 42]], P.slate);
for (let y = 42; y < 108; y++) {
  const row = Math.floor((y - 42) / 6);
  const yy = (y - 42) % 6;
  for (let x = 0; x < W; x++) {
    if (!roof.alpha(x, y)) continue;
    const off = row % 2 ? 4 : 0;
    const xx = (x + off) % 8;
    let c = P.slate;
    if (yy === 5) c = P.slateDk; // course shadow line
    else if (yy === 4 && (xx === 0 || xx === 7)) c = P.slateDk; // rounded shingle corners
    else if (xx === 0 && yy < 4) c = P.slateDk; // shingle split
    else if (yy === 0 && xx > 1 && xx < 7) c = P.slateLt; // lit top edge
    if (c === P.slate && rand(x, y) < 0.06) c = P.slateLt;
    roof.put(x, y, c);
  }
}
roof.hline(116, 268, 42, P.slateHi); // ridge cap
roof.hline(116, 268, 43, P.slateHi);
house.over(roof);

// Cross gable over the door: slate barge band, clapboard gable, round window.
house.poly([[142, 110], [242, 110], [192, 50]], P.slateDk);
house.poly([[146, 110], [238, 110], [192, 55]], P.slate);
house.poly([[154, 110], [230, 110], [192, 65]], P.trim); // white bargeboard
house.poly([[157, 110], [227, 110], [192, 68]], P.cream);
for (let y = 72; y < 110; y += 5) {
  const half = ((y - 68) / 42) * 35;
  house.hline(Math.round(192 - half) + 1, Math.round(192 + half) - 1, y, P.creamDk);
}
// round window
house.ellipse(192, 88, 10, 10, P.ink);
house.ellipse(192, 88, 9, 9, P.trim);
house.ellipse(192, 88, 6.5, 6.5, P.glass);
house.ellipse(190, 86, 3, 3, P.glassLt);
house.hline(185, 199, 88, P.trim);
house.vline(192, 81, 95, P.trim);

// Façade: cream clapboard with white corner boards.
house.rect(X0, WALL_TOP, X1 - X0 + 1, WALL_BOT - WALL_TOP + 1, P.cream);
for (let y = WALL_TOP + 4; y <= WALL_BOT; y += 6) {
  house.hline(X0, X1, y, P.creamDk);
  house.hline(X0, X1, y + 1, P.creamLt);
}
house.rect(X0, WALL_TOP, X1 - X0 + 1, 4, P.ink, 70); // eave shadow
house.rect(X0, WALL_TOP, 5, WALL_BOT - WALL_TOP + 1, P.trim);
house.rect(X1 - 4, WALL_TOP, 5, WALL_BOT - WALL_TOP + 1, P.trim);
house.vline(X0 + 4, WALL_TOP, WALL_BOT, P.trimDk);
house.vline(X1 - 4, WALL_TOP, WALL_BOT, P.trimDk);
house.rect(X0, WALL_BOT - 3, X1 - X0 + 1, 4, P.trim); // skirting board
house.hline(X0, X1, WALL_BOT - 3, P.trimDk);
// eaves fascia (over the wall top)
house.rect(84, 106, 217, 3, P.trim);
house.hline(84, 300, 109, P.ink);

// Big four-pane windows with shutters and flower boxes.
function windowAt(x, y, w, h) {
  house.rect(x - 1, y - 1, w + 2, h + 2, P.ink);
  house.rect(x, y, w, h, P.trim);
  house.rect(x + 3, y + 3, w - 6, h - 6, P.glass);
  for (let j = 0; j < h - 6; j++) {
    const t = j / (h - 6);
    if (t < 0.35) house.hline(x + 3, x + w - 4, y + 3 + j, P.glassLt);
    else if (t > 0.8) house.hline(x + 3, x + w - 4, y + 3 + j, P.glassDk);
  }
  // highlight streaks
  for (const [sx, sy] of [[x + 6, y + 12], [x + 10, y + 13], [x + w / 2 + 5, y + 12]]) {
    for (let k = 0; k < 5; k++) house.put(sx + k, sy - k, P.white);
  }
  house.rect(x + w / 2 - 1, y + 2, 2, h - 4, P.trim); // mullions
  house.rect(x + 2, y + h / 2 - 1, w - 4, 2, P.trim);
  house.hline(x + 3, x + w - 4, y + 3, P.trimDk);
  // shutters
  for (const sx of [x - 10, x + w + 2]) {
    house.rect(sx - 1, y - 1, 10, h + 2, P.ink);
    house.rect(sx, y, 8, h, P.shutter);
    for (let j = y + 2; j < y + h - 1; j += 3) house.hline(sx + 1, sx + 6, j, P.shutterDk);
    house.vline(sx + 7, y, y + h - 1, P.shutterDk);
  }
  // sill
  house.rect(x - 3, y + h, w + 6, 3, P.trim);
  house.hline(x - 3, x + w + 2, y + h + 2, P.trimDk);
  // flower box
  const by = y + h + 3;
  house.rect(x - 2, by, w + 4, 7, P.ink);
  house.rect(x - 1, by, w + 2, 6, P.wood);
  house.hline(x - 1, x + w, by + 5, P.woodDk);
  const colours = [P.red, P.pink, P.yellow, P.white, P.violet];
  for (let fx = x; fx < x + w; fx += 3) {
    const fy = by - 2 - Math.floor(rand(fx, by) * 3);
    house.put(fx, fy + 2, P.leafDk);
    house.put(fx + 1, fy + 1, P.leaf);
    house.put(fx - 1, fy + 1, P.leaf);
    house.put(fx, fy, colours[Math.floor(rand(fx, 7) * colours.length)]);
    house.put(fx + 1, fy, colours[Math.floor(rand(fx, 9) * colours.length)]);
  }
}
windowAt(114, 116, 34, 28);
windowAt(236, 116, 34, 28);

// Arched teal door with a fanlight, porch canopy, lantern.
const DX = 180, DW = 24, DTOP = 130;
const doorShape = (c, grow = 0) => {
  house.rect(DX - grow, DTOP + 12 - grow, DW + grow * 2, WALL_BOT - DTOP - 12 + grow + 1, c);
  house.ellipse(192 - 0.5, DTOP + 12, 12 + grow, 12 + grow, c);
};
doorShape(P.ink, 3);
doorShape(P.trim, 2);
doorShape(P.door, 0);
house.rect(DX, DTOP + 12, DW, 2, P.doorDk);
house.ellipse(191.5, DTOP + 12, 8, 7, P.glass); // fanlight
house.rect(DX, DTOP + 12, DW, 8, P.door);
house.ellipse(189, DTOP + 9, 3, 2, P.glassLt);
house.vline(192, DTOP + 5, DTOP + 12, P.trim);
house.line(185, DTOP + 8, 191, DTOP + 12, P.trim);
house.line(199, DTOP + 8, 193, DTOP + 12, P.trim);
for (const px of [DX + 3, DX + 13]) { // raised panels (door body is y 142..167)
  house.rect(px, 145, 8, 9, P.doorDk);
  house.rect(px + 1, 146, 6, 7, P.doorLt);
  house.rect(px, 156, 8, 9, P.doorDk);
  house.rect(px + 1, 157, 6, 7, P.doorLt);
}
house.rect(DX + 20, 154, 2, 2, P.gold); // knob
// canopy
house.poly([[170, 128], [214, 128], [206, 116], [178, 116]], P.slate);
for (let y = 118; y < 128; y += 3) house.hline(172, 212, y, P.slateDk);
house.hline(178, 206, 116, P.slateHi);
house.rect(170, 128, 45, 2, P.trim);
house.hline(170, 214, 130, P.ink);
for (const bx of [172, 210]) { house.line(bx, 131, bx + (bx < 192 ? 3 : -3), 136, P.trim); house.line(bx, 131, bx, 136, P.trim); }
// lantern
house.vline(214, 131, 134, P.ink);
house.rect(211, 135, 7, 10, P.ink);
house.rect(212, 137, 5, 6, P.lamp);
house.put(214, 139, P.white);
house.rect(211, 145, 7, 1, P.ink);

// Stone foundation + front step.
house.rect(X0, WALL_BOT + 1, X1 - X0 + 1, FOUND_BOT - WALL_BOT, P.stone);
for (let y = WALL_BOT + 1; y <= FOUND_BOT; y += 4) {
  if (y + 3 <= FOUND_BOT) house.hline(X0, X1, y + 3, P.stoneDk);
  for (let x = X0 + ((y >> 2) % 2 ? 6 : 0); x <= X1; x += 12) house.vline(x, y, y + 2, P.stoneDk);
  house.hline(X0, X1, y, P.stoneLt);
}
house.rect(174, WALL_BOT + 1, 36, FOUND_BOT - WALL_BOT, P.stoneLt); // step
house.hline(174, 209, WALL_BOT + 1, P.white);
house.hline(174, 209, FOUND_BOT, P.stoneDk);
house.outline(P.ink);

// ── Garden: walkable ground (beds, stepping stones) ─────────────────────
const garden = new Canvas(W, H);
// stepping stones from the door to the gate
[[192, 182], [188, 194], [195, 206], [189, 218], [194, 230]].forEach(([x, y], i) => {
  garden.ellipse(x, y, 9, 5, P.pathDk);
  garden.ellipse(x, y - 0.5, 8, 4, P.path);
  garden.ellipse(x - 2, y - 2, 4, 1.5, P.pathLt);
  if (i % 2) garden.put(x + 4, y + 1, P.pathDk);
});
// flower beds with stone edging
function bed(x, y, w, h) {
  garden.rect(x - 2, y - 2, w + 4, h + 4, P.stoneDk);
  garden.rect(x - 1, y - 1, w + 2, h + 2, P.stone);
  for (let i = x; i < x + w; i += 4) garden.put(i, y - 1, P.stoneLt);
  garden.rect(x, y, w, h, P.soil);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (rand(i, j) < 0.12) garden.put(i, j, P.soilDk);
}
bed(108, 186, 60, 26);
bed(216, 186, 60, 26);
// tulips on the left
const tulip = [P.red, P.yellow, P.pink, P.red, P.violet, P.yellow];
for (let row = 0; row < 2; row++) {
  for (let i = 0; i < 7; i++) {
    const x = 113 + i * 8 + (row ? 4 : 0);
    const y = 193 + row * 11;
    garden.vline(x, y + 1, y + 5, P.leafDk);
    garden.put(x - 1, y + 4, P.leaf); garden.put(x + 1, y + 3, P.leaf);
    const c = tulip[(i + row * 3) % tulip.length];
    garden.rect(x - 1, y - 2, 3, 3, c);
    garden.put(x - 1, y - 3, c); garden.put(x + 1, y - 3, c);
    garden.put(x, y - 2, P.white);
  }
}
// rose bushes and daisies on the right
for (const [x, y] of [[226, 197], [246, 199], [266, 197]]) {
  garden.ellipse(x, y, 8, 7, P.leafDk);
  garden.ellipse(x - 1, y - 1, 7, 6, P.leaf);
  garden.ellipse(x - 3, y - 3, 3, 2, P.leafLt);
  for (let k = 0; k < 6; k++) {
    const rx = x - 5 + Math.floor(rand(x, k) * 11), ry = y - 5 + Math.floor(rand(y, k, 3) * 9);
    garden.put(rx, ry, P.pink); garden.put(rx + 1, ry, P.red); garden.put(rx, ry + 1, P.red);
  }
}
for (let k = 0; k < 7; k++) {
  const x = 220 + Math.floor(rand(k, 11) * 52), y = 207 + Math.floor(rand(k, 13) * 4);
  garden.put(x, y, P.white); garden.put(x - 1, y, P.white); garden.put(x + 1, y, P.white); garden.put(x, y - 1, P.white); garden.put(x, y, P.yellow);
}
garden.outline(P.ink);

// ── Garden: blocking bits (picket fence, corner bushes) ─────────────────
const fence = new Canvas(W, H);
function pickets(x0, x1) {
  fence.rect(x0, 229, x1 - x0 + 1, 2, P.trimDk); // rails
  fence.rect(x0, 235, x1 - x0 + 1, 2, P.trimDk);
  for (let x = x0; x + 3 <= x1; x += 6) {
    fence.rect(x, 227, 4, 12, P.trim);
    fence.rect(x + 1, 226, 2, 1, P.trim); // pointed top
    fence.vline(x + 3, 227, 238, P.trimDk);
  }
}
// Keep the gate columns (11–12, x 176..207) free of pixels, outlines
// included, so the gate stays walkable.
pickets(98, 163); // left of the gate
pickets(218, 285); // right of the gate
for (const px of [167, 211]) { // gate posts (cols 10 and 13), gate left open
  fence.rect(px, 222, 6, 17, P.trim);
  fence.vline(px + 5, 222, 238, P.trimDk);
  fence.ellipse(px + 2.5, 221, 3, 2.5, P.trim);
}
for (const sx of [96, 284]) { // side fences running back to the house
  fence.rect(sx, 182, 4, 57, P.trim);
  fence.vline(sx + 3, 182, 238, P.trimDk);
  for (let y = 184; y < 236; y += 12) fence.hline(sx, sx + 3, y, P.trimDk);
}
for (const bx of [92, 292]) { // round bushes at the house corners
  fence.ellipse(bx, 172, 12, 10, P.leafDk);
  fence.ellipse(bx - 1, 171, 11, 9, P.leaf);
  fence.ellipse(bx - 4, 167, 5, 3, P.leafLt);
  for (let k = 0; k < 5; k++) fence.put(bx - 7 + Math.floor(rand(bx, k) * 14), 166 + Math.floor(rand(k, bx) * 12), P.leafDk);
}
fence.outline(P.ink);

// ── Soft shadow under the house and fence ───────────────────────────────
const shadow = new Canvas(W, H);
for (let k = 0; k < 6; k++) shadow.rect(88 - k, FOUND_BOT + 1 + k, X1 - X0 + 17 + k * 2, 1, P.ink, 70 - k * 11);
shadow.rect(96, 239, 192, 1, P.ink, 40);

// ── Route to template layers and bake ───────────────────────────────────
const FOUNDATION_ROW = 10; // tile row of the foundation (y 160..175)
const upper = house.rows(0, FOUNDATION_ROW * 16);
const lower = house.rows(FOUNDATION_ROW * 16, H).over(fence);

const collision = [];
for (let r = 6; r <= FOUNDATION_ROW; r++) for (let c = 6; c <= 17; c++) collision.push([r, c]);

await bakeCanvases({
  name: "RoseCottage",
  jsonName: "rose_cottage",
  layers: {
    GroundUpper: garden,
    DecorationLowerShadow: shadow,
    DecorationLower: lower,
    DecorationUpper1: upper,
  },
  collision,
  door: [FOUNDATION_ROW, 11],
});
