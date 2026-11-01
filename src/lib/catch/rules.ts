// Fenwick's Orchard Catch's numbers, all in one place (the game: src/lib/catch/sim.ts).
// Times in ticks (TICKS_PER_SEC a second); positions in 1/SUB px, so every step is
// whole numbers and comes out the same on every engine.

import type { CatchFruitKind } from "@/types/catch";

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Fenwick's Orchard Catch #1"). */
export const CATCH_EPOCH = "2026-10-31";

/** A minute in the orchard; nothing drops after LAST_DROP_TICKS (wasps after WASP_LAST_TICKS), so it all lands in time. */
export const RUN_TICKS = 60 * TICKS_PER_SEC;
export const LAST_DROP_TICKS = 56 * TICKS_PER_SEC;
export const WASP_LAST_TICKS = 52 * TICKS_PER_SEC;

/** Sub-pixels a pixel. */
export const SUB = 16;
/** The field, in px: its width, where fruit leaves the branches, the basket's rim, the ground. */
export const FIELD_W = 480;
export const BRANCH_Y = 92;
export const RIM_Y = 262;
export const GROUND_Y = 292;
/** How far either side of a trunk fruit hangs. */
export const CANOPY_HALF = 46;
/** The basket: half its width (px), how far it can go, its speed (1/SUB px a tick), what it holds. */
export const BASKET_HALF = 20;
export const BASKET_MIN = 34;
export const BASKET_MAX = 452;
export const BASKET_SPEED = 112;
export const BASKET_CAP = 10;
/** With the basket's middle left of this (px), it tips into Fenwick's press. */
export const PRESS_X = 62;

/** Falling: 1/SUB px a tick a tick; a nudge off the branch up to NUDGE either way. */
export const GRAVITY = 3;
export const NUDGE = 8;
/** Each step of gust pushes falling fruit this much a tick (1/SUB px). */
export const WIND_VX = 4;
export const WIND_SEG_TICKS = 5 * TICKS_PER_SEC;
export const WIND_SEGS = Math.ceil(RUN_TICKS / WIND_SEG_TICKS);
export const WIND_MAX = 3;
/** A wasp doesn't fall: it drifts down at WASP_VY and across at WASP_VX, off the walls. */
export const WASP_VY = 22;
export const WASP_VX = 20;

/** A tree rustles this long before its fruit drops. */
export const SHAKE_TICKS = 18;
/** A sting: the basket can't move for this long. */
export const STUN_TICKS = 45;

/** Each fruit: points (rotten costs), size (px), how fast it leaves the branch. */
export const FRUIT: Record<CatchFruitKind, { points: number; r: number; vy: number }> = {
  apple: { points: 10, r: 7, vy: 0 },
  pear: { points: 15, r: 8, vy: 0 },
  plum: { points: 8, r: 5, vy: 18 },
  golden: { points: 200, r: 8, vy: 0 },
  rotten: { points: -25, r: 7, vy: 0 },
  wasp: { points: 0, r: 6, vy: WASP_VY },
};
/** The multiplier grows a step every CHAIN_STEP good catches in a row, up to CHAIN_MAX. */
export const CHAIN_STEP = 5;
export const CHAIN_MAX = 4;

export const MAX_INPUTS = RUN_TICKS;

/** The weekly prizes (src/lib/arcadeServer.ts). */
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Orchard Keeper";
export const PRIZE_COSMETIC = "prize_orchard_hat";
