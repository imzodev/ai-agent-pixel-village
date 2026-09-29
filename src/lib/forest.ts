// The woodcutting forest west of town: chunks cx −8..−6, cy −1..1, all
// generated grass, so trees (oak_tree resource nodes) never collide with
// map art. The layout is a deterministic jittered grid with an east–west
// trail kept clear through the middle, so every boot plants the same forest.

/** Forest bounds in world tiles (inclusive), ty grows downward. */
export const FOREST_TILES = { tx0: -192, tx1: -121, ty0: -15, ty1: 29 } as const;
/** Tile rows of the trail kept free of trees. */
export const FOREST_TRAIL_TY = { ty0: 6, ty1: 8 } as const;

const STEP = 5; // tiles between grid cells
const JITTER = 2; // max tiles a tree shifts from its cell centre
const KEEP = 0.8; // share of grid cells that get a tree
const EDGE = 2; // tiles kept clear inside the forest border

/** Deterministic pseudo-random in [0, 1) from two integers. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Tree positions as world tiles [tx, ty] (the trunk base tile). */
export function forestTrees(): [number, number][] {
  const out: [number, number][] = [];
  const { tx0, tx1, ty0, ty1 } = FOREST_TILES;
  for (let cy = ty0 + EDGE; cy <= ty1 - EDGE; cy += STEP) {
    for (let cx = tx0 + EDGE; cx <= tx1 - EDGE; cx += STEP) {
      if (hash(cx, cy) > KEEP) continue;
      const tx = Math.min(tx1 - EDGE, Math.max(tx0 + EDGE, cx + Math.round((hash(cx, cy + 1) * 2 - 1) * JITTER)));
      const ty = Math.min(ty1 - EDGE, Math.max(ty0 + EDGE, cy + Math.round((hash(cx + 1, cy) * 2 - 1) * JITTER)));
      // Canopies reach ~3 tiles up from the trunk: keep them off the trail too.
      if (ty >= FOREST_TRAIL_TY.ty0 && ty <= FOREST_TRAIL_TY.ty1 + 3) continue;
      out.push([tx, ty]);
    }
  }
  return out;
}

