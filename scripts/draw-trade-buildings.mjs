#!/usr/bin/env node
// Working buildings in the detailed (DS-era) style of scripts/draw-houses.mjs,
// baked into their own templates:
//
//   forge — Bjorn's smithy in Hollowmere: stone walls under a slate roof, a
//           broad stone chimney, a SMITHY board, a window onto the tools, an
//           open lean-to bay with a glowing hearth, hanging tongs and
//           hammers, anvil, quench barrel and coal, and a display rack out
//           front whose goods the game draws from his real stock
//           (src/lib/shopDisplay.ts) (public/buildings/forge.json)
//   inn   — a two-storey timber inn with a hanging tankard sign, lanterns
//           by the door, a bench and barrels (public/buildings/inn.json)
//   waystone — a carved standing stone with a glowing blue rune on a
//           flagstone base: attune to it, fast-travel between them
//           (public/buildings/waystone.json)
//   bakery — Marigold's bakery: a cream shopfront under a teal roof with a
//           brick oven chimney, two big display windows full of bread under
//           striped awnings, a painted BAKERY board and a hanging pretzel
//           sign, flour sacks and a bread cart out front (bakery.json)
//   ranch — a fenced pen for a player's animals: a hen coop on the left, a
//           red gambrel barn on the right, trough and hay bales between,
//           and the same road + gate as the field lots (ranch_lot.json)
//
//   node scripts/draw-trade-buildings.mjs [forge|inn|bakery|ranch|waystone]
//
// Both are 24×15-tile templates. Routing (as in draw-houses): the wall's
// bottom row → DecorationLower (blocks, anchors the Y-sort); everything
// above → DecorationUpper1 (you walk behind it); steps and flowers →
// GroundUpper; ground shadows → DecorationLowerShadow. Chimney tops and
// the hearth glow are listed in src/game/buildingStamps.ts.

import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";
import { PAL, hex, ramp, shade, softShadow } from "./ds-art.mjs";

const W = 384, H = 240, T = 16;
const FIRE = [hex(0x7a1e0e), hex(0xb83a12), hex(0xe8661a), hex(0xf8a030), hex(0xffd860), hex(0xfff4c0)];

// The building being drawn: wall footprint in pixels and the door column.
let G = { X0: 0, X1: 0, BOTTOM: 207, DOOR_X: 0 };

function line(c, x0, x1, y, col) { for (let x = x0; x <= x1; x++) c.put(x, y, col); }
function vline(c, x, y0, y1, col) { for (let y = y0; y <= y1; y++) c.put(x, y, col); }

// ── Walls ───────────────────────────────────────────────────────────────
function stoneWall(c, top) {
  // Rough-cut stone blocks in staggered courses, darker toward the ground.
  for (let y = top; y <= G.BOTTOM; y++) {
    const row = Math.floor((y - top) / 8), k = (y - top) % 8;
    for (let x = G.X0; x <= G.X1; x++) {
      const w = 13 + (row % 3) * 2;
      const bx = (x - G.X0 + row * 7) % w;
      const block = Math.floor((x - G.X0 + row * 7) / w);
      let t = 0.66 + (rand(block, row, 11) - 0.5) * 0.3 - k * 0.025 - (y - top) * 0.0012;
      if (k === 7 || bx === 0) t = 0.12; // mortar joints
      else if (k === 0 || bx === 1) t += 0.14; // lit upper-left edge of each block
      c.put(x, y, ramp(PAL.stone, t, x, y));
    }
  }
  for (const x of [G.X0, G.X1]) vline(c, x, top, G.BOTTOM, PAL.ink);
}
function timberWall(c, top, floorY) {
  shade(c, G.X0, top, G.X1 - G.X0 + 1, G.BOTTOM - top + 1, PAL.plaster, (x, y) => 0.6 + (rand(x, y, 5) - 0.5) * 0.12 - (y - top) * 0.0015);
  const beam = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) for (let k = 0; k < 4; k++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      c.put(x + (x0 === x1 ? k : 0), y + (y0 === y1 ? k : 0), PAL.wood[k === 0 ? 2 : k === 3 ? 0 : 1]);
    }
  };
  const span = G.X1 - G.X0;
  for (const f of [0, 0.25, 0.5, 0.75]) beam(G.X0 + Math.round(span * f), top, G.X0 + Math.round(span * f), G.BOTTOM);
  beam(G.X1 - 3, top, G.X1 - 3, G.BOTTOM);
  beam(G.X0, top, G.X1, top); beam(G.X0, floorY, G.X1, floorY);
  // diagonal braces in the end bays
  beam(G.X0 + 4, floorY, G.X0 + Math.round(span * 0.25) - 2, top + 4);
  beam(G.X1 - 6, floorY, G.X1 - Math.round(span * 0.25) + 2, top + 4);
}

// ── Roof (hip roof seen from the front) ─────────────────────────────────
function roof(c, ridgeY, eaveY, colors) {
  const xl = G.X0 - 7, xr = G.X1 + 7, inset = Math.round((eaveY - ridgeY) * 0.35);
  const edge = (y) => inset * (1 - (y - ridgeY) / (eaveY - ridgeY));
  for (let y = ridgeY; y <= eaveY; y++) for (let x = xl; x <= xr; x++) {
    if (x < xl + edge(y) || x > xr - edge(y)) continue;
    const row = Math.floor((y - ridgeY) / 7), k = (y - ridgeY) % 7;
    const tx = (x - xl + (row % 2) * 5) % 10;
    let t = 0.72 - row * 0.03 - k * 0.07 + (rand(Math.floor((x - xl + (row % 2) * 5) / 10), row, 9) - 0.5) * 0.18;
    if (k === 6) t = 0.08;
    else if (tx === 0) t -= 0.3;
    else if (k === 0 && tx < 6) t += 0.2;
    c.put(x, y, ramp(colors, t, x, y));
  }
  for (let x = xl + inset; x <= xr - inset; x++) { c.put(x, ridgeY, PAL.ink); c.put(x, ridgeY + 1, colors[5]); c.put(x, ridgeY + 2, colors[4]); }
  for (let x = xl; x <= xr; x++) {
    c.put(x, eaveY + 1, PAL.wood[1]); c.put(x, eaveY + 2, PAL.wood[0]); c.put(x, eaveY + 3, PAL.ink);
    for (let k = 0; k < 6; k++) if (x >= G.X0 && x <= G.X1) c.put(x, eaveY + 4 + k, PAL.shadow, 110 - k * 18);
  }
  for (let y = ridgeY; y <= eaveY + 2; y++) { c.put(Math.round(xl + edge(Math.min(y, eaveY))) - 1, y, PAL.ink); c.put(Math.round(xr - edge(Math.min(y, eaveY))) + 1, y, PAL.ink); }
}
function chimney(c, x, top, bottom, w = 14) {
  shade(c, x, top, w, bottom - top, PAL.stone, (px, py) => 0.62 - (px - x) * (0.4 / w) + ((py - top) % 6 === 5 ? -0.3 : 0) + (((px - x + Math.floor((py - top) / 6) * 4) % 8) === 0 ? -0.25 : 0));
  shade(c, x - 2, top - 4, w + 4, 4, PAL.stone, (px) => 0.85 - (px - x) * 0.03);
  for (let y = top - 4; y < bottom; y++) { c.put(x - 3 + (y < top ? 0 : 2), y, PAL.ink); c.put(x + w + 2 - (y < top ? 0 : 2), y, PAL.ink); }
  line(c, x - 3, x + w + 2, top - 5, PAL.ink);
}

