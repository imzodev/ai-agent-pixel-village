// The continent's extent, on its own so the client can know it without the
// terrain generator (src/lib/continent.ts re-exports it).
import type { TileBox } from "@/types/regions";

/** The continent (tiles, inclusive): chunks cx −117…41, cy −80…80. Ocean beyond. */
export const CONTINENT: TileBox = { tx0: -2800, tx1: 999, ty0: -1200, ty1: 1199 };
