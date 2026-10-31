// Pip's Archery Butts' run: pull the string back (how far and which way is the
// shot), loose, and the arrow flies under gravity and the day's wind until it
// sticks in a butt, takes the golden apple, or comes down in the grass. Rings
// pay by the butt's worth and the run of hits. A minute and twenty arrows; the
// browser plays it live and the server replays the stored inputs to score it,
// so only + − × ÷ and a fixed order (a test checks). Pure. Numbers: rules.ts.
// Course: course.ts.

import * as rules from "./rules";
import { appleUp, targetAt, windAt } from "./course";
import type { ArcheryArrow, ArcheryCourse, ArcheryDetail, ArcheryEventKind, ArcheryInput, ArcheryRing, ArcheryState } from "@/types/archery";
import type { ArcadeResult } from "@/types/arcade";

const {
  APPLE_BONUS, APPLE_R, ARROWS, BULL_POINTS, CHAIN_MAX, DRAW_K, FIELD_END, FIELD_START, GRAVITY, INNER_POINTS, LAUNCH_X, LAUNCH_Y,
  MAX_DRAW, MAX_INPUTS, MAX_TICKS, MIN_DX, MIN_DY, NOCK_TICKS, OUTER_POINTS, PERFECT_BONUS, RING_BULL, RING_INNER, RING_OUTER,
  RUN_TICKS, TICKS_PER_SEC, TIME_BONUS_PER_SEC, WIND_K,
} = rules;

export function initArchery(): ArcheryState {
  return {
    tick: 0, arrows: [], quiver: ARROWS, nockAt: 0, points: 0, hits: 0, bulls: 0, apple: false,
    chain: 0, bestChain: 0, lastLand: 0, log: [], done: false,
  };
}

/** A pull the bow can make: whole numbers, forward, not too low, no longer than a full draw. */
export const validAim = (dx: number, dy: number): boolean =>
  Number.isInteger(dx) && Number.isInteger(dy) && dx >= MIN_DX && dy >= MIN_DY && dx * dx + dy * dy <= MAX_DRAW * MAX_DRAW;

/** An arrow is on the string and the bell hasn't gone. */
export const canLoose = (st: ArcheryState): boolean => !st.done && st.tick < RUN_TICKS && st.quiver > 0 && st.tick >= st.nockAt;

export const ringOf = (off: number): ArcheryRing | null => {
  const d = off < 0 ? -off : off;
  return d <= RING_BULL ? "bull" : d <= RING_INNER ? "inner" : d <= RING_OUTER ? "outer" : null;
};
const RING_POINTS: Record<ArcheryRing, number> = { bull: BULL_POINTS, inner: INNER_POINTS, outer: OUTER_POINTS };

/** A new arrow leaving the bow. */
export const launch = (dx: number, dy: number, at: number): ArcheryArrow =>
  ({ x: LAUNCH_X, y: LAUNCH_Y, vx: dx * DRAW_K, vy: dy * DRAW_K, at, state: "fly", target: -1, dy: 0 });

/** What one tick of flight ran into: a butt (and where on its face), the apple, the ground, or nothing. */
export type FlightHit = { k: "target"; i: number; off: number } | { k: "apple" } | { k: "ground" } | { k: "gone" } | null;

/**
 * Move a flying arrow one tick (wind, then gravity, then the step) and say what
 * it hit on the way: the first thing its step crossed. Butts are tested where
 * they are this tick and the last, so a rolling cart can't be skipped through.
 */
export function flyStep(a: ArcheryArrow, course: ArcheryCourse, tick: number, withApple: boolean): FlightHit {
  const px = a.x, py = a.y;
  a.vx += windAt(course, tick) * WIND_K;
  a.vy -= GRAVITY;
  const nx = px + a.vx, ny = py + a.vy;
  let best = 2, hit: FlightHit = null;
  const targets = course.targets;
  for (let i = 0; i < targets.length; i++) {
    const was = targetAt(targets[i], tick), now = targetAt(targets[i], tick + 1);
    // Sides of the face's plane, before and after (relative to a moving face).
    const s0 = px - was.x, s1 = nx - now.x;
    if ((s0 < 0 && s1 < 0) || (s0 > 0 && s1 > 0) || s0 === s1) continue;
    const f = s0 / (s0 - s1);
    if (f >= best) continue;
    const off = py + (ny - py) * f - (was.y + (now.y - was.y) * f);
    if (off < -RING_OUTER || off > RING_OUTER) continue;
    best = f; hit = { k: "target", i, off };
  }
  if (withApple) {
    const ap = course.apple;
    const s0 = px - ap.x, s1 = nx - ap.x;
    if (!((s0 < 0 && s1 < 0) || (s0 > 0 && s1 > 0) || s0 === s1)) {
      const f = s0 / (s0 - s1);
      const off = py + (ny - py) * f - ap.y;
      if (f < best && off >= -APPLE_R && off <= APPLE_R) { best = f; hit = { k: "apple" }; }
    }
  }
  if (ny <= 0 && py > 0) {
    const f = py / (py - ny);
    if (f < best) { best = f; hit = { k: "ground" }; }
  }
  if (hit) {
    // Stop where it struck.
    a.x = px + (nx - px) * best;
    a.y = py + (ny - py) * best;
    return hit;
  }
  a.x = nx; a.y = ny;
  if (nx > FIELD_END || nx < FIELD_START) return { k: "gone" };
  return null;
}