// ── Windows, doors, foundation ──────────────────────────────────────────
function window_(c, x, y, w, h, shutters, box) {
  shade(c, x - 2, y - 2, w + 4, h + 4, PAL.wood, (px, py) => (py === y - 2 ? 0.9 : 0.55));
  shade(c, x, y, w, h, PAL.glassLit, (px, py) => 0.55 + ((py - y) / h) * 0.3 - ((px - x) / w) * 0.15);
  for (let k = 0; k < Math.min(w, h); k++) { c.put(x + 2 + k, y + h - 3 - k, PAL.glassLit[4]); c.put(x + 3 + k, y + h - 3 - k, PAL.glassLit[3]); }
  vline(c, x + Math.floor(w / 2), y, y + h - 1, PAL.wood[1]); line(c, x, x + w - 1, y + Math.floor(h / 2), PAL.wood[1]);
  line(c, x - 3, x + w + 2, y + h + 2, PAL.wood[4]); line(c, x - 3, x + w + 2, y + h + 3, PAL.wood[1]);
  if (shutters) for (const sx of [x - 8, x + w + 3]) {
    shade(c, sx, y - 1, 5, h + 2, shutters, (px, py) => 0.62 - (px - sx) * 0.08 + ((py - y) % 4 === 0 ? -0.25 : 0));
    vline(c, sx - 1, y - 1, y + h, PAL.ink); vline(c, sx + 5, y - 1, y + h, PAL.ink);
  }
  if (box) {
    shade(c, x - 2, y + h + 4, w + 4, 5, PAL.wood, (px, py) => 0.55 - (py - y - h - 4) * 0.08);
    for (let fx = x - 1; fx < x + w + 2; fx += 3) {
      c.put(fx, y + h + 3, PAL.leaf[3]); c.put(fx + 1, y + h + 3, PAL.leaf[2]);
      c.put(fx, y + h + 2, box[(fx >> 1) % box.length]); c.put(fx + 1, y + h + 1, box[(fx >> 2) % box.length]);
    }
  }
}
/** A plank door (w px wide) with a small window, under an awning. */
function door(c, roofColors, w = 14, glass = true) {
  const x = G.DOOR_X + 1 + Math.round((14 - w) / 2), top = G.BOTTOM - 30;
  shade(c, x - 2, top - 2, w + 4, G.BOTTOM - top + 2, PAL.wood, (px, py) => (py === top - 2 ? 0.9 : 0.42));
  shade(c, x, top, w, G.BOTTOM - top - 1, PAL.wood, (px, py) => 0.62 + (((px - x) % 4) === 3 ? -0.3 : 0) - (py - top) * 0.008);
  if (w > 18) vline(c, x + Math.floor(w / 2), top, G.BOTTOM - 2, PAL.wood[0]); // double door
  if (glass) shade(c, x + 3, top + 4, w - 6, 6, PAL.glassLit, (px, py) => 0.7 - (py - top) * 0.04);
  c.put(x + w - 3, top + 16, PAL.yellow); c.put(x + w - 3, top + 17, PAL.wood[0]);
  if (w > 18) { c.put(x + 2, top + 16, PAL.yellow); c.put(x + 2, top + 17, PAL.wood[0]); }
  if (roofColors) {
    for (let y = top - 9; y <= top - 3; y++) { const grow = y - (top - 9); for (let px = x - 4 - grow; px <= x + w + 3 + grow; px++) c.put(px, y, ramp(roofColors, 0.75 - grow * 0.08, px, y)); }
    line(c, x - 11, x + w + 10, top - 2, PAL.ink);
  }
  return { x, w, top };
}
function wallLamp(c, lx, ly) {
  shade(c, lx, ly, 5, 7, PAL.glassLit, () => 0.8); c.put(lx + 2, ly + 1, PAL.lampLt);
  line(c, lx - 1, lx + 5, ly - 1, PAL.iron); line(c, lx - 1, lx + 5, ly + 7, PAL.iron); vline(c, lx - 1, ly, ly + 6, PAL.iron); vline(c, lx + 5, ly, ly + 6, PAL.iron);
  c.put(lx + 2, ly - 2, PAL.iron); c.put(lx + 2, ly - 3, PAL.iron);
}
function foundation(c) {
  for (let y = G.BOTTOM - 6; y <= G.BOTTOM; y++) for (let x = G.X0; x <= G.X1; x++) {
    const bx = (x - G.X0 + (y > G.BOTTOM - 3 ? 6 : 0)) % 12;
    c.put(x, y, bx === 0 || y === G.BOTTOM - 3 ? PAL.stone[1] : ramp(PAL.stone, 0.65 - (y - G.BOTTOM + 6) * 0.06, x, y));
  }
  line(c, G.X0, G.X1, G.BOTTOM, PAL.ink);
  for (let y = 0; y <= G.BOTTOM; y++) for (const x of [G.X0, G.X1]) if (c.alpha(x, y) > 200 && y > 60) c.put(x, y, PAL.ink);
}
function step(c, x, w) {
  shade(c, x - 1, G.BOTTOM + 1, w + 4, 5, PAL.stone, (px, py) => (py === G.BOTTOM + 1 ? 0.9 : 0.55));
  line(c, x - 1, x + w + 2, G.BOTTOM + 6, PAL.stone[0]);
}
function bush(c, bx, by, flowers = true) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) {
    const d = ((x - 5.5) / 6) ** 2 + ((y - 3.5) / 4) ** 2;
    if (d <= 1) c.put(bx + x, by + y, ramp(PAL.leaf, 0.65 - (x - 5) * 0.03 - (y - 3) * 0.08, bx + x, y));
  }
  if (flowers) for (const [fx, fy, col] of [[bx + 3, by + 2, PAL.red], [bx + 7, by + 1, PAL.pink], [bx + 5, by + 4, PAL.yellow]]) c.put(fx, fy, col);
}

// ── Props ───────────────────────────────────────────────────────────────
function barrel(c, x, y, h = 18, hoops = PAL.iron) {
  // a barrel standing with its base at y
  for (let py = y - h; py <= y; py++) {
    const bulge = Math.round(Math.sin(((py - (y - h)) / h) * Math.PI) * 2);
    for (let px = x - 6 - bulge; px <= x + 6 + bulge; px++) {
      const stave = (px - x + 20) % 4 === 0;
      c.put(px, py, ramp(PAL.wood, 0.62 - (px - x) * 0.025 + (stave ? -0.22 : 0), px, py));
    }
    c.put(x - 7 - bulge, py, PAL.ink); c.put(x + 7 + bulge, py, PAL.ink);
  }
  for (const hy of [y - h + 3, y - 3]) line(c, x - 7, x + 7, hy, hoops);
  shade(c, x - 5, y - h - 2, 11, 3, PAL.wood, () => 0.85);
  line(c, x - 6, x + 6, y - h - 3, PAL.ink); line(c, x - 7, x + 7, y + 1, PAL.ink);
}
function bench(c, x, y, w) {
  shade(c, x, y - 7, w, 4, PAL.wood, (px, py) => (py === y - 7 ? 0.85 : 0.6) - ((px - x) % 9 === 0 ? 0.2 : 0)); // seat
  shade(c, x, y - 16, w, 3, PAL.wood, () => 0.7); // back rail
  for (const lx of [x + 2, x + w - 4]) { shade(c, lx, y - 16, 2, 16, PAL.wood, () => 0.4); }
  line(c, x - 1, x + w, y - 3, PAL.ink);
}

