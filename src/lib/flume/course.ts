// Log Flume's daily course, the same for everyone that day (flumeCourseFor): the
// river section (a centreline and half-width every 60 px: bends, a narrows, a
// pool), rocks that never close the channel nor leave a log-trapping slot by a bank, a band or two of rapids, the mill's
// three gates (one a spillway, one the saw the golden birch wants), and the 24
// logs: kind, where each enters and when, coming faster as the run goes on.
// Pure, and only + − × ÷ and sqrt (a test checks).

import {
  FIELD_W, FIRST_AT, FLUME_EPOCH, LAST_AT, LOGS, LOG_KINDS, MILL_Y, MIN_GAP, MIN_HALF_WIDTH, OAK_SHARE, POST_R,
} from "./rules";
import { hashSeed, makeRng } from "../arcade/rng";
import { dayNumber } from "../arcade/days";
import type { FlumeCourse, FlumeLogKind, FlumeRiverPoint, FlumeRock } from "@/types/flume";

const STEP = 60;
const OAK_R = LOG_KINDS.oak.radius;

export const flumeNumber = (day: string): number => dayNumber(FLUME_EPOCH, day);

/** The river at height y: centreline, half-width, and how the centreline leans (dx per dy). */
export function riverAt(river: readonly FlumeRiverPoint[], y: number): { cx: number; hw: number; slope: number } {
  if (y <= river[0].y) return { cx: river[0].cx, hw: river[0].hw, slope: 0 };
  for (let i = 1; i < river.length; i++) {
    const a = river[i - 1], b = river[i];
    if (y <= b.y) {
      const f = (y - a.y) / (b.y - a.y), slope = (b.cx - a.cx) / (b.y - a.y);
      return { cx: a.cx + (b.cx - a.cx) * f, hw: a.hw + (b.hw - a.hw) * f, slope };
    }
  }
  const z = river[river.length - 1];
  return { cx: z.cx, hw: z.hw, slope: 0 };
}

/** The mill's gates at MILL_Y: each one's span (x0, x1), and the posts between them. */
export function gatesOf(course: Pick<FlumeCourse, "river">): { spans: { x0: number; x1: number }[]; posts: FlumeRock[] } {
  const { cx, hw } = riverAt(course.river, MILL_Y);
  const w = (2 * hw) / 3, left = cx - hw;
  return {
    spans: [0, 1, 2].map((i) => ({ x0: left + i * w, x1: left + (i + 1) * w })),
    posts: [1, 2].map((i) => ({ x: left + i * w, y: MILL_Y, r: POST_R })),
  };
}

/** The widest free stretch across the river at y, for an oak's middle (banks and rocks kept an oak's width off). */
export function freeGap(course: Pick<FlumeCourse, "river" | "rocks">, y: number): { x0: number; x1: number } {
  const { cx, hw } = riverAt(course.river, y);
  let spans = [{ x0: cx - hw + OAK_R, x1: cx + hw - OAK_R }];
  for (const r of course.rocks) {
    const R = r.r + OAK_R + 2, dy = y - r.y;
    if (dy * dy >= R * R) continue;
    const h = Math.sqrt(R * R - dy * dy), b0 = r.x - h, b1 = r.x + h;
    spans = spans.flatMap((s) => [{ x0: s.x0, x1: Math.min(s.x1, b0) }, { x0: Math.max(s.x0, b1), x1: s.x1 }]).filter((s) => s.x1 > s.x0);
  }
  let best = { x0: cx, x1: cx };
  for (const s of spans) if (s.x1 - s.x0 > best.x1 - best.x0) best = s;
  return best;
}

/** The water beside a rock, each side, out to the bank (negative: the rock runs into the bank). */
export function roomBeside(course: Pick<FlumeCourse, "river">, r: FlumeRock): { left: number; right: number } {
  const { cx, hw } = riverAt(course.river, r.y);
  return { left: r.x - r.r - (cx - hw), right: cx + hw - (r.x + r.r) };
}
/** Room an oak can pass through (anything narrower beside a rock would trap logs). */
const PASS = 2 * OAK_R + 8;
const noTrap = (course: Pick<FlumeCourse, "river">, r: FlumeRock): boolean => {
  const { left, right } = roomBeside(course, r);
  return (left <= 0 || left >= PASS) && (right <= 0 || right >= PASS);
};

