// Harvest Haul's daily course: the produce to load, in order, and the road to
// market, the same for everyone that day (courseFor). The road is a height
// every ROAD_STEP units, built from seeded pieces: flat runs, bumps, cobbles,
// hills and potholes, flat again at the market. Every course is checked: no
// slope steeper than MAX_GRADE outside a pothole. Pure.

import { FRAGILE, HAUL_EPOCH, HAUL_ITEMS, ROAD_STEP } from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { HaulCourse, HaulItemKey, HaulRoad } from "@/types/haul";

const STURDY = (Object.keys(HAUL_ITEMS) as HaulItemKey[]).filter((k) => !FRAGILE.includes(k) && k !== "cake");
/** Hills no steeper than this (rise over run). */
export const MAX_GRADE = 0.32;
/** Where the cart waits while you load it. */
export const START_X = 160;
/** The road's least length before the market's flat stretch (about 20 s of driving). */
const MIN_ROAD = 3000;

export const haulNumber = (day: string): number => dayNumber(HAUL_EPOCH, day);
const weekend = (day: string): boolean => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** The road's height at x (between its points, in a straight line; flat past the ends). */
export function roadAt(road: HaulRoad, x: number): number {
  const h = road.heights;
  if (x <= 0) return h[0];
  const i = Math.floor(x / ROAD_STEP);
  if (i >= h.length - 1) return h[h.length - 1];
  const f = (x - i * ROAD_STEP) / ROAD_STEP;
  return h[i] + (h[i + 1] - h[i]) * f;
}

/** Where the market is (the cart stops there). */
export const marketX = (road: HaulRoad): number => road.length - 240;

function buildRoad(rnd: () => number): HaulRoad {
  const h: number[] = [0];
  let y = 0;
  const push = (dy: number, n = 1) => { for (let i = 0; i < n; i++) { y += dy; h.push(Math.round(y * 10) / 10); } };
  const flat = (steps: number) => push(0, steps);
  flat(22); // where you load, and a run-up
  const pieces = 9 + Math.floor(rnd() * 3);
  // At least `pieces`, and on until the road is MIN_ROAD long.
  for (let p = 0; p < pieces || (h.length - 1) * ROAD_STEP < MIN_ROAD; p++) {
    const k = rnd();
    if (k < 0.2) flat(6 + Math.floor(rnd() * 10));
    else if (k < 0.42) {
      // Bumps: up and down, a few times.
      const a = 3 + rnd() * 5, n = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) { push(-a / 2, 2); push(a / 2, 2); }
    } else if (k < 0.58) {
      // Cobbles: small jolts every step.
      const n = 10 + Math.floor(rnd() * 10);
      let lift = 0;
      for (let i = 0; i < n; i++) { const next = Math.round((rnd() * 2 - 1) * 2.5 * 10) / 10; push(next - lift); lift = next; }
      push(-lift);
    } else if (k < 0.8) {
      // A hill: up, a top, down.
      const rise = 30 + rnd() * 50, grade = 0.15 + rnd() * (MAX_GRADE - 0.15);
      const steps = Math.max(2, Math.ceil(rise / (grade * ROAD_STEP)));
      push(-rise / steps, steps); flat(2 + Math.floor(rnd() * 4)); push(rise / steps, steps);
    } else {
      // A pothole: a sharp dip and out.
      const d = 6 + rnd() * 8;
      flat(2); push(d); push(-d); flat(2);
    }
  }
  flat(24); // the market
  return { heights: h, length: (h.length - 1) * ROAD_STEP };
}

/** Is every slope (other than a pothole's single step) gentle enough? */
export function roadOk(road: HaulRoad): boolean {
  const h = road.heights;
  for (let i = 1; i < h.length; i++) if (Math.abs(h[i] - h[i - 1]) > MAX_GRADE * ROAD_STEP + 14) return false;
  return true;
}

/** The day's produce: 8–10 things, at least one fragile, the wedding cake at weekends. */
function buildItems(day: string, rnd: () => number): HaulItemKey[] {
  const n = 8 + Math.floor(rnd() * 3);
  const items: HaulItemKey[] = [];
  for (let i = 0; i < n; i++) items.push(STURDY[Math.floor(rnd() * STURDY.length)]);
  items[2 + Math.floor(rnd() * (n - 3))] = "eggs";
  if (weekend(day)) items[n - 1 - Math.floor(rnd() * 3)] = "cake";
  return items;
}

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function haulCourseFor(day: string, salt = ""): HaulCourse {
  for (let attempt = 0; ; attempt++) {
    const seed = hashSeed(`haul:${salt}${day}:${attempt}`);
    const rnd = makeRng(seed);
    const items = buildItems(day, rnd);
    const road = buildRoad(rnd);
    if (roadOk(road) || attempt > 20) return { day, number: haulNumber(day), seed, items, road };
  }
}