// ── The forge ───────────────────────────────────────────────────────────
/** A window onto the workshop: dark, lit by the forge, tools on the wall. */
function toolWindow(c, x, y, w, h) {
  shade(c, x - 3, y - 3, w + 6, h + 6, PAL.wood, (px, py) => (py === y - 3 || px === x - 3 ? 0.9 : 0.5));
  shade(c, x, y, w, h, [hex(0x2a160c), hex(0x4a2410), hex(0x7a3a14), hex(0xb85a1c)], (px, py) => 0.25 + ((py - y) / h) * 0.55 + (rand(px >> 1, py >> 1, 33) - 0.5) * 0.1); // warm from below
  for (const [tx2, kind] of [[x + 4, "hammer"], [x + 12, "tongs"], [x + 21, "hammer"]]) hangingTool(c, tx2, y + 2, kind);
  vline(c, x + Math.floor(w / 2), y, y + h - 1, PAL.wood[1]); line(c, x, x + w - 1, y + Math.floor(h / 2), PAL.wood[1]);
  for (let k = 0; k < 6; k++) c.put(x + 3 + k, y + h - 4 - k, PAL.white, 60);
  line(c, x - 4, x + w + 3, y + h + 3, PAL.wood[4]); line(c, x - 4, x + w + 3, y + h + 4, PAL.wood[1]);
}
/** Tongs or a hammer hanging from a nail. */
function hangingTool(c, x, y, kind) {
  c.put(x + 1, y, PAL.ironLt);
  if (kind === "hammer") {
    vline(c, x + 1, y + 1, y + 10, PAL.wood[2]); vline(c, x + 2, y + 1, y + 10, PAL.wood[1]);
    shade(c, x - 1, y + 10, 6, 3, [hex(0x2c2c36), hex(0x5a5a68), hex(0x8a8a9a)], (px) => 0.8 - (px - x) * 0.1);
  } else {
    for (let k = 0; k < 9; k++) { c.put(x + (k < 6 ? 0 : k - 6), y + 1 + k, PAL.iron); c.put(x + 3 - (k < 6 ? 0 : k - 6), y + 1 + k, PAL.iron); }
    c.put(x + 1, y + 6, PAL.ironLt); c.put(x + 2, y + 6, PAL.ironLt);
  }
}
async function forge() {
  // Smithy: cols 7–15, the lean-to bay cols 16–20, door at col 11.
  G = { X0: 7 * T, X1: 16 * T - 1, BOTTOM: 207, DOOR_X: 11 * T };
  const art = new Canvas(W, H), groundC = new Canvas(W, H), shadowC = new Canvas(W, H);
  const wallTop = 132, ridgeY = 52, eaveY = 138;
  chimney(art, G.X0 + 8, ridgeY - 18, ridgeY + 30, 24); // broad stone stack
  stoneWall(art, wallTop);
  roof(art, ridgeY, eaveY, PAL.roofSlate);
  toolWindow(art, G.X0 + 8, 156, 30, 18);
  window_(art, G.X1 - 30, 156, 16, 16, null, null);
  // the SMITHY board over the door, iron-dark with gilt letters
  const sb0 = G.X0 + 40, sb1 = G.X1 - 38, by0 = 135, by1 = 148;
  shade(art, sb0, by0, sb1 - sb0 + 1, by1 - by0 + 1, [hex(0x22222a), hex(0x2e2e38), hex(0x3c3c48)], (px, py) => (py === by0 ? 0.95 : 0.5));
  line(art, sb0 - 1, sb1 + 1, by0 - 1, PAL.ink); line(art, sb0 - 1, sb1 + 1, by1 + 1, PAL.ink); vline(art, sb0 - 1, by0, by1, PAL.ink); vline(art, sb1 + 1, by0, by1, PAL.ink);
  for (const [rx, ry] of [[sb0 + 2, by0 + 2], [sb1 - 2, by0 + 2], [sb0 + 2, by1 - 2], [sb1 - 2, by1 - 2]]) art.put(rx, ry, PAL.ironLt); // rivets
  const tw = 6 * 7 - 2, tx = Math.round((sb0 + sb1) / 2 - tw / 2) + 1;
  lettering(art, "SMITHY", tx, by0 + 3, PAL.yellow, hex(0x101014));
  foundation(art);
  const d = door(art, null, 14, false);
  // iron straps across the door
  for (const sy of [d.top + 6, d.top + 20]) line(art, d.x, d.x + d.w - 1, sy, PAL.iron);
  // a hanging anvil sign on a bracket above the door
  line(art, d.x + d.w + 4, d.x + d.w + 20, d.top - 8, PAL.iron);
  for (let y = d.top - 7; y <= d.top - 4; y++) { art.put(d.x + d.w + 8, y, PAL.iron); art.put(d.x + d.w + 18, y, PAL.iron); }
  shade(art, d.x + d.w + 5, d.top - 3, 17, 11, PAL.wood, (px, py) => 0.7 - (py - d.top) * 0.03);
  for (const [ax, ay, aw] of [[8, 2, 9], [10, 5, 5], [9, 7, 7]]) line(art, d.x + d.w + 5 + ax - 4, d.x + d.w + 5 + ax - 4 + aw - 1, d.top - 3 + ay, PAL.iron); // anvil glyph
  // ── lean-to bay: posts, a plank roof sloping down to the right
  const bx0 = 16 * T, bx1 = 21 * T - 1, roofTop = 128, roofLow = 146;
  for (let x = bx0 - 2; x <= bx1 + 3; x++) {
    const ry = Math.round(roofTop + ((x - bx0) / (bx1 - bx0)) * (roofLow - roofTop));
    for (let y = ry; y <= ry + 8; y++) art.put(x, y, ramp(PAL.wood, 0.75 - (y - ry) * 0.06 + ((x - bx0) % 8 === 0 ? -0.25 : 0), x, y));
    art.put(x, ry - 1, PAL.ink); art.put(x, ry + 9, PAL.ink);
    for (let k = 0; k < 5; k++) art.put(x, ry + 10 + k, PAL.shadow, 90 - k * 16);
  }
  for (const px of [bx1 - 3]) { shade(art, px, roofLow + 9, 4, G.BOTTOM - roofLow - 9, PAL.wood, (x) => 0.6 - (x - px) * 0.08); vline(art, px - 1, roofLow + 9, G.BOTTOM, PAL.ink); vline(art, px + 4, roofLow + 9, G.BOTTOM, PAL.ink); }
  // back wall of the bay (darker stone), and the hearth against it
  for (let y = 150; y <= G.BOTTOM; y++) for (let x = bx0; x < bx1 - 4; x++) art.put(x, y, ramp(PAL.stone, 0.32 + (rand(x >> 3, y >> 3, 4) - 0.5) * 0.12, x, y));
  const hx = bx0 + 8, hw = 38, hy = 176;
  shade(art, hx - 3, hy - 4, hw + 6, G.BOTTOM - hy + 4, PAL.stone, (px, py) => 0.7 - (py - hy) * 0.01 + (((px + py) % 9) === 0 ? -0.2 : 0)); // hearth surround
  for (let y = hy + 3; y <= G.BOTTOM - 8; y++) for (let x = hx + 3; x < hx + hw - 3; x++) {
    const depth = (y - hy - 3) / (G.BOTTOM - 8 - hy - 3);
    const t = 0.25 + depth * 0.65 + (rand(x >> 1, y >> 1, 21) - 0.5) * 0.3;
    art.put(x, y, ramp(FIRE, t, x, y)); // glowing coals
  }
  for (const [fx, fy] of [[hx + 10, hy + 2], [hx + 18, hy], [hx + 26, hy + 3]]) { art.put(fx, fy, FIRE[4]); art.put(fx, fy - 1, FIRE[3]); art.put(fx + 1, fy - 3, FIRE[2]); } // flames
  // bellows hanging beside the hearth
  shade(art, hx + hw + 2, hy - 2, 10, 12, PAL.wood, (px, py) => 0.45 + (py - hy) * 0.02);
  line(art, hx + hw + 2, hx + hw + 11, hy + 10, PAL.ink);
  // anvil on its stump in front of the bay
  const ax = bx0 + 46, ay = G.BOTTOM + 14;
  shade(groundC, ax - 6, ay - 8, 13, 8, PAL.log, (px, py) => 0.55 + ((py - ay) % 3 === 0 ? -0.15 : 0)); // stump
  const IRON = [hex(0x1e1e26), hex(0x2c2c36), hex(0x3c3c48), hex(0x5a5a68), hex(0x8a8a9a)];
  shade(art, ax - 11, ay - 17, 23, 6, IRON, (px, py) => (py === ay - 17 ? 0.95 : 0.55 - (py - ay + 17) * 0.06)); // anvil face
  shade(art, ax - 5, ay - 11, 11, 4, IRON, () => 0.3); // waist
  shade(art, ax - 8, ay - 8, 17, 2, IRON, () => 0.45); // foot
  for (let k = 0; k < 7; k++) { art.put(ax - 12 - k, ay - 16 + Math.floor(k / 2), IRON[3]); art.put(ax - 12 - k, ay - 15 + Math.floor(k / 2), IRON[1]); } // horn
  line(art, ax - 12, ax + 12, ay - 18, PAL.ink);
  for (const [gx, gy] of [[ax - 3, ay - 19], [ax + 2, ay - 21], [ax + 5, ay - 20]]) art.put(gx, gy, FIRE[4]); // sparks
  // hammer leaning on the anvil, quench barrel, weapon rack
  line(art, ax + 6, ax + 9, ay - 19, PAL.iron); vline(art, ax + 7, ay - 18, ay - 12, PAL.wood[2]);
  barrel(art, bx1 - 14, G.BOTTOM - 1, 16);
  shade(art, bx1 - 19, G.BOTTOM - 19, 11, 2, [hex(0x2a4a7a), hex(0x3c6aa8), hex(0x5c90cc)], () => 0.5); // water
  // the display rack west of the door (template x 52–106): a beam with
  // pegs for axes and swords, a shelf for arrow bundles. The goods on it
  // are drawn by the game from Bjorn's stock (src/lib/shopDisplay.ts).
  const rk0 = 52, rk1 = 106, beamY = 170, shelfY = 197;
  for (const px of [rk0, rk1 - 2]) shade(art, px, beamY - 4, 3, G.BOTTOM - beamY + 4, PAL.wood, (x) => 0.62 - (x - px) * 0.12);
  shade(art, rk0 - 2, beamY, rk1 - rk0 + 4, 3, PAL.wood, (x, y) => (y === beamY ? 0.85 : 0.5));
  shade(art, rk0, shelfY, rk1 - rk0, 3, PAL.wood, (x, y) => (y === shelfY ? 0.85 : 0.45));
  for (const px of [58, 67, 76, 88, 95, 102]) { art.put(px + 2, beamY + 3, PAL.iron); art.put(px + 2, beamY + 4, PAL.ironLt); } // pegs
  line(art, rk0 - 3, rk1 + 2, beamY - 1, PAL.ink); line(art, rk0, rk1 - 1, shelfY + 3, PAL.ink);
  vline(art, rk0 - 1, beamY - 4, G.BOTTOM, PAL.ink); vline(art, rk1 + 1, beamY - 4, G.BOTTOM, PAL.ink);
  // tongs and hammers hanging on the bay's back wall
  for (const [tx2, kind] of [[bx0 + 12, "tongs"], [bx0 + 21, "hammer"], [bx0 + 29, "tongs"], [bx0 + 38, "hammer"]]) hangingTool(art, tx2, 155, kind);
  // a heap of coal in front of the bay: lumps on a low mound
  const COAL = [hex(0x101016), hex(0x1c1c24), hex(0x2c2c36), hex(0x44444f), hex(0x6a6a78)];
  const cx = bx0 + 12, cy = G.BOTTOM + 14;
  for (let y = -6; y <= 0; y++) for (let x = -11; x <= 11; x++) {
    if ((x / 11) ** 2 + (y / 6.5) ** 2 > 1) continue;
    const lump = (Math.floor((x + 20) / 3) + Math.floor((y + 20) / 2)) % 2;
    art.put(cx + x, cy + y, ramp(COAL, 0.35 + lump * 0.25 - y * 0.03 - x * 0.012 + (rand(x, y, 61) - 0.5) * 0.25, cx + x, cy + y));
  }
  for (let x = -11; x <= 11; x++) art.put(cx + x, cy + 1, PAL.ink);

  softShadow(shadowC, G.X0 - 4, G.BOTTOM + 1, bx1 - G.X0 + 9, 7, 110);
  step(groundC, d.x - 2, d.w);
  bush(groundC, G.X0 + 2, G.BOTTOM + 1, false);

  const upper = art.rows(0, 12 * T);
  const lower = art.rows(12 * T, H);
  const collision = [];
  for (let r = 8; r <= 12; r++) for (let c = 7; c <= 15; c++) collision.push([r, c]);
  for (let r = 10; r <= 12; r++) for (let c = 16; c <= 20; c++) collision.push([r, c]); // bay (hearth, barrel)
  collision.push([12, 3], [12, 4], [12, 5], [12, 6]); // display rack
  collision.push([13, 16]); // coal heap
  await bakeCanvases({
    name: "Forge", jsonName: "forge",
    layers: { GroundUpper: groundC, DecorationLowerShadow: shadowC, DecorationLower: lower, DecorationUpper1: upper },
    collision, door: [12, 11],
  });
}

