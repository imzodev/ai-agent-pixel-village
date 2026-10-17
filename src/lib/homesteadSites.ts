// Homestead sites: where homesteads can be claimed. A site is the full
// GRID × GRID parcels (src/lib/homestead.ts), reserved whole for its owner,
// on a grid in the homesteads (continent.ts HOMESTEADS) south of the
// village. Sites stand back to back in pairs between north–south lanes
// (LANE_TX), with a lane along the top of every row, so each one touches a
// lane where its first parcels are, and the lanes join up to the village.
//
// Pinned like towns: scripts/gen-homestead-sites.ts writes
// homesteadSitesData.json and a re-run only adds sites. Sites open in
// blocks (nearest the village first) as the open ones fill.

import DATA from "./homesteadSitesData.json";
import { GRID, PARCEL_TILES } from "./homestead";
import type { HomesteadSite, HomesteadSitesData } from "@/types/homestead";

export const SITES: readonly HomesteadSite[] = (DATA as HomesteadSitesData).sites;
/** Site width in tiles. */
export const SITE_TILES = GRID * PARCEL_TILES;
/** Left tile of each site column (pairs between the lanes at −352, −228, −104 and 20). */
export const SITE_COLS: readonly number[] = [-348, -288, -224, -164, -100, -40, 24, 84];
/** Top tile of each site row; the lane runs along the 4 tiles above. */
export const SITE_ROWS: readonly number[] = [57, 121, 185];
export const SITE_LANE_W = 4;
/** The north–south lanes between pairs of sites (left tile, SITE_LANE_W wide). */
export const LANE_TX: readonly number[] = [-352, -228, -104, 20];
/** Sites per block: a block opens when OPEN_AT of the open sites are claimed. */
export const BLOCK_SIZE = 4;

const byKey = new Map(SITES.map((s) => [s.key, s]));
export const siteByKey = (key: string): HomesteadSite | undefined => byKey.get(key);

/** Is a world tile on the planned grid (any site cell, sited or not, or its lane)? Kept clear of bushes and rocks. */
export function onSiteGrid(tx: number, ty: number): boolean {
  return SITE_ROWS.some((r) => ty >= r - SITE_LANE_W && ty < r + SITE_TILES) && SITE_COLS.some((c) => tx >= c - SITE_LANE_W && tx < c + SITE_TILES);
}

/** The site whose grid covers a world tile. */
export function siteAtTile(tx: number, ty: number): HomesteadSite | null {
  for (const s of SITES) if (tx >= s.tx && tx < s.tx + SITE_TILES && ty >= s.ty && ty < s.ty + SITE_TILES) return s;
  return null;
}

/** Is (tx, ty) on a homestead lane (path art): along the top of a site, or north–south between pairs of sites? */
export function onSiteLane(tx: number, ty: number): boolean {
  const top = SITE_ROWS[0] - SITE_LANE_W, bottom = SITE_ROWS[SITE_ROWS.length - 1] + SITE_TILES;
  if (ty >= top && ty < bottom && LANE_TX.some((x) => tx >= x && tx < x + SITE_LANE_W)) return true;
  for (const s of SITES) {
    if (ty >= s.ty - SITE_LANE_W && ty < s.ty && tx >= s.tx - SITE_LANE_W && tx < s.tx + SITE_TILES + SITE_LANE_W) return true;
  }
  return false;
}

/** The village plaza (tile), which sites are numbered and opened from. */
export const VILLAGE_TILE = { tx: 32, ty: 21 };
