// Fishing Derby's run: cast where the fish are, wait for one to come and nibble,
// strike on the bite, then reel against the line's tension: hold while it rests,
// ease off while it runs (too tight snaps the line, too slack and it throws the
// hook). 75 seconds; a fish on the line at the bell may still be landed. The
// browser plays it live and the server replays the stored inputs to score it,
// so only + − × ÷ and sqrt, its own random state, a fixed order (a test checks).
// Pure. Numbers: rules.ts. Course: course.ts.

import * as rules from "./rules";
import { inPond, spotInPond } from "./course";
import { nextState, stateValue } from "../arcade/rng";
import type { DerbyCourse, DerbyDetail, DerbyEnd, DerbyFish, DerbyInput, DerbyState } from "@/types/derby";
import type { ArcadeResult } from "@/types/arcade";

const {
  BITE_R, BITE_WINDOW, CATCH_BONUS, DERBY_FISH, DT, EASE, FIELD_H, FIELD_W, FLIGHT_TICKS, HOOK_TENSION, LAND_R, MAX_INPUTS,
  MAX_TICKS, MIN_REEL, NIBBLE_MIN, NIBBLE_SPAN, NOTICE_R, PERFECT_BONUS, PULL_T, RECOVER_TICKS, REED_PULL, REEL_DRAG,
  REEL_SPEED, REEL_T, REST_MIN, REST_PULL, REST_SPAN, RUN_MIN, RUN_SPAN, RUN_SPEED, RUN_TICKS, SCARE_R, SETTLE_TICKS,
  SHORE_GAP, SHY_TICKS, SLACK_AT, SLACK_HOLD, SLACK_TICKS, TIP, TROPHY_NOTICE, TROPHY_STAY, TURN,
} = rules;

const STATUS: DerbyFish["status"][] = ["hidden", "swim", "engaged", "hooked", "caught", "lost", "gone"];

/** The run's own random numbers (advanced in a fixed order, so replays agree). */
function rand(st: DerbyState): number {
  st.rng = nextState(st.rng);
  return stateValue(st.rng);
}

export function initDerby(course: DerbyCourse): DerbyState {
  return {
    tick: 0, rng: course.seed ^ 0x5bd1e995,
    fish: course.fish.map((f) => ({ x: f.x, y: f.y, c: 1, s: 0, tx: f.x, ty: f.y, status: f.appearAt > 0 ? "hidden" : "swim", shyUntil: 0, biteAt: -1 })),
    phase: "idle", phaseAt: 0, bx: TIP.x, by: TIP.y, target: -1, reeling: false, tension: 0, slackTicks: 0,
    running: false, fightUntil: 0, caught: [], lost: 0, last: null, done: false,
  };
}

const trophyIndex = (course: DerbyCourse): number => course.fish.length - 1;

/** Can a cast land at (x, y) now? In the water, with the line idle or waiting (a recast). */
export const canCast = (st: DerbyState, course: DerbyCourse, x: number, y: number): boolean =>
  !st.done && st.tick < RUN_TICKS && (st.phase === "idle" || st.phase === "waiting") && inPond(course.pond, x, y);

/** Is there anything to strike at (the bobber's out)? */
export const canStrike = (st: DerbyState): boolean => !st.done && (st.phase === "waiting" || st.phase === "bite");

function setPhase(st: DerbyState, phase: DerbyState["phase"]): void {
  st.phase = phase;
  st.phaseAt = st.tick;
}

/** The fish swims off and keeps away from bobbers a while. */
function spook(st: DerbyState, course: DerbyCourse, i: number): void {
  const f = st.fish[i];
  if (f.status === "engaged") f.status = "swim";
  f.shyUntil = st.tick + SHY_TICKS;
  f.biteAt = -1;
  const p = spotInPond(course.pond, () => rand(st), SHORE_GAP);
  f.tx = p.x; f.ty = p.y;
}

/** End the cast (how, and which fish), then a moment before the next. */
function endCast(st: DerbyState, k: DerbyEnd, fish: number): void {
  st.last = { k, at: st.tick, fish };
  st.target = -1;
  st.tension = 0;
  st.slackTicks = 0;
  setPhase(st, "recover");
}

/** Turn toward (tx, ty) and swim on at `speed`; stay in the water. True when there. */
function swimTo(f: DerbyFish, course: DerbyCourse, tx: number, ty: number, speed: number, gap: number): boolean {
  const dx = tx - f.x, dy = ty - f.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 2) return true;
  let c = f.c + (dx / d - f.c) * TURN, s = f.s + (dy / d - f.s) * TURN;
  const len = Math.sqrt(c * c + s * s);
  if (len > 1e-6) { c /= len; s /= len; } else { c = dx / d; s = dy / d; }
  f.c = c; f.s = s;
  const step = Math.min(d, speed * DT), nx = f.x + c * step, ny = f.y + s * step;
  if (inPond(course.pond, nx, ny, gap)) { f.x = nx; f.y = ny; return false; }
  return true; // the shore's in the way: pick somewhere else
}