// ── The inn ─────────────────────────────────────────────────────────────
async function inn() {
  // Two storeys, cols 5–18; a wide double door at cols 11–12.
  G = { X0: 5 * T, X1: 19 * T - 1, BOTTOM: 207, DOOR_X: 11 * T };
  const art = new Canvas(W, H), groundC = new Canvas(W, H), shadowC = new Canvas(W, H);
  const wallTop = 92, ridgeY = 16, eaveY = 98;
  chimney(art, G.X0 + 20, ridgeY - 6, ridgeY + 24);
  chimney(art, G.X1 - 34, ridgeY - 6, ridgeY + 24);
  timberWall(art, wallTop, 146);
  roof(art, ridgeY, eaveY, PAL.roofRed);
  // dormers along the roof
  for (const dx of [G.X0 + 50, G.X1 - 74]) {
    const dy = ridgeY + 22;
    shade(art, dx, dy + 8, 24, 18, PAL.plaster, (x, y) => 0.6 - (y - dy) * 0.01);
    window_(art, dx + 5, dy + 11, 14, 12, false, null);
    for (let y = dy; y <= dy + 9; y++) { const hw = (y - dy) * 1.6; for (let x = dx + 12 - hw; x <= dx + 12 + hw; x++) art.put(Math.round(x), y, ramp(PAL.roofRed, 0.6 - (y - dy) * 0.03, Math.round(x), y)); }
    line(art, dx - 2, dx + 26, dy + 9, PAL.ink);
  }
  const box = [PAL.red, PAL.pink, PAL.yellow, PAL.white, PAL.violet];
  for (const wx of [G.X0 + 14, G.X0 + 70, G.X0 + 126, G.X0 + 182]) window_(art, wx, 110, 18, 18, PAL.leaf, box);
  for (const wx of [G.X0 + 14, G.X0 + 50, G.X1 - 70, G.X1 - 34]) window_(art, wx, 160, 18, 17, PAL.leaf, null);
  foundation(art);
  const d = door(art, PAL.roofRed, 26, true);
  wallLamp(art, d.x - 12, d.top + 2);
  wallLamp(art, d.x + d.w + 7, d.top + 2);
  // hanging tankard sign on an iron bracket, upper right of the door
  const sx = G.X1 - 18, sy = 128;
  line(art, G.X1 - 2, G.X1 + 22, sy - 6, PAL.iron); art.put(G.X1 + 1, sy - 5, PAL.iron); art.put(G.X1 + 2, sy - 4, PAL.iron);
  for (let y = sy - 5; y <= sy - 2; y++) { art.put(sx + 26, y, PAL.iron); art.put(sx + 38, y, PAL.iron); }
  shade(art, sx + 22, sy - 1, 21, 17, PAL.wood, (px, py) => 0.7 - (py - sy) * 0.03);
  line(art, sx + 21, sx + 43, sy - 2, PAL.ink); line(art, sx + 21, sx + 43, sy + 16, PAL.ink);
  vline(art, sx + 21, sy - 1, sy + 15, PAL.ink); vline(art, sx + 43, sy - 1, sy + 15, PAL.ink);
  shade(art, sx + 27, sy + 3, 8, 10, PAL.glassLit, (px, py) => 0.75 - (py - sy) * 0.03); // tankard
  shade(art, sx + 27, sy + 2, 8, 2, PAL.plaster, () => 0.95); // foam
  for (let y = sy + 5; y <= sy + 9; y++) art.put(sx + 36, y, PAL.wood[0]); art.put(sx + 35, sy + 5, PAL.wood[0]); art.put(sx + 35, sy + 9, PAL.wood[0]); // handle
  // outside: a bench by the west wall, barrels stacked by the east wall
  bench(art, G.X0 - 46, G.BOTTOM + 10, 34);
  barrel(art, G.X1 + 14, G.BOTTOM - 1, 18);
  barrel(art, G.X1 + 30, G.BOTTOM - 1, 18);
  barrel(art, G.X1 + 22, G.BOTTOM - 19, 16);

  softShadow(shadowC, G.X0 - 4, G.BOTTOM + 1, G.X1 - G.X0 + 9, 7, 110);
  softShadow(shadowC, G.X1 + 5, G.BOTTOM + 1, 34, 5, 90);
  step(groundC, d.x - 2, d.w);
  for (const bx of [G.X0 + 4, G.X0 + 60, G.X1 - 60]) bush(groundC, bx, G.BOTTOM + 1);

  const upper = art.rows(0, 12 * T);
  const lower = art.rows(12 * T, H);
  const collision = [];
  for (let r = 5; r <= 12; r++) for (let c = 5; c <= 18; c++) collision.push([r, c]);
  collision.push([12, 19], [12, 20], [12, 21]); // barrels
  collision.push([13, 2], [13, 3]); // bench
  await bakeCanvases({
    name: "Inn", jsonName: "inn",
    layers: { GroundUpper: groundC, DecorationLowerShadow: shadowC, DecorationLower: lower, DecorationUpper1: upper },
    collision, door: [12, 11],
  });
}

// ── The bakery ──────────────────────────────────────────────────────────
// A one-storey shopfront, cols 9–20: big display windows either side of a
// glazed door (col 15), so you can see the bread from the street.
const BREAD = [hex(0x4a240e), hex(0x7a3e18), hex(0xa85e26), hex(0xd08a40), hex(0xecb468), hex(0xfadaa0)];
const CRUST_DK = hex(0x5a2c10);
const AWNING = [hex(0xa82c2c), hex(0xd04040)];
const CREAM = [hex(0xe8d8b8), hex(0xfbf3e0)];
const SHOP_DARK = [hex(0x2a160c), hex(0x3e2414), hex(0x5a361c), hex(0x7a4c26), hex(0x9a6634)];
// 5×7 capitals for painted signs.
const FONT = {
  B: ["1111.", "1...1", "1...1", "1111.", "1...1", "1...1", "1111."],
  A: [".111.", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
  K: ["1...1", "1..1.", "1.1..", "11...", "1.1..", "1..1.", "1...1"],
  E: ["11111", "1....", "1....", "1111.", "1....", "1....", "11111"],
  R: ["1111.", "1...1", "1...1", "1111.", "1.1..", "1..1.", "1...1"],
  Y: ["1...1", "1...1", ".1.1.", "..1..", "..1..", "..1..", "..1.."],
  S: [".1111", "1....", "1....", ".111.", "....1", "....1", "1111."],
  M: ["1...1", "11.11", "1.1.1", "1.1.1", "1...1", "1...1", "1...1"],
  I: ["11111", "..1..", "..1..", "..1..", "..1..", "..1..", "11111"],
  T: ["11111", "..1..", "..1..", "..1..", "..1..", "..1..", "..1.."],
  H: ["1...1", "1...1", "1...1", "11111", "1...1", "1...1", "1...1"],
};
function lettering(c, text, x, y, col, shadow) {
  for (const ch of text) {
    const g = FONT[ch];
    if (g) for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r][k] === "1") { c.put(x + k + 1, y + r + 1, shadow); c.put(x + k, y + r, col); }
    x += 7;
  }
}
/** An oval loaf: crust ramp lit from the upper left, a few slashes. */
function loaf(c, cx, cy, rx, ry, slashes = 2) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2;
    if (d > 1) continue;
    c.put(cx + x, cy + y, ramp(BREAD, 0.78 - d * 0.3 - (x + y) * 0.035, cx + x, cy + y));
  }
  for (let k = 0; k < slashes; k++) { const sx = cx - rx + 3 + Math.round(((k + 0.5) * (2 * rx - 4)) / slashes); c.put(sx, cy - 1, CRUST_DK); c.put(sx + 1, cy - 2, BREAD[5]); }
  for (let x = -rx + 1; x <= rx - 1; x++) c.put(cx + x, cy + ry, BREAD[0]); // shadowed base
}
/** A baguette lying on a shelf. */
function baguette(c, x0, y, len) {
  for (let x = 0; x < len; x++) {
    const taper = x < 2 || x > len - 3 ? 1 : 0;
    for (let k = taper; k < 4 - taper; k++) c.put(x0 + x, y + k, ramp(BREAD, 0.85 - k * 0.18, x0 + x, y + k));
    if (x % 4 === 2 && x > 2 && x < len - 3) c.put(x0 + x, y + 1, CRUST_DK);
  }
}
/** A round bun with a glazed top. */
function bun(c, cx, cy) {
  for (let y = -3; y <= 2; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y * 1.4 <= 11) c.put(cx + x, cy + y, ramp(BREAD, 0.75 - (x + y) * 0.06, cx + x, cy + y));
  c.put(cx - 1, cy - 2, BREAD[5]); c.put(cx, cy - 2, PAL.white);
}
/** A croissant: a fat crescent of three lumps. */
function croissant(c, cx, cy) {
  for (const [dx, dy, r] of [[-4, 1, 2], [0, 0, 3], [4, 1, 2]]) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) c.put(cx + dx + x, cy + dy + y, ramp(BREAD, 0.8 - (y + r) * 0.09 - (x === r ? 0.2 : 0), cx + dx + x, cy + dy + y));
}
/** A pie with a lattice top, on a stand. */
function pie(c, cx, cy) {
  for (let y = -3; y <= 2; y++) for (let x = -8; x <= 8; x++) if ((x / 8) ** 2 + (y / 3.3) ** 2 <= 1) c.put(cx + x, cy + y, (x + y + 20) % 3 === 0 ? BREAD[4] : hex(0x8a1e3a));
  line(c, cx - 8, cx + 8, cy + 3, BREAD[2]); line(c, cx - 6, cx + 6, cy + 4, BREAD[1]);
  vline(c, cx, cy + 5, cy + 7, PAL.stone[3]); line(c, cx - 4, cx + 4, cy + 8, PAL.stone[2]);
}
/** A big shop window: a warm interior with shelves of bread, mullions,
 *  glass glints and an awning shadow across the top. */
