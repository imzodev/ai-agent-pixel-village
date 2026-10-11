// The Common Field: a great fenced wheat field north of the village where
// anyone can gather. Its layout is src/lib/commonField.json, shared with the
// art (scripts/draw-wheat-field.mjs, which cuts the picture into the scenery
// stamps listed in commonFieldStamps.json and public/buildings/buildings.json).
// Its wheat is wild resource nodes planted on the furrows by src/lib/seed.ts;
// each gives a few sheaves and regrows (crops.ts).

import LAYOUT from "./commonField.json";
import STAMPS from "./commonFieldStamps.json";

const SW = 24, SH = 15;

/** The field's top-left tile and size in tiles. */
export const COMMON_FIELD = { tx: LAYOUT.origin.tx, ty: LAYOUT.origin.ty, w: LAYOUT.stamps.cols * SW, h: LAYOUT.stamps.rows * SH } as const;

/** The field's stamps (buildings.json entries) and the tilesets they draw from. */
export const COMMON_FIELD_STAMPS = STAMPS.stamps;
export const COMMON_FIELD_TILESETS: readonly string[] = STAMPS.tilesets;

/** World tiles of every wheat stalk in the field. */
export function commonFieldWheat(): [number, number][] {
  const [c0, c1, cs] = LAYOUT.wheat.cols, [r0, r1, rs] = LAYOUT.wheat.rows;
  const bales = new Set(LAYOUT.bales.map(([c, r]) => `${c},${r}`));
  const out: [number, number][] = [];
  for (let r = r0; r <= r1; r += rs) for (let c = c0; c <= c1; c += cs) if (!bales.has(`${c},${r}`)) out.push([COMMON_FIELD.tx + c, COMMON_FIELD.ty + r]);
  return out;
}