function log(st: ArcheryState, k: ArcheryEventKind, arrow: number, extra: { target?: number; points?: number; chain?: number } = {}): void {
  st.log.push({ k, at: st.tick, arrow, ...extra });
}

function miss(st: ArcheryState, i: number): void {
  st.chain = 0;
  st.lastLand = st.tick;
  log(st, "miss", i);
}

function scoreHit(st: ArcheryState, i: number, kind: ArcheryEventKind, base: number, target?: number): void {
  st.chain = Math.min(CHAIN_MAX, st.chain + 1);
  if (st.chain > st.bestChain) st.bestChain = st.chain;
  st.hits++;
  st.lastLand = st.tick;
  const pts = base * st.chain;
  st.points += pts;
  log(st, kind, i, { target, points: pts, chain: st.chain });
}

/** One tick: this tick's loose, then every arrow in the air (in loosing order), then the clock. */
export function stepArchery(st: ArcheryState, course: ArcheryCourse, inputs: readonly ArcheryInput[]): void {
  if (st.done) return;
  for (const inp of inputs) {
    if (inp.k !== "loose" || !canLoose(st) || !validAim(inp.dx, inp.dy)) continue;
    st.quiver--;
    st.nockAt = st.tick + NOCK_TICKS;
    st.arrows.push(launch(inp.dx, inp.dy, st.tick));
    log(st, "loose", st.arrows.length - 1);
  }

  const withApple = !st.apple && appleUp(course, st.tick);
  let flying = 0;
  for (let i = 0; i < st.arrows.length; i++) {
    const a = st.arrows[i];
    if (a.state !== "fly") continue;
    const hit = flyStep(a, course, st.tick, withApple && !st.apple);
    if (!hit) { flying++; continue; }
    if (hit.k === "target") {
      const ring = ringOf(hit.off)!;
      a.state = "stuck"; a.target = hit.i; a.dy = hit.off;
      if (ring === "bull") st.bulls++;
      scoreHit(st, i, ring, RING_POINTS[ring] * course.targets[hit.i].worth, hit.i);
    } else if (hit.k === "apple") {
      a.state = "apple";
      st.apple = true;
      scoreHit(st, i, "apple", APPLE_BONUS);
    } else {
      a.state = hit.k;
      miss(st, i);
    }
  }

  st.tick++;
  const spent = st.quiver === 0 || st.tick >= RUN_TICKS;
  if ((spent && flying === 0) || st.tick >= MAX_TICKS) {
    // The bell: whatever is still up is lost.
    for (let i = 0; i < st.arrows.length; i++) if (st.arrows[i].state === "fly") { st.arrows[i].state = "gone"; miss(st, i); }
    st.done = true;
  }
}

/** The run's counts. */
export const archeryDetail = (st: ArcheryState): ArcheryDetail => ({
  hits: st.hits, bulls: st.bulls, apple: st.apple ? 1 : 0, arrows: st.arrows.length, chain: st.bestChain,
});

/** The run's points: the hits, a little for every second left once the last arrow came down, a quarter more if every arrow hit. */
export function scoreArchery(st: ArcheryState): ArcadeResult {
  const perfect = st.done && st.hits === ARROWS;
  const left = st.quiver === 0 ? Math.max(0, RUN_TICKS - st.lastLand) : 0;
  const base = st.points + Math.floor(left / TICKS_PER_SEC) * TIME_BONUS_PER_SEC;
  return { score: base + (perfect ? Math.round(base * PERFECT_BONUS) : 0), ticks: st.tick, perfect, detail: { ...archeryDetail(st) } };
}

/** Inputs as the server accepts them: loose only, real pulls, before the bell, in order, not too many. Null if not. */
export function cleanArcheryInputs(raw: unknown): ArcheryInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: ArcheryInput[] = [];
  let last = -1;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t), dx = Number(o?.dx), dy = Number(o?.dy);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= RUN_TICKS) return null;
    if (o.k !== "loose" || !validAim(dx, dy)) return null;
    last = t;
    out.push({ t, k: "loose", dx, dy });
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayArchery(course: ArcheryCourse, inputs: readonly ArcheryInput[]): { state: ArcheryState; result: ArcadeResult } {
  const st = initArchery();
  let k = 0;
  while (!st.done) {
    const now: ArcheryInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepArchery(st, course, now);
  }
  return { state: st, result: scoreArchery(st) };
}

export function archeryHash(st: ArcheryState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  mix(st.tick); mix(st.quiver); mix(st.nockAt); mix(st.points); mix(st.hits); mix(st.bulls); mix(st.apple ? 1 : 0);
  mix(st.chain); mix(st.bestChain); mix(st.lastLand);
  for (const a of st.arrows) {
    mix(Math.round(a.x * 10000)); mix(Math.round(a.y * 10000)); mix(a.at); mix(a.target);
    mix(a.state === "stuck" ? 1 : a.state === "ground" ? 2 : a.state === "gone" ? 3 : a.state === "apple" ? 4 : 0);
  }
  return (h >>> 0).toString(16);
}
