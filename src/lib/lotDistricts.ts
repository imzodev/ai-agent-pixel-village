// The homesteads: rows of lots planned south of Hollowmere (workshops) and of
// the village farms (land, ranches, vineyards), in the open land the
// continent keeps for them (continent.ts HOMESTEADS). Each row belongs to one
// kind and opens as a whole when the open lots of that kind fill up
// (src/lib/lotRows.ts). Pure: scripts/gen-lot-districts.ts writes the
// planned lots into the manifest; the terrain draws the lanes.
//
// Orchards came later: the first farm row is their row 0 (always open), so
// they exist from the start; the other farm rows rotate land, ranch,
// vineyard and orchard.
//
// Lots stand on a 24-tile grid anchored at the road south of Hollowmere
// (tx −352…−349, the gap the first workshops already leave): groups of five
// lots with a 4-tile lane between groups, so every row's own road (each lot's
// top two rows) joins the lanes and the lanes join the roads north.

import type { DistrictLotKind, PlannedLot } from "@/types/lotDistricts";

export type { DistrictLotKind, PlannedLot } from "@/types/lotDistricts";

const W = 24, H = 15;
/** Lanes between lot groups (tx0, inclusive, 4 wide); the first is the road south of Hollowmere. */
export const LANE_TX: readonly number[] = [-352, -228, -104, 20];
export const LANE_W = 4;
/** Lot columns (left tx) on the grid. */
const WEST = [-448, -424, -400, -376]; // west of the Hollowmere road
const group = (x0: number) => [0, 1, 2, 3, 4].map((i) => x0 + i * W);
const G0 = group(-348), G1 = group(-224), G2 = group(-100), G3 = group(24);

/** Rows south of Hollowmere, above the farms' latitude: workshops only (tx ≤ −126). */
const UPPER_TY = [53, 68];
/** Rows south of the farms: workshops on the Hollowmere side, farm kinds on the village side. */
const LOWER_TY = Array.from({ length: 12 }, (_, r) => 105 + r * H);
const FARM_KINDS: readonly DistrictLotKind[] = ["land", "ranch", "vineyard", "orchard"];

/** Every planned homestead lot, in opening order within each kind. */
export function plannedLots(): PlannedLot[] {
  const out: PlannedLot[] = [];
  let workshopRow = 1;
  // Orchards are new: their first row (0, always open) is the first farm row; the others rotate.
  const farmRow: Record<string, number> = { land: 1, ranch: 1, vineyard: 1, orchard: 0 };
  for (const ty of UPPER_TY) {
    const row = `workshop_${workshopRow++}`;
    for (const tx of [...WEST, ...G0, ...G1.slice(0, 4)]) out.push({ kind: "workshop", row, tx, ty });
  }
  LOWER_TY.forEach((ty, r) => {
    const wrow = `workshop_${workshopRow++}`;
    for (const tx of [...WEST, ...G0]) out.push({ kind: "workshop", row: wrow, tx, ty });
    const kind = r === 0 ? "orchard" : FARM_KINDS[(r - 1) % FARM_KINDS.length];
    const frow = `${kind}_${farmRow[kind]++}`;
    for (const tx of [...G1, ...G2, ...G3]) out.push({ kind, row: frow, tx, ty });
  });
  return out;
}

/** Is (tx, ty) on a homestead lane (drawn as a path)? Lanes run the height of the district. */
export function onLane(tx: number, ty: number): boolean {
  if (ty < 38 || ty > 296) return false; // from just inside the district (path edges stay off the heartland above)
  for (const x of LANE_TX) {
    if (tx < x || tx >= x + LANE_W) continue;
    if (x >= -126 && ty < 105) return false; // the village farms' rows stand there
    return true;
  }
  return false;
}

/** A row's number within its kind (0 = the original lots). */
export const rowIndex = (row: string): number => Number(row.slice(row.lastIndexOf("_") + 1)) || 0;
export const rowKind = (row: string): string => row.slice(0, row.lastIndexOf("_"));
