// Fishing Derby's numbers, all in one place (the game: src/lib/derby/sim.ts).
// The pond is seen from above: units are pixels at scale 1, y grows downwards;
// speeds are units a second, times in ticks (TICKS_PER_SEC a second).

import type { DerbyFishDef, DerbyFishKey } from "@/types/derby";

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;
export const DT = 1 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Fishing Derby #1"). */
export const DERBY_EPOCH = "2026-10-22";

/** The field, and the rod's tip at the end of the dock (bottom middle). */
export const FIELD_W = 300;
export const FIELD_H = 420;
export const TIP = { x: 150, y: 352 } as const;
export const DOCK = { x: 138, y: 356, w: 24, h: 64 } as const;

/** The derby lasts this long; a fish on the line at the bell may still be landed, up to MAX_TICKS. */
export const RUN_TICKS = 75 * TICKS_PER_SEC;
export const MAX_TICKS = RUN_TICKS + 20 * TICKS_PER_SEC;

// ── Casting ──
/** The bobber's flight, and how long it must sit still before a fish comes. */
export const FLIGHT_TICKS = 12;
export const SETTLE_TICKS = 15;
/** Fish this close to where the bobber lands take fright. */
export const SCARE_R = 28;
/** A fish notices a still bobber this far off (the trophy, a little less). */
export const NOTICE_R = 64;
export const TROPHY_NOTICE = 0.7;
/** At the bobber: it nibbles a while, then bites. */
export const BITE_R = 7;
export const NIBBLE_MIN = 15;
export const NIBBLE_SPAN = 45;
/** Strike within this after the bite, or it takes the bait. */
export const BITE_WINDOW = 18;
/** A frightened fish keeps off bobbers this long. */
export const SHY_TICKS = 3 * TICKS_PER_SEC;
/** After a cast ends, a moment before the next. */
export const RECOVER_TICKS = 12;

// ── Swimming ──
/** How quickly a fish turns toward where it's going (share per tick). */
export const TURN = 0.12;
/** Fish keep this far inside the water. */
export const SHORE_GAP = 10;
/** The trophy surfaces between these times, and stays this long. */
export const TROPHY_FROM = 18 * TICKS_PER_SEC;
export const TROPHY_SPAN = 27 * TICKS_PER_SEC;
export const TROPHY_STAY = 22 * TICKS_PER_SEC;

// ── Reeling ──
/** Tension a second while reeling: a base, plus the fish's pull. */
export const REEL_T = 0.3;
export const PULL_T = 1.2;
/** Let go: tension settles toward the fish's pull × SLACK_HOLD, at EASE a second. */
export const SLACK_HOLD = 0.5;
export const EASE = 2.4;
/** Under SLACK_AT for SLACK_TICKS, the fish throws the hook. */
export const SLACK_AT = 0.06;
export const SLACK_TICKS = 45;
/** Reeling brings a fish in this fast (less while it pulls); a run takes line out. */
export const REEL_SPEED = 60;
export const REEL_DRAG = 0.7;
export const MIN_REEL = 8;
export const RUN_SPEED = 30;
/** A run lasts RUN_MIN + up to RUN_SPAN ticks (longer for strong fish); a rest REST_MIN + up to REST_SPAN. */
export const RUN_MIN = 18;
export const RUN_SPAN = 30;
export const REST_MIN = 24;
export const REST_SPAN = 36;
/** Resting, a fish still pulls this share. */
export const REST_PULL = 0.25;
/** In the reeds a fish pulls harder. */
export const REED_PULL = 1.5;
/** Within this of the rod's tip it's landed. */
export const LAND_R = 16;
/** Tension right after the strike. */
export const HOOK_TENSION = 0.3;

// ── Score ──
/** Each fish landed is worth its grams plus this. */
export const CATCH_BONUS = 150;
/** The trophy landed and nothing lost: this share on top. */
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 3000;

// ── The fish (the world's pond fish; src/lib/fishing.ts has their names and when they bite) ──
export const DERBY_FISH: Record<DerbyFishKey, DerbyFishDef> = {
  silver_minnow: { key: "silver_minnow", name: "Silver Minnow", icon: "🐟", minG: 40, maxG: 120, speed: 34, fight: 0.25, freq: 30, time: "any", color: "#b8c4cc" },
  pond_perch: { key: "pond_perch", name: "Pond Perch", icon: "🐠", minG: 150, maxG: 450, speed: 26, fight: 0.45, freq: 24, time: "any", color: "#8aa050" },
  mud_carp: { key: "mud_carp", name: "Mud Carp", icon: "🐟", minG: 600, maxG: 2400, speed: 18, fight: 0.7, freq: 16, time: "any", color: "#6a5a3a" },
  bluegill: { key: "bluegill", name: "Bluegill", icon: "🐠", minG: 120, maxG: 350, speed: 30, fight: 0.5, freq: 12, time: "day", color: "#4a7aa8" },
  catfish: { key: "catfish", name: "Whiskered Catfish", icon: "🐡", minG: 1200, maxG: 4500, speed: 16, fight: 0.85, freq: 12, time: "night", color: "#4a4a44" },
  golden_carp: { key: "golden_carp", name: "Golden Carp", icon: "🐠", minG: 2000, maxG: 5000, speed: 20, fight: 0.9, freq: 0, time: "dusk", trophy: true, color: "#f0b030" },
  storm_eel: { key: "storm_eel", name: "Storm Eel", icon: "🐍", minG: 1500, maxG: 3500, speed: 30, fight: 1, freq: 0, time: "any", rain: true, trophy: true, color: "#5a6a8a" },
  ghost_koi: { key: "ghost_koi", name: "Ghost Koi", icon: "🐠", minG: 3000, maxG: 7000, speed: 22, fight: 1.1, freq: 0, time: "night", trophy: true, color: "#e8eef4" },
};
/** How many regulars swim in the pond. */
export const REGULARS = 13;

// ── The weekly prizes (src/lib/arcadeServer.ts) ──
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Derby Champion";
export const PRIZE_COSMETIC = "prize_angler_specs";
