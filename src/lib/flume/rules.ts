// Log Flume's numbers, all in one place (the game: src/lib/flume/sim.ts). The
// river section is seen from above: units are pixels at scale 1, y grows
// downstream; speeds are units a second, times in ticks (TICKS_PER_SEC a second).

import type { FlumeLogDef, FlumeLogKind } from "@/types/flume";

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;
export const DT = 1 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Log Flume #1"). */
export const FLUME_EPOCH = "2026-10-25";

export const FIELD_W = 300;
export const FIELD_H = 420;
/** Logs enter above this line and are judged as they cross MILL_Y into the gates. */
export const ENTER_Y = -30;
export const MILL_Y = 392;
/** The posts between the gates (rocks that bounce but never split a log). */
export const POST_R = 7;

/** The run: logs arrive until LAST_AT, then a while to reach the mill. */
export const RUN_TICKS = 70 * TICKS_PER_SEC;
export const LOGS = 24;
export const FIRST_AT = 20;
export const LAST_AT = 58 * TICKS_PER_SEC;

// ── The river ──
/** The current down the middle; rapids run faster. */
export const CURRENT = 62;
export const RAPIDS = 1.7;
/** Just upstream of a rock or post the water splits around it: within this far of its edge, up to this share of the current sideways. */
export const SPLIT_REACH = 28;
export const SPLIT_FLOW = 0.9;
/** How quickly a log takes up the current (share a tick). */
export const DRAG = 0.08;
/** A held log slides toward the pointer: this fast per pixel off, up to its kind's latSpeed. */
export const STEER_GAIN = 6;
/** Rock bounce (share of the speed into it kept), and how hard a hit splits a log. */
export const BOUNCE = 0.4;
export const SPLIT_SPEED = 130;
/** Against a bank: the speed kept. A log barely moving this long (on a bank, pinned on a rock) is beached. */
export const BANK_SLOW = 0.85;
export const STALL_SPEED = 8;
export const BEACH_TICKS = 2 * TICKS_PER_SEC;
/** The river is never narrower than this anywhere, nor its free channel past rocks. */
export const MIN_HALF_WIDTH = 52;
export const MIN_GAP = 34;

// ── Score ──
/** The golden birch through its own saw (elsewhere it's worth a pine). */
export const BIRCH_BONUS = 50;
/** Every log milled: this share on top. */
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 4000;

// ── The logs ──
export const LOG_KINDS: Record<FlumeLogKind, FlumeLogDef> = {
  pine: { kind: "pine", name: "Pine log", halfLen: 16, radius: 7, latSpeed: 110, mass: 1, points: 10, color: "#a0703a" },
  oak: { kind: "oak", name: "Oak log", halfLen: 25, radius: 9, latSpeed: 65, mass: 2, points: 20, color: "#6e4426" },
  birch: { kind: "birch", name: "Golden birch", halfLen: 18, radius: 7, latSpeed: 95, mass: 1, points: 10, color: "#f0e0a8" },
};
/** Of the logs that aren't the birch, this share are oak. */
export const OAK_SHARE = 0.3;

// ── The weekly prizes (src/lib/arcadeServer.ts) ──
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "River Boss";
export const PRIZE_COSMETIC = "prize_logger_hat";
