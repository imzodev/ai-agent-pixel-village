// Bjorn's Forge's daily course, the same for everyone that day (forgeCourseFor):
// the day's commissions on the board, easiest first, and how strongly the fire
// burns through the minute. Pure, whole numbers.

import { COMMISSIONS, FIRE_MAX, FIRE_MIN, FIRE_SEGS, FIRE_SEG_TICKS, FORGE_EPOCH, FORGE_PIECES, RUN_TICKS } from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { ForgeCommission, ForgeCourse, ForgePieceKey, ForgeState } from "@/types/forgeGame";

export const forgeNumber = (day: string): number => dayNumber(FORGE_EPOCH, day);

const PIECES = Object.keys(FORGE_PIECES) as ForgePieceKey[];

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function forgeCourseFor(day: string, salt = ""): ForgeCourse {
  const seed = hashSeed(`forge:${salt}${day}`);
  const rnd = makeRng(seed);
  const commissions: ForgeCommission[] = [];
  for (let i = 0; i < COMMISSIONS; i++) {
    const piece = PIECES[Math.floor(rnd() * PIECES.length)];
    const def = FORGE_PIECES[piece];
    commissions.push({ piece, strikes: def.strikes, quality: def.quality, points: def.points });
  }
  // Easiest first, so the minute builds up.
  commissions.sort((a, b) => a.points - b.points);
  // The fire: it starts steady and wanders a step at a time (low, steady,
  // roaring), so the smith has to watch it.
  const fire: number[] = [];
  let s = 4;
  for (let i = 0; i < FIRE_SEGS; i++) {
    if (i > 0) {
      const r = rnd();
      if (r < 0.3) s--;
      else if (r > 0.7) s++;
      s = Math.max(FIRE_MIN, Math.min(FIRE_MAX, s));
    }
    fire.push(s);
  }
  return { day, number: forgeNumber(day), seed, commissions, fire };
}

/** The fire's strength at a tick, in quarters (steady before it's lit, last strength past the end). */
export const fireAt = (course: ForgeCourse, st: ForgeState): number => {
  if (st.phase === "prep") return 4;
  const i = Math.floor((st.tick - st.startAt) / FIRE_SEG_TICKS);
  return course.fire[Math.max(0, Math.min(course.fire.length - 1, i))] ?? 4;
};

/** A course is usable when every commission is a real piece and the fire stays in range. */
export function forgeCourseSolvable(course: ForgeCourse): boolean {
  if (course.commissions.length !== COMMISSIONS) return false;
  for (const c of course.commissions) {
    const def = FORGE_PIECES[c.piece];
    if (!def) return false;
    if (c.strikes !== def.strikes || c.quality !== def.quality || c.points !== def.points) return false;
  }
  if (course.fire.length !== RUN_TICKS / FIRE_SEG_TICKS) return false;
  return course.fire.every((f) => Number.isInteger(f) && f >= FIRE_MIN && f <= FIRE_MAX);
}
