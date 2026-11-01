// Fenwick's Orchard Catch's daily course, the same for everyone that day
// (catchCourseFor): where the three trees stand, when Fenwick shakes which,
// what falls (apples and pears mostly, plums, rotten apples and wasps, the
// golden pear once), and the day's gusts. Every good fruit can be reached from
// every other one in time (catchCourseSolvable); a full basket and the trips to
// the press are what make a clean run hard. At weekends it's harvest day: more
// pears, and one tree shaken three times over. Pure; whole numbers only.

import * as rules from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { CatchCourse, CatchDrop, CatchFruit, CatchFruitKind, CatchShake } from "@/types/catch";

const {
  BASKET_HALF, BASKET_SPEED, BRANCH_Y, CANOPY_HALF, CATCH_EPOCH, FIELD_W, FRUIT, GRAVITY, LAST_DROP_TICKS, NUDGE, RIM_Y, SHAKE_TICKS, SUB,
  WASP_LAST_TICKS, WASP_VX, WIND_MAX, WIND_SEGS, WIND_SEG_TICKS, WIND_VX,
} = rules;

export const catchNumber = (day: string): number => dayNumber(CATCH_EPOCH, day);

const weekendOf = (day: string): boolean => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

export const isGood = (k: CatchFruitKind): boolean => k === "apple" || k === "pear" || k === "plum" || k === "golden";

/** The gust at a tick. */
export const windAt = (c: CatchCourse, tick: number): number => c.wind[Math.min(c.wind.length - 1, Math.floor(tick / WIND_SEG_TICKS))];

/** A fruit as it leaves the branch. */
export function spawn(d: CatchDrop): CatchFruit {
  return { kind: d.kind, x: d.x, y: BRANCH_Y * SUB, vx: d.kind === "wasp" ? (d.vx < 0 ? -WASP_VX : WASP_VX) : d.vx, vy: FRUIT[d.kind].vy, state: "fall", at: -1 };
}

/** One tick of falling (a wasp drifts instead), the gust pushing sideways, off the field's sides. */
export function fallStep(f: CatchFruit, gust: number): void {
  if (f.kind !== "wasp") f.vy += GRAVITY;
  f.x += f.vx + gust * WIND_VX;
  f.y += f.vy;
  const lo = FRUIT[f.kind].r * SUB, hi = (FIELD_W - FRUIT[f.kind].r) * SUB;
  if (f.x < lo) { f.x = 2 * lo - f.x; f.vx = -f.vx; }
  if (f.x > hi) { f.x = 2 * hi - f.x; f.vx = -f.vx; }
}

/** Where a step from (x0, y0) to (x1, y1) crosses the rim, or null if it doesn't. */
export function rimCross(x0: number, y0: number, x1: number, y1: number): number | null {
  const rim = RIM_Y * SUB;
  if (y0 >= rim || y1 < rim) return null;
  return x0 + Math.floor(((x1 - x0) * (rim - y0)) / (y1 - y0));
}

/** When and where a drop reaches the basket's rim (falling freely through the day's gusts). */
export function landingOf(c: Pick<CatchCourse, "wind">, d: CatchDrop): { t: number; x: number } {
  const f = spawn(d);
  for (let t = d.at; t < d.at + 600; t++) {
    const x0 = f.x, y0 = f.y;
    fallStep(f, c.wind[Math.min(c.wind.length - 1, Math.floor(t / WIND_SEG_TICKS))]);
    const x = rimCross(x0, y0, f.x, f.y);
    if (x !== null) return { t, x };
  }
  return { t: d.at + 600, x: f.x };
}

