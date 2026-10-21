// Whistle's simulation: a flock, a few wolves and the player's whistles, one
// fixed tick at a time. The browser plays it live and the server replays the
// stored taps to score a run, so it must come out the same everywhere:
//   - only + − × ÷ and Math.sqrt (exactly rounded on every engine); no
//     sin/cos/atan2/exp/pow/hypot, no Math.random (a test checks this file);
//   - random numbers from the run's own mulberry32 state (rng.ts);
//   - a fixed order: sheep by index, then wolves by index.
// Pure. Numbers: rules.ts. Course: course.ts.

import * as rules from "./rules";
import { inRect } from "./course";
import { nextState, stateValue } from "./rng";
import type { Course, RunResult, RunState, WRect, WhistleInput } from "@/types/whistle";

// Copied into locals: read through an import binding, every constant costs a
// property lookup in the hot loops (5x slower under some loaders).
const {
  ALIGN_W, BREATH_COST, BREATH_MAX, CALM_MAX, CARRY_TICKS, CATCH_R, COHESION_W, FEAR_R, FEAR_W, FIELD_H, FIELD_W,
  FRICTION_CALM, FRICTION_PANIC, HUNT_R, MAX_INPUTS, MAX_TICKS, MIN_GAP, NEIGHBOUR_R, PANIC_MAX, PANIC_SPREAD,
  PANIC_TICKS, PERFECT_BONUS, PER_SECOND_LEFT, PER_SHEEP, RING_MAX, RING_PUSH, RING_SPEED, SCARED_TICKS,
  SEPARATION_R, SEPARATION_W, SHEEP_R, STRAY_R, TICKS_PER_SEC, WANDER, WOLF_GRACE, WOLF_LEASH, WOLF_PROWL,
  WOLF_PUSH, WOLF_SPEED,
} = rules;
const WOLF_R = 6;

function rand(st: RunState): number {
  st.rng = nextState(st.rng);
  return stateValue(st.rng);
}

/** Would a body of radius r at (x, y) overlap the field's edge or a solid box? */
function blocked(x: number, y: number, r: number, solids: readonly WRect[]): boolean {
  if (x < r || y < r || x > FIELD_W - r || y > FIELD_H - r) return true;
  for (const b of solids) if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  return false;
}

/** Move by the velocity, one axis at a time, bouncing softly off what's in the way. */
function moveBody(b: { x: number; y: number; vx: number; vy: number }, r: number, solids: readonly WRect[]): void {
  const nx = b.x + b.vx;
  if (blocked(nx, b.y, r, solids)) b.vx *= -0.3;
  else b.x = nx;
  const ny = b.y + b.vy;
  if (blocked(b.x, ny, r, solids)) b.vy *= -0.3;
  else b.y = ny;
}

function capSpeed(b: { vx: number; vy: number }, max: number): void {
  const s2 = b.vx * b.vx + b.vy * b.vy;
  if (s2 > max * max) {
    const k = max / Math.sqrt(s2);
    b.vx *= k;
    b.vy *= k;
  }
}

/** Steer towards (tx, ty) at `speed`. */
function seek(b: { x: number; y: number; vx: number; vy: number }, tx: number, ty: number, speed: number): void {
  const dx = tx - b.x, dy = ty - b.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const wx = d > 0.001 ? (dx / d) * speed : 0, wy = d > 0.001 ? (dy / d) * speed : 0;
  b.vx += (wx - b.vx) * 0.2;
  b.vy += (wy - b.vy) * 0.2;
}

/** The solid things for sheep, and for wolves (who never go in the pen). */
export function solidsOf(course: Course): { sheep: WRect[]; wolves: WRect[] } {
  const sheep = [...course.walls, ...course.water];
  return { sheep, wolves: [...sheep, course.pen] };
}