function shopWindow(c, x, y, w, h, variant) {
  shade(c, x - 3, y - 3, w + 6, h + 6, PAL.wood, (px, py) => (py === y - 3 || px === x - 3 ? 0.9 : 0.5)); // frame
  // the warm shop inside, lit from above
  shade(c, x, y, w, h, SHOP_DARK, (px, py) => 0.85 - ((py - y) / h) * 0.55 + (rand(px >> 2, py >> 2, 31) - 0.5) * 0.08);
  for (let k = 0; k < 6; k++) line(c, x, x + w - 1, y + k, ramp(PAL.glassLit, 0.75 - k * 0.1, x, y + k)); // lamp glow under the ceiling
  // shelves: two on the back wall, the display counter at the bottom
  const shelves = [y + 13, y + 24];
  for (const sy of shelves) { line(c, x + 1, x + w - 2, sy, PAL.wood[4]); line(c, x + 1, x + w - 2, sy + 1, PAL.wood[1]); }
  shade(c, x, y + h - 6, w, 6, PAL.wood, (px, py) => (py === y + h - 6 ? 0.85 : 0.45 - ((px - x) % 12 === 0 ? 0.15 : 0)));
  if (variant === 0) {
    for (let k = 0; k < 4; k++) loaf(c, x + 8 + k * 14, shelves[0] - 3, 6, 3);
    baguette(c, x + 3, shelves[1] - 4, 22); baguette(c, x + 27, shelves[1] - 4, 22); bun(c, x + w - 8, shelves[1] - 3);
    for (let k = 0; k < 6; k++) bun(c, x + 6 + k * 9, y + h - 9);
  } else {
    for (let k = 0; k < 5; k++) croissant(c, x + 8 + k * 11, shelves[0] - 3);
    loaf(c, x + 10, shelves[1] - 3, 7, 3, 3); loaf(c, x + 27, shelves[1] - 3, 7, 3, 3); bun(c, x + 42, shelves[1] - 3); bun(c, x + 51, shelves[1] - 3);
    pie(c, x + 16, y + h - 15); pie(c, x + w - 18, y + h - 15);
    for (let k = 0; k < 3; k++) bun(c, x + 28 + k * 6, y + h - 9);
  }
  // mullions: three tall panes
  for (const mx of [x + Math.round(w / 3), x + Math.round((2 * w) / 3)]) { vline(c, mx, y, y + h - 1, PAL.wood[1]); vline(c, mx + 1, y, y + h - 1, PAL.wood[3]); }
  // glass glints
  for (const gx of [x + 4, x + Math.round(w / 3) + 6, x + Math.round((2 * w) / 3) + 5]) for (let k = 0; k < 9; k++) { c.put(gx + k, y + 10 + 9 - k, PAL.white, 70); c.put(gx + k + 2, y + 10 + 9 - k, PAL.white, 45); }
  // sill
  line(c, x - 4, x + w + 3, y + h + 3, PAL.wood[4]); line(c, x - 4, x + w + 3, y + h + 4, PAL.wood[1]);
}
/** A striped canvas awning with a scalloped edge. */
function awning(c, x, y, w) {
  for (let py = 0; py < 10; py++) for (let px = -3 - Math.floor(py / 3); px < w + 3 + Math.floor(py / 3); px++) {
    const stripe = Math.floor((px + 40) / 6) % 2;
    const col = stripe ? CREAM[py < 2 ? 1 : 0] : AWNING[py < 2 ? 1 : 0];
    c.put(x + px, y + py, col);
  }
  const x0 = x - 6, x1 = x + w + 5;
  for (let px = x0; px <= x1; px++) {
    const stripe = Math.floor((px - x + 40) / 6) % 2;
    const lip = (px - x0) % 6 < 4 ? 3 : 1; // scallops
    for (let k = 0; k < lip; k++) c.put(px, y + 10 + k, stripe ? CREAM[0] : AWNING[0]);
    c.put(px, y + 10 + lip, PAL.ink);
    for (let k = 0; k < 4; k++) c.put(px, y + 11 + lip + k, PAL.shadow, 70 - k * 16); // shade on the glass
  }
  line(c, x - 4, x + w + 3, y - 1, PAL.ink);
  for (let py = 0; py < 10; py++) { c.put(x - 4 - Math.floor(py / 3), y + py, PAL.ink); c.put(x + w + 3 + Math.floor(py / 3), y + py, PAL.ink); }
}
function flourSack(c, x, y) {
  // a burlap sack slumped on its base, tied at the neck, a wheat mark on it
  const SACK = [hex(0x8a7650), hex(0xa8946a), hex(0xc4b088), hex(0xdccaa4), hex(0xece0c0)];
  for (let py = -12; py <= 0; py++) {
    const half = py < -9 ? 2 + (py + 12) * 0.7 : 6 - Math.max(0, py + 2) * 0.6;
    for (let px = -Math.round(half); px <= Math.round(half); px++) c.put(x + px, y + py, ramp(SACK, 0.72 - px * 0.06 - (py + 12) * 0.018 + (rand(x + px, py, 13) - 0.5) * 0.1, x + px, y + py));
  }
  line(c, x - 2, x + 2, y - 9, PAL.wood[1]); // tie
  for (const [dx, dy] of [[0, -6], [0, -5], [0, -4], [-1, -5], [1, -5], [-1, -3], [1, -3]]) c.put(x + dx, y + dy, PAL.wood[2]); // wheat mark
}
async function bakery() {
  G = { X0: 9 * T, X1: 21 * T - 1, BOTTOM: 207, DOOR_X: 232 };
  const art = new Canvas(W, H), groundC = new Canvas(W, H), shadowC = new Canvas(W, H);
  const wallTop = 118, ridgeY = 44, eaveY = 124;
  // the bread oven's brick chimney, broad, on the right
  shade(art, G.X1 - 54, ridgeY - 16, 20, eaveY - ridgeY + 4, PAL.brick, (px, py) => 0.62 - (px - G.X1 + 54) * 0.02 + ((py - ridgeY) % 5 === 4 ? -0.35 : 0) + (((px + Math.floor((py - ridgeY) / 5) * 3) % 7) === 0 ? -0.3 : 0));
  shade(art, G.X1 - 57, ridgeY - 20, 26, 4, PAL.brick, (px) => 0.85 - (px - G.X1 + 57) * 0.02);
  for (let y = ridgeY - 20; y < eaveY; y++) { art.put(G.X1 - 58 + (y < ridgeY - 16 ? 0 : 3), y, PAL.ink); art.put(G.X1 - 31 - (y < ridgeY - 16 ? 0 : 3), y, PAL.ink); }
  line(art, G.X1 - 58, G.X1 - 31, ridgeY - 21, PAL.ink);
  // cream plaster walls with timber corner posts
  shade(art, G.X0, wallTop, G.X1 - G.X0 + 1, G.BOTTOM - wallTop + 1, PAL.plaster, (x, y) => 0.68 + (rand(x, y, 5) - 0.5) * 0.1 - (y - wallTop) * 0.0012);
  for (const px of [G.X0, G.X1 - 4]) shade(art, px, wallTop, 5, G.BOTTOM - wallTop, PAL.wood, (x) => 0.65 - (x - px) * 0.08);
  roof(art, ridgeY, eaveY, PAL.roofTeal);
  // a round attic window in the gable
  const ax = 240, ay = ridgeY + 40;
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const d = x * x + y * y;
    if (d <= 49) art.put(ax + x, ay + y, d > 30 ? PAL.wood[d > 42 ? 0 : 3] : ramp(PAL.glassLit, 0.65 - y * 0.03, ax + x, ay + y));
  }
  line(art, ax - 5, ax + 5, ay, PAL.wood[1]); vline(art, ax, ay - 5, ay + 5, PAL.wood[1]);
  // the painted fascia board: BAKERY with a loaf either side
  const bx0 = G.X0 + 40, bx1 = G.X1 - 40, by0 = wallTop + 6, by1 = wallTop + 20;
  shade(art, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, [hex(0x1e3a2a), hex(0x2a5038), hex(0x386848)], (px, py) => (py === by0 ? 0.95 : 0.5));
  line(art, bx0 - 1, bx1 + 1, by0 - 1, PAL.ink); line(art, bx0 - 1, bx1 + 1, by1 + 1, PAL.ink); vline(art, bx0 - 1, by0, by1, PAL.ink); vline(art, bx1 + 1, by0, by1, PAL.ink);
  line(art, bx0 + 1, bx1 - 1, by0 + 1, PAL.yellow); line(art, bx0 + 1, bx1 - 1, by1 - 1, PAL.yellow); // gilt border
  const tw = 6 * 7 - 2, tx = Math.round((bx0 + bx1) / 2 - tw / 2);
  lettering(art, "BAKERY", tx, by0 + 4, CREAM[1], hex(0x10241a));
  loaf(art, tx - 12, by0 + 7, 5, 3); loaf(art, tx + tw + 11, by0 + 7, 5, 3);
  // display windows under striped awnings, the glazed door between them
  const wy = 160, wh = 32;
  shopWindow(art, G.X0 + 12, wy, 60, wh, 0);
  shopWindow(art, G.X1 - 71, wy, 60, wh, 1);
  awning(art, G.X0 + 12, wy - 13, 60);
  awning(art, G.X1 - 71, wy - 13, 60);
  // brick stall riser under the windows
  for (const wx of [G.X0 + 9, G.X1 - 74]) shade(art, wx, wy + wh + 5, 66, 7, PAL.brick, (px, py) => 0.6 + ((py - wy) % 4 === 3 ? -0.35 : 0) + (((px + (py >> 2) * 3) % 8) === 0 ? -0.3 : 0));
  foundation(art);
  const d = door(art, PAL.roofTeal, 18, true);
  // a bigger pane in the door, showing the warm shop behind
  shade(art, d.x + 3, d.top + 4, d.w - 6, 13, PAL.glassLit, (px, py) => 0.72 - (py - d.top) * 0.03);
  bun(art, d.x + 9, d.top + 14);
  wallLamp(art, d.x - 10, d.top - 2);
  wallLamp(art, d.x + d.w + 5, d.top - 2);
  // the hanging pretzel sign on an iron bracket off the left corner
  const sx = G.X0 - 30, sy = wallTop + 34;
  line(art, sx + 4, G.X0 + 2, sy - 6, PAL.iron); art.put(G.X0 - 1, sy - 5, PAL.iron); art.put(G.X0 - 2, sy - 4, PAL.iron);
  for (let y = sy - 5; y <= sy - 1; y++) { art.put(sx + 6, y, PAL.iron); art.put(sx + 22, y, PAL.iron); }
  shade(art, sx + 2, sy, 25, 20, PAL.wood, (px, py) => 0.72 - (py - sy) * 0.025);
  line(art, sx + 1, sx + 27, sy - 1, PAL.ink); line(art, sx + 1, sx + 27, sy + 20, PAL.ink); vline(art, sx + 1, sy, sy + 19, PAL.ink); vline(art, sx + 27, sy, sy + 19, PAL.ink);
  // pretzel: a knot of three loops
  const pcx = sx + 14, pcy = sy + 10;
  for (let a = 0; a < 360; a += 4) {
    const r = (a * Math.PI) / 180;
    for (const [ox, oy, rx, ry] of [[-4, -1, 5, 5], [4, -1, 5, 5], [0, 3, 8, 5]]) {
      const px = Math.round(pcx + ox + Math.cos(r) * rx), py = Math.round(pcy + oy + Math.sin(r) * ry);
      art.put(px, py, BREAD[3]); art.put(px, py + 1, BREAD[1]);
    }
  }
  for (const [kx, ky] of [[pcx - 3, pcy - 3], [pcx + 3, pcy - 2], [pcx - 6, pcy + 3], [pcx + 5, pcy + 4]]) art.put(kx, ky, PAL.white); // salt
  // out front: flour sacks by the left window, a bread cart by the right
  const sacks = new Canvas(W, H);
  flourSack(sacks, G.X0 - 5, G.BOTTOM + 3); flourSack(sacks, G.X0 - 16, G.BOTTOM + 5); flourSack(sacks, G.X0 - 10, G.BOTTOM - 5);
  sacks.outline(PAL.ink); art.over(sacks);
  const cx0 = G.X1 + 6, cy = G.BOTTOM + 4;
  shade(art, cx0, cy - 12, 34, 9, PAL.wood, (px, py) => (py === cy - 12 ? 0.9 : 0.55 - ((px - cx0) % 6 === 0 ? 0.2 : 0)));
  line(art, cx0 - 1, cx0 + 34, cy - 13, PAL.ink); line(art, cx0 - 1, cx0 + 34, cy - 3, PAL.ink);
  for (let k = 0; k < 3; k++) loaf(art, cx0 + 7 + k * 10, cy - 15, 5, 3, 1);
  baguette(art, cx0 + 2, cy - 21, 16); baguette(art, cx0 + 16, cy - 20, 16);
  for (const wx of [cx0 + 6, cx0 + 28]) { // wheels
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { const dd = x * x + y * y; if (dd <= 16) art.put(wx + x, cy + y, dd >= 9 ? PAL.wood[0] : dd <= 1 ? PAL.wood[3] : PAL.wood[2]); }
  }
  line(art, cx0 + 34, cx0 + 44, cy - 6, PAL.wood[1]); // handle

  // the free-bread table (template cols 10–11, row 13): a checked cloth
  // over a little trestle. The loaves on it are drawn by the game from the
  // current batch (src/lib/bakery.ts, WorldScene), so they run out.
  const tx0 = 10 * T + 1, tx1 = 12 * T - 2, ty = 13 * T + 1;
  for (const lx of [tx0 + 2, tx1 - 3]) { shade(art, lx, ty + 9, 2, 6, PAL.wood, () => 0.35); }
  for (let y = ty; y <= ty + 9; y++) for (let x = tx0; x <= tx1; x++) {
    const top = y < ty + 5;
    const check = (Math.floor((x - tx0) / 3) + Math.floor((y - ty) / (top ? 2 : 3))) % 2 === 0;
    const base = check ? (top ? AWNING[1] : AWNING[0]) : (top ? CREAM[1] : CREAM[0]);
    if (!top && y === ty + 9 && (x - tx0) % 4 === 3) continue; // ragged hem
    art.put(x, y, base);
  }
  line(art, tx0, tx1, ty + 5, PAL.ink); // the table edge under the cloth
  line(art, tx0 - 1, tx1 + 1, ty - 1, PAL.ink); vline(art, tx0 - 1, ty, ty + 9, PAL.ink); vline(art, tx1 + 1, ty, ty + 9, PAL.ink);
  softShadow(shadowC, tx0 - 1, ty + 14, tx1 - tx0 + 3, 4, 90);

  softShadow(shadowC, G.X0 - 4, G.BOTTOM + 1, G.X1 - G.X0 + 9, 7, 110);
  softShadow(shadowC, cx0 - 2, cy + 3, 40, 5, 90);
  step(groundC, d.x - 2, d.w);
  bush(groundC, G.X0 + 76, G.BOTTOM + 1); bush(groundC, G.X1 - 88, G.BOTTOM + 1);

  const upper = art.rows(0, 12 * T);
  const lower = art.rows(12 * T, H);
  const collision = [];
  for (let r = 8; r <= 12; r++) for (let c = 9; c <= 20; c++) collision.push([r, c]);
  collision.push([12, 7], [12, 8], [13, 8]); // flour sacks
  collision.push([13, 10], [13, 11]); // the bread table
  collision.push([12, 21], [12, 22], [12, 23]); // bread cart
  await bakeCanvases({
    name: "Bakery", jsonName: "bakery",
    layers: { GroundUpper: groundC, DecorationLowerShadow: shadowC, DecorationLower: lower, DecorationUpper1: upper },
    collision, door: [12, 15],
  });
}