/** Can the basket be under both in time (ignoring stings and the press)? */
const reachable = (a: { t: number; x: number }, b: { t: number; x: number }): boolean =>
  Math.abs(a.x - b.x) <= BASKET_SPEED * Math.abs(a.t - b.t) + 2 * BASKET_HALF * SUB;

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function catchCourseFor(day: string, salt = ""): CatchCourse {
  const seed = hashSeed(`catch:${salt}${day}`);
  const rnd = makeRng(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const weekend = weekendOf(day);

  const trees = [int(140, 165), int(255, 285), int(380, 410)];
  const wind: number[] = [];
  let w = int(-1, 1);
  for (let i = 0; i < WIND_SEGS; i++) {
    const r = rnd();
    if (r < 0.3) w--; else if (r > 0.7) w++;
    w = Math.max(-WIND_MAX, Math.min(WIND_MAX, w));
    wind.push(w);
  }

  const pick = (): CatchFruitKind => {
    const r = int(1, 100);
    if (weekend) return r <= 35 ? "apple" : r <= 70 ? "pear" : r <= 80 ? "plum" : r <= 91 ? "rotten" : "wasp";
    return r <= 45 ? "apple" : r <= 70 ? "pear" : r <= 82 ? "plum" : r <= 92 ? "rotten" : "wasp";
  };

  const shakes: CatchShake[] = [];
  const drops: CatchDrop[] = [];
  const goldenAt = int(20, 45) * rules.TICKS_PER_SEC;
  const burstAt = weekend ? int(25, 40) * rules.TICKS_PER_SEC : -1;
  let golden = false, burst = false, last = -1;
  for (let t = 45; t + SHAKE_TICKS <= LAST_DROP_TICKS;) {
    let tree = int(0, 2);
    if (tree === last) tree = (tree + int(1, 2)) % 3;
    last = tree;
    // A burst: the same tree three times over, quickly.
    const times = !burst && burstAt >= 0 && t >= burstAt ? 3 : 1;
    if (times === 3) burst = true;
    for (let s = 0; s < times; s++) {
      const at = t + s * 14;
      shakes.push({ at, tree });
      const n = times === 3 ? 3 : int(1, 3);
      for (let i = 0; i < n; i++) {
        const dropAt = at + SHAKE_TICKS + i * int(4, 9);
        if (dropAt > LAST_DROP_TICKS) break;
        let kind = pick();
        if (!golden && at >= goldenAt) { kind = "golden"; golden = true; }
        if (kind === "wasp" && dropAt > WASP_LAST_TICKS) kind = "rotten";
        drops.push({ at: dropAt, tree, x: (trees[tree] + int(-CANOPY_HALF, CANOPY_HALF)) * SUB, vx: int(-NUDGE, NUDGE), kind });
      }
    }
    t += times * 14 + Math.max(24, int(34, 72) - Math.floor(t / 90));
  }
  drops.sort((a, b) => a.at - b.at);

  // Every good fruit within reach of every other: nudge its branch, else it's rotten.
  const placed: { t: number; x: number }[] = [];
  const fits = (l: { t: number; x: number }) => placed.every((p) => reachable(p, l));
  for (const d of drops) {
    if (!isGood(d.kind)) continue;
    let land = landingOf({ wind }, d);
    if (!fits(land)) {
      // The nearest x every placed fruit allows, then try it.
      let lo = 0, hi = FIELD_W * SUB;
      for (const p of placed) {
        const reach = BASKET_SPEED * Math.abs(p.t - land.t) + 2 * BASKET_HALF * SUB;
        lo = Math.max(lo, p.x - reach); hi = Math.min(hi, p.x + reach);
      }
      if (lo <= hi) {
        d.x += Math.max(lo, Math.min(hi, land.x)) - land.x;
        d.x = Math.max(FRUIT[d.kind].r * SUB, Math.min((FIELD_W - FRUIT[d.kind].r) * SUB, d.x));
        land = landingOf({ wind }, d);
      }
    }
    if (fits(land)) placed.push(land);
    else {
      if (d.kind === "golden") golden = false;
      d.kind = "rotten";
    }
  }
  // The golden pear comes back on the next good fruit that falls like a pear.
  if (!golden) {
    for (const d of drops) if (d.at >= goldenAt && (d.kind === "apple" || d.kind === "pear")) { d.kind = "golden"; break; }
  }
  return { day, number: catchNumber(day), seed, trees, shakes, drops, wind, weekend };
}

/** Every good fruit reachable from every other, one golden pear, wind in range, nothing dropping late. */
export function catchCourseSolvable(c: CatchCourse): boolean {
  if (c.wind.length !== WIND_SEGS || c.wind.some((w) => Math.abs(w) > WIND_MAX)) return false;
  if (c.drops.filter((d) => d.kind === "golden").length !== 1) return false;
  const lands: { t: number; x: number }[] = [];
  for (const d of c.drops) {
    if (d.at > LAST_DROP_TICKS || (d.kind === "wasp" && d.at > WASP_LAST_TICKS)) return false;
    if (isGood(d.kind)) lands.push(landingOf(c, d));
  }
  for (let i = 0; i < lands.length; i++) for (let j = 0; j < i; j++) if (!reachable(lands[i], lands[j])) return false;
  return lands.every((l) => l.t < rules.RUN_TICKS);
}
