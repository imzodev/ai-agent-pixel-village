// Log Flume's run: Ansel's logs come down the river section one after another,
// carried by the current; hold one and it slides sideways toward your pointer at
// its own speed. Rocks bounce a log (or split it, hit too hard), banks slow it,
// a log stalled anywhere is out (beached), logs shove each other, and at the bottom
// the mill's three gates take them: two saws, one spillway. The browser plays it
// and the server replays the stored inputs to score it, so only + − × ÷ and sqrt,
// a fixed order (a test checks). Pure. Numbers: rules.ts. Course: course.ts.

import * as rules from "./rules";
import { gatesOf, riverAt, roomBeside } from "./course";
import type { FlumeCourse, FlumeDetail, FlumeEvent, FlumeInput, FlumeLog, FlumeState } from "@/types/flume";
import type { ArcadeResult } from "@/types/arcade";

const {
  BANK_SLOW, BEACH_TICKS, BIRCH_BONUS, BOUNCE, CURRENT, DRAG, DT, ENTER_Y, FIELD_W, LOG_KINDS, MAX_INPUTS, MILL_Y,
  PERFECT_BONUS, RAPIDS, RUN_TICKS, SPLIT_FLOW, SPLIT_REACH, SPLIT_SPEED, STALL_SPEED, STEER_GAIN,
} = rules;

export function initFlume(course: FlumeCourse): FlumeState {
  return {
    tick: 0,
    logs: course.logs.map((l) => ({ x: l.x, y: ENTER_Y, vx: 0, vy: 0, status: "waiting", stall: 0, gate: -1 })),
    held: -1, holdX: 0, points: 0, log: [], done: false,
  };
}

const kindOf = (course: FlumeCourse, i: number) => LOG_KINDS[course.logs[i].kind];
const afloat = (l: FlumeLog) => l.status === "afloat";

/** Can log `i` be taken hold of now? */
export const canGrab = (st: FlumeState, i: number): boolean => !st.done && i >= 0 && i < st.logs.length && afloat(st.logs[i]);

function event(st: FlumeState, k: FlumeEvent["k"], log: number, points?: number): void {
  st.log.push(points === undefined ? { k, at: st.tick, log } : { k, at: st.tick, log, points });
}

/** Take log i off the river (milled, split, beached, spilled, too late), and let go of it. */
function resolve(st: FlumeState, i: number, status: FlumeLog["status"]): void {
  st.logs[i].status = status;
  st.logs[i].vx = 0; st.logs[i].vy = 0;
  if (st.held === i) st.held = -1;
}

/**
 * The current at (x, y): along the river, faster in the rapids, and just
 * upstream of a rock or post it splits around it (sideways, away from its
 * middle), so a log drifting onto one slides off instead of pinning there.
 */
function currentAt(course: FlumeCourse, x: number, y: number, round: readonly { x: number; y: number; r: number }[]): { cx: number; cy: number } {
  const { slope } = riverAt(course.river, y);
  let speed = CURRENT;
  for (const r of course.rapids) if (y >= r.y0 && y <= r.y1) { speed *= RAPIDS; break; }
  const len = Math.sqrt(slope * slope + 1);
  let cx = (slope / len) * speed;
  for (const o of round) {
    const dy = o.y - y, dx = x - o.x, reach = o.r + SPLIT_REACH;
    if (dy < 0 || dy > reach + 20 || dx * dx >= reach * reach) continue;
    // Away from its middle, unless that side's shut (the rock meets the bank there): then round the other side.
    const room = roomBeside(course, o);
    const side = room.left <= 0 ? 1 : room.right <= 0 ? -1 : dx >= 0 ? 1 : -1;
    cx += side * speed * SPLIT_FLOW * (1 - Math.abs(dx) / reach);
  }
  return { cx, cy: speed / len };
}

/** A log against a round obstacle (a rock or a post): bounced off it, or split on a rock hit too hard. */
function hitRound(st: FlumeState, course: FlumeCourse, i: number, ox: number, oy: number, or: number, canSplit: boolean): void {
  const l = st.logs[i], k = kindOf(course, i);
  // The point on the log's spine nearest the obstacle (the log lies along the flow).
  const py = Math.max(l.y - k.halfLen, Math.min(l.y + k.halfLen, oy));
  let nx = l.x - ox, ny = py - oy;
  const d2 = nx * nx + ny * ny, min = or + k.radius;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  if (d > 1e-6) { nx /= d; ny /= d; } else { nx = l.x >= ox ? 1 : -1; ny = 0; }
  const into = -(l.vx * nx + l.vy * ny);
  if (canSplit && into > SPLIT_SPEED) { resolve(st, i, "split"); event(st, "split", i); return; }
  l.x += nx * (min - d); l.y += ny * (min - d);
  if (into > 0) {
    l.vx += (1 + BOUNCE) * into * nx; l.vy += (1 + BOUNCE) * into * ny;
    if (into > 30) event(st, "bump", i);
  }
}

