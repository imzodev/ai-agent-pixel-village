#!/usr/bin/env node
// The shared house templates, redrawn in the detailed (DS-era) style and
// baked IN PLACE so every stamp using them (the village cabins, Hollowmere,
// Brightwater) updates at once:
//
//   cabin_1  — log cabin, red tiled roof
//   cabin_2  — painted board cabin, teal roof, white trim
//   house_1  — two-storey timber-frame, brown roof with a dormer
//   house_2  — two-storey brick, slate roof
//
//   node scripts/draw-houses.mjs
//
// Each keeps the old template's contract exactly: 24×15 tiles, Collision on
// columns 10–19 (rows 8–12 for cabins, 5–12 for houses) and the door tile
// at (17, 12), so lots, doors and stamps keep working. Routing: the wall's
// bottom row (row 12) → DecorationLower (blocks, anchors the Y-sort);
// everything above → DecorationUpper1 (you walk behind it); the door step
// and flowers → GroundUpper; the ground shadow → DecorationLowerShadow.
// Chimney tops (for the smoke) are listed in src/game/buildingStamps.ts.

import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";
import { PAL, ramp, shade, softShadow } from "./ds-art.mjs";

const W = 384, H = 240, T = 16;
const X0 = 160, X1 = 319, BOTTOM = 207; // wall footprint (cols 10–19, down to row 12)
const DOOR_X = 17 * T; // door tile column 17

function line(c, x0, x1, y, col) { for (let x = x0; x <= x1; x++) c.put(x, y, col); }
function vline(c, x, y0, y1, col) { for (let y = y0; y <= y1; y++) c.put(x, y, col); }

// ── Walls ───────────────────────────────────────────────────────────────
function logWall(c, top) {
  for (let y = top; y <= BOTTOM; y++) {
    const k = (y - top) % 7;
    for (let x = X0; x <= X1; x++) {
      let t = 0.85 - k * 0.1 + (rand(x >> 2, Math.floor((y - top) / 7), 3) - 0.5) * 0.15;
      if (k === 6) t = 0.08;
      if ((x * 7 + Math.floor((y - top) / 7) * 13) % 37 === 0) t -= 0.2; // knots
      c.put(x, y, ramp(PAL.log, t, x, y));
    }
  }
  for (let y = top + 3; y <= BOTTOM - 8; y += 7) for (const ex of [X0 + 4, X1 - 4]) { // log ends
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= 3.2) c.put(ex + dx, y + dy, d < 1.2 ? PAL.wood[3] : d < 2.2 ? PAL.wood[4] : PAL.log[1]);
    }
  }
}
function boardWall(c, top) {
  for (let y = top; y <= BOTTOM; y++) for (let x = X0; x <= X1; x++) {
    const k = (x - X0) % 6;
    let t = 0.62 + (k === 0 ? 0.25 : k === 5 ? -0.3 : 0) - (y - top) * 0.002;
    c.put(x, y, ramp(PAL.board, t, x, y));
  }
  for (const x of [X0, X0 + 1, X0 + 2, X1 - 2, X1 - 1, X1]) vline(c, x, top, BOTTOM, x === X0 || x === X1 ? PAL.board[1] : PAL.white); // trim
}
function timberWall(c, top, floorY) {
  shade(c, X0, top, X1 - X0 + 1, BOTTOM - top + 1, PAL.plaster, (x, y) => 0.6 + (rand(x, y, 5) - 0.5) * 0.12 - (y - top) * 0.0015);
  const beam = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) for (let k = 0; k < 4; k++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      c.put(x + (x0 === x1 ? k : 0), y + (y0 === y1 ? k : 0), PAL.wood[k === 0 ? 2 : k === 3 ? 0 : 1]);
    }
  };
  for (const x of [X0, X0 + 52, X0 + 104, X1 - 3]) beam(x, top, x, BOTTOM);
  beam(X0, top, X1, top); beam(X0, floorY, X1, floorY);
  beam(X0 + 4, floorY, X0 + 50, top + 4); beam(X1 - 6, floorY, X1 - 52, top + 4); // braces
}
function brickWall(c, top) {
  for (let y = top; y <= BOTTOM; y++) {
    const row = Math.floor((y - top) / 5), k = (y - top) % 5;
    for (let x = X0; x <= X1; x++) {
      const bx = (x - X0 + (row % 2) * 5) % 10;
      let t = 0.6 + (rand(Math.floor((x - X0 + (row % 2) * 5) / 10), row, 6) - 0.5) * 0.35 - k * 0.04;
      if (k === 4 || bx === 9) { c.put(x, y, PAL.plaster[1]); continue; } // mortar
      c.put(x, y, ramp(PAL.brick, t, x, y));
    }
  }
  for (const x of [X0, X1]) vline(c, x, top, BOTTOM, PAL.brick[0]);
}

