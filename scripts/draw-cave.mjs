#!/usr/bin/env node
// The Greyspine cave: two original portal stamps (src/lib/regions.ts).
//
//   cave_mouth — a timbered opening in the north cliff of the Greyspine
//     pass (5×3 tiles of cliff face replacing the generator's cliff there)
//   cave_exit  — a rope ladder up the wall of the caverns' entry hall,
//     with daylight falling on the floor below it
//
//   node scripts/draw-cave.mjs
//
// Writes public/assets/CaveMouth.png + public/buildings/cave_mouth.json and
// public/assets/CaveExit.png + public/buildings/cave_exit.json. The art is
// on DecorationLower (it blocks: you go in through the portal, not on
// foot); Collision marks the same tiles so the stamp has a click target.

import { Canvas, rand } from "./canvas-art.mjs";
import { bakeCanvases } from "./bake-building.mjs";

const W_ = 384, H_ = 240, T = 16;
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const P = {
  ink: hex(0x1c1614),
  face: hex(0x766c62), faceDk: hex(0x564e46), faceLt: hex(0x948a7e), rock: hex(0x8a8276), rockLt: hex(0xa8a092), rockDk: hex(0x6a6258),
  dark: hex(0x0e0a0c), dark2: hex(0x1e1818),
  wood: hex(0x8c5c38), woodDk: hex(0x5c3c24), woodLt: hex(0xae7a4a),
  lamp: hex(0xffc860), lampLt: hex(0xfff2c0), iron: hex(0x3a3a40),
  rope: hex(0xc8a868), ropeDk: hex(0x98784a),
  caveFace: hex(0x4a4240), caveFaceDk: hex(0x342e2c), caveWall: hex(0x1e1a1c),
  light: hex(0xfff0b0),
};

// ── Cave mouth ──────────────────────────────────────────────────────────
// Template placed with its top-left at (CAVE_MOUTH_TX - 12, -6): cols
// 10–14 × rows 5–7 are the earth cliff face around the mouth (matching the
// Wilds cliff tiles: grass overhang, earth, dark foot); the door is the
// pass tile in front of it (row 8, col 12).
{
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const ramp = (cols, t, x, y) => { const f = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1); const i = Math.floor(f); return cols[Math.min(cols.length - 1, i + (f - i > BAYER[((y & 3) << 2) | (x & 3)] ? 1 : 0))]; };
  const E = [hex(0x5a3a22), hex(0x7a5030), hex(0x9a6a40), hex(0xb88454), hex(0xd4a06c), hex(0xe8bc88)];
  const G = [hex(0x3e7a3c), hex(0x4f9444), hex(0x62ac50), hex(0x74c05c), hex(0x8ad06c), hex(0xa8e084)];
  const W = [hex(0x4a2c18), hex(0x6e4426), hex(0x946036), hex(0xb8804a), hex(0xd8a468)];
  const C0 = 10 * T, R0 = 5 * T, w = 5 * T, h = 3 * T;
  const art = new Canvas(W_, H_);
  for (let y = R0; y < R0 + h; y++) for (let x = C0; x < C0 + w; x++) {
    const gy = y - R0;
    const crack = (x * 5 + Math.floor(gy / 7) * 3) % 11 === 0;
    let t = 0.62 - (gy / 48) * 0.35 + (rand(x, gy, 70) - 0.5) * 0.12 + Math.sin(x * 1.7 + gy * 0.4) * 0.06 - (crack ? 0.25 : 0);
    if (gy >= 44) t -= (gy - 43) * 0.09;
    art.put(x, y, ramp(E, t, x, y));
  }
  for (let x = C0; x < C0 + w; x++) { // grass overhang
    const drape = 3 + Math.round(1.2 * Math.sin(x * 1.1));
    for (let y = 0; y < drape; y++) art.put(x, R0 + y, ramp(G, 0.75 - y * 0.12, x, y));
    art.put(x, R0 + drape, G[0]);
  }
  // The opening: a dark arch fading into the hill.
  const ox = C0 + T + 2, ow = 3 * T - 4, oTop = R0 + 10, oBot = R0 + h;
  for (let y = oTop; y < oBot; y++) for (let x = ox; x < ox + ow; x++) {
    const dx = (x + 0.5 - (ox + ow / 2)) / (ow / 2), dy = (y - (oTop + 12)) / 12;
    if (y < oTop + 12 && dx * dx + dy * dy > 1) continue;
    art.put(x, y, y > oBot - 5 ? P.dark2 : P.dark);
  }
  // Timber frame, lintel and a hanging lantern.
  const beam = (x0, y0, ww, hh) => { for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) art.put(x, y, ramp(W, 0.8 - (x - x0) / ww * 0.5 - (y === y0 ? -0.2 : 0), x, y)); };
  beam(ox - 4, oTop + 4, 5, oBot - oTop - 4);
  beam(ox + ow - 1, oTop + 4, 5, oBot - oTop - 4);
  beam(ox - 6, oTop, ow + 12, 5);
  art.vline(ox + ow / 2, oTop + 5, oTop + 8, P.iron);
  art.rect(ox + ow / 2 - 2, oTop + 9, 5, 6, P.iron);
  art.rect(ox + ow / 2 - 1, oTop + 10, 3, 4, P.lamp);
  art.put(ox + ow / 2, oTop + 11, P.lampLt);
  for (const [x, y] of [[C0 + 3, R0 + h - 4], [C0 + w - 8, R0 + h - 5]]) { art.rect(x, y, 4, 3, P.rockDk); art.put(x + 1, y, P.rockLt); }

  const cells = [];
  for (let r = 5; r <= 7; r++) for (let c = 10; c <= 14; c++) cells.push([r, c]);
  await bakeCanvases({ name: "CaveMouth", jsonName: "cave_mouth", layers: { DecorationLower: art }, collision: cells, door: [8, 12] });
}

