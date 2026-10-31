// Pip's Archery Butts' daily course, the same for everyone that day
// (archeryCourseFor): the butts down the range (a post near, then a post or a
// hoist, a cart or a hoist, a far one), the scarecrow and when the golden apple
// sits on its hat, and the wind through the minute. At weekends the King's butt
// stands at the end of the range. Pure.

import {
  APPLE_TICKS, APPLE_Y, ARCHERY_EPOCH, FIELD_END, RING_OUTER, RUN_TICKS, TICKS_PER_SEC, WIND_MAX, WIND_SEGS, WIND_SEG_TICKS,
} from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { ArcheryCourse, ArcheryTarget, ArcheryTargetKind } from "@/types/archery";

export const archeryNumber = (day: string): number => dayNumber(ARCHERY_EPOCH, day);

const weekend = (day: string): boolean => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** The furthest a butt stands (a full pull still reaches it against the wind). */
export const MAX_TARGET_X = 54;

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function archeryCourseFor(day: string, salt = ""): ArcheryCourse {
  const seed = hashSeed(`archery:${salt}${day}`);
  const rnd = makeRng(seed);
  /** A whole number in [a, b]. */
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  /** Metres to a tenth, in [a, b]. */
  const m = (a: number, b: number) => int(a * 10, b * 10) / 10;
  const still = (kind: ArcheryTargetKind, x: number, y: number, worth: number): ArcheryTarget =>
    ({ kind, x0: x, x1: x, y0: y, y1: y, period: TICKS_PER_SEC, phase: 0, worth });
  const hoist = (x: number, worth: number): ArcheryTarget => {
    const period = int(3, 5) * TICKS_PER_SEC;
    return { kind: "hoist", x0: x, x1: x, y0: m(0.9, 1.2), y1: m(2.8, 3.4), period, phase: int(0, period - 1), worth };
  };

  const targets: ArcheryTarget[] = [];
  // Near: a post to warm up on.
  targets.push(still("post", m(10, 13), m(1.1, 1.4), 1));
  // Past the scarecrow: a post, or a butt on a rope.
  targets.push(rnd() < 0.5 ? still("post", m(20, 25), m(1.1, 1.5), 2) : hoist(m(20, 25), 3));
  // The middle of the range: Tobin's cart rolling back and forth, or another hoist.
  if (rnd() < 0.65) {
    const x0 = m(29, 32), period = int(6, 9) * TICKS_PER_SEC;
    targets.push({ kind: "cart", x0, x1: x0 + m(5, 7), y0: 1.25, y1: 1.25, period, phase: int(0, period - 1), worth: 3 });
  } else targets.push(hoist(m(31, 36), 3));
  // Far: a post, now and then on a rope.
  targets.push(rnd() < 0.75 ? still("post", m(43, 47), m(1.2, 1.6), 4) : hoist(m(43, 47), 5));
  // Weekends: the King's butt, right at the end.
  if (weekend(day)) targets.push(still("king", m(51, 53), 1.4, 8));

  // The scarecrow between the first two butts; the apple on its hat for a while.
  const scarecrowX = m(15, 18);
  const from = int(5, 40) * TICKS_PER_SEC;
  const apple = { x: scarecrowX, y: APPLE_Y, from, to: from + APPLE_TICKS };

  // The wind: a step at a time, from a gentle start.
  const wind: number[] = [];
  let w = int(-2, 2);
  for (let i = 0; i < WIND_SEGS; i++) {
    if (i > 0) {
      const r = rnd();
      if (r < 0.3) w--;
      else if (r > 0.7) w++;
      w = Math.max(-WIND_MAX, Math.min(WIND_MAX, w));
    }
    wind.push(w);
  }
  return { day, number: archeryNumber(day), seed, targets, scarecrowX, apple, wind };
}

/** The wind at a tick (the last segment's past the end). */
export const windAt = (course: ArcheryCourse, tick: number): number => {
  const i = Math.floor(tick / WIND_SEG_TICKS);
  return course.wind[Math.max(0, Math.min(course.wind.length - 1, i))] ?? 0;
};

/** How far through its back-and-forth a moving butt is (0 at its start, 1 at its far end). */
const swingAt = (t: ArcheryTarget, tick: number): number => {
  const half = t.period / 2;
  let p = (tick + t.phase) % t.period;
  if (p < 0) p += t.period;
  return p < half ? p / half : (t.period - p) / half;
};

/** Where a butt's face is at a tick. */
export function targetAt(t: ArcheryTarget, tick: number): { x: number; y: number } {
  if (t.x0 === t.x1 && t.y0 === t.y1) return { x: t.x0, y: t.y0 };
  const f = swingAt(t, tick);
  return { x: t.x0 + (t.x1 - t.x0) * f, y: t.y0 + (t.y1 - t.y0) * f };
}

/** The apple is on the hat (and can be hit) at this tick. */
export const appleUp = (course: ArcheryCourse, tick: number): boolean => tick >= course.apple.from && tick < course.apple.to;

/** A course is usable when its butts are on the range, apart, in reach and above the ground, and the wind is in range. */
export function archeryCourseSolvable(course: ArcheryCourse): boolean {
  if (course.targets.length < 4) return false;
  let lastX = 0;
  for (const t of course.targets) {
    const lo = Math.min(t.x0, t.x1), hi = Math.max(t.x0, t.x1);
    if (lo < lastX + 4 || hi > MAX_TARGET_X || hi >= FIELD_END) return false;
    if (Math.min(t.y0, t.y1) - RING_OUTER < 0.1) return false;
    if (!Number.isInteger(t.period) || t.period < TICKS_PER_SEC || !Number.isInteger(t.phase) || t.worth <= 0) return false;
    if (Math.abs(course.scarecrowX - lo) < 2 || Math.abs(course.scarecrowX - hi) < 2) return false;
    lastX = hi;
  }
  if (course.apple.from < 0 || course.apple.to > RUN_TICKS) return false;
  if (course.wind.length !== WIND_SEGS) return false;
  return course.wind.every((w) => Number.isInteger(w) && Math.abs(w) <= WIND_MAX);
}
