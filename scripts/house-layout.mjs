// Two-storey house layout, derived from the Cabin One template
// (public/buildings/cabin_1.json). Shared by scripts/build-house.mjs
// (Willow House) and scripts/build-brick-house.mjs (Brick House).
//
// Starting from the cabin:
//   - the roof, chimney, gable and attic window move up STOREY rows;
//   - a new upper storey (the cabin's plaster wall panel, same timber
//     corner posts) with three tall windows fills the gap;
//   - the ground floor keeps the cabin's shutters, door and steps, and can
//     swap its wall panel for another variant;
//   - collision grows to cover the upper storey and the raised gable.
// The result still draws from the shared tilesets; bake it with
// scripts/bake-building.mjs.

import { readTemplate, tilesOf } from "./bake-building.mjs";

const STOREY = 3; // rows added by the upper floor
const ROOF_BOTTOM = 9; // cabin rows 0..9 hold the roof / gable / chimney
const LEFT = 10; // wall columns 10..19
const RIGHT = 19;

/**
 * @param {object} opts
 * @param {[number, number]} opts.upperWindow  Walls.png (row, col) of the
 *   top-left tile of a 2×3 window unit for the upper storey.
 * @param {number} opts.groundPanelShift  columns to shift the ground
 *   floor's plaster panel by in Walls.png (0 = plain plaster, 12 = plaster
 *   on a brick base). Corner posts are kept either way.
 */
export function twoStoreyHouse({ upperWindow, groundPanelShift }) {
  const src = readTemplate("public/buildings/cabin_1.json");
  const { gid, where } = tilesOf(src);
  const W = src.width;
  const layers = Object.fromEntries(src.layers.map((l) => [l.name, { ...l, data: l.data.slice() }]));
  const at = (r, c) => r * W + c;
  const get = (name, r, c) => layers[name].data[at(r, c)];
  const set = (name, r, c, g) => { layers[name].data[at(r, c)] = g; };

  /** Move every tile of `name` in rows [r0, r1] up by STOREY rows. */
  function raise(name, r0, r1) {
    const d = layers[name].data;
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < W; c++) {
        d[at(r - STOREY, c)] = d[at(r, c)];
        d[at(r, c)] = 0;
      }
    }
  }

  // 1. Lift everything that belongs to the roof by one storey.
  raise("DecorationUpper1", 0 + STOREY, ROOF_BOTTOM); // roof
  raise("DecorationUpperShadow", 0 + STOREY, 11); // roof shadow on the walls
  raise("DecorationLower", 7, ROOF_BOTTOM); // gable wall under the roof
  raise("DecorationMiddle", 7, 8); // attic window
  for (let r = STOREY; r <= 6; r++) for (const c of [LEFT, LEFT + 1]) { // chimney
    set("DecorationUpper", r - STOREY, c, get("DecorationUpper", r, c));
    set("DecorationUpper", r, c, 0);
  }

  // 2. Upper storey: the cabin's plaster panel, same edge posts.
  const up = ROOF_BOTTOM - STOREY + 1; // first row of the new storey
  for (let i = 0; i < 3; i++) {
    for (let c = LEFT; c <= RIGHT; c++) {
      const col = c === LEFT ? 19 : c === RIGHT ? 22 : 21;
      set("DecorationLower", up + i, c, gid("Walls", 8 + i, col));
    }
  }
  for (let i = 0; i < 2; i++) {
    set("DecorationUpper", up + i, LEFT, gid("Walls", 8 + i, 19));
    set("DecorationUpper", up + i, RIGHT, gid("Walls", 8 + i, 22));
  }
  // three tall windows (a 2×3 unit from Walls.png)
  const [wr, wc] = upperWindow;
  for (const c0 of [11, 14, 17]) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) set("DecorationMiddle", up + i, c0 + j, gid("Walls", wr + i, wc + j));
  }

  // 3. Ground floor wall panel. Only the panel between the corners changes;
  // the timber corner posts stay so both storeys share the same frame.
  if (groundPanelShift) {
    for (let r = up + 3; r <= 12; r++) {
      for (let c = LEFT + 1; c < RIGHT; c++) {
        const g = get("DecorationLower", r, c);
        if (!g) continue;
        const w = where(g);
        if (w.name === "Walls" && w.r >= 8 && w.r <= 10 && w.c >= 20 && w.c <= 21) set("DecorationLower", r, c, gid("Walls", w.r, w.c + groundPanelShift));
      }
    }
  }

  // 4. Collision grows to cover the upper storey and the raised gable.
  for (let r = 8 - STOREY; r <= 12; r++) for (let c = LEFT; c <= RIGHT; c++) set("Collision", r, c, 1);

  return { ...src, layers: src.layers.map((l) => layers[l.name]) };
}