/** A run at tick 0: the flock bunched round the start, the wolves at home. */
export function initRun(course: Course): RunState {
  const st: RunState = {
    tick: 0, sheep: [], wolves: [], rings: [], breath: BREATH_MAX, rng: course.seed ^ 0x5eed,
    penned: 0, lost: 0, done: false, whistles: 0, lastWhistle: -MIN_GAP,
  };
  const { sheep: solids } = solidsOf(course);
  for (let i = 0; i < course.sheep; i++) {
    let x = course.start.x, y = course.start.y;
    for (let k = 0; k < 20; k++) {
      x = course.start.x + (rand(st) * 2 - 1) * 34;
      y = course.start.y + (rand(st) * 2 - 1) * 26;
      if (!blocked(x, y, SHEEP_R, solids)) break;
    }
    st.sheep.push({ x, y, vx: 0, vy: 0, status: "free", panic: 0 });
  }
  for (const d of course.dens) st.wolves.push({ x: d.x, y: d.y, vx: 0, vy: 0, home: { x: d.x, y: d.y }, target: -1, retreat: 0 });
  return st;
}


/** The whistles' waves reach whatever their front passes this tick. */
function soundRings(st: RunState): void {
  const keep = [];
  for (const ring of st.rings) {
    const age = st.tick - ring.born;
    const r0 = age * RING_SPEED, r1 = r0 + RING_SPEED;
    if (r0 > RING_MAX) continue;
    keep.push(ring);
    const hit = (b: { x: number; y: number }): { ux: number; uy: number; k: number } | null => {
      const dx = b.x - ring.x, dy = b.y - ring.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (!(d >= r0 && d < r1) || d > RING_MAX) return null;
      return d < 0.001 ? { ux: 0, uy: -1, k: 1 } : { ux: dx / d, uy: dy / d, k: 1 - (0.5 * d) / RING_MAX };
    };
    for (const s of st.sheep) {
      if (s.status !== "free") continue;
      const h = hit(s);
      if (!h) continue;
      s.vx += h.ux * RING_PUSH * h.k;
      s.vy += h.uy * RING_PUSH * h.k;
      s.panic = PANIC_TICKS;
    }
    for (const w of st.wolves) {
      const h = hit(w);
      if (!h) continue;
      w.vx += h.ux * WOLF_PUSH;
      w.vy += h.uy * WOLF_PUSH;
      w.target = -1;
      w.retreat = Math.max(w.retreat, SCARED_TICKS);
    }
  }
  st.rings = keep;
}

/**
 * The flock's tick. Returns which sheep were stragglers at its start (no other
 * free sheep within STRAY_R), for the wolves.
 */
