// Pip's Archery Butts' numbers, all in one place (the game: src/lib/archery/sim.ts).
// Times in ticks (TICKS_PER_SEC a second), lengths in metres; the flight uses
// only + − × ÷, so it comes out the same on every engine.

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Pip's Archery Butts #1"). */
export const ARCHERY_EPOCH = "2026-10-30";

/** A minute to shoot; arrows still in the air at the bell may land within GRACE_TICKS. */
export const RUN_TICKS = 60 * TICKS_PER_SEC;
export const GRACE_TICKS = 8 * TICKS_PER_SEC;
export const MAX_TICKS = RUN_TICKS + GRACE_TICKS;

/** Arrows in the quiver. */
export const ARROWS = 20;
/** Ticks to nock the next arrow after a loose. */
export const NOCK_TICKS = 20;

/** The longest pull, in draw units (the aim is a whole-number vector, dx² + dy² ≤ MAX_DRAW²). */
export const MAX_DRAW = 400;
/** The least forward pull, and how far below level the bow can point. */
export const MIN_DX = 1;
export const MIN_DY = -100;
/** Metres a tick of arrow speed per draw unit (a full pull is 0.82 m a tick, about 25 m/s). */
export const DRAW_K = 0.00205;
/** Gravity, in metres a tick a tick (9.8 m/s²). */
export const GRAVITY = 9.8 / (TICKS_PER_SEC * TICKS_PER_SEC);
/** Each step of wind pushes an arrow this much along the range, every tick. */
export const WIND_K = 0.00012;
/** The wind changes this often (5 s), a step at a time. */
export const WIND_SEG_TICKS = 5 * TICKS_PER_SEC;
export const WIND_SEGS = Math.ceil(MAX_TICKS / WIND_SEG_TICKS);
export const WIND_MAX = 4;

/** Where the arrow leaves the bow (the archer stands at x = 0). */
export const LAUNCH_X = 0.4;
export const LAUNCH_Y = 1.4;
/** Past these the arrow is gone (the range ends; it went backwards). */
export const FIELD_END = 62;
export const FIELD_START = -4;

/** The face's rings, from its centre, in metres. */
export const RING_BULL = 0.18;
export const RING_INNER = 0.45;
export const RING_OUTER = 0.75;
/** Ring points, multiplied by the target's worth and the chain. */
export const BULL_POINTS = 10;
export const INNER_POINTS = 6;
export const OUTER_POINTS = 3;
/** Hits in a row multiply up to this. */
export const CHAIN_MAX = 4;

/** The golden apple: its size, its bonus, and how long it sits on the hat. */
export const APPLE_R = 0.2;
export const APPLE_BONUS = 150;
export const APPLE_TICKS = 12 * TICKS_PER_SEC;
/** The scarecrow's hat, where the apple sits. */
export const APPLE_Y = 2.15;

/** Points a second left on the clock once every arrow is down. */
export const TIME_BONUS_PER_SEC = 2;
/** Every arrow a hit: this share on top. */
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 200;

/** The weekly prizes (src/lib/arcadeServer.ts). */
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Sharpshooter";
export const PRIZE_COSMETIC = "prize_archer_cap";