// ── Roof (hip roof seen from the front) ─────────────────────────────────
function roof(c, ridgeY, eaveY, colors, dormer) {
  const xl = X0 - 7, xr = X1 + 7, inset = Math.round((eaveY - ridgeY) * 0.35);
  const inRoof = (x, y) => y >= ridgeY && y <= eaveY && x >= xl + inset * (1 - (y - ridgeY) / (eaveY - ridgeY)) && x <= xr - inset * (1 - (y - ridgeY) / (eaveY - ridgeY));
  for (let y = ridgeY; y <= eaveY; y++) for (let x = xl; x <= xr; x++) {
    if (!inRoof(x, y)) continue;
    const row = Math.floor((y - ridgeY) / 7), k = (y - ridgeY) % 7;
    const tx = (x - xl + (row % 2) * 5) % 10;
    let t = 0.72 - row * 0.03 - k * 0.07 + (rand(Math.floor((x - xl + (row % 2) * 5) / 10), row, 9) - 0.5) * 0.18;
    if (k === 6) t = 0.08; // shadow line under each course
    else if (tx === 0) t -= 0.3; // gap between tiles
    else if (k === 0 && tx < 6) t += 0.2; // lit upper lip of each tile
    c.put(x, y, ramp(colors, t, x, y));
  }
  // ridge cap
  for (let x = xl + inset; x <= xr - inset; x++) { c.put(x, ridgeY, PAL.ink); c.put(x, ridgeY + 1, colors[5]); c.put(x, ridgeY + 2, colors[4]); }
  // eave fascia and its shadow on the wall
  for (let x = xl; x <= xr; x++) {
    c.put(x, eaveY + 1, PAL.wood[1]); c.put(x, eaveY + 2, PAL.wood[0]); c.put(x, eaveY + 3, PAL.ink);
    for (let k = 0; k < 6; k++) if (x >= X0 && x <= X1) c.put(x, eaveY + 4 + k, PAL.shadow, 110 - k * 18);
  }
  // roof outline (sides)
  for (let y = ridgeY; y <= eaveY + 2; y++) {
    const t = Math.min(1, (y - ridgeY) / (eaveY - ridgeY));
    c.put(Math.round(xl + inset * (1 - t)) - 1, y, PAL.ink); c.put(Math.round(xr - inset * (1 - t)) + 1, y, PAL.ink);
  }
  if (dormer) { // a little gabled window in the roof
    const dx = X0 + 40, dy = ridgeY + 10;
    shade(c, dx, dy + 8, 24, 18, PAL.plaster, (x, y) => 0.6 - (y - dy) * 0.01);
    window_(c, dx + 5, dy + 11, 14, 12, false, null);
    for (let y = dy; y <= dy + 9; y++) { const hw = (y - dy) * 1.6; for (let x = dx + 12 - hw; x <= dx + 12 + hw; x++) c.put(Math.round(x), y, ramp(colors, 0.6 - (y - dy) * 0.03, Math.round(x), y)); }
    line(c, dx - 2, dx + 26, dy + 9, PAL.ink);
  }
}
function chimney(c, x, top, bottom) {
  shade(c, x, top, 14, bottom - top, PAL.stone, (px, py) => 0.62 - (px - x) * 0.03 + ((py - top) % 6 === 5 ? -0.3 : 0) + (((px - x + Math.floor((py - top) / 6) * 4) % 8) === 0 ? -0.25 : 0));
  shade(c, x - 2, top - 4, 18, 4, PAL.stone, (px) => 0.85 - (px - x) * 0.03);
  for (let y = top - 4; y < bottom; y++) { c.put(x - 3 + (y < top ? 0 : 2), y, PAL.ink); c.put(x + 16 - (y < top ? 0 : 2), y, PAL.ink); }
  line(c, x - 3, x + 16, top - 5, PAL.ink);
}