function stepSheep(st: RunState, course: Course, solids: readonly WRect[]): boolean[] {
  const n = st.sheep.length;
  const ax = new Array<number>(n).fill(0), ay = new Array<number>(n).fill(0), panic = new Array<number>(n).fill(0);
  const stray = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const s = st.sheep[i];
    if (s.status !== "free") continue;
    let sx = 0, sy = 0, cx = 0, cy = 0, vx = 0, vy = 0, cn = 0, caught = 0, close = 0;
    for (let j = 0; j < n; j++) {
      const o = st.sheep[j];
      if (j === i || o.status !== "free") continue;
      const dx = o.x - s.x, dy = o.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= NEIGHBOUR_R * NEIGHBOUR_R) continue;
      if (d2 < STRAY_R * STRAY_R) close++;
      cn++;
      cx += o.x; cy += o.y; vx += o.vx; vy += o.vy;
      if (o.panic - PANIC_SPREAD > caught) caught = o.panic - PANIC_SPREAD;
      if (d2 < SEPARATION_R * SEPARATION_R && d2 > 0) {
        const d = Math.sqrt(d2), f = (SEPARATION_R - d) / SEPARATION_R;
        sx -= (dx / d) * f;
        sy -= (dy / d) * f;
      }
    }
    let fx = sx * SEPARATION_W, fy = sy * SEPARATION_W;
    if (cn > 0) {
      fx += (cx / cn - s.x) * COHESION_W + (vx / cn - s.vx) * ALIGN_W;
      fy += (cy / cn - s.y) * COHESION_W + (vy / cn - s.vy) * ALIGN_W;
    }
    let p = s.panic > 0 ? s.panic - 1 : 0;
    if (caught > p) p = caught;
    for (const w of st.wolves) {
      const dx = s.x - w.x, dy = s.y - w.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= FEAR_R * FEAR_R) continue;
      const d = Math.sqrt(d2);
      if (d > 0.001) {
        fx += (dx / d) * FEAR_W * (1 - d / FEAR_R);
        fy += (dy / d) * FEAR_W * (1 - d / FEAR_R);
      }
      if (p < PANIC_TICKS / 2) p = PANIC_TICKS / 2;
    }
    if (p === 0) {
      fx += (rand(st) * 2 - 1) * WANDER;
      fy += (rand(st) * 2 - 1) * WANDER;
    }
    ax[i] = fx; ay[i] = fy; panic[i] = p; stray[i] = close === 0;
  }
  for (let i = 0; i < n; i++) {
    const s = st.sheep[i];
    if (s.status === "lost") continue;
    if (s.status === "penned") {
      // Settled in the pen: drift to a stop, kept inside.
      s.vx *= FRICTION_CALM; s.vy *= FRICTION_CALM;
      moveBody(s, SHEEP_R, solids);
      const p = course.pen;
      s.x = Math.min(Math.max(s.x, p.x + SHEEP_R), p.x + p.w - SHEEP_R);
      s.y = Math.min(Math.max(s.y, p.y + SHEEP_R), p.y + p.h - SHEEP_R);
      continue;
    }
    s.panic = panic[i];
    s.vx += ax[i]; s.vy += ay[i];
    const f = s.panic > 0 ? FRICTION_PANIC : FRICTION_CALM;
    s.vx *= f; s.vy *= f;
    capSpeed(s, s.panic > 0 ? PANIC_MAX : CALM_MAX);
    moveBody(s, SHEEP_R, solids);
    if (inRect(course.pen, s.x, s.y)) {
      s.status = "penned";
      s.panic = 0;
      st.penned++;
    }
  }
  return stray;
}

function stepWolves(st: RunState, solids: readonly WRect[], stray: readonly boolean[]): void {
  for (const w of st.wolves) {
    if (w.retreat > 0) {
      w.retreat--;
      seek(w, w.home.x, w.home.y, WOLF_SPEED);
    } else {
      if (w.target >= 0) {
        const s = st.sheep[w.target];
        const dx = s.x - w.x, dy = s.y - w.y;
        if (s.status !== "free" || !stray[w.target] || dx * dx + dy * dy > HUNT_R * HUNT_R * 2) w.target = -1;
      }
      if (w.target < 0 && st.tick >= WOLF_GRACE) {
        let best = HUNT_R * HUNT_R;
        for (let i = 0; i < st.sheep.length; i++) {
          const s = st.sheep[i];
          if (s.status !== "free") continue;
          const dx = s.x - w.x, dy = s.y - w.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best && stray[i]) { best = d2; w.target = i; }
        }
      }
      if (w.target >= 0) {
        const s = st.sheep[w.target];
        seek(w, s.x, s.y, WOLF_SPEED);
        const dx = s.x - w.x, dy = s.y - w.y;
        if (dx * dx + dy * dy < CATCH_R * CATCH_R) {
          s.status = "lost";
          s.vx = 0; s.vy = 0;
          st.lost++;
          w.target = -1;
          w.retreat = CARRY_TICKS;
        }
      } else {
        // Prowl round the den.
        const dx = w.home.x - w.x, dy = w.home.y - w.y;
        if (dx * dx + dy * dy > WOLF_LEASH * WOLF_LEASH) seek(w, w.home.x, w.home.y, WOLF_PROWL);
        else {
          w.vx += (rand(st) * 2 - 1) * 0.08;
          w.vy += (rand(st) * 2 - 1) * 0.08;
          capSpeed(w, WOLF_PROWL);
        }
      }
    }
    capSpeed(w, WOLF_PUSH);
    moveBody(w, WOLF_R, solids);
  }
}

