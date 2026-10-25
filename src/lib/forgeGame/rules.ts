// Bjorn's Forge's numbers, all in one place (the game: src/lib/forgeGame/sim.ts).
// Times in ticks (TICKS_PER_SEC a second); heat is in whole units, so every
// check stays in whole numbers.

import type { ForgeFuelDef, ForgeFuelKey, ForgeHammerDef, ForgeHammerKey, ForgePieceDef, ForgePieceKey, ForgeTongsDef, ForgeTongsKey } from "@/types/forgeGame";

export const TICKS_PER_SEC = 30;
export const TICK_MS = 1000 / TICKS_PER_SEC;

/** Courses are numbered from this day ("Bjorn's Forge #1"). */
export const FORGE_EPOCH = "2026-10-25";

/** Choosing the fuel and tools lasts at most this long (lighting the fire ends it early). */
export const PREP_TICKS = 10 * TICKS_PER_SEC;
/** The forge itself lasts a minute from when the fire is lit. */
export const RUN_TICKS = 60 * TICKS_PER_SEC;

/** Heat in whole units: 0 (cold) to 767 (it burns out). */
export const HEAT_MIN = 0;
export const HEAT_MAX = 767;
/** At or below this, a blow cracks the billet. */
export const COLD_MAX = 191;
/** At or above this the iron is white hot: a blow burns it out, and in the fire it rises half as fast. */
export const HOT_MIN = 640;
/** The middle of every piece's sweet band. */
export const SWEET_MID = 416;
/** Each blow takes heat out of the iron; knocking scale off a little. */
export const STRIKE_HEAT = 30;
export const KNOCK_HEAT = 10;
/** A quench drops the heat this much (and takes the scale with it). */
export const QUENCH_DROP = 260;

/** The day's fire changes strength this often (5 s). */
export const FIRE_SEG_TICKS = 5 * TICKS_PER_SEC;
export const FIRE_SEGS = RUN_TICKS / FIRE_SEG_TICKS;
/** Fire strength in quarters: low, steady, roaring. */
export const FIRE_MIN = 3;
export const FIRE_MAX = 5;

/** The commissions on a day's board. */
export const COMMISSIONS = 4;
/** The hammer comes round this often; one blow a beat. */
export const SWING_TICKS = 18;
/** Ticks either side of the beat that still count as perfect. */
export const PERFECT_WINDOW = 1;
/** Scale shakes loose every this many blows. */
export const SCALE_EVERY = 3;
/** A good blow's points, a perfect one's, and the most a run of good blows adds to each. */
export const STRIKE_POINTS = 10;
export const PERFECT_POINTS = 15;
export const CHAIN_MAX = 10;
export const KNOCK_POINTS = 2;
/** A finished commission pays its worth plus this. */
export const COMMISSION_BONUS = 30;
/** Finishing a commission with time to spare pays up to this. */
export const TIME_BONUS_MAX = 20;
/** Every commission made and no billet lost: this share on top. */
export const PERFECT_BONUS = 0.25;
export const MAX_INPUTS = 1500;

/** The pieces Bjorn forges: the world's items, each with its own cooling and sweet band. */
export const FORGE_PIECES: Record<ForgePieceKey, ForgePieceDef> = {
  axe: { key: "axe", name: "Woodcutter's Axe", icon: "🪓", strikes: 6, quality: 36, points: 30, coolRate: 2, band: 300, color: "#b8bcc4", shape: "axe" },
  stone_sword: { key: "stone_sword", name: "Stone Sword", icon: "🗡️", strikes: 8, quality: 48, points: 40, coolRate: 3, band: 260, color: "#9aa0aa", shape: "blade" },
  thorn_blade: { key: "thorn_blade", name: "Thorn Blade", icon: "🗡️", strikes: 9, quality: 54, points: 50, coolRate: 3, band: 230, color: "#7d9a68", shape: "blade" },
  wisp_blade: { key: "wisp_blade", name: "Wisp Blade", icon: "🗡️", strikes: 10, quality: 62, points: 65, coolRate: 3, band: 200, color: "#b58ad8", shape: "blade" },
  steel_sword: { key: "steel_sword", name: "Steel Sword", icon: "🗡️", strikes: 11, quality: 70, points: 80, coolRate: 4, band: 180, color: "#d8dce4", shape: "blade" },
  wyvernbone_blade: { key: "wyvernbone_blade", name: "Wyvernbone Blade", icon: "🗡️", strikes: 12, quality: 78, points: 100, coolRate: 4, band: 160, color: "#e8dfc4", shape: "blade" },
};

/** The fuels: how fast the fire heats the billet. */
export const FORGE_FUELS: Record<ForgeFuelKey, ForgeFuelDef> = {
  charcoal: { key: "charcoal", name: "Charcoal", icon: "🪵", rate: 7, blurb: "Gentle: slow to heat, slow to burn" },
  coal: { key: "coal", name: "Coal", icon: "🪨", rate: 9, blurb: "Steady: the smith's usual" },
  coke: { key: "coke", name: "Coke", icon: "🔥", rate: 12, blurb: "Fierce: quick heats, quick to burn" },
};

/** The hammers: the window and what a blow is worth. */
export const FORGE_HAMMERS: Record<ForgeHammerKey, ForgeHammerDef> = {
  stone: { key: "stone", name: "Stone Hammer", icon: "🔨", window: 4, gain: 7, perfectGain: 10, blurb: "Balanced" },
  iron: { key: "iron", name: "Iron Hammer", icon: "⚒️", window: 6, gain: 6, perfectGain: 8, blurb: "Forgiving, lighter blows" },
  tinker: { key: "tinker", name: "Tinker's Hammer", icon: "🛠️", window: 3, gain: 8, perfectGain: 12, blurb: "Tight timing, big blows" },
};

/** The tongs: how quickly the billet moves, how deep it sits in the fire, the quenches. */
export const FORGE_TONGS: Record<ForgeTongsKey, ForgeTongsDef> = {
  short: { key: "short", name: "Short Tongs", icon: "🥢", moveTicks: 3, reach: 4, quenches: 0, blurb: "Quick hands" },
  long: { key: "long", name: "Long Tongs", icon: "🔧", moveTicks: 8, reach: 5, quenches: 0, blurb: "Deep in the coals: heats faster" },
  quench: { key: "quench", name: "Quench Tongs", icon: "💧", moveTicks: 8, reach: 4, quenches: 2, blurb: "Two quenches to save a billet" },
};

/** The weekly prizes (src/lib/arcadeServer.ts). */
export const WEEKLY_PRIZE_GEMS = [500, 300, 150] as const;
export const PRIZE_TITLE = "Master Smith";
export const PRIZE_COSMETIC = "prize_smith_goggles";