// ── Windows, door, foundation ───────────────────────────────────────────
function window_(c, x, y, w, h, shutters, box) {
  shade(c, x - 2, y - 2, w + 4, h + 4, PAL.wood, (px, py) => (py === y - 2 ? 0.9 : 0.55)); // frame
  shade(c, x, y, w, h, PAL.glassLit, (px, py) => 0.55 + (py - y) / h * 0.3 - (px - x) / w * 0.15); // warm interior
  for (let k = 0; k < Math.min(w, h); k++) { c.put(x + 2 + k, y + h - 3 - k, PAL.glassLit[4]); c.put(x + 3 + k, y + h - 3 - k, PAL.glassLit[3]); } // glint
  vline(c, x + Math.floor(w / 2), y, y + h - 1, PAL.wood[1]); line(c, x, x + w - 1, y + Math.floor(h / 2), PAL.wood[1]); // mullions
  line(c, x - 3, x + w + 2, y + h + 2, PAL.wood[4]); line(c, x - 3, x + w + 2, y + h + 3, PAL.wood[1]); // sill
  if (shutters) for (const sx of [x - 8, x + w + 3]) {
    shade(c, sx, y - 1, 5, h + 2, shutters, (px, py) => 0.62 - (px - sx) * 0.08 + ((py - y) % 4 === 0 ? -0.25 : 0));
    vline(c, sx - 1, y - 1, y + h, PAL.ink); vline(c, sx + 5, y - 1, y + h, PAL.ink);
  }
  if (box) { // flower box with blooms
    shade(c, x - 2, y + h + 4, w + 4, 5, PAL.wood, (px, py) => 0.55 - (py - y - h - 4) * 0.08);
    for (let fx = x - 1; fx < x + w + 2; fx += 3) {
      c.put(fx, y + h + 3, PAL.leaf[3]); c.put(fx + 1, y + h + 3, PAL.leaf[2]);
      c.put(fx, y + h + 2, box[(fx >> 1) % box.length]); c.put(fx + 1, y + h + 1, box[(fx >> 2) % box.length]);
    }
  }
}
function door(c, roofColors) {
  const x = DOOR_X + 1, w = 14, top = BOTTOM - 30;
  shade(c, x - 2, top - 2, w + 4, BOTTOM - top + 2, PAL.wood, (px, py) => (py === top - 2 ? 0.9 : 0.42)); // frame
  shade(c, x, top, w, BOTTOM - top - 1, PAL.wood, (px, py) => 0.62 + (((px - x) % 4) === 3 ? -0.3 : 0) - (py - top) * 0.008);
  shade(c, x + 3, top + 4, 8, 6, PAL.glassLit, (px, py) => 0.7 - (py - top) * 0.04); // little window
  c.put(x + w - 3, top + 16, PAL.yellow); c.put(x + w - 3, top + 17, PAL.wood[0]); // knob
  // awning above the door
  for (let y = top - 9; y <= top - 3; y++) { const grow = y - (top - 9); for (let px = x - 4 - grow; px <= x + w + 3 + grow; px++) c.put(px, y, ramp(roofColors, 0.75 - grow * 0.08, px, y)); }
  line(c, x - 11, x + w + 10, top - 2, PAL.ink);
  // wall lamp beside the door
  const lx = x + w + 5, ly = top + 2;
  shade(c, lx, ly, 5, 7, PAL.glassLit, () => 0.8); c.put(lx + 2, ly + 1, PAL.lampLt);
  line(c, lx - 1, lx + 5, ly - 1, PAL.iron); line(c, lx - 1, lx + 5, ly + 7, PAL.iron); vline(c, lx - 1, ly, ly + 6, PAL.iron); vline(c, lx + 5, ly, ly + 6, PAL.iron);
}
function foundation(c) {
  // Kept inside columns 10–19 (x 160..319) so the blocked tiles match the
  // template's collision exactly; the walls' side outlines are the
  // outermost wall pixels.
  for (let y = BOTTOM - 6; y <= BOTTOM; y++) for (let x = X0; x <= X1; x++) {
    const bx = (x - X0 + (y > BOTTOM - 3 ? 6 : 0)) % 12;
    c.put(x, y, bx === 0 || y === BOTTOM - 3 ? PAL.stone[1] : ramp(PAL.stone, 0.65 - (y - BOTTOM + 6) * 0.06, x, y));
  }
  line(c, X0, X1, BOTTOM, PAL.ink);
  for (let y = 0; y <= BOTTOM; y++) for (const x of [X0, X1]) if (c.alpha(x, y) > 200 && y > 100) c.put(x, y, PAL.ink);
}