/** Two logs shoved apart (heavier ones give less). Both lie along the flow: compare their spines. */
function shove(course: FlumeCourse, st: FlumeState, a: number, b: number): void {
  const la = st.logs[a], lb = st.logs[b], ka = kindOf(course, a), kb = kindOf(course, b);
  const dx = lb.x - la.x, dyRaw = lb.y - la.y;
  const gap = Math.max(0, Math.abs(dyRaw) - ka.halfLen - kb.halfLen);
  const dy = dyRaw >= 0 ? gap : -gap;
  const d2 = dx * dx + dy * dy, min = ka.radius + kb.radius;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : a < b ? 1 : -1, ny = d > 1e-6 ? dy / d : 0;
  const push = min - d, wa = kb.mass / (ka.mass + kb.mass), wb = 1 - wa;
  la.x -= nx * push * wa; la.y -= ny * push * wa;
  lb.x += nx * push * wb; lb.y += ny * push * wb;
  const rel = (lb.vx - la.vx) * nx + (lb.vy - la.vy) * ny;
  if (rel < 0) { la.vx += nx * rel * wa; la.vy += ny * rel * wa; lb.vx -= nx * rel * wb; lb.vy -= ny * rel * wb; }
}

/** Through the bottom line: which gate it's in decides milled or spilled. */
function atMill(st: FlumeState, course: FlumeCourse, i: number, spans: { x0: number; x1: number }[]): void {
  const l = st.logs[i];
  let gate = 0;
  for (let g = 0; g < spans.length; g++) if (l.x >= spans[g].x0) gate = g;
  l.gate = gate;
  if (gate === course.mill.spillway) { resolve(st, i, "spilled"); event(st, "spilled", i); return; }
  const k = kindOf(course, i);
  const points = course.logs[i].kind === "birch" && gate === course.mill.birchSaw ? BIRCH_BONUS : k.points;
  st.points += points;
  resolve(st, i, "milled");
  event(st, "milled", i, points);
}

/** One tick: this tick's inputs, logs arriving, the current and steering, rocks, banks, each other, the mill. */
export function stepFlume(st: FlumeState, course: FlumeCourse, inputs: readonly FlumeInput[]): void {
  if (st.done) return;
  for (const inp of inputs) {
    if (inp.k === "grab") { if (canGrab(st, inp.log)) { st.held = inp.log; st.holdX = inp.x; } }
    else if (inp.k === "move") st.holdX = inp.x;
    else st.held = -1;
  }

  for (let i = 0; i < st.logs.length; i++) {
    const l = st.logs[i];
    if (l.status === "waiting" && st.tick >= course.logs[i].at) { l.status = "afloat"; event(st, "enter", i); }
  }

  const { spans, posts } = gatesOf(course);
  const round = [...course.rocks, ...posts];
  for (let i = 0; i < st.logs.length; i++) {
    const l = st.logs[i];
    if (!afloat(l)) continue;
    const k = kindOf(course, i);
    const cur = currentAt(course, l.x, l.y + kindOf(course, i).halfLen, round);
    l.vx += (cur.cx - l.vx) * DRAG;
    l.vy += (cur.cy - l.vy) * DRAG;
    if (st.held === i) {
      const want = (st.holdX - l.x) * STEER_GAIN;
      l.vx = cur.cx + Math.max(-k.latSpeed, Math.min(k.latSpeed, want));
    }
    l.x += l.vx * DT;
    l.y += l.vy * DT;

    for (const r of course.rocks) { hitRound(st, course, i, r.x, r.y, r.r, true); if (!afloat(l)) break; }
    if (!afloat(l)) continue;
    for (const p of posts) hitRound(st, course, i, p.x, p.y, p.r, false);

    // The banks hold it in, and slow it. Stalled anywhere (on a bank, pinned on a rock) long enough, it's out.
    const { cx, hw } = riverAt(course.river, l.y);
    const left = cx - hw + k.radius, right = cx + hw - k.radius;
    let onBank = false;
    if (l.x < left) { l.x = left; if (l.vx < 0) l.vx = 0; onBank = true; }
    else if (l.x > right) { l.x = right; if (l.vx > 0) l.vx = 0; onBank = true; }
    if (onBank) { l.vx *= BANK_SLOW; l.vy *= BANK_SLOW; }
    const speed2 = l.vx * l.vx + l.vy * l.vy;
    l.stall = speed2 < STALL_SPEED * STALL_SPEED ? l.stall + 1 : 0;
    if (l.stall >= BEACH_TICKS) { resolve(st, i, "beached"); event(st, "beached", i); continue; }
    if (l.x < -40 || l.x > FIELD_W + 40) { resolve(st, i, "beached"); event(st, "beached", i); continue; }
    if (l.y - k.halfLen > MILL_Y) atMill(st, course, i, spans);
  }

  for (let a = 0; a < st.logs.length; a++) {
    if (!afloat(st.logs[a])) continue;
    for (let b = a + 1; b < st.logs.length; b++) if (afloat(st.logs[b])) shove(course, st, a, b);
  }

  st.tick++;
  const allIn = st.logs.every((l) => l.status !== "waiting" && l.status !== "afloat");
  if (allIn || st.tick >= RUN_TICKS) {
    for (let i = 0; i < st.logs.length; i++) if (st.logs[i].status === "afloat" || st.logs[i].status === "waiting") resolve(st, i, "late");
    st.done = true;
  }
}

