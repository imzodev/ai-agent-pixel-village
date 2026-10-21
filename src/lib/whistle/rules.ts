// Whistle's numbers, all in one place (the simulation is src/lib/whistle/sim.ts).
// Field units: the field is FIELD_W × FIELD_H, drawn 1 unit = 1 pixel at scale 1.
// Speeds are units per tick, times in ticks (TICKS_PER_SEC a second).

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;
export const RUN_SECONDS = 75;
export const MAX_TICKS = RUN_SECONDS * TICKS_PER_SEC;

export const FIELD_W = 270;
export const FIELD_H = 480;

/** Courses are numbered from this day ("Whistle #1"). */
export const WHISTLE_EPOCH = "2026-10-21";

// ── The flock ──
export const SHEEP_COUNT = 30;
export const SHEEP_R = 6;
export const NEIGHBOUR_R = 30;
export const SEPARATION_R = 13;
export const SEPARATION_W = 0.09;
export const COHESION_W = 0.0016;
export const ALIGN_W = 0.04;
export const WANDER = 0.035;
export const CALM_MAX = 0.55;
export const PANIC_MAX = 1.9;
export const FRICTION_CALM = 0.9;
export const FRICTION_PANIC = 0.965;
/** How long a fright lasts, and how much of it a neighbour catches. */
export const PANIC_TICKS = 40;
export const PANIC_SPREAD = 8;

// ── The whistle ──
/** The wave grows RING_SPEED a tick up to RING_MAX. */
export const RING_SPEED = 5;
export const RING_MAX = 95;
/** The push at the tap point; it fades to half at RING_MAX. */
export const RING_PUSH = 1.6;
/** A whistle costs BREATH_COST of breath; it refills a unit a tick up to BREATH_MAX (3 whistles). */
export const BREATH_COST = 30;
export const BREATH_MAX = 3 * BREATH_COST;
/** At most one whistle every MIN_GAP ticks. */
export const MIN_GAP = 6;

// ── Wolves ──
/** Wolves start hunting after this. */
export const WOLF_GRACE = 3 * TICKS_PER_SEC;
/** A sheep with no free neighbour this close is a straggler. */
export const STRAY_R = 26;
export const HUNT_R = 130;
export const WOLF_SPEED = 1.45;
export const WOLF_PROWL = 0.45;
export const WOLF_LEASH = 34;
export const CATCH_R = 7;
/** Sheep keep away from wolves this close. */
export const FEAR_R = 42;
export const FEAR_W = 0.12;
/** A whistle sends a wolf home for this long; a catch, for longer. */
export const SCARED_TICKS = 75;
export const CARRY_TICKS = 150;
export const WOLF_PUSH = 2.4;

// ── Score ──
export const PER_SHEEP = 100;
/** When no sheep is left out: this much for each second left. */
export const PER_SECOND_LEFT = 10;
/** Every sheep penned, none lost. */
export const PERFECT_BONUS = 500;

/** A run's taps are capped (a whistle every MIN_GAP ticks is at most MAX_TICKS / MIN_GAP). */
export const MAX_INPUTS = 400;

// ── The weekly prizes (src/lib/whistleServer.ts awardWeek) ──
/** Gems for the week's first, second and third. */
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
/** The top three's title and hat (cosmetics.ts). */
export const PRIZE_TITLE = "Champion Shepherd";
export const PRIZE_COSMETIC = "prize_shepherd_hat";
/** A run's token is good for this long after it starts. */
export const RUN_TOKEN_MS = 15 * 60_000;