// ── Cave exit ───────────────────────────────────────────────────────────
// Template placed with its top-left at (CAVE_EXIT_TILE.tx - 12,
// CAVE_EXIT_TILE.ty - 5): the ladder fills the wall-face tile (row 5,
// col 12); daylight pools on the floor below; the door is row 6, col 12.
{
  const wall = new Canvas(W_, H_);
  const x0 = 12 * T, y0 = 5 * T;
  // Wall face, like the generator's cave_face, with a shaft of sky above.
  wall.rect(x0, y0, T, T, P.caveFace);
  for (let x = x0; x < x0 + T; x++) if (rand(x, 44) < 0.4) wall.vline(x, y0 + 2, y0 + T - 1, P.caveFaceDk);
  wall.rect(x0 + 3, y0, 10, 3, P.light); // the opening's glow at the top
  // Rope ladder.
  // (stops a pixel short of the tile's bottom so the outline doesn't
  // spill onto the floor tile in front, which must stay walkable)
  for (const lx of [x0 + 3, x0 + 12]) wall.vline(lx, y0, y0 + T - 2, P.rope);
  for (let y = y0 + 2; y < y0 + T - 2; y += 4) { wall.hline(x0 + 3, x0 + 12, y, P.wood); wall.hline(x0 + 4, x0 + 11, y + 1, P.woodDk); }

  const floor = new Canvas(W_, H_);
  // Soft daylight on the floor (translucent; no outline so it never blocks).
  for (let y = y0 + T; y < y0 + 3 * T; y++) for (let x = x0 - 12; x < x0 + T + 12; x++) {
    const dx = (x - (x0 + 8)) / 22, dy = (y - (y0 + T)) / 28;
    const d = dx * dx + dy * dy;
    if (d < 1) floor.put(x, y, P.light, Math.round(70 * (1 - d)));
  }
  wall.outline(P.ink);
  await bakeCanvases({ name: "CaveExit", jsonName: "cave_exit", layers: { GroundUpper: floor, DecorationLower: wall }, collision: [[5, 12]], door: [6, 12] });
}