/** One tick: this tick's taps (whistles if there's breath), the waves, the flock, the wolves. */
export function step(st: RunState, course: Course, taps: readonly WhistleInput[], solids = solidsOf(course)): void {
  if (st.done) return;
  st.breath = Math.min(BREATH_MAX, st.breath + 1);
  for (const t of taps) {
    if (st.breath < BREATH_COST || st.tick - st.lastWhistle < MIN_GAP) continue;
    st.breath -= BREATH_COST;
    st.lastWhistle = st.tick;
    st.whistles++;
    st.rings.push({ x: t.x, y: t.y, born: st.tick });
  }
  soundRings(st);
  const stray = stepSheep(st, course, solids.sheep);
  stepWolves(st, solids.wolves, stray);
  st.tick++;
  if (st.penned + st.lost >= st.sheep.length || st.tick >= MAX_TICKS) st.done = true;
}

/** Could this tap be whistled now? (The client shows a dry whistle otherwise.) */
export const canWhistle = (st: RunState): boolean => st.breath >= BREATH_COST && st.tick - st.lastWhistle >= MIN_GAP;

/** A run's score: every penned sheep, plus seconds left once none is out, plus a perfect bonus. */
export function scoreOf(st: RunState): RunResult {
  const out = st.sheep.length - st.penned - st.lost;
  const secondsLeft = Math.floor((MAX_TICKS - st.tick) / TICKS_PER_SEC);
  const perfect = st.penned === st.sheep.length;
  const score = st.penned * PER_SHEEP + (out === 0 ? secondsLeft * PER_SECOND_LEFT : 0) + (perfect ? PERFECT_BONUS : 0);
  return { score, penned: st.penned, lost: st.lost, ticks: st.tick, perfect };
}

/** Taps as the server accepts them: whole units on the field, ticks in order, not too many. Null if not. */
export function cleanInputs(raw: unknown): WhistleInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: WhistleInput[] = [];
  let last = -1;
  for (const r of raw) {
    const t = Number((r as WhistleInput)?.t), x = Number((r as WhistleInput)?.x), y = Number((r as WhistleInput)?.y);
    if (![t, x, y].every(Number.isInteger)) return null;
    if (t < last || t < 0 || t >= MAX_TICKS || x < 0 || y < 0 || x > FIELD_W || y > FIELD_H) return null;
    last = t;
    out.push({ t, x, y });
  }
  return out;
}

/** Play a whole run from its taps (the server's check, and the replay pages). */
export function replay(course: Course, inputs: readonly WhistleInput[]): { state: RunState; result: RunResult } {
  const st = initRun(course);
  const solids = solidsOf(course);
  let k = 0;
  while (!st.done) {
    const taps: WhistleInput[] = [];
    while (k < inputs.length && inputs[k].t === st.tick) taps.push(inputs[k++]);
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    step(st, course, taps, solids);
  }
  return { state: st, result: scoreOf(st) };
}

/** A short fingerprint of a run's state (tests, and comparing engines). */
export function stateHash(st: RunState): string {
  let h = 2166136261;
  const mix = (n: number) => {
    const v = Math.round(n * 1000) | 0;
    h = Math.imul(h ^ v, 16777619);
  };
  mix(st.tick); mix(st.penned); mix(st.lost); mix(st.rng);
  for (const s of st.sheep) { mix(s.x); mix(s.y); mix(s.vx); mix(s.vy); }
  for (const w of st.wolves) { mix(w.x); mix(w.y); }
  return (h >>> 0).toString(16);
}
