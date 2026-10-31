// Della's Loom's daily course, the same for everyone that day (loomCourseFor):
// the day's figure of two to four colours, and the 24 rows of cloth built from
// it (repeated, mirrored, doubled or shifted, each with a twist), which get
// longer and quicker to show, some woven "and back again". At weekends the
// gold thread runs through some rows. Pure.

import { COLORS, GAP_TICKS, GOLD, LEAD_TICKS, LOOM_EPOCH, MAX_LEN, ROWS, SHOW_MIN, SHOW_TICKS, START_LEN } from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { LoomCourse, LoomRow } from "@/types/loom";

export const loomNumber = (day: string): number => dayNumber(LOOM_EPOCH, day);

const weekend = (day: string): boolean => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** A row's length: START_LEN, a thread more each row, up to MAX_LEN. */
export const rowLen = (r: number): number => Math.min(MAX_LEN, START_LEN + r);

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function loomCourseFor(day: string, salt = ""): LoomCourse {
  const seed = hashSeed(`loom:${salt}${day}`);
  const rnd = makeRng(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const gold = weekend(day);

  // The figure: no colour twice in a row, and it wraps round without one either.
  const f = int(2, 4);
  const figure: number[] = [];
  while (figure.length < f) {
    const c = int(0, COLORS - 1);
    if (figure.length && figure[figure.length - 1] === c) continue;
    if (figure.length === f - 1 && f > 2 && c === figure[0]) continue;
    figure.push(c);
  }
  const mirror = [...figure, ...figure.slice(1, -1).reverse()];

  const rows: LoomRow[] = [];
  let golds = 0;
  for (let r = 0; r < ROWS; r++) {
    const len = rowLen(r), shift = int(0, figure.length - 1), how = int(0, 3);
    const threads: number[] = [];
    for (let i = 0; i < len; i++) {
      if (how === 0) threads.push(figure[(i + shift) % figure.length]);
      else if (how === 1) threads.push(mirror[(i + shift) % mirror.length]);
      else if (how === 2) threads.push(figure[(Math.floor(i / 2) + shift) % figure.length]);
      else threads.push(figure[(figure.length - 1 - ((i + shift) % figure.length))]);
    }
    // The twist: one thread another colour (from the second row).
    if (r > 0) {
      const j = int(0, len - 1);
      let c = int(0, COLORS - 2);
      if (c >= threads[j]) c++;
      threads[j] = c;
    }
    if (gold && r >= 2 && (rnd() < 0.4 || (r === 3 && golds === 0))) { threads[int(0, len - 1)] = GOLD; golds++; }
    const back = r >= 2 && rows[r - 1].kind !== "back" && rnd() < 0.35;
    rows.push({ kind: back ? "back" : "plain", threads, show: Math.max(SHOW_MIN, SHOW_TICKS - Math.floor(r / 2)) });
  }
  return { day, number: loomNumber(day), seed, colors: gold ? COLORS + 1 : COLORS, figure, rows };
}

/** Ticks from a show's start until thread i lights. */
export const litAt = (row: LoomRow, i: number): number => LEAD_TICKS + i * (row.show + GAP_TICKS);
/** Ticks a whole show takes. */
export const showTicks = (row: LoomRow): number => litAt(row, row.threads.length);

/** Every row as long as it should be, every thread a spool on the loom, never two "back" rows running, gold only (and at least once) at weekends. */
export function loomCourseSolvable(c: LoomCourse): boolean {
  const gold = weekend(c.day);
  if (c.colors !== (gold ? COLORS + 1 : COLORS) || c.rows.length !== ROWS) return false;
  let golds = 0;
  for (let r = 0; r < c.rows.length; r++) {
    const row = c.rows[r];
    if (row.threads.length !== rowLen(r) || row.show < SHOW_MIN) return false;
    if (r > 0 && row.kind === "back" && c.rows[r - 1].kind === "back") return false;
    for (const t of row.threads) {
      if (!Number.isInteger(t) || t < 0 || t >= c.colors) return false;
      if (t === GOLD) golds++;
    }
  }
  return gold ? golds > 0 : golds === 0;
}
