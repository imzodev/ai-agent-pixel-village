// Where the arcade's games stand in the village: Whistle's sheepfold in the
// plaza, Harvest Haul's cart by the Village Ranch's west gate, Fishing Derby's
// jetty by the Western Meadow pond, Marigold's Oven by her bread table. Walking up opens
// the game (ArcadeModal). Spots are chosen once by scripts/gen-arcade-spots.ts
// (spotsData.json, pinned) on clear ground; each has a sign row on top, and
// the rows under it block, on the server and the client (setDynamicBlocks).

import SPOTS from "./spotsData.json";
import type { ArcadeGameKey, ArcadeSpot } from "@/types/arcade";

/** Each spot's size in tiles and what it's called. */
const SHAPE: Record<ArcadeGameKey, Omit<ArcadeSpot, "game" | "tx" | "ty">> = {
  whistle: { w: 6, h: 5, signRows: 1, name: "The sheepfold" },
  haul: { w: 7, h: 4, signRows: 1, name: "Della's cart" },
  derby: { w: 6, h: 4, signRows: 1, name: "The derby jetty" },
  oven: { w: 5, h: 4, signRows: 1, name: "Marigold's oven" },
};
export const SPOT_SHAPE = SHAPE;

const placed = SPOTS as Partial<Record<ArcadeGameKey, { tx: number; ty: number }>>;
export const ARCADE_SPOTS: ArcadeSpot[] = (Object.keys(SHAPE) as ArcadeGameKey[])
  .filter((g) => placed[g])
  .map((game) => ({ game, ...placed[game]!, ...SHAPE[game] }));

export const spotOf = (game: ArcadeGameKey): ArcadeSpot | undefined => ARCADE_SPOTS.find((s) => s.game === game);

/** The tiles a spot blocks (everything below its sign row). */
export function arcadeSpotBlocks(s: ArcadeSpot): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  for (let y = s.ty + s.signRows; y < s.ty + s.h; y++) for (let x = s.tx; x < s.tx + s.w; x++) out.push({ tx: x, ty: y });
  return out;
}

/** Where you stand to play: in front of it (bottom middle), in pixels. */
export const arcadeSpotPoint = (s: ArcadeSpot): { x: number; y: number } => ({ x: (s.tx + s.w / 2) * 16, y: (s.ty + s.h) * 16 + 8 });
