// Harvest Haul's run: load the produce onto the cart (stack), a moment to
// settle, then the drive to market, leaning the cart over the bumps. The
// browser plays it live and the server replays the stored inputs to score it,
// so the same determinism rules as physics.ts hold here (a test checks).
// Pure. Numbers: rules.ts. Course: course.ts. Physics: physics.ts.

import * as rules from "./rules";
import { START_X, marketX, roadAt } from "./course";
import { massOf, stepWorld } from "./physics";
import type { HaulBody, HaulCourse, HaulDetail, HaulInput, HaulState } from "@/types/haul";
import type { ArcadeResult } from "@/types/arcade";

const {
  ACCEL, ARRIVE_TICKS, BED_HH, BED_HW, BRAKE, CRUISE, DROP_GAP, DROP_RANGE, DT, HAUL_ITEMS, HOLD_GAP, LEAN_RATE, LEAN_TAN,
  LOST_BELOW, LOST_SIDE, MAX_INPUTS, MAX_TICKS, PERFECT_BONUS, RIDE_H, SETTLE_TICKS, SIDE_HH, SIDE_HW, STACK_TICKS, WHEEL_X,
} = rules;

/** Quarter turns as unit pairs (no angles). */
const QUARTER = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
/** The cart's parts in its own frame: the bed, then a low side at each end. */
const PARTS = [
  { x: 0, y: 0, hw: BED_HW, hh: BED_HH },
  { x: -(BED_HW - SIDE_HW), y: -(BED_HH + SIDE_HH), hw: SIDE_HW, hh: SIDE_HH },
  { x: BED_HW - SIDE_HW, y: -(BED_HH + SIDE_HH), hw: SIDE_HW, hh: SIDE_HH },
] as const;
export const CART_PARTS = PARTS.length;

/**
 * Where the cart is at distance `d` with lean `lean`: the bed's centre and its
 * rotation, from the road under its two wheels, tilted by the lean.
 */
export function cartPose(course: HaulCourse, d: number, lean: number): { x: number; y: number; c: number; s: number } {
  const hl = roadAt(course.road, d - WHEEL_X), hr = roadAt(course.road, d + WHEEL_X);
  const dx = 2 * WHEEL_X, dy = hr - hl, len = Math.sqrt(dx * dx + dy * dy);
  const c0 = dx / len, s0 = dy / len;
  const k = lean * LEAN_TAN, lk = Math.sqrt(1 + k * k);
  const lc = 1 / lk, ls = k / lk;
  const c = c0 * lc - s0 * ls, s = s0 * lc + c0 * ls;
  // Up from the road (y grows down): the rotated (0, -1) is (s, -c).
  const up = RIDE_H + BED_HH;
  return { x: d + s * up, y: (hl + hr) / 2 - c * up, c, s };
}

/** Put the cart's parts where the pose says, with the velocities that got them there. */
function moveCart(st: HaulState, course: HaulCourse, first = false): void {
  const p = cartPose(course, st.dist, st.lean);
  for (let i = 0; i < PARTS.length; i++) {
    const b = st.bodies[i], o = PARTS[i];
    const x = p.x + p.c * o.x - p.s * o.y, y = p.y + p.s * o.x + p.c * o.y;
    if (first) { b.vx = 0; b.vy = 0; b.w = 0; }
    else {
      b.vx = (x - b.x) / DT; b.vy = (y - b.y) / DT;
      b.w = (b.c * p.s - b.s * p.c) / DT;
    }
    b.x = x; b.y = y; b.c = p.c; b.s = p.s;
  }
}

export function initHaul(course: HaulCourse): HaulState {
  const st: HaulState = {
    tick: 0, phase: "stack", phaseAt: 0, bodies: [], arbiters: [],
    status: course.items.map(() => "waiting"), broken: course.items.map(() => false),
    next: 0, readyAt: 0, dist: START_X, speed: 0, lean: 0, leanInput: 0, done: false,
  };
  PARTS.forEach((o, i) => st.bodies.push({ id: i, x: 0, y: 0, c: 1, s: 0, vx: 0, vy: 0, w: 0, invMass: 0, invI: 0, friction: 0.8, shape: { kind: "box", hw: o.hw, hh: o.hh }, item: -1 }));
  moveCart(st, course, true);
  return st;
}

