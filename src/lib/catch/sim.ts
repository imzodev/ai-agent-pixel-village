// Fenwick's Orchard Catch's run: Fenwick shakes the trees and you slide the
// basket under what falls. Good fruit pays, more for every five in a row; a
// rotten apple costs and breaks the run; a wasp stings and the basket can't move
// for a moment. The basket holds ten: tip it into the press at the left before it
// overflows. A minute; the browser plays it live and the server replays the
// stored inputs to score it, so whole numbers only and a fixed order (a test
// checks). Pure. Numbers: rules.ts. Course: course.ts.

import * as rules from "./rules";
import { fallStep, isGood, rimCross, spawn, windAt } from "./course";
import type { CatchCourse, CatchDetail, CatchEventKind, CatchEvent, CatchFruit, CatchInput, CatchState } from "@/types/catch";
import type { ArcadeResult } from "@/types/arcade";

const {
  BASKET_CAP, BASKET_HALF, BASKET_MAX, BASKET_MIN, BASKET_SPEED, CHAIN_MAX, CHAIN_STEP, FIELD_W, FRUIT, GROUND_Y, MAX_INPUTS, PRESS_X,
  RUN_TICKS, STUN_TICKS, SUB,
} = rules;

export function initCatch(): CatchState {
  const mid = Math.floor((BASKET_MIN + BASKET_MAX) / 2) * SUB;
  return {
    tick: 0, basketX: mid, target: mid, stunUntil: 0, load: 0, points: 0, streak: 0, bestStreak: 0, caught: 0, missed: 0, rotten: 0,
    stings: 0, golden: false, pressed: 0, fruit: [], nextDrop: 0, nextShake: 0, log: [], done: false,
  };
}

/** A target the basket can head for (whole px, anywhere on the field). */
export const validTarget = (x: number): boolean => Number.isInteger(x) && x >= 0 && x <= FIELD_W;

/** The multiplier a good catch is paid at, with `streak` good catches in a row before it. */
export const multOf = (streak: number): number => Math.min(CHAIN_MAX, 1 + Math.floor(streak / CHAIN_STEP));

function log(st: CatchState, k: CatchEventKind, i: number, extra: Partial<CatchEvent> = {}): void {
  st.log.push({ k, at: st.tick, i, ...extra });
}

/** A fruit reached the rim over the basket. */
function land(st: CatchState, f: CatchFruit, i: number): void {
  f.at = st.tick;
  if (f.kind === "wasp") {
    f.state = "caught";
    st.stings++;
    st.streak = 0;
    st.stunUntil = st.tick + STUN_TICKS;
    log(st, "sting", i);
    return;
  }
  if (st.load >= BASKET_CAP) {
    // Full: it bounces off the heap.
    f.state = "bounced";
    if (isGood(f.kind)) { st.missed++; st.streak = 0; }
    log(st, "bounce", i);
    return;
  }
  f.state = "caught";
  st.load++;
  if (f.kind === "rotten") {
    st.rotten++;
    st.streak = 0;
    st.points += FRUIT.rotten.points;
    log(st, "rotten", i, { points: FRUIT.rotten.points });
    return;
  }
  const mult = f.kind === "golden" ? 1 : multOf(st.streak);
  const pts = FRUIT[f.kind].points * mult;
  st.points += pts;
  st.caught++;
  st.streak++;
  if (st.streak > st.bestStreak) st.bestStreak = st.streak;
  if (f.kind === "golden") st.golden = true;
  log(st, f.kind === "golden" ? "golden" : "catch", i, { points: pts, n: mult });
}

export function stepCatch(st: CatchState, course: CatchCourse, inputs: readonly CatchInput[]): void {
  if (st.done) return;
  for (const inp of inputs) if (inp.k === "to" && validTarget(inp.x)) st.target = Math.max(BASKET_MIN, Math.min(BASKET_MAX, inp.x)) * SUB;

  // The basket.
  if (st.tick >= st.stunUntil) {
    const d = st.target - st.basketX;
    st.basketX += d > BASKET_SPEED ? BASKET_SPEED : d < -BASKET_SPEED ? -BASKET_SPEED : d;
  }
  if (st.load > 0 && st.basketX <= PRESS_X * SUB) {
    log(st, "press", -1, { n: st.load });
    st.pressed += st.load;
    st.load = 0;
  }

  // Shakes and drops due.
  while (st.nextShake < course.shakes.length && course.shakes[st.nextShake].at <= st.tick) { log(st, "shake", course.shakes[st.nextShake].tree); st.nextShake++; }
  while (st.nextDrop < course.drops.length && course.drops[st.nextDrop].at <= st.tick) st.fruit.push(spawn(course.drops[st.nextDrop++]));

  // Everything falling.
  const gust = windAt(course, st.tick), ground = GROUND_Y * SUB;
  for (let i = 0; i < st.fruit.length; i++) {
    const f = st.fruit[i];
    if (f.state !== "fall") continue;
    const x0 = f.x, y0 = f.y;
    fallStep(f, gust);
    const x = rimCross(x0, y0, f.x, f.y);
    if (x !== null && Math.abs(x - st.basketX) <= (BASKET_HALF + FRUIT[f.kind].r) * SUB) { land(st, f, i); continue; }
    if (f.y >= ground) {
      f.state = "ground";
      f.at = st.tick;
      if (isGood(f.kind)) { st.missed++; st.streak = 0; log(st, "miss", i); }
    }
  }

  st.tick++;
  if (st.tick >= RUN_TICKS) st.done = true;
}

/** The run's counts. */
export const catchDetail = (st: CatchState): CatchDetail => ({
  caught: st.caught, missed: st.missed, golden: st.golden ? 1 : 0, stings: st.stings, rotten: st.rotten, streak: st.bestStreak,
});

/** The run's points (never below nothing). Perfect: not one good fruit lost. */
export function scoreCatch(st: CatchState): ArcadeResult {
  return { score: Math.max(0, st.points), ticks: st.tick, perfect: st.done && st.missed === 0 && st.caught > 0, detail: { ...catchDetail(st) } };
}

/** Inputs as the server accepts them: basket targets on the field, before the bell, in order, one a tick at most. Null if not. */
export function cleanCatchInputs(raw: unknown): CatchInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: CatchInput[] = [];
  let last = -1;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t), x = Number(o?.x);
    if (!Number.isInteger(t) || t <= last || t < 0 || t >= RUN_TICKS) return null;
    if (o.k !== "to" || !validTarget(x)) return null;
    last = t;
    out.push({ t, k: "to", x });
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayCatch(course: CatchCourse, inputs: readonly CatchInput[]): { state: CatchState; result: ArcadeResult } {
  const st = initCatch();
  let k = 0;
  while (!st.done) {
    const now: CatchInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepCatch(st, course, now);
  }
  return { state: st, result: scoreCatch(st) };
}

export function catchHash(st: CatchState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  mix(st.tick); mix(st.basketX); mix(st.target); mix(st.stunUntil); mix(st.load); mix(st.points); mix(st.streak); mix(st.bestStreak);
  mix(st.caught); mix(st.missed); mix(st.rotten); mix(st.stings); mix(st.golden ? 1 : 0); mix(st.pressed);
  for (const f of st.fruit) { mix(f.x); mix(f.y); mix(f.at); mix(f.state === "caught" ? 1 : f.state === "ground" ? 2 : f.state === "bounced" ? 3 : 0); }
  return (h >>> 0).toString(16);
}