// ── The ranch lot ───────────────────────────────────────────────────────
// Same skeleton as the field lots (scripts/draw-land-lot.mjs): road on
// rows 0–1, a fence with a 2-tile gate at cols 11–12 on row 3, sides on
// cols 1 / 22, back on row 13. The animals' pen is cols 7–14, rows 5–12
// (src/lib/ranch.ts RANCH_PEN).
const BARN = [hex(0x4a1412), hex(0x6a1e1a), hex(0x8c2a22), hex(0xa83a2c), hex(0xc4553e), hex(0xdc7a5c)];
const ROAD = { base: hex(0xb89a6c), dk: hex(0x9a7e56), lt: hex(0xcfb487), edge: hex(0x8a7048) };
const STRAW = [hex(0x8a6a2a), hex(0xb08a3a), hex(0xd4b050), hex(0xecd078), hex(0xf8eaa8)];
async function ranch() {
  const groundC = new Canvas(W, H), shadowC = new Canvas(W, H), lowerC = new Canvas(W, H), upperC = new Canvas(W, H);
  // road (rows 0–1), continuous across neighbouring lots
  groundC.rect(0, 3, W, 26, ROAD.base);
  for (let x = 0; x < W; x++) {
    groundC.put(x, 3, ROAD.edge); groundC.put(x, 28, ROAD.edge);
    if (rand(x, 1) < 0.5) groundC.put(x, 2, ROAD.edge);
    if (rand(x, 2) < 0.5) groundC.put(x, 29, ROAD.edge);
    for (let y = 4; y < 28; y++) if (rand(x, y) < 0.08) groundC.put(x, y, ROAD.dk);
    for (const ry of [10, 21]) if (rand(x, ry) < 0.8) groundC.put(x, ry, ROAD.dk);
  }
  // trodden dirt from the gate to the coop and the barn doors
  const dirt = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const edge = Math.min(x - x0, x0 + w - 1 - x, y - y0, y0 + h - 1 - y); // ragged, grassy margins
      if (edge < 2 && rand(x, y, 3) < 0.55 - edge * 0.2) continue;
      groundC.put(x, y, ramp([ROAD.edge, ROAD.dk, ROAD.base, ROAD.lt], 0.55 + (rand(x, y, 8) - 0.5) * 0.35 - (edge < 2 ? 0.2 : 0), x, y));
    }
  };
  dirt(11 * T + 4, 28, 24, 3 * T); // gate spur
  dirt(4 * T, 9 * T + 4, 8 * T, 18); // to the coop
  dirt(12 * T, 9 * T + 4, 6 * T, 18); // to the barn
  dirt(16 * T, 10 * T, 4 * T, 3 * T); // barn apron
  // straw strewn in the pen
  for (let k = 0; k < 60; k++) { const x = 7 * T + Math.floor(rand(k, 41) * 8 * T), y = 5 * T + Math.floor(rand(41, k) * 7 * T); groundC.put(x, y, STRAW[2 + (k % 2)]); groundC.put(x + 1, y, STRAW[1]); }

  // ── coop (cols 2–6): white board walls, red roof, ramp, nest window
  const cx0 = 2 * T + 4, cx1 = 6 * T + 10, cBottom = 8 * T + 14;
  for (let y = 6 * T + 6; y <= cBottom; y++) for (let x = cx0; x <= cx1; x++) {
    const k = (x - cx0) % 5;
    lowerC.put(x, y, ramp(PAL.board, 0.7 + (k === 0 ? 0.2 : k === 4 ? -0.3 : 0), x, y));
  }
  for (let y = 4 * T; y <= 6 * T + 8; y++) { // pitched roof
    const half = ((y - 4 * T) / (2 * T + 8)) * ((cx1 - cx0) / 2 + 8);
    const mid = (cx0 + cx1) / 2;
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) lowerC.put(x, y, ramp(PAL.roofRed, 0.75 - ((y - 4 * T) % 6 === 5 ? 0.5 : 0) - (x - mid) * 0.004, x, y));
    lowerC.put(Math.round(mid - half) - 1, y, PAL.ink); lowerC.put(Math.round(mid + half) + 1, y, PAL.ink);
  }
  line(lowerC, cx0 - 9, cx1 + 9, 6 * T + 9, PAL.ink);
  shade(lowerC, cx0 + 8, 7 * T, 12, 10, PAL.glassLit, (px, py) => 0.35 + (py - 7 * T) * 0.03); // nest hole (warm, straw inside)
  for (let x = cx0 + 9; x < cx0 + 19; x++) lowerC.put(x, 7 * T + 8, STRAW[3]);
  const hatch = cx1 - 16; // little hen door + ramp
  shade(lowerC, hatch, cBottom - 12, 10, 12, PAL.wood, () => 0.25);
  for (let k = 0; k < 14; k++) { line(lowerC, hatch - 2 + k, hatch + 9 + k, cBottom - 1 + Math.floor(k / 2), k % 3 === 0 ? PAL.wood[1] : PAL.wood[3]); }
  vline(lowerC, cx0, 6 * T + 8, cBottom, PAL.ink); vline(lowerC, cx1, 6 * T + 8, cBottom, PAL.ink); line(lowerC, cx0, cx1, cBottom, PAL.ink);
  softShadow(shadowC, cx0 - 2, cBottom + 1, cx1 - cx0 + 5, 6, 100);

  // ── barn (cols 15–21): red boards, gambrel roof, white-trimmed X doors, hay loft
  const bx0 = 15 * T + 2, bx1 = 22 * T - 3, bTop = 7 * T, bBottom = 10 * T + 14;
  for (let y = bTop; y <= bBottom; y++) for (let x = bx0; x <= bx1; x++) {
    const k = (x - bx0) % 6;
    lowerC.put(x, y, ramp(BARN, 0.6 + (k === 0 ? -0.35 : k === 1 ? 0.15 : 0) - (y - bTop) * 0.002 + (rand(x, y >> 2, 6) - 0.5) * 0.08, x, y));
  }
  const mid = (bx0 + bx1) / 2, rw = (bx1 - bx0) / 2 + 6;
  const rTop = 4 * T + 6;
  for (let y = rTop; y <= bTop + 2; y++) { // gambrel: steep lower slopes, shallow top
    const t = (y - rTop) / (bTop + 2 - rTop);
    const half = t < 0.4 ? 14 + (t / 0.4) * (rw * 0.55 - 14) : rw * 0.55 + ((t - 0.4) / 0.6) * (rw * 0.45);
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) upperC.put(x, y, ramp(PAL.roofSlate, 0.72 - ((y - 3 * T) % 7 === 6 ? 0.5 : 0) + (t < 0.4 ? 0.08 : 0), x, y));
    upperC.put(Math.round(mid - half) - 1, y, PAL.ink); upperC.put(Math.round(mid + half) + 1, y, PAL.ink);
  }
  line(upperC, Math.round(mid - 14), Math.round(mid + 14), rTop - 1, PAL.ink);
  // hay loft door with bales peeking out
  shade(upperC, Math.round(mid) - 9, bTop - 18, 18, 14, PAL.wood, () => 0.2);
  for (let x = Math.round(mid) - 8; x < Math.round(mid) + 8; x++) for (let y = bTop - 10; y < bTop - 5; y++) upperC.put(x, y, ramp(STRAW, 0.6 + (rand(x, y, 2) - 0.5) * 0.4, x, y));
  // big doors with white X bracing
  const dx0 = Math.round(mid) - 16, dx1 = Math.round(mid) + 16, dTop = bTop + 14;
  for (let y = dTop; y <= bBottom; y++) for (let x = dx0; x <= dx1; x++) lowerC.put(x, y, ramp(BARN, 0.45 + ((x - dx0) % 4 === 0 ? -0.2 : 0), x, y));
  const white = PAL.white;
  for (const [x0, x1] of [[dx0, Math.round(mid)], [Math.round(mid), dx1]]) {
    line(lowerC, x0, x1, dTop, white); line(lowerC, x0, x1, bBottom - 1, white); vline(lowerC, x0, dTop, bBottom, white); vline(lowerC, x1, dTop, bBottom, white);
    const n = bBottom - dTop;
    for (let i = 0; i <= n; i++) { lowerC.put(Math.round(x0 + ((x1 - x0) * i) / n), dTop + i, white); lowerC.put(Math.round(x1 - ((x1 - x0) * i) / n), dTop + i, white); }
  }
  for (const x of [bx0 + 3, bx1 - 3]) vline(lowerC, x, bTop, bBottom, white); // corner trim
  vline(lowerC, bx0, bTop, bBottom, PAL.ink); vline(lowerC, bx1, bTop, bBottom, PAL.ink); line(lowerC, bx0, bx1, bBottom, PAL.ink);
  softShadow(shadowC, bx0 - 2, bBottom + 1, bx1 - bx0 + 5, 7, 110);

  // ── trough and hay bales in the pen
  const tx0 = 9 * T + 2, ty0 = 11 * T + 4;
  shade(lowerC, tx0, ty0, 28, 9, PAL.wood, (px, py) => 0.55 - (py - ty0) * 0.04);
  shade(lowerC, tx0 + 2, ty0 + 1, 24, 3, PAL.glass, () => 0.6);
  line(lowerC, tx0 - 1, tx0 + 28, ty0 - 1, PAL.ink); line(lowerC, tx0 - 1, tx0 + 28, ty0 + 9, PAL.ink);
  const bale = (x, y) => {
    for (let py = y; py < y + 11; py++) for (let px = x; px < x + 16; px++) lowerC.put(px, py, ramp(STRAW, 0.7 - (py - y) * 0.035 + (rand(px, py, 4) - 0.5) * 0.25, px, py));
    for (const by of [y + 3, y + 8]) line(lowerC, x, x + 15, by, STRAW[0]);
    line(lowerC, x - 1, x + 16, y - 1, PAL.ink); line(lowerC, x - 1, x + 16, y + 11, PAL.ink); vline(lowerC, x - 1, y, y + 10, PAL.ink); vline(lowerC, x + 16, y, y + 10, PAL.ink);
  };
  bale(11 * T + 6, 5 * T + 6); bale(12 * T + 10, 6 * T + 8);

  // ── fence: post-and-rail around the lot, gate open on the road side
  const wood = (t) => ramp(PAL.wood, t, 0, 0);
  const hRun = (row, x0, x1) => {
    const y = row * T;
    for (let x = x0; x <= x1; x++) { lowerC.put(x, y + 5, wood(0.7)); lowerC.put(x, y + 6, wood(0.55)); lowerC.put(x, y + 7, wood(0.25)); lowerC.put(x, y + 10, wood(0.7)); lowerC.put(x, y + 11, wood(0.55)); lowerC.put(x, y + 12, wood(0.25)); }
    for (let x = x0; x + 3 <= x1; x += 16) postAt(x, y + 2, y + 13);
    postAt(x1 - 3, y + 2, y + 13);
  };
  const vRun = (col, y0, y1) => { const x = col * T + 6; for (let y = y0; y <= y1; y++) { lowerC.put(x, y, wood(0.7)); lowerC.put(x + 1, y, wood(0.55)); lowerC.put(x + 2, y, wood(0.25)); } for (let y = y0; y + 10 <= y1; y += 16) postAt(x - 1, y, y + 9); };
  function postAt(x, y0, y1) { for (let y = y0; y <= y1; y++) { lowerC.put(x, y, wood(0.85)); lowerC.put(x + 1, y, wood(0.6)); lowerC.put(x + 2, y, wood(0.5)); lowerC.put(x + 3, y, wood(0.25)); } }
  const FX0 = 1 * T + 5, FX1 = 23 * T - 6;
  vRun(1, 3 * T + 6, 13 * T + 12); vRun(22, 3 * T + 6, 13 * T + 12);
  hRun(3, FX0, 11 * T - 3); hRun(3, 13 * T + 2, FX1); hRun(13, FX0, FX1);
  for (const gx of [11 * T - 7, 13 * T + 2]) for (let y = 3 * T + 1; y <= 3 * T + 13; y++) for (let k = 0; k < 5; k++) lowerC.put(gx + k, y, wood(k === 0 ? 0.85 : k === 4 ? 0.25 : 0.6));
  // sign by the gate: a little hen + cow mark
  const SX = 14 * T + 2, SY = 3 * T - 8;
  for (let y = SY + 10; y < SY + 22; y++) for (let x = SX + 9; x < SX + 12; x++) upperC.put(x, y, wood(0.3));
  for (let y = SY; y < SY + 12; y++) for (let x = SX; x < SX + 22; x++) upperC.put(x, y, ramp(PAL.wood, 0.78 - (y - SY) * 0.02, x, y));
  for (const [px, py, col] of [[SX + 5, SY + 5, PAL.white], [SX + 6, SY + 5, PAL.white], [SX + 6, SY + 4, PAL.red], [SX + 7, SY + 6, PAL.yellow], [SX + 13, SY + 5, PAL.white], [SX + 14, SY + 5, PAL.ink], [SX + 15, SY + 5, PAL.white], [SX + 16, SY + 6, PAL.white]]) upperC.put(px, py, col);
  lowerC.outline(PAL.ink);

  const collision = [];
  for (let c = 1; c <= 22; c++) if (c < 11 || c > 12) collision.push([3, c]); // front fence (the lot's clickable face)
  for (let r = 7; r <= 8; r++) for (let c = 2; c <= 6; c++) collision.push([r, c]); // coop
  for (let r = 8; r <= 10; r++) for (let c = 15; c <= 21; c++) collision.push([r, c]); // barn
  collision.push([11, 9], [11, 10]); // trough
  // the back and side fences block too (rows 4–13 / row 13)
  for (let r = 4; r <= 13; r++) collision.push([r, 1], [r, 22]);
  for (let c = 2; c <= 21; c++) collision.push([13, c]);
  await bakeCanvases({
    name: "RanchLot", jsonName: "ranch_lot",
    layers: { GroundUpper: groundC, DecorationLowerShadow: shadowC, DecorationLower: lowerC, DecorationUpper1: upperC },
    collision, door: [3, 11],
  });
}