/** Is there always a channel at least MIN_GAP wide from the top to the mill? */
export function passable(course: Pick<FlumeCourse, "river" | "rocks">): boolean {
  for (let y = 0; y < MILL_Y - 20; y += 4) { const g = freeGap(course, y); if (g.x1 - g.x0 < MIN_GAP) return false; }
  return true;
}

function buildRiver(rnd: () => number): FlumeRiverPoint[] {
  const out: FlumeRiverPoint[] = [];
  const narrows = 2 + Math.floor(rnd() * 4), pool = (narrows + 2 + Math.floor(rnd() * 3)) % 8 + 1;
  let cx = FIELD_W / 2 + (rnd() - 0.5) * 40;
  for (let k = 0; k <= 9; k++) {
    let hw = 78 + rnd() * 30;
    if (k === narrows) hw = MIN_HALF_WIDTH + rnd() * 8;
    if (k === pool) hw = 118 + rnd() * 14;
    cx += (rnd() - 0.5) * 70;
    cx = Math.max(hw + 8, Math.min(FIELD_W - hw - 8, cx));
    out.push({ y: -STEP + k * STEP, cx: Math.round(cx), hw: Math.round(hw) });
  }
  // The mill sits on a steady stretch: the last points line up.
  out[8] = { ...out[8], cx: out[7].cx };
  out[9] = { ...out[9], cx: out[7].cx, hw: out[8].hw };
  return out;
}

/** The day's course; `salt` is the server's secret (so it can't be known early). */
export function flumeCourseFor(day: string, salt = ""): FlumeCourse {
  for (let attempt = 0; ; attempt++) {
    const seed = hashSeed(`flume:${salt}${day}:${attempt}`);
    const rnd = makeRng(seed);
    const river = buildRiver(rnd);
    // Rocks, one at a time, each kept only if the channel stays open.
    const rocks: FlumeRock[] = [];
    const want = 4 + Math.floor(rnd() * 4);
    for (let tries = 0; rocks.length < want && tries < 80; tries++) {
      const y = 60 + rnd() * (MILL_Y - 130), { cx, hw } = riverAt(river, y);
      const r = 10 + Math.floor(rnd() * 9), x = cx + (rnd() * 2 - 1) * (hw - r);
      const rock = { x: Math.round(x), y: Math.round(y), r };
      if (noTrap({ river }, rock) && passable({ river, rocks: [...rocks, rock] })) rocks.push(rock);
    }
    if (rocks.length < 4 && attempt < 30) continue;
    const r0 = 40 + Math.floor(rnd() * 150);
    const rapids = [{ y0: r0, y1: r0 + 50 + Math.floor(rnd() * 40) }];
    if (rnd() < 0.5) { const r1 = rapids[0].y1 + 40 + Math.floor(rnd() * 60); if (r1 + 50 < MILL_Y - 20) rapids.push({ y0: r1, y1: r1 + 50 }); }
    const spillway = Math.floor(rnd() * 3);
    const saws = [0, 1, 2].filter((g) => g !== spillway);
    const birchSaw = saws[Math.floor(rnd() * 2)];
    // The logs: one golden birch mid-run, the rest pine or oak; gaps shrinking as it goes.
    const birchAt = 6 + Math.floor(rnd() * 14);
    const weights = Array.from({ length: LOGS - 1 }, (_, i) => 1.3 - (0.6 * i) / (LOGS - 2) + (rnd() - 0.5) * 0.3);
    const total = weights.reduce((s, w) => s + w, 0);
    const top = riverAt(river, 0);
    let at = FIRST_AT;
    const logs = Array.from({ length: LOGS }, (_, i) => {
      const kind: FlumeLogKind = i === birchAt ? "birch" : rnd() < OAK_SHARE ? "oak" : "pine";
      const x = Math.round(top.cx + (rnd() * 2 - 1) * (top.hw - 20));
      const log = { kind, x, at: Math.round(at) };
      if (i < LOGS - 1) at += ((LAST_AT - FIRST_AT) * weights[i]) / total;
      return log;
    });
    return { day, number: flumeNumber(day), seed, river, rocks, rapids, mill: { spillway, birchSaw }, logs };
  }
}
