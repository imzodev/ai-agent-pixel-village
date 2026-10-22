// Harvest Haul's numbers, all in one place (the game: src/lib/haul/sim.ts).
// Units are pixels at scale 1, y grows downwards; speeds are units a second,
// times in ticks (TICKS_PER_SEC a second).

import type { HaulItemDef, HaulItemKey } from "@/types/haul";

export const TICKS_PER_SEC = 60;
export const TICK_MS = 1000 / TICKS_PER_SEC;
export const DT = 1 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Harvest Haul #1"). */
export const HAUL_EPOCH = "2026-10-22";

export const GRAVITY = 900;

// ── The solver ──
export const ITERATIONS = 10;
export const BIAS_FACTOR = 0.2;
/** Overlap allowed before the solver pushes bodies apart (keeps stacks calm). */
export const SLOP = 0.5;

// ── The cart: a bed and a low side at each end ──
export const BED_HW = 78;
export const BED_HH = 5;
export const SIDE_HW = 3;
export const SIDE_HH = 9;
/** Wheels this far either side of the middle (the road under them tilts the cart). */
export const WHEEL_X = 52;
/** The bed's top sits this high over the road. */
export const RIDE_H = 26;

// ── Stacking ──
/** The next item hangs this far over the top of the stack (or the bed): a gentle drop, if you aim well. */
export const HOLD_GAP = 22;
/** How far from the middle you may drop. */
export const DROP_RANGE = 90;
/** A pause between drops. */
export const DROP_GAP = 30;
/** The stacking phase ends by itself after this. */
export const STACK_TICKS = 35 * TICKS_PER_SEC;
/** Then a moment for the stack to settle before the cart moves. */
export const SETTLE_TICKS = 60;

// ── The drive ──
export const ROAD_STEP = 20;
export const CRUISE = 150;
export const ACCEL = 110;
export const BRAKE = 160;
/** Leaning: how far the cart tilts at full lean (tan of the angle), and how fast it gets there. */
export const LEAN_TAN = 0.22;
export const LEAN_RATE = 3;
/** After arriving, a moment before the count. */
export const ARRIVE_TICKS = 60;
/** An item this far under the bed, or this far from the cart, has fallen off. */
export const LOST_BELOW = 140;
export const LOST_SIDE = 240;
/** The longest a run can last (stack + settle + drive + arrive, with margin). */
export const MAX_TICKS = 120 * TICKS_PER_SEC;

// ── Score ──
/** Everything delivered whole: this share on top. */
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 2000;

// ── The produce ──
const box = (hw: number, hh: number) => ({ kind: "box" as const, hw, hh });
const circle = (r: number) => ({ kind: "circle" as const, r });
export const HAUL_ITEMS: Record<HaulItemKey, HaulItemDef> = {
  pumpkin: { key: "pumpkin", name: "Pumpkin", icon: "🎃", shape: circle(13), density: 1.2, friction: 0.7, value: 30 },
  cabbage: { key: "cabbage", name: "Cabbage", icon: "🥬", shape: circle(9), density: 0.8, friction: 0.8, value: 15 },
  watermelon: { key: "watermelon", name: "Watermelon", icon: "🍉", shape: circle(15), density: 1.3, friction: 0.5, value: 35 },
  cheese: { key: "cheese", name: "Cheese wheel", icon: "🧀", shape: box(16, 7), density: 1.4, friction: 0.6, value: 40 },
  eggs: { key: "eggs", name: "Basket of eggs", icon: "🥚", shape: box(11, 7), density: 0.6, friction: 0.7, value: 50, breakSpeed: 260 },
  hay: { key: "hay", name: "Hay bale", icon: "🌾", shape: box(22, 11), density: 0.7, friction: 0.9, value: 20 },
  crate: { key: "crate", name: "Apple crate", icon: "📦", shape: box(14, 12), density: 1, friction: 0.7, value: 25 },
  flour: { key: "flour", name: "Flour sack", icon: "🌾", shape: box(15, 9), density: 1, friction: 0.95, value: 20 },
  churn: { key: "churn", name: "Milk churn", icon: "🥛", shape: box(8, 14), density: 1.5, friction: 0.5, value: 35 },
  cake: { key: "cake", name: "Wedding cake", icon: "🎂", shape: box(12, 18), density: 0.8, friction: 0.7, value: 120, breakSpeed: 235 },
};
export const FRAGILE: readonly HaulItemKey[] = ["eggs", "cake"];

// ── The weekly prizes (src/lib/arcadeServer.ts) ──
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Master Hauler";
export const PRIZE_COSMETIC = "prize_hauler_apron";
