// Della's Loom's run: Della shows a row of the cloth thread by thread, then you
// weave it from memory by tapping the spools in order ("and back again" rows in
// reverse). Say Ready before the show ends and every thread you hadn't seen pays
// extra if the row comes out clean. A wrong thread snags the cloth and the row is
// shown again; three snags and Della takes the shuttle back. A minute and a half;
// the browser plays it live and the server replays the stored inputs to score it,
// so whole numbers only and a fixed order (a test checks). Pure. Numbers:
// rules.ts. Course: course.ts.

import * as rules from "./rules";
import { litAt, showTicks } from "./course";
import type { LoomCourse, LoomDetail, LoomEventKind, LoomEvent, LoomInput, LoomRow, LoomState } from "@/types/loom";
import type { ArcadeResult } from "@/types/arcade";

const {
  BACK_MULT, CHAIN_MAX, GAP_TICKS, GOLD, GOLD_BONUS, LEAD_TICKS, MAX_INPUTS, MEMORY_BONUS, ROW_BONUS, ROWS, RUN_TICKS, SNAG_MAX,
  THREAD_POINTS, TICKS_PER_SEC, TIME_BONUS_PER_SEC,
} = rules;

export function initLoom(): LoomState {
  return {
    tick: 0, row: 0, phase: "show", showAt: 0, at: 0, clean: true, firstShow: true, memory: 0,
    points: 0, snags: 0, chain: 0, bestChain: 0, cleanRows: 0, golds: 0, remembered: 0, endAt: -1, snagged: [],
    log: [{ k: "show", at: 0, row: 0 }], done: false,
  };
}

/** The thread wanted at weave position i ("back" rows go from the last shown to the first). */
export const expected = (row: LoomRow, i: number): number =>
  row.kind === "back" ? row.threads[row.threads.length - 1 - i] : row.threads[i];

/** How many of the row's threads have lit by `tick` in the show that began at `showAt`. */
export function shownBy(row: LoomRow, showAt: number, tick: number): number {
  const since = tick - showAt - LEAD_TICKS;
  if (since < 0) return 0;
  return Math.min(row.threads.length, Math.floor(since / (row.show + GAP_TICKS)) + 1);
}

/** Ready is taken during a show once a thread has lit. */
export const canReady = (st: LoomState, course: LoomCourse): boolean =>
  !st.done && st.phase === "show" && shownBy(course.rows[st.row], st.showAt, st.tick) >= 1;

/** A spool can be tapped while weaving. */
export const canPick = (st: LoomState, course: LoomCourse, c: number): boolean =>
  !st.done && st.phase === "weave" && Number.isInteger(c) && c >= 0 && c < course.colors;

function log(st: LoomState, k: LoomEventKind, extra: Partial<LoomEvent> = {}): void {
  st.log.push({ k, at: st.tick, row: st.row, ...extra });
}

/** Show the row (again) from the next tick. */
function show(st: LoomState, first: boolean): void {
  st.phase = "show";
  st.showAt = st.tick + 1;
  st.at = 0;
  st.memory = 0;
  st.firstShow = first;
  st.log.push({ k: "show", at: st.tick + 1, row: st.row });
}

function finishRow(st: LoomState, row: LoomRow): void {
  const len = row.threads.length;
  let pts = len * THREAD_POINTS * (row.kind === "back" ? BACK_MULT : 1);
  for (const t of row.threads) if (t === GOLD) { pts += GOLD_BONUS; st.golds++; }
  if (st.clean) {
    st.chain = Math.min(CHAIN_MAX, st.chain + 1);
    if (st.chain > st.bestChain) st.bestChain = st.chain;
    st.cleanRows++;
    st.remembered += st.memory;
    pts += ROW_BONUS * len * st.chain + st.memory * MEMORY_BONUS;
  }
  st.points += pts;
  log(st, "row", { points: pts, clean: st.clean, chain: st.clean ? st.chain : 0 });
  st.row++;
  st.clean = true;
  if (st.row >= ROWS) { st.endAt = st.tick; st.done = true; return; }
  show(st, true);
}

export function stepLoom(st: LoomState, course: LoomCourse, inputs: readonly LoomInput[]): void {
  if (st.done) return;
  let row = course.rows[st.row];
  if (st.phase === "show" && st.tick >= st.showAt + showTicks(row)) st.phase = "weave";

  for (const inp of inputs) {
    if (st.done) break;
    row = course.rows[st.row];
    if (inp.k === "ready") {
      if (!canReady(st, course)) continue;
      if (st.firstShow) st.memory = row.threads.length - shownBy(row, st.showAt, st.tick);
      st.phase = "weave";
      log(st, "ready", { i: st.memory });
      continue;
    }
    if (!canPick(st, course, inp.c)) continue;
    if (inp.c === expected(row, st.at)) {
      log(st, "thread", { i: st.at, c: inp.c });
      st.at++;
      if (st.at >= row.threads.length) finishRow(st, row);
    } else {
      st.snags++;
      st.chain = 0;
      st.clean = false;
      st.snagged.push({ row: st.row, i: st.at });
      log(st, "snag", { i: st.at, c: inp.c });
      if (st.snags >= SNAG_MAX) { st.done = true; break; }
      show(st, false);
    }
  }

  st.tick++;
  if (st.tick >= RUN_TICKS) st.done = true;
}

/** The run's counts. */
export const loomDetail = (st: LoomState): LoomDetail => ({
  rows: st.row, clean: st.cleanRows, snags: st.snags, chain: st.bestChain, golds: st.golds, memory: st.remembered,
});

/** The run's points: the rows woven, and a little for every second left if the whole cloth is done. Perfect: all of it, no snags. */
export function scoreLoom(st: LoomState): ArcadeResult {
  const left = st.endAt >= 0 ? Math.max(0, RUN_TICKS - st.endAt) : 0;
  const score = st.points + Math.floor(left / TICKS_PER_SEC) * TIME_BONUS_PER_SEC;
  return { score, ticks: st.tick, perfect: st.row >= ROWS && st.snags === 0, detail: { ...loomDetail(st) } };
}

/** Inputs as the server accepts them: picks of a spool or Ready, before the bell, in order, not too many. Null if not. */
export function cleanLoomInputs(raw: unknown): LoomInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: LoomInput[] = [];
  let last = -1;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= RUN_TICKS) return null;
    if (o.k === "ready") out.push({ t, k: "ready" });
    else if (o.k === "pick") {
      const c = Number(o.c);
      if (!Number.isInteger(c) || c < 0 || c > GOLD) return null;
      out.push({ t, k: "pick", c });
    } else return null;
    last = t;
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayLoom(course: LoomCourse, inputs: readonly LoomInput[]): { state: LoomState; result: ArcadeResult } {
  const st = initLoom();
  let k = 0;
  while (!st.done) {
    const now: LoomInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepLoom(st, course, now);
  }
  return { state: st, result: scoreLoom(st) };
}

export function loomHash(st: LoomState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  mix(st.tick); mix(st.row); mix(st.phase === "show" ? 1 : 2); mix(st.showAt); mix(st.at); mix(st.points); mix(st.snags);
  mix(st.chain); mix(st.bestChain); mix(st.cleanRows); mix(st.golds); mix(st.remembered); mix(st.endAt);
  for (const s of st.snagged) { mix(s.row); mix(s.i); }
  mix(st.log.length);
  return (h >>> 0).toString(16);
}

/** When thread i of the row on the loom lights in the current show (drawing). */
export const litTick = (st: LoomState, course: LoomCourse, i: number): number => st.showAt + litAt(course.rows[st.row], i);
