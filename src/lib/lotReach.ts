// Tending a garden: how close you must be to plant, water or harvest, and the
// exception for your own lot (stand anywhere inside it and every plot is in
// reach). Pure; the client (Hud) and the garden route share it.

import type { LotBounds } from "@/types/garden";

const TILE_PX = 16;

/** How close the client asks you to be to a plot or crop. */
export const TEND_RANGE_PX = 90;
/** What the server accepts (a little slack for movement in flight). */
export const TEND_RANGE_SERVER_PX = 110;
/** A lot's edge counts a little beyond its parcel, so its fences and borders are inside. */
const EDGE_MARGIN_PX = TILE_PX;

/** Is the world-pixel point (x, y) inside the lot's parcel? */
export function insideLot(b: LotBounds, x: number, y: number): boolean {
  return x >= b.tx * TILE_PX - EDGE_MARGIN_PX && x < (b.tx + b.tw) * TILE_PX + EDGE_MARGIN_PX
    && y >= b.ty * TILE_PX - EDGE_MARGIN_PX && y < (b.ty + b.th) * TILE_PX + EDGE_MARGIN_PX;
}

/**
 * Close enough to work the whole lot (the farm window, Plant / Harvest /
 * Water all): inside it, or around it within FARM_REACH_PX, e.g. at its
 * gate on the path. The client and the garden route use the same rule.
 */
export const FARM_REACH_PX = 64;
export function atLot(b: LotBounds, x: number, y: number): boolean {
  return x >= b.tx * TILE_PX - FARM_REACH_PX && x < (b.tx + b.tw) * TILE_PX + FARM_REACH_PX
    && y >= b.ty * TILE_PX - FARM_REACH_PX && y < (b.ty + b.th) * TILE_PX + FARM_REACH_PX;
}

/** Can you tend something `distPx` away? Yes when it's near, or when it's in your own lot and you stand in it. */
export function canTend(distPx: number, range: number, standingInOwnLot: boolean): boolean {
  return distPx <= range || standingInOwnLot;
}
