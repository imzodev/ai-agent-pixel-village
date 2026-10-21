// Whistle's daily course: one per UTC day, the same for everyone, built from
// the day's seed (courseFor). The flock starts at the bottom and the pen sits
// at the top, its gate in the bottom wall; in between, one of a few layouts.
// Every course is checked: a sheep can walk from the start into the pen
// (reachable), or the layout is rolled again. Pure.

import { FIELD_H, FIELD_W, SHEEP_COUNT, SHEEP_R, WHISTLE_EPOCH } from "./rules";
import { hashSeed, makeRng } from "./rng";
import type { Course, CourseTemplate, WPoint, WRect } from "@/types/whistle";

const DAY_MS = 86_400_000;
const TEMPLATES: readonly CourseTemplate[] = ["meadow", "river", "lanes", "pond"];
const PEN_W = 84, PEN_H = 52, WALL = 4, GATE = 36;
/** Obstacles stay between the pen and the start. */
const TOP = 110, BOTTOM = 390;

/** "2026-10-21" for a time. */
export const whistleDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
/** "Whistle #N": 1 on WHISTLE_EPOCH. */
export const whistleNumber = (day: string): number => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${WHISTLE_EPOCH}T00:00:00Z`)) / DAY_MS) + 1;
/** ms until the next course starts. */
export const msToNextCourse = (ms: number): number => DAY_MS - (ms % DAY_MS);
/** The Monday (UTC) a day's week starts on. */
export function weekOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return whistleDay(t - dow * DAY_MS);
}

const overlaps = (a: WRect, b: WRect, pad = 0): boolean =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
export const inRect = (r: WRect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const int = (n: number) => Math.round(n);

/** The pen: its inside, and walls round it with the gate in the bottom wall. */
function penAt(px: number, gateX: number): { pen: WRect; walls: WRect[] } {
  const pen = { x: px, y: 24, w: PEN_W, h: PEN_H };
  const by = pen.y + pen.h;
  return {
    pen,
    walls: [
      { x: px - WALL, y: pen.y - WALL, w: PEN_W + 2 * WALL, h: WALL },
      { x: px - WALL, y: pen.y, w: WALL, h: PEN_H + WALL },
      { x: px + PEN_W, y: pen.y, w: WALL, h: PEN_H + WALL },
      { x: px, y: by, w: gateX - px, h: WALL },
      { x: gateX + GATE, y: by, w: px + PEN_W - gateX - GATE, h: WALL },
    ].filter((r) => r.w > 0),
  };
}

/** A hedge somewhere in the middle, not on anything already placed. */
function hedges(rnd: () => number, n: number, taken: WRect[], out: WRect[]): void {
  for (let tries = 0; out.length < n && tries < 60; tries++) {
    const w = int(30 + rnd() * 44), h = int(10 + rnd() * 8);
    const r = { x: int(8 + rnd() * (FIELD_W - 16 - w)), y: int(TOP + rnd() * (BOTTOM - TOP - h)), w, h };
    if ([...taken, ...out].some((t) => overlaps(t, r, 22))) continue;
    out.push(r);
  }
}

/** A line across the field with one gap (a fence, or a river with a bridge). */
function across(y: number, h: number, gapX: number, gapW: number): WRect[] {
  return [{ x: 0, y, w: gapX, h }, { x: gapX + gapW, y, w: FIELD_W - gapX - gapW, h }].filter((r) => r.w > 0);
}

function layout(template: CourseTemplate, rnd: () => number): { walls: WRect[]; water: WRect[] } {
  const walls: WRect[] = [], water: WRect[] = [];
  if (template === "meadow") {
    hedges(rnd, 4 + Math.floor(rnd() * 3), [], walls);
  } else if (template === "river") {
    const y = int(200 + rnd() * 70), h = int(22 + rnd() * 10), bw = int(38 + rnd() * 8);
    const a = int(12 + rnd() * 90), b = int(150 + rnd() * (FIELD_W - 162 - bw));
    water.push({ x: 0, y, w: a, h }, { x: a + bw, y, w: b - a - bw, h }, { x: b + bw, y, w: FIELD_W - b - bw, h });
    hedges(rnd, 2, water, walls);
  } else if (template === "lanes") {
    const gw = int(48 + rnd() * 14), leftFirst = rnd() < 0.5;
    const g1 = leftFirst ? int(10 + rnd() * 40) : int(FIELD_W - 10 - gw - rnd() * 40);
    const g2 = leftFirst ? int(FIELD_W - 10 - gw - rnd() * 40) : int(10 + rnd() * 40);
    walls.push(...across(int(170 + rnd() * 20), 6, g1, gw), ...across(int(290 + rnd() * 30), 6, g2, gw));
  } else {
    const w = int(80 + rnd() * 40), h = int(60 + rnd() * 30);
    water.push({ x: int((FIELD_W - w) / 2 + (rnd() - 0.5) * 70), y: int(200 + rnd() * 60), w, h });
    hedges(rnd, 2 + Math.floor(rnd() * 2), water, walls);
  }
  return { walls, water };
}

const CELL = 5;
/** Can a sheep walk from the start into the pen? (A flood fill on a 5-unit grid.) */
export function reachable(c: Pick<Course, "start" | "pen" | "walls" | "water">): boolean {
  const cols = Math.ceil(FIELD_W / CELL), rows = Math.ceil(FIELD_H / CELL);
  const solid = [...c.walls, ...c.water];
  const free = (i: number, j: number): boolean => {
    const x = i * CELL + CELL / 2, y = j * CELL + CELL / 2;
    if (x < SHEEP_R || y < SHEEP_R || x > FIELD_W - SHEEP_R || y > FIELD_H - SHEEP_R) return false;
    return !solid.some((r) => x > r.x - SHEEP_R && x < r.x + r.w + SHEEP_R && y > r.y - SHEEP_R && y < r.y + r.h + SHEEP_R);
  };
  const seen = new Uint8Array(cols * rows);
  const si = Math.floor(c.start.x / CELL), sj = Math.floor(c.start.y / CELL);
  if (!free(si, sj)) return false;
  const queue = [si + sj * cols];
  seen[queue[0]] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % cols, j = (k - i) / cols;
    if (inRect(c.pen, i * CELL + CELL / 2, j * CELL + CELL / 2)) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nk = ni + nj * cols;
      if (seen[nk] || !free(ni, nj)) continue;
      seen[nk] = 1;
      queue.push(nk);
    }
  }
  return false;
}

/** How many wolves: one early in the week, up to three on Sunday. */
const wolvesOn = (day: string): number => 1 + Math.floor(((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) / 3);

/**
 * The day's course. `salt` is the server's secret (whistleServer.ts courseOf),
 * so nobody can work out tomorrow's course from this code and practise it early.
 */
export function courseFor(day: string, salt = ""): Course {
  for (let attempt = 0; ; attempt++) {
    const seed = hashSeed(`whistle:${salt}${day}:${attempt}`);
    const rnd = makeRng(seed);
    const template = TEMPLATES[Math.floor(rnd() * TEMPLATES.length)];
    const px = int(20 + rnd() * (FIELD_W - 40 - PEN_W));
    const gateX = int(px + 6 + rnd() * (PEN_W - 12 - GATE));
    const pen = penAt(px, gateX);
    const start: WPoint = { x: int(70 + rnd() * (FIELD_W - 140)), y: FIELD_H - 64 };
    const { walls, water } = layout(template, rnd);
    const n = wolvesOn(day);
    const dens: WPoint[] = [];
    for (let i = 0; i < n; i++) {
      const left = (i + Math.floor(rnd() * 2)) % 2 === 0;
      let d: WPoint = { x: left ? 12 : FIELD_W - 12, y: int(TOP + 20 + rnd() * (BOTTOM - TOP - 60)) };
      for (let k = 0; k < 10 && [...walls, ...water].some((r) => inRect({ x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 }, d.x, d.y)); k++) d = { x: d.x, y: d.y + 24 };
      dens.push(d);
    }
    const course: Course = {
      day, number: whistleNumber(day), template, seed, start, pen: pen.pen,
      walls: [...pen.walls, ...walls], water, dens, sheep: SHEEP_COUNT,
    };
    if (reachable(course) || attempt > 20) return course;
  }
}
