// Della's Loom's numbers, all in one place (the game: src/lib/loom/sim.ts).
// Times in ticks (TICKS_PER_SEC a second); everything is whole numbers.

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Della's Loom #1"). */
export const LOOM_EPOCH = "2026-10-31";

/** A minute and a half at the loom. */
export const RUN_TICKS = 90 * TICKS_PER_SEC;

/** Spools: cream, madder, woad, weld; the gold thread at weekends. */
export const COLORS = 4;
export const GOLD = 4;

/** Rows in the day's cloth (more than anyone weaves in time), their lengths. */
export const ROWS = 24;
export const START_LEN = 3;
export const MAX_LEN = 12;
/** Ticks a thread is lit while shown: SHOW_TICKS on the first row, a tick less every two rows, never under SHOW_MIN. */
export const SHOW_TICKS = 15;
export const SHOW_MIN = 8;
/** Dark between two shown threads, and before the first. */
export const GAP_TICKS = 6;
export const LEAD_TICKS = 12;

/** Points a thread (once its row is done), "and back again" rows pay double. */
export const THREAD_POINTS = 5;
export const BACK_MULT = 2;
/** A clean row: this × its length × the run of clean rows (up to CHAIN_MAX). */
export const ROW_BONUS = 4;
export const CHAIN_MAX = 4;
/** A thread woven from memory (not yet shown when you said Ready), on a clean row. */
export const MEMORY_BONUS = 15;
/** A gold thread woven (weekends). */
export const GOLD_BONUS = 60;
/** Snags before Della takes the shuttle back. */
export const SNAG_MAX = 3;
/** Points a second left on the clock once the whole cloth is woven. */
export const TIME_BONUS_PER_SEC = 5;
export const MAX_INPUTS = 600;

/** The weekly prizes (src/lib/arcadeServer.ts). */
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Master Weaver";
export const PRIZE_COSMETIC = "prize_weaver_smock";