/** A body's half size across and up (its bounding box, turned as it is). */
function halfExtents(b: Pick<HaulBody, "shape" | "c" | "s">): { hx: number; hy: number } {
  if (b.shape.kind === "circle") return { hx: b.shape.r, hy: b.shape.r };
  const ac = Math.abs(b.c), as = Math.abs(b.s);
  return { hx: ac * b.shape.hw + as * b.shape.hh, hy: as * b.shape.hw + ac * b.shape.hh };
}

/**
 * Where the next item hangs (world): over x on the cart, HOLD_GAP above
 * whatever is loaded right under it (or the bed), so a drop is gentle if you aim well.
 */
export function holdPoint(st: HaulState, course: HaulCourse, x: number, r: number): { x: number; y: number } {
  const bed = st.bodies[0];
  const key = course.items[Math.min(st.next, course.items.length - 1)];
  const [c, s] = QUARTER[((r % 4) + 4) % 4];
  const me = halfExtents({ shape: HAUL_ITEMS[key].shape, c, s });
  const ax = bed.x + Math.max(-DROP_RANGE, Math.min(DROP_RANGE, x));
  let top = bed.y - BED_HH;
  for (let i = CART_PARTS; i < st.bodies.length; i++) {
    const b = st.bodies[i], e = halfExtents(b);
    if (Math.abs(b.x - ax) < e.hx + me.hx) top = Math.min(top, b.y - e.hy);
  }
  return { x: ax, y: top - HOLD_GAP - me.hy };
}

export const canDrop = (st: HaulState, course: HaulCourse): boolean => st.phase === "stack" && st.next < course.items.length && st.tick >= st.readyAt;

function drop(st: HaulState, course: HaulCourse, x: number, r: number): void {
  const def = HAUL_ITEMS[course.items[st.next]];
  const at = holdPoint(st, course, x, r);
  const [c, s] = QUARTER[((r % 4) + 4) % 4];
  const m = massOf(def.shape, def.density);
  const body: HaulBody = { id: PARTS.length + st.next, x: at.x, y: at.y, c, s, vx: 0, vy: 0, w: 0, ...m, friction: def.friction, shape: def.shape, item: st.next };
  st.bodies.push(body);
  st.status[st.next] = "placed";
  st.next++;
  st.readyAt = st.tick + DROP_GAP;
}

function setPhase(st: HaulState, phase: HaulState["phase"]): void {
  st.phase = phase;
  st.phaseAt = st.tick;
}

