// Beehive Builder's run: set the day's pieces down on the comb, three to a tray;
// whenever a whole line fills it turns to honey and clears (several at once
// multiply, a line through a flower counts double). The run ends when every
// piece is down, when nothing in the tray fits anywhere, or when the bees'
// patience runs out. The browser plays it and the server replays the stored
// inputs to score it: whole numbers, a fixed order (a test checks). Pure.

import * as rules from "./rules";
import { CELLS, LINES, LINES_OF, cellIndex } from "./board";
import type { HiveCourse, HiveDetail, HiveInput, HiveState } from "@/types/hive";
import type { ArcadeResult } from "@/types/arcade";

const { HONEY_PER_CELL, JELLY_BONUS, MAX_INPUTS, PER_CELL_PLACED, PERFECT_BONUS, PIECES, RUN_TICKS, SHAPES, TICKS_PER_SEC, TIME_BONUS_PER_SEC, TRAY } = rules;

export function initHive(course: HiveCourse): HiveState {
  const filled = CELLS.map(() => false);
  for (const [q, r] of course.comb) filled[cellIndex(q, r)] = true;
  return {
    tick: 0, filled, trayAt: 0, used: Array.from({ length: TRAY }, () => false),
    points: 0, lines: 0, placed: 0, flowers: 0, jellyTaken: false, log: [], done: false, end: null,
  };
}

/** The tray's piece in `slot`, or null once it's used (or past the last piece). */
export function trayPiece(st: HiveState, course: HiveCourse, slot: number) {
  if (slot < 0 || slot >= TRAY || st.used[slot]) return null;
  const key = course.pieces[st.trayAt + slot];
  return key ? SHAPES[key] : null;
}

/** The cells piece `slot` would cover with its anchor at (q, r), or null if it doesn't fit there. */
export function cellsFor(st: HiveState, course: HiveCourse, slot: number, q: number, r: number): number[] | null {
  const shape = trayPiece(st, course, slot);
  if (!shape) return null;
  const out: number[] = [];
  for (const [dq, dr] of shape.cells) {
    const i = cellIndex(q + dq, r + dr);
    if (i < 0 || st.filled[i]) return null;
    out.push(i);
  }
  return out;
}

export const canPlace = (st: HiveState, course: HiveCourse, slot: number, q: number, r: number): boolean =>
  !st.done && cellsFor(st, course, slot, q, r) !== null;

/** Does anything left in the tray fit anywhere? */
export function anyFits(st: HiveState, course: HiveCourse): boolean {
  for (let s = 0; s < TRAY; s++) {
    if (!trayPiece(st, course, s)) continue;
    for (const [q, r] of CELLS) if (cellsFor(st, course, s, q, r)) return true;
  }
  return false;
}

const isAt = (cells: HiveCourse["flowers"], i: number): boolean => cells.some(([q, r]) => cellIndex(q, r) === i);

function finish(st: HiveState, why: HiveState["end"] & string): void {
  st.done = true;
  st.end = why;
  if (why === "done") st.points += TIME_BONUS_PER_SEC * Math.floor(Math.max(0, RUN_TICKS - st.tick) / TICKS_PER_SEC);
  st.log.push({ k: "end", at: st.tick, why });
}

function place(st: HiveState, course: HiveCourse, slot: number, cells: number[]): void {
  for (const i of cells) st.filled[i] = true;
  st.used[slot] = true;
  st.placed++;
  st.points += cells.length * PER_CELL_PLACED;
  st.log.push({ k: "place", at: st.tick, slot, cells, points: cells.length * PER_CELL_PLACED });

  // Every line now full turns to honey, all at once (a cell on two lines counts once).
  const full = new Set<number>();
  for (const i of cells) for (const li of LINES_OF[i]) if (LINES[li].every((c) => st.filled[c])) full.add(li);
  if (full.size) {
    const gone = new Set<number>();
    let flowerHoney = 0, flowers = 0, jelly = false;
    for (const li of [...full].sort((a, b) => a - b)) {
      const line = LINES[li];
      for (const c of line) gone.add(c);
      if (line.some((c) => isAt(course.flowers, c))) { flowerHoney += line.length * HONEY_PER_CELL; flowers++; }
      if (course.jelly && !st.jellyTaken && line.some((c) => cellIndex(course.jelly![0], course.jelly![1]) === c)) jelly = true;
    }
    const points = (gone.size * HONEY_PER_CELL + flowerHoney) * full.size + (jelly ? JELLY_BONUS : 0);
    for (const c of gone) st.filled[c] = false;
    st.points += points;
    st.lines += full.size;
    st.flowers += flowers;
    if (jelly) st.jellyTaken = true;
    st.log.push({ k: "clear", at: st.tick, cells: [...gone].sort((a, b) => a - b), lines: full.size, points, flowers, jelly });
  }

  // The next tray once this one's used; then is it over?
  if (st.used.every(Boolean)) { st.trayAt += TRAY; st.used = st.used.map(() => false); }
  if (st.placed >= PIECES) finish(st, "done");
  else if (!anyFits(st, course)) finish(st, "full");
}

/** One tick: this tick's placements, then the clock. */
export function stepHive(st: HiveState, course: HiveCourse, inputs: readonly HiveInput[]): void {
  if (st.done) return;
  for (const inp of inputs) {
    if (st.done) break;
    const cells = cellsFor(st, course, inp.slot, inp.q, inp.r);
    if (cells) place(st, course, inp.slot, cells);
  }
  if (st.done) return;
  st.tick++;
  if (st.tick >= RUN_TICKS) finish(st, "time");
}

export const hiveDetail = (st: HiveState): HiveDetail => ({ honey: st.points, lines: st.lines, placed: st.placed, flowers: st.flowers });

/** The honey made; a quarter more for placing every piece. */
export function scoreHive(st: HiveState): ArcadeResult {
  const perfect = st.done && st.end === "done";
  const score = st.points + (perfect ? Math.round(st.points * PERFECT_BONUS) : 0);
  return { score, ticks: st.tick, perfect, detail: { ...hiveDetail(st), honey: score } };
}

/** Inputs as the server accepts them: placements with whole numbers, ticks in order, not too many. Null if not. */
export function cleanHiveInputs(raw: unknown): HiveInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: HiveInput[] = [];
  let last = -1;
  for (const x of raw) {
    const o = x as Record<string, unknown>;
    const t = Number(o?.t), slot = Number(o?.slot), q = Number(o?.q), r = Number(o?.r);
    if (o?.k !== "place" || ![t, slot, q, r].every(Number.isInteger)) return null;
    if (t < last || t < 0 || t >= RUN_TICKS || slot < 0 || slot >= TRAY || Math.abs(q) > 9 || Math.abs(r) > 9) return null;
    last = t;
    out.push({ t, k: "place", slot, q, r });
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayHive(course: HiveCourse, inputs: readonly HiveInput[]): { state: HiveState; result: ArcadeResult } {
  const st = initHive(course);
  let k = 0;
  while (!st.done) {
    const now: HiveInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepHive(st, course, now);
  }
  return { state: st, result: scoreHive(st) };
}

export function hiveHash(st: HiveState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  mix(st.tick); mix(st.points); mix(st.lines); mix(st.placed); mix(st.flowers); mix(st.trayAt);
  st.filled.forEach((f, i) => { if (f) mix(i + 1); });
  st.used.forEach((u) => mix(u ? 1 : 0));
  return (h >>> 0).toString(16);
}