// ── Ground: step, flowers, shadow ───────────────────────────────────────
function ground(c, shadowC) {
  softShadow(shadowC, X0 - 4, BOTTOM + 1, X1 - X0 + 9, 7, 110);
  // stone step in front of the door
  shade(c, DOOR_X - 1, BOTTOM + 1, 18, 5, PAL.stone, (px, py) => (py === BOTTOM + 1 ? 0.9 : 0.55));
  line(c, DOOR_X - 1, DOOR_X + 16, BOTTOM + 6, PAL.stone[0]);
  // flower bushes along the wall
  for (const bx of [X0 + 6, X0 + 30, X0 + 84]) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
      const d = ((x - 5.5) / 6) ** 2 + ((y - 3.5) / 4) ** 2;
      if (d <= 1) c.put(bx + x, BOTTOM + 1 + y, ramp(PAL.leaf, 0.65 - (x - 5) * 0.03 - (y - 3) * 0.08, bx + x, y));
    }
    for (const [fx, fy, col] of [[bx + 3, BOTTOM + 3, PAL.red], [bx + 7, BOTTOM + 2, PAL.pink], [bx + 5, BOTTOM + 5, PAL.yellow]]) c.put(fx, fy, col);
  }
}

// ── Assembly ────────────────────────────────────────────────────────────
async function house({ name, jsonName, storeys, wall, roofColors, shutters, dormer, chimneyX }) {
  const art = new Canvas(W, H);
  const groundC = new Canvas(W, H), shadowC = new Canvas(W, H);
  const wallTop = storeys === 2 ? 92 : 140;
  const ridgeY = storeys === 2 ? 14 : 58, eaveY = storeys === 2 ? 98 : 146;
  chimney(art, chimneyX, ridgeY - 10, ridgeY + 26);
  if (wall === "log") logWall(art, wallTop);
  if (wall === "board") boardWall(art, wallTop);
  if (wall === "timber") timberWall(art, wallTop, 146);
  if (wall === "brick") brickWall(art, wallTop);
  roof(art, ridgeY, eaveY, roofColors, dormer);
  const box = [PAL.red, PAL.pink, PAL.yellow, PAL.white, PAL.violet];
  if (storeys === 2) {
    for (const wx of [X0 + 14, X0 + 62, X0 + 112]) window_(art, wx, 112, 18, 18, shutters, box);
    for (const wx of [X0 + 14, X0 + 62]) window_(art, wx, 160, 18, 18, shutters, box);
  } else {
    for (const wx of [X0 + 16, X0 + 62]) window_(art, wx, 160, 18, 17, shutters, box);
  }
  foundation(art);
  door(art, roofColors);
  ground(groundC, shadowC);

  const upper = art.rows(0, 12 * T);
  const lower = art.rows(12 * T, H);
  const collision = [];
  for (let r = storeys === 2 ? 5 : 8; r <= 12; r++) for (let c = 10; c <= 19; c++) collision.push([r, c]);
  await bakeCanvases({
    name, jsonName,
    layers: { GroundUpper: groundC, DecorationLowerShadow: shadowC, DecorationLower: lower, DecorationUpper1: upper },
    collision, door: [12, 17],
  });
}

await house({ name: "CabinLog", jsonName: "cabin_1", storeys: 1, wall: "log", roofColors: PAL.roofRed, shutters: PAL.leaf, dormer: false, chimneyX: X0 + 104 });
await house({ name: "CabinBoard", jsonName: "cabin_2", storeys: 1, wall: "board", roofColors: PAL.roofTeal, shutters: PAL.roofRed, dormer: false, chimneyX: X0 + 22 });
await house({ name: "HouseTimber", jsonName: "house_1", storeys: 2, wall: "timber", roofColors: PAL.roofBrown, shutters: PAL.leaf, dormer: true, chimneyX: X0 + 110 });
await house({ name: "HouseBrick", jsonName: "house_2", storeys: 2, wall: "brick", roofColors: PAL.roofSlate, shutters: null, dormer: false, chimneyX: X0 + 24 });