/** One tick: this tick's inputs, the cart, the physics, what broke or fell off, the phase. */
export function stepHaul(st: HaulState, course: HaulCourse, inputs: readonly HaulInput[]): void {
  if (st.done) return;
  for (const i of inputs) {
    if (i.k === "lean") st.leanInput = i.v < 0 ? -1 : i.v > 0 ? 1 : 0;
    else if (i.k === "drop") { if (canDrop(st, course)) drop(st, course, i.x, i.r); }
    else if (i.k === "go" && st.phase === "stack" && st.next > 0) setPhase(st, "settle");
  }

  // The phase clock.
  if (st.phase === "stack" && (st.next >= course.items.length || st.tick - st.phaseAt >= STACK_TICKS)) setPhase(st, "settle");
  if (st.phase === "settle" && st.tick - st.phaseAt >= SETTLE_TICKS) {
    for (let k = st.next; k < course.items.length; k++) st.status[k] = "lost"; // never loaded
    st.next = course.items.length;
    setPhase(st, "drive");
  }
  if (st.phase === "drive") {
    const end = marketX(course.road);
    const left = end - st.dist;
    if (left <= (st.speed * st.speed) / (2 * BRAKE) + 0.5) st.speed = Math.max(0, st.speed - BRAKE * DT);
    else st.speed = Math.min(CRUISE, st.speed + ACCEL * DT);
    st.dist = Math.min(end, st.dist + st.speed * DT);
    if (st.speed === 0 && st.dist >= end - 2) setPhase(st, "arrive");
    const target = st.leanInput, rate = LEAN_RATE * DT;
    st.lean = st.lean < target ? Math.min(target, st.lean + rate) : Math.max(target, st.lean - rate);
  } else if (st.phase === "arrive" && st.lean !== 0) {
    st.lean = st.lean > 0 ? Math.max(0, st.lean - LEAN_RATE * DT) : Math.min(0, st.lean + LEAN_RATE * DT);
  }

  moveCart(st, course);
  const { arbiters, impact } = stepWorld(st.bodies, st.arbiters);
  st.arbiters = arbiters;

  // Fragile things break on a hard knock; anything far below the bed or left behind is lost.
  const bed = st.bodies[0];
  let removed = false;
  for (let i = PARTS.length; i < st.bodies.length; i++) {
    const b = st.bodies[i], def = HAUL_ITEMS[course.items[b.item]];
    if (def.breakSpeed && impact[i] > def.breakSpeed) st.broken[b.item] = true;
    if (b.y > bed.y + LOST_BELOW || Math.abs(b.x - bed.x) > LOST_SIDE) { st.status[b.item] = "lost"; removed = true; }
  }
  if (removed) {
    st.bodies = st.bodies.filter((b) => b.item < 0 || st.status[b.item] !== "lost");
    st.arbiters = []; // indices moved; contacts start fresh next tick
  }

  st.tick++;
  if ((st.phase === "arrive" && st.tick - st.phaseAt >= ARRIVE_TICKS) || st.tick >= MAX_TICKS) {
    setPhase(st, "done");
    st.done = true;
  }
}

export function haulDetail(st: HaulState): HaulDetail {
  let delivered = 0, broken = 0, lost = 0;
  st.status.forEach((s, i) => {
    if (s === "lost" || s === "waiting") lost++;
    else if (st.broken[i]) broken++;
    else delivered++;
  });
  return { delivered, broken, lost };
}

/** What's worth: everything delivered whole, plus a quarter more if nothing was lost or broken. */
export function scoreHaul(st: HaulState, course: HaulCourse): ArcadeResult {
  const d = haulDetail(st);
  let value = 0;
  st.status.forEach((s, i) => { if (s === "placed" && !st.broken[i]) value += HAUL_ITEMS[course.items[i]].value; });
  const perfect = st.done && d.delivered === course.items.length;
  const score = value + (perfect ? Math.round(value * PERFECT_BONUS) : 0);
  return { score, ticks: st.tick, perfect, detail: { ...d } };
}

/** Inputs as the server accepts them: known kinds, whole numbers, ticks in order, not too many. Null if not. */
export function cleanHaulInputs(raw: unknown): HaulInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: HaulInput[] = [];
  let last = -1;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= MAX_TICKS) return null;
    last = t;
    if (o.k === "go") out.push({ t, k: "go" });
    else if (o.k === "lean") {
      const v = Number(o.v);
      if (v !== -1 && v !== 0 && v !== 1) return null;
      out.push({ t, k: "lean", v });
    } else if (o.k === "drop") {
      const x = Number(o.x), rr = Number(o.r);
      if (!Number.isInteger(x) || !Number.isInteger(rr) || Math.abs(x) > DROP_RANGE || rr < 0 || rr > 3) return null;
      out.push({ t, k: "drop", x, r: rr });
    } else return null;
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayHaul(course: HaulCourse, inputs: readonly HaulInput[]): { state: HaulState; result: ArcadeResult } {
  const st = initHaul(course);
  let k = 0;
  while (!st.done) {
    const now: HaulInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepHaul(st, course, now);
  }
  return { state: st, result: scoreHaul(st, course) };
}

export function haulHash(st: HaulState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (Math.round(n * 1000) | 0), 16777619); };
  mix(st.tick); mix(st.dist);
  for (const b of st.bodies) { mix(b.x); mix(b.y); mix(b.c); mix(b.s); }
  st.status.forEach((s, i) => mix((s === "placed" ? 1 : s === "lost" ? 2 : 0) + (st.broken[i] ? 4 : 0)));
  return (h >>> 0).toString(16);
}