// ── The waystone ────────────────────────────────────────────────────────
// A tall rough-cut stone (cols 11–12, rows 9–12) on a round flagstone
// base, a carved rune glowing blue down its face. Blocks its two base
// tiles; the door (where you attune / travel) is the base's left tile.
const RUNE = [hex(0x1e4a8a), hex(0x2f78c8), hex(0x5ab0f0), hex(0x9adcff), hex(0xe4f8ff)];
async function waystone() {
  const groundC = new Canvas(W, H), shadowC = new Canvas(W, H), upperC = new Canvas(W, H);
  const cx = 12 * T, base = 13 * T - 2; // stone centre x, ground line
  // flagstone circle around it
  for (let y = base - 12; y <= base + 12; y++) for (let x = cx - 26; x <= cx + 26; x++) {
    const d = ((x - cx) / 26) ** 2 + ((y - base) / 12) ** 2;
    if (d > 1) continue;
    const seam = (Math.floor((x - cx + 40) / 9) + Math.floor((y - base + 20) / 6)) % 2 === 0 && ((x + y) % 9 === 0);
    groundC.put(x, y, d > 0.86 ? PAL.stone[1] : ramp(PAL.stone, 0.62 + (rand(x >> 2, y >> 2, 17) - 0.5) * 0.25 - (seam ? 0.3 : 0), x, y));
  }
  softShadow(shadowC, cx - 12, base - 2, 26, 6, 120);
  // the stone: tapering slab with a chipped top
  const top = 9 * T - 6;
  const art = new Canvas(W, H);
  for (let y = top; y <= base; y++) {
    const t = (y - top) / (base - top);
    const half = 7 + t * 4 + (y < top + 4 ? -2 + (y - top) * 0.5 : 0);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const side = (x - cx) / half;
      let tone = 0.62 - side * 0.28 + (rand(x >> 1, y >> 2, 23) - 0.5) * 0.12;
      if ((y * 3 + x) % 17 === 0) tone -= 0.18; // pits and cracks
      art.put(x, y, ramp(PAL.stone, tone, x, y));
    }
  }
  // moss creeping up the base
  for (let x = cx - 11; x <= cx + 11; x++) for (let y = base - 5 - Math.round(rand(x, 3, 5) * 6); y <= base; y++) if (rand(x, y, 9) < 0.55) art.put(x, y, ramp(PAL.leaf, 0.45 + rand(x, y, 2) * 0.3, x, y));
  // carved, glowing rune: a vertical stroke with chevrons and a ring
  const glyph = [[0, -14], [0, -13], [0, -12], [0, -11], [0, -10], [0, -9], [0, -8], [0, -7], [0, -6], [0, -5], [0, -4], [0, -3], [0, -2], [0, -1], [0, 0], [-1, -11], [-2, -10], [-3, -9], [1, -11], [2, -10], [3, -9], [-1, -5], [-2, -4], [1, -5], [2, -4], [-2, 2], [-1, 3], [0, 3], [1, 3], [2, 2], [-3, 1], [3, 1], [-2, 0], [2, 0]];
  const ry = top + 24;
  for (const [gx, gy] of glyph) {
    for (const [hx, hy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (art.alpha(cx + gx + hx, ry + gy + hy) > 0) art.put(cx + gx + hx, ry + gy + hy, RUNE[1], 200); // glow halo
  }
  for (const [gx, gy] of glyph) art.put(cx + gx, ry + gy, gy % 3 === 0 ? RUNE[4] : RUNE[3]);
  art.outline(PAL.ink);
  // little floating motes of light
  for (const [mx, my] of [[cx - 14, top + 10], [cx + 13, top + 20], [cx - 9, top - 4], [cx + 8, top - 8]]) { upperC.put(mx, my, RUNE[3]); upperC.put(mx, my + 1, RUNE[2], 160); }
  // route: the base row blocks (lower), the stone's body above it Y-sorts
  const lower = art.rows(12 * T, H), upper = art.rows(0, 12 * T).over(upperC);
  await bakeCanvases({
    name: "Waystone", jsonName: "waystone",
    layers: { GroundUpper: groundC, DecorationLowerShadow: shadowC, DecorationLower: lower, DecorationUpper1: upper },
    collision: [[12, 11], [12, 12]], door: [12, 11],
  });
}

const only = process.argv[2];
for (const [name, draw] of Object.entries({ forge, inn, bakery, ranch, waystone })) if (!only || only === name) await draw();