function updateFish(st: DerbyState, course: DerbyCourse): void {
  const trophy = trophyIndex(course);
  const waiting = st.phase === "waiting" && st.tick - st.phaseAt >= SETTLE_TICKS;
  // A still bobber draws the nearest fish that isn't shy.
  if (waiting && st.target < 0) {
    let best = -1, bestD = 0;
    for (let i = 0; i < st.fish.length; i++) {
      const f = st.fish[i];
      if (f.status !== "swim" || st.tick < f.shyUntil) continue;
      const r = NOTICE_R * (i === trophy ? TROPHY_NOTICE : 1);
      const d2 = (f.x - st.bx) * (f.x - st.bx) + (f.y - st.by) * (f.y - st.by);
      if (d2 <= r * r && (best < 0 || d2 < bestD)) { best = i; bestD = d2; }
    }
    if (best >= 0) { st.fish[best].status = "engaged"; st.fish[best].biteAt = -1; st.target = best; }
  }
  for (let i = 0; i < st.fish.length; i++) {
    const f = st.fish[i], def = DERBY_FISH[course.fish[i].key];
    if (f.status === "hidden") {
      if (st.tick >= course.fish[i].appearAt) f.status = "swim";
      continue;
    }
    if (i === trophy && f.status === "swim" && st.tick >= course.fish[i].appearAt + TROPHY_STAY) { f.status = "gone"; continue; }
    if (f.status === "swim") {
      if (swimTo(f, course, f.tx, f.ty, def.speed, SHORE_GAP)) {
        const p = spotInPond(course.pond, () => rand(st), SHORE_GAP);
        f.tx = p.x; f.ty = p.y;
      }
    } else if (f.status === "engaged") {
      const d2 = (f.x - st.bx) * (f.x - st.bx) + (f.y - st.by) * (f.y - st.by);
      if (d2 > BITE_R * BITE_R) swimTo(f, course, st.bx, st.by, def.speed * 0.7, 0);
      else if (f.biteAt < 0) f.biteAt = st.tick + NIBBLE_MIN + Math.floor(rand(st) * NIBBLE_SPAN);
      else if (st.tick >= f.biteAt && st.phase === "waiting") setPhase(st, "bite");
    }
  }
}

/** How hard the hooked fish pulls now. */
function pullOf(st: DerbyState, course: DerbyCourse): number {
  const f = st.fish[st.target], cf = course.fish[st.target], def = DERBY_FISH[cf.key];
  const size = def.maxG > def.minG ? (cf.grams - def.minG) / (def.maxG - def.minG) : 0;
  let fight = def.fight * (0.6 + 0.4 * size);
  for (const r of course.reeds) if ((f.x - r.x) * (f.x - r.x) + (f.y - r.y) * (f.y - r.y) <= r.r * r.r) { fight *= REED_PULL; break; }
  if (st.tick >= st.fightUntil) {
    st.running = !st.running;
    const strong = 0.6 + def.fight * 0.6;
    st.fightUntil = st.tick + (st.running ? Math.round((RUN_MIN + rand(st) * RUN_SPAN) * strong) : REST_MIN + Math.floor(rand(st) * REST_SPAN));
  }
  return st.running ? fight : fight * REST_PULL;
}

function reel(st: DerbyState, course: DerbyCourse): void {
  const i = st.target, f = st.fish[i];
  const pull = pullOf(st, course);
  const dx = TIP.x - f.x, dy = TIP.y - f.y, d = Math.sqrt(dx * dx + dy * dy);
  const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : -1;
  if (st.reeling) {
    st.tension += (REEL_T + PULL_T * pull) * DT;
    const step = Math.max(MIN_REEL, REEL_SPEED * (1 - REEL_DRAG * pull)) * DT;
    f.x += ux * step; f.y += uy * step;
  } else {
    st.tension += (pull * SLACK_HOLD - st.tension) * Math.min(1, EASE * DT);
    if (st.running) {
      const step = RUN_SPEED * pull * DT, nx = f.x - ux * step, ny = f.y - uy * step;
      if (inPond(course.pond, nx, ny, 4)) { f.x = nx; f.y = ny; }
    }
  }
  // It faces where it's going: away on a run, toward you otherwise.
  f.c = st.running && !st.reeling ? -ux : ux; f.s = st.running && !st.reeling ? -uy : uy;
  if (st.tension >= 1) { f.status = "lost"; st.lost++; endCast(st, "snap", i); return; }
  st.slackTicks = st.tension < SLACK_AT ? st.slackTicks + 1 : 0;
  if (st.slackTicks >= SLACK_TICKS) { f.status = "lost"; st.lost++; endCast(st, "thrown", i); return; }
  if (d - REEL_SPEED * DT <= LAND_R) { f.status = "caught"; f.x = TIP.x; f.y = TIP.y; st.caught.push(i); endCast(st, "caught", i); }
}

