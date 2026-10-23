// Marigold's Oven's numbers, all in one place (the game: src/lib/oven/sim.ts).
// Times in ticks (TICKS_PER_SEC a second); an oven's heat is in quarters, so
// every bake check stays in whole numbers.

import type { OvenGoodDef, OvenGoodKey, OvenPieKey } from "@/types/oven";

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Marigold's Oven #1"). */
export const OVEN_EPOCH = "2026-10-22";

/** The morning bake lasts a minute. */
export const RUN_TICKS = 60 * TICKS_PER_SEC;
export const OVENS = 3;
/** Heat in quarters: a normal oven, and the day's hot one. */
export const HEAT = 4;
export const HOT_HEAT = 5;

/** Taken this close to the middle of the golden window (ticks, either side): perfect. */
export const PERFECT_HALF = 15;
/** A perfect bake is worth this much more (in halves: 3 = ×1.5). */
export const PERFECT_HALVES = 3;

// ── Customers ──
export const TICKETS = 14;
/** The first customer comes in after this; then gaps from FIRST_GAP down to LAST_GAP, ± JITTER. */
export const FIRST_AT = 30;
export const FIRST_GAP = 4.4 * TICKS_PER_SEC;
export const LAST_GAP = 2.2 * TICKS_PER_SEC;
export const JITTER = 0.8 * TICKS_PER_SEC;
/** A customer waits this long, plus so much an item. */
export const PATIENCE = 18 * TICKS_PER_SEC;
export const PATIENCE_PER_ITEM = 4 * TICKS_PER_SEC;
/** A finished order pays its goods, this bonus, and a tip for the time left (up to TIP_MAX). */
export const ORDER_BONUS = 20;
export const TIP_MAX = 20;
/** Weekends: a wedding party's order (instead of one ticket), with more patience. */
export const RUSH: OvenGoodKey[] = ["bread", "bread", "honey_bun", "honey_bun", "apple_pie"];
export const RUSH_PATIENCE = 30 * TICKS_PER_SEC;

// ── Score ──
/** Nobody left and nothing spoiled: this share on top. */
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 1500;

// ── Marigold's goods (the world's items: src/lib/itemDefs.ts, src/lib/orchard.ts) ──
const S = TICKS_PER_SEC;
export const OVEN_GOODS: Record<OvenGoodKey, OvenGoodDef> = {
  bread: { key: "bread", name: "Fresh Bread", icon: "🍞", bakeTicks: 6 * S, goldenTicks: 3.5 * S, points: 10, crust: "#c8843a", fill: "#f0d8a0" },
  honey_bun: { key: "honey_bun", name: "Honey Bun", icon: "🥐", bakeTicks: 4 * S, goldenTicks: 3 * S, points: 15, crust: "#d89a40", fill: "#f8c860" },
  apple_pie: { key: "apple_pie", name: "Apple Pie", icon: "🥧", bakeTicks: 9 * S, goldenTicks: 4 * S, points: 25, crust: "#c88a48", fill: "#e8c060" },
  cherry_pie: { key: "cherry_pie", name: "Cherry Pie", icon: "🥧", bakeTicks: 9 * S, goldenTicks: 4 * S, points: 25, crust: "#c88a48", fill: "#b02838" },
  peach_pie: { key: "peach_pie", name: "Peach Pie", icon: "🥧", bakeTicks: 9 * S, goldenTicks: 4 * S, points: 25, crust: "#c88a48", fill: "#f0a050" },
};
export const PIES: readonly OvenPieKey[] = ["apple_pie", "cherry_pie", "peach_pie"];

// ── The weekly prizes (src/lib/arcadeServer.ts) ──
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Golden Crust";
export const PRIZE_COSMETIC = "prize_baker_crown";