export function flumeDetail(st: FlumeState, course: FlumeCourse): FlumeDetail {
  let milled = 0, split = 0, lost = 0, birch = 0;
  st.logs.forEach((l, i) => {
    if (l.status === "milled") { milled++; if (course.logs[i].kind === "birch" && l.gate === course.mill.birchSaw) birch = 1; }
    else if (l.status === "split") split++;
    else lost++;
  });
  return { milled, split, lost, birch };
}

/** What the mill paid; a quarter more when every log was milled. */
export function scoreFlume(st: FlumeState, course: FlumeCourse): ArcadeResult {
  const d = flumeDetail(st, course);
  const perfect = st.done && d.milled === st.logs.length;
  return { score: st.points + (perfect ? Math.round(st.points * PERFECT_BONUS) : 0), ticks: st.tick, perfect, detail: { ...d } };
}

/** Inputs as the server accepts them: known kinds, whole numbers, ticks in order, not too many. Null if not. */
export function cleanFlumeInputs(raw: unknown): FlumeInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INPUTS) return null;
  const out: FlumeInput[] = [];
  let last = -1;
  for (const x of raw) {
    const o = x as Record<string, unknown>;
    const t = Number(o?.t);
    if (!Number.isInteger(t) || t < last || t < 0 || t >= RUN_TICKS) return null;
    last = t;
    if (o.k === "drop") { out.push({ t, k: "drop" }); continue; }
    const px = Number(o.x);
    if (!Number.isInteger(px) || px < -50 || px > FIELD_W + 50) return null;
    if (o.k === "move") out.push({ t, k: "move", x: px });
    else if (o.k === "grab") {
      const log = Number(o.log);
      if (!Number.isInteger(log) || log < 0 || log >= rules.LOGS) return null;
      out.push({ t, k: "grab", log, x: px });
    } else return null;
  }
  return out;
}

/** Play a whole run from its inputs (the server's check, and the replays). */
export function replayFlume(course: FlumeCourse, inputs: readonly FlumeInput[]): { state: FlumeState; result: ArcadeResult } {
  const st = initFlume(course);
  let k = 0;
  while (!st.done) {
    const now: FlumeInput[] = [];
    while (k < inputs.length && inputs[k].t < st.tick) k++;
    while (k < inputs.length && inputs[k].t === st.tick) now.push(inputs[k++]);
    stepFlume(st, course, now);
  }
  return { state: st, result: scoreFlume(st, course) };
}

const STATUS: FlumeLog["status"][] = ["waiting", "afloat", "milled", "split", "beached", "spilled", "late"];
export function flumeHash(st: FlumeState): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (Math.round(n * 1000) | 0), 16777619); };
  mix(st.tick); mix(st.points); mix(st.held);
  for (const l of st.logs) { mix(l.x); mix(l.y); mix(l.vx); mix(l.vy); mix(STATUS.indexOf(l.status)); mix(l.gate); }
  return (h >>> 0).toString(16);
}
