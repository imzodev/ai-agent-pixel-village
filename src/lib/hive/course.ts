// Beehive Builder's daily course, the same for everyone that day (hiveCourseFor):
// a few cells of old comb already filled (never a whole line), flower cells, a
// royal-jelly cell at weekends, and the 36 pieces in the order they're dealt,
// with at least MIN_SINGLES single cells among them. Pure, whole numbers.

import { COMB_MIN, COMB_SPAN, FLOWERS, HIVE_EPOCH, MIN_SINGLES, PIECES, SHAPES, TRAY } from "./rules";
import { CELLS, LINES } from "./board";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { HiveCell, HiveCourse, HiveShapeKey } from "@/types/hive";

const KEYS = Object.keys(SHAPES) as HiveShapeKey[];
const TOTAL = KEYS.reduce((s, k) => s + SHAPES[k].weight, 0);

export const hiveNumber = (day: string): number => dayNumber(HIVE_EPOCH, day);
const weekend = (day: string): boolean => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function hiveCourseFor(day: string, salt = ""): HiveCourse {
  const seed = hashSeed(`hive:${salt}${day}`);
  const rnd = makeRng(seed);
  // Distinct cells: old comb, then flowers, then the jelly.
  const taken = new Set<number>();
  const pick = (): number => { for (;;) { const i = Math.floor(rnd() * CELLS.length); if (!taken.has(i)) { taken.add(i); return i; } } };
  let comb: number[] = [];
  for (let tries = 0; ; tries++) {
    taken.clear();
    const n = COMB_MIN + Math.floor(rnd() * COMB_SPAN);
    comb = Array.from({ length: n }, pick);
    // Never a line already full.
    if (!LINES.some((line) => line.every((i) => taken.has(i))) || tries > 20) break;
  }
  const flowers = Array.from({ length: FLOWERS }, pick);
  const jelly = weekend(day) ? pick() : null;

  const pieces: HiveShapeKey[] = [];
  for (let i = 0; i < PIECES; i++) {
    let r = rnd() * TOTAL, key = KEYS[KEYS.length - 1];
    for (const k of KEYS) { r -= SHAPES[k].weight; if (r < 0) { key = k; break; } }
    pieces.push(key);
  }
  // Top up the singles, in trays after the first.
  for (let have = pieces.filter((k) => k === "one").length; have < MIN_SINGLES; have++) {
    for (;;) { const i = TRAY + Math.floor(rnd() * (PIECES - TRAY)); if (pieces[i] !== "one") { pieces[i] = "one"; break; } }
  }
  const cell = (i: number): HiveCell => CELLS[i];
  return { day, number: hiveNumber(day), seed, comb: comb.map(cell), flowers: flowers.map(cell), jelly: jelly === null ? null : cell(jelly), pieces };
}
