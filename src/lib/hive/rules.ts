// Beehive Builder's numbers, all in one place (the game: src/lib/hive/sim.ts).
// The comb is a hexagon of hex cells (board.ts); pieces are cells as axial
// offsets, never turned. Times in ticks (TICKS_PER_SEC a second).

import type { HiveShapeDef, HiveShapeKey } from "@/types/hive";

export const TICKS_PER_SEC = 10;
export const TICK_MS = 1000 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Beehive Builder #1"). */
export const HIVE_EPOCH = "2026-10-24";

/** The comb's radius in cells (3: 37 cells, lines of 4 to 7). */
export const RADIUS = 3;
/** The bees' patience: the run ends after this however far it got. */
export const RUN_TICKS = 180 * TICKS_PER_SEC;
/** Pieces dealt in a day, three to a tray. */
export const PIECES = 36;
export const TRAY = 3;

// ── The day's comb ──
export const COMB_MIN = 4;
export const COMB_SPAN = 3; // 4–6 cells of old comb
export const FLOWERS = 2;
/** At least this many single cells among the pieces, so no day starts hopeless. */
export const MIN_SINGLES = 4;

// ── Score ──
export const PER_CELL_PLACED = 1;
/** A cell turned to honey; several lines at once multiply (× lines). */
export const HONEY_PER_CELL = 10;
/** A cleared line through the royal jelly, once. */
export const JELLY_BONUS = 100;
/** Every piece placed: this much a second left, and a quarter on top. */
export const TIME_BONUS_PER_SEC = 2;
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 100;

// ── The pieces (axial offsets; E = (1, 0), SE = (0, 1), NE = (1, −1)) ──
export const SHAPES: Record<HiveShapeKey, HiveShapeDef> = {
  one: { key: "one", cells: [[0, 0]], weight: 6 },
  duo_e: { key: "duo_e", cells: [[0, 0], [1, 0]], weight: 8 },
  duo_se: { key: "duo_se", cells: [[0, 0], [0, 1]], weight: 8 },
  duo_ne: { key: "duo_ne", cells: [[0, 0], [1, -1]], weight: 8 },
  tri_a: { key: "tri_a", cells: [[0, 0], [1, 0], [0, 1]], weight: 6 },
  tri_b: { key: "tri_b", cells: [[0, 0], [1, 0], [1, -1]], weight: 6 },
  line3_e: { key: "line3_e", cells: [[0, 0], [1, 0], [2, 0]], weight: 5 },
  line3_se: { key: "line3_se", cells: [[0, 0], [0, 1], [0, 2]], weight: 5 },
  line3_ne: { key: "line3_ne", cells: [[0, 0], [1, -1], [2, -2]], weight: 5 },
  bend_a: { key: "bend_a", cells: [[0, 0], [1, 0], [1, 1]], weight: 4 },
  bend_b: { key: "bend_b", cells: [[0, 0], [0, 1], [1, 1]], weight: 4 },
  diamond: { key: "diamond", cells: [[0, 0], [1, 0], [0, 1], [1, 1]], weight: 4 },
  line4_e: { key: "line4_e", cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 2 },
  line4_se: { key: "line4_se", cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 2 },
  line4_ne: { key: "line4_ne", cells: [[0, 0], [1, -1], [2, -2], [3, -3]], weight: 2 },
};

// ── The weekly prizes (src/lib/arcadeServer.ts) ──
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Queen Bee";
export const PRIZE_COSMETIC = "prize_queen_cone";