/** One tick: this tick's inputs, the line, the fish, the fight, the clock. */
export function stepDerby(st: DerbyState, course: DerbyCourse, inputs: readonly DerbyInput[]): void {
  if (st.done) return;
  for (const inp of inputs) {
    if (inp.k === "reel") st.reeling = inp.v === 1;
    else if (inp.k === "cast") {
      if (!canCast(st, course, inp.x, inp.y)) continue;
      if (st.phase === "waiting" && st.target >= 0) spook(st, course, st.target);
      st.target = -1;
      st.bx = inp.x; st.by = inp.y;
      setPhase(st, "flight");
    } else if (inp.k === "strike") {
      if (st.phase === "bite") {
        const f = st.fish[st.target];
        f.status = "hooked";
        st.tension = HOOK_TENSION; st.slackTicks = 0;
        st.running = false; st.fightUntil = st.tick; // it bolts on the first tick
        setPhase(st, "reel");
      } else if (st.phase === "waiting") {
        const t = st.target;
        if (t >= 0) spook(st, course, t);
        endCast(st, "early", t);
      }
    }
  }

  if (st.phase === "flight" && st.tick - st.phaseAt >= FLIGHT_TICKS) {
    // The splash frightens fish right under it.
    for (let i = 0; i < st.fish.length; i++) {
      const f = st.fish[i];
      if (f.status === "swim" && (f.x - st.bx) * (f.x - st.bx) + (f.y - st.by) * (f.y - st.by) <= SCARE_R * SCARE_R) spook(st, course, i);
    }
    setPhase(st, "waiting");
  }
  if (st.phase === "recover" && st.tick - st.phaseAt >= RECOVER_TICKS) setPhase(st, "idle");

  updateFish(st, course);

  if (st.phase === "bite" && st.tick - st.phaseAt >= BITE_WINDOW) {
    const t = st.target;
    spook(st, course, t);
    endCast(st, "stolen", t);
  }
  if (st.phase === "reel") reel(st, course);

  st.tick++;
  const busy = st.phase === "reel" || st.phase === "bite";
  if ((st.tick >= RUN_TICKS && !busy) || st.tick >= MAX_TICKS) {
    if (st.phase === "reel") { st.fish[st.target].status = "lost"; st.lost++; st.last = { k: "timeout", at: st.tick, fish: st.target }; }
    st.done = true;
  }
}

export function derbyDetail(st: DerbyState, course: DerbyCourse): DerbyDetail {
  let grams = 0;
  for (const i of st.caught) grams += course.fish[i].grams;
  return { caught: st.caught.length, grams, lost: st.lost, trophy: st.caught.includes(trophyIndex(course)) ? 1 : 0 };
}

/** Grams landed plus a bonus a fish; a quarter more for the trophy with nothing lost. */
export function scoreDerby(st: DerbyState, course: DerbyCourse): ArcadeResult {
  const d = derbyDetail(st, course);
  const base = d.grams + d.caught * CATCH_BONUS;
  const perfect = st.done && d.trophy === 1 && d.lost === 0;
  return { score: base + (perfect ? Math.round(base * PERFECT_BONUS) : 0), ticks: st.tick, perfect, detail: { ...d } };
}

/** Inputs as the server accepts them: known kinds, whole numbers, ticks in order, not too many. Null if not. */
export function cleanDerbyInputs(raw: unknown): DerbyInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: DerbyInput[] = [];
  let last = -1;
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    const t = Number(o?.t);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= MAX_TICKS) return null;
    last = t;
    if (o.k === "strike") out.push({ t, k: "strike" });
    else if (o.k === "reel") {
      const v = Number(o.v);
      if (v !== 0 && v !== 1) return null;
      out.push({ t, k: "reel", v });
    } else if (o.k === "cast") {
      const x = Number(o.x), y = Number(o.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > FIELD_W || y < 0 || y > FIELD_H) return null;
      out.push({ t, k: "cast", x, y });
    } else return null;
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayDerby(course: DerbyCourse, inputs: readonly DerbyInput[]): { state: DerbyState; result: ArcadeResult } {
  const st = initDerby(course);
  let k = 0;
  while (!st.done) {
    const now: DerbyInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepDerby(st, course, now);
  }
  return { state: st, result: scoreDerby(st, course) };
}

export function derbyHash(st: DerbyState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (Math.round(n * 1000) | 0), 16777619); };
  mix(st.tick); mix(st.rng); mix(st.tension); mix(st.lost);
  for (const f of st.fish) { mix(f.x); mix(f.y); mix(f.c); mix(f.s); mix(STATUS.indexOf(f.status)); }
  for (const i of st.caught) mix(i);
  return (h >>> 0).toString(16);
}
