// Marigold's Oven's daily course, the same for everyone that day (ovenCourseFor):
// the day's pie, which oven runs hot, and the customers: when each comes in,
// what they want and how long they'll wait, coming faster as the minute goes on.
// At weekends a wedding party orders a big batch. Pure, whole numbers.

import {
  FIRST_AT, FIRST_GAP, HEAT, HOT_HEAT, JITTER, LAST_GAP, OVENS, OVEN_EPOCH, PATIENCE, PATIENCE_PER_ITEM, PIES, RUN_TICKS,
  RUSH, RUSH_PATIENCE, TICKETS, TICKS_PER_SEC,
} from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { OvenCourse, OvenGoodKey, OvenTicket } from "@/types/oven";

export const ovenNumber = (day: string): number => dayNumber(OVEN_EPOCH, day);
const weekend = (day: string): boolean => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** The three doughs on a day: bread, buns and its pie. */
export const doughsOf = (course: Pick<OvenCourse, "pie">): OvenGoodKey[] => ["bread", "honey_bun", course.pie];

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function ovenCourseFor(day: string, salt = ""): OvenCourse {
  const seed = hashSeed(`oven:${salt}${day}`);
  const rnd = makeRng(seed);
  const pie = PIES[Math.floor(rnd() * PIES.length)];
  const hot = Math.floor(rnd() * OVENS);
  const heat = Array.from({ length: OVENS }, (_, i) => (i === hot ? HOT_HEAT : HEAT));

  // What a customer wants: mostly bread and buns, a pie now and then (never two).
  const order = (): OvenGoodKey[] => {
    const n = 1 + Math.floor(rnd() * 3);
    const items: OvenGoodKey[] = [];
    for (let i = 0; i < n; i++) {
      const r = rnd();
      items.push(r < 0.45 ? "bread" : r < 0.8 || items.includes(pie) ? "honey_bun" : pie);
    }
    return items;
  };
  // No one comes in during the last five seconds.
  const tickets: OvenTicket[] = [];
  let at = FIRST_AT;
  for (let i = 0; i < TICKETS && at < RUN_TICKS - 5 * TICKS_PER_SEC; i++) {
    const items = order();
    tickets.push({ at, items, patience: PATIENCE + items.length * PATIENCE_PER_ITEM });
    const gap = FIRST_GAP + (LAST_GAP - FIRST_GAP) * (i / (TICKETS - 1)) + (rnd() * 2 - 1) * JITTER;
    at += Math.round(gap);
  }
  if (weekend(day)) {
    const k = 3 + Math.floor(rnd() * 3);
    tickets[k] = { at: tickets[k].at, items: RUSH.map((g) => (g === "apple_pie" ? pie : g)), patience: RUSH_PATIENCE, rush: true };
  }
  return { day, number: ovenNumber(day), seed, pie, heat, tickets };
}
