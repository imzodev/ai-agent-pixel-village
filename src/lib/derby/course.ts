// Fishing Derby's daily course, the same for everyone that day (derbyCourseFor):
// the pond's shape (a big pool by the dock and a few lobes), lily pads and reed
// beds, the hour and the weather, and the fish. The day's trophy (the golden
// carp at dusk, the storm eel in the rain, the ghost koi at night) is picked
// first and sets the hour and the weather; the regulars are the world's pond
// fish about then. Pure, and only + − × ÷ and sqrt (a test checks).

import { DERBY_EPOCH, DERBY_FISH, DOCK, FIELD_H, FIELD_W, REGULARS, SHORE_GAP, TIP, TROPHY_FROM, TROPHY_SPAN } from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { DerbyCircle, DerbyCourse, DerbyCourseFish, DerbyFishDef, DerbyFishKey, DerbyTime, DerbyWeather } from "@/types/derby";

const R2 = 0.7071067811865476;
/** Where the lobes may sit, from the big pool's middle (unit pairs: up, the diagonals, the sides). */
const LOBE_DIRS = [[0, -1], [-R2, -R2], [R2, -R2], [-1, 0], [1, 0]] as const;
const TROPHIES: DerbyFishKey[] = ["golden_carp", "storm_eel", "ghost_koi"];
const KEYS = Object.keys(DERBY_FISH) as DerbyFishKey[];

export const derbyNumber = (day: string): number => dayNumber(DERBY_EPOCH, day);

/** Is (x, y) in the water, at least `gap` from the shore? */
export function inPond(pond: readonly DerbyCircle[], x: number, y: number, gap = 0): boolean {
  for (const p of pond) {
    const dx = x - p.x, dy = y - p.y, r = p.r - gap;
    if (r > 0 && dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** Is a fish about at this hour and weather (the world's rules: dusk also has the day's fish)? */
export function fishAbout(def: DerbyFishDef, time: DerbyTime, weather: DerbyWeather): boolean {
  if (def.rain && weather !== "rain") return false;
  if (def.time === "any") return true;
  if (def.time === "day") return time === "day" || time === "dusk";
  return def.time === time;
}

/** The regulars about at this hour and weather. */
export const regularPool = (time: DerbyTime, weather: DerbyWeather): DerbyFishDef[] =>
  KEYS.map((k) => DERBY_FISH[k]).filter((d) => !d.trophy && fishAbout(d, time, weather));

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** A random spot in the water, `gap` from the shore and at least `away` from the rod's tip. */
export function spotInPond(pond: readonly DerbyCircle[], rnd: () => number, gap: number, away = 0): { x: number; y: number } {
  for (let i = 0; i < 60; i++) {
    const x = rnd() * FIELD_W, y = rnd() * FIELD_H;
    if (inPond(pond, x, y, gap) && dist2(x, y, TIP.x, TIP.y) >= away * away) return { x, y };
  }
  return { x: pond[0].x, y: pond[0].y };
}

function buildPond(rnd: () => number): DerbyCircle[] {
  // The big pool, always round the end of the dock.
  const cx = Math.round(FIELD_W / 2 + (rnd() - 0.5) * 30), cy = Math.round(205 + rnd() * 25);
  const toTip = Math.sqrt(dist2(cx, cy, TIP.x, TIP.y));
  const r = Math.round(Math.min(138, Math.max(118 + rnd() * 16, toTip + 22)));
  const pond: DerbyCircle[] = [{ x: cx, y: cy, r }];
  // Two or three lobes in shuffled directions, kept inside the field and clear of the dock's bank.
  const dirs = LOBE_DIRS.map((d) => ({ d, k: rnd() })).sort((a, b) => a.k - b.k);
  const n = 2 + Math.floor(rnd() * 2);
  for (const { d } of dirs.slice(0, n)) {
    const reach = r * (0.62 + rnd() * 0.2);
    const x = Math.round(cx + d[0] * reach), y = Math.round(cy + d[1] * reach);
    const lr = Math.min(46 + rnd() * 30, x - 8, FIELD_W - 8 - x, y - 8, DOCK.y - 20 - y);
    if (lr >= 30) pond.push({ x, y, r: Math.round(lr) });
  }
  return pond;
}

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function derbyCourseFor(day: string, salt = ""): DerbyCourse {
  const seed = hashSeed(`derby:${salt}${day}`);
  const rnd = makeRng(seed);
  const pond = buildPond(rnd);

  // Lily pads anywhere; reed beds along the shore, away from the dock.
  const pads: DerbyCircle[] = [];
  for (let i = 0, n = 4 + Math.floor(rnd() * 4); i < n; i++) {
    const p = spotInPond(pond, rnd, 14, 60);
    pads.push({ x: Math.round(p.x), y: Math.round(p.y), r: 6 + Math.floor(rnd() * 6) });
  }
  const reeds: DerbyCircle[] = [];
  for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
    for (let k = 0; k < 60; k++) {
      const x = rnd() * FIELD_W, y = rnd() * FIELD_H;
      if (inPond(pond, x, y) && !inPond(pond, x, y, 18) && dist2(x, y, TIP.x, TIP.y) > 100 * 100) {
        reeds.push({ x: Math.round(x), y: Math.round(y), r: 18 + Math.floor(rnd() * 9) });
        break;
      }
    }
  }

  // The trophy sets the hour and the weather.
  const trophy = TROPHIES[Math.floor(rnd() * TROPHIES.length)];
  let time: DerbyTime, weather: DerbyWeather;
  if (trophy === "golden_carp") { time = "dusk"; weather = rnd() < 0.3 ? "rain" : "clear"; }
  else if (trophy === "storm_eel") { time = (["day", "dusk", "night"] as const)[Math.floor(rnd() * 3)]; weather = "rain"; }
  else { time = "night"; weather = rnd() < 0.25 ? "rain" : "clear"; }

  const pool = regularPool(time, weather);
  const total = pool.reduce((s, d) => s + d.freq, 0);
  const fish: DerbyCourseFish[] = [];
  for (let i = 0; i < REGULARS; i++) {
    let r = rnd() * total, def = pool[pool.length - 1];
    for (const d of pool) { r -= d.freq; if (r < 0) { def = d; break; } }
    const u = rnd(), at = spotInPond(pond, rnd, SHORE_GAP, 70);
    fish.push({ key: def.key, grams: Math.round(def.minG + (def.maxG - def.minG) * u * u), x: Math.round(at.x), y: Math.round(at.y), appearAt: 0 });
  }
  const td = DERBY_FISH[trophy], at = spotInPond(pond, rnd, SHORE_GAP + 6, 120);
  fish.push({
    key: trophy, grams: Math.round(td.minG + (td.maxG - td.minG) * rnd()),
    x: Math.round(at.x), y: Math.round(at.y), appearAt: TROPHY_FROM + Math.floor(rnd() * TROPHY_SPAN),
  });
  return { day, number: derbyNumber(day), seed, time, weather, pond, pads, reeds, fish };
}
