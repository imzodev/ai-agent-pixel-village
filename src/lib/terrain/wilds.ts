// The Wilds tileset (scripts/draw-wilds.mjs): tile names → GIDs, shared by
// the chunk generator (server + /api/chunks) and the client (animated
// tiles). Wilds sits above every shared tileset's GID range.

import WILDS from "./wildsTiles.json";

export const WILDS_FIRSTGID = 8388;
export const WILDS_SHEET = { columns: WILDS.columns, width: WILDS.width, height: WILDS.height };

const INDEX = new Map(WILDS.names.map((name, i) => [name, i]));

/** GID of a Wilds tile by name. */
export function wildsGid(name: string): number {
  const i = INDEX.get(name);
  if (i === undefined) throw new Error(`unknown Wilds tile "${name}"`);
  return WILDS_FIRSTGID + i;
}

/** The Wilds tile name of a global id, or null when it isn't a Wilds tile. */
export function wildsNameOf(gid: number): string | null {
  return gid >= WILDS_FIRSTGID ? WILDS.names[gid - WILDS_FIRSTGID] ?? null : null;
}

/** Frame time of the animated tiles (water), in ms. */
const FRAME_MS = 240;

/** Tiled tile-animation data for the Wilds tileset (Phaser plays it
 *  natively): one entry per animated tile, frames as local tile ids. */
export const WILDS_TILE_ANIMATIONS = Object.values(WILDS.anims as Record<string, string[]>).map((frames) => ({
  id: wildsGid(frames[0]) - WILDS_FIRSTGID,
  animation: frames.map((f) => ({ tileid: wildsGid(f) - WILDS_FIRSTGID, duration: FRAME_MS })),
}));
