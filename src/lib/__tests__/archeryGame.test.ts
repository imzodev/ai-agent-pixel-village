import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_TARGET_X, appleUp, archeryCourseFor, archeryCourseSolvable, targetAt, windAt } from "../archery/course";
import { archeryHash, canLoose, cleanArcheryInputs, flyStep, initArchery, launch, replayArchery, ringOf, scoreArchery, stepArchery, validAim } from "../archery/sim";
import {
  APPLE_BONUS, ARCHERY_EPOCH, ARROWS, BULL_POINTS, CHAIN_MAX, MAX_DRAW, MAX_TICKS, NOCK_TICKS, RING_OUTER, RUN_TICKS, WIND_MAX, WIND_SEGS,
} from "../archery/rules";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import { cosmoByKey } from "../cosmetics";
import type { ArcheryCourse, ArcheryInput } from "@/types/archery";

const DAY = "2026-10-30";

/**
 * Where a pull loosed at `tick` meets the plane of a point that moves as
 * `aimAt(tick)` says (a butt or the apple), ignoring everything else: how far
 * above (+) or below the arrow passes it, or null if it never gets there.
 */
function passOff(course: ArcheryCourse, dx: number, dy: number, tick: number, aimAt: (t: number) => { x: number; y: number }): number | null {
  const bare = { ...course, targets: [] };
  const a = launch(dx, dy, tick);
  for (let t = tick; t < tick + 300; t++) {
    const px = a.x, py = a.y, was = aimAt(t);
    const hit = flyStep(a, bare, t, false);
    const now = aimAt(t + 1);
    const s0 = px - was.x, s1 = a.x - now.x;
    if (s0 <= 0 && s1 > 0) {
      const f = s0 / (s0 - s1);
      return py + (a.y - py) * f - (was.y + (now.y - was.y) * f);
    }
    if (hit) return null;
  }
  return null;
}

/** The pull that passes closest to the point's centre (a coarse sweep of the grid, then a fine one round the best). */
function bestPull(course: ArcheryCourse, tick: number, aimAt: (t: number) => { x: number; y: number }): { dx: number; dy: number; off: number } {
  let best = { dx: 200, dy: 200, off: 1e9 };
  const tryPull = (dx: number, dy: number) => {
    if (!validAim(dx, dy)) return;
    const off = passOff(course, dx, dy, tick, aimAt);
    if (off !== null && Math.abs(off) < Math.abs(best.off)) best = { dx, dy, off };
  };
  // Flat-ish shots, so the arrow doesn't lob into a nearer butt.
  for (let dx = 120; dx <= MAX_DRAW; dx += 10) for (let dy = 0; dy <= 260; dy += 10) tryPull(dx, dy);
  const c = best;
  for (let dx = c.dx - 10; dx <= c.dx + 10; dx++) for (let dy = c.dy - 10; dy <= c.dy + 10; dy++) tryPull(dx, dy);
  return best;
}

/** A steady archer: one arrow at a time, round the butts from the nearest, aimed with the wind known. */
function archer(course: ArcheryCourse, shots = ARROWS): ArcheryInput[] {
  const st = initArchery(), out: ArcheryInput[] = [];
  let n = 0;
  while (!st.done) {
    const now: ArcheryInput[] = [];
    const busy = st.arrows.some((a) => a.state === "fly");
    if (!busy && n < shots && canLoose(st)) {
      const tg = course.targets[n % course.targets.length];
      const p = bestPull(course, st.tick, (t) => targetAt(tg, t));
      now.push({ t: st.tick, k: "loose", dx: p.dx, dy: p.dy });
      n++;
    }
    stepArchery(st, course, now);
    out.push(...now);
  }
  return out;
}

describe("archery course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(archeryCourseFor(DAY)).toEqual(archeryCourseFor(DAY));
    expect(archeryCourseFor(DAY).seed).not.toBe(archeryCourseFor("2026-10-31").seed);
    expect(archeryCourseFor(DAY, "salt").seed).not.toBe(archeryCourseFor(DAY).seed);
  });

  it("lays out a usable range every day of a year, the King's butt only at weekends", () => {
    const winds = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 30 + d));
      const c = archeryCourseFor(day);
      expect(archeryCourseSolvable(c), day).toBe(true);
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(c.targets.some((t) => t.kind === "king"), day).toBe(dow === 0 || dow === 6);
      expect(c.wind.length).toBe(WIND_SEGS);
      expect(c.targets.every((t) => Math.max(t.x0, t.x1) <= MAX_TARGET_X)).toBe(true);
      winds.add(c.wind.join(","));
    }
    expect(winds.size).toBeGreaterThan(300);
  });

  it("moves hoists and carts back and forth between their ends, and leaves posts still", () => {
    for (let d = 0; d < 30; d++) {
      const c = archeryCourseFor(arcadeDay(Date.UTC(2026, 9, 30 + d)));
      for (const t of c.targets) {
        for (let tick = 0; tick < MAX_TICKS; tick += 7) {
          const p = targetAt(t, tick);
          expect(p.x).toBeGreaterThanOrEqual(Math.min(t.x0, t.x1) - 1e-9);
          expect(p.x).toBeLessThanOrEqual(Math.max(t.x0, t.x1) + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(Math.min(t.y0, t.y1) - 1e-9);
          expect(p.y).toBeLessThanOrEqual(Math.max(t.y0, t.y1) + 1e-9);
        }
        if (t.kind === "post" || t.kind === "king") expect(targetAt(t, 123)).toEqual(targetAt(t, 0));
        else {
          const far = targetAt(t, t.period - t.phase + t.period / 2);
          expect(far.x).toBeCloseTo(t.x1, 9);
          expect(far.y).toBeCloseTo(t.y1, 9);
        }
      }
    }
  });

  it("puts every butt in reach: a pull finds its middle, with the day's wind, any time", () => {
    for (let d = 0; d < 7; d++) {
      const c = archeryCourseFor(arcadeDay(Date.UTC(2026, 9, 30 + d)));
      for (const t of c.targets) {
        for (const tick of [0, 700, 1500]) {
          const p = bestPull(c, tick, (k) => targetAt(t, k));
          expect(Math.abs(p.off), `${c.day} ${t.kind}@${t.x0} at ${tick}`).toBeLessThan(0.05);
        }
      }
    }
  });
});

describe("archery run", () => {
  it("scores rings by the butt's worth and the run of hits", () => {
    expect(ringOf(0)).toBe("bull");
    expect(ringOf(-0.3)).toBe("inner");
    expect(ringOf(0.7)).toBe("outer");
    expect(ringOf(RING_OUTER + 0.01)).toBeNull();
    const c = archeryCourseFor(DAY), inputs = archer(c);
    const { state: st } = replayArchery(c, inputs);
    const hits = st.log.filter((e) => e.k === "bull" || e.k === "inner" || e.k === "outer");
    expect(hits.length).toBeGreaterThan(ARROWS * 0.8);
    for (const e of hits) {
      const ring = e.k as "bull" | "inner" | "outer";
      const base = { bull: BULL_POINTS, inner: 6, outer: 3 }[ring] * c.targets[e.target!].worth;
      expect(e.points).toBe(base * e.chain!);
      expect(e.chain).toBeLessThanOrEqual(CHAIN_MAX);
    }
  });

  it("replays exactly (golden run: changing the rules or the range changes this hash)", () => {
    const c = archeryCourseFor(DAY), inputs = archer(c);
    const a = replayArchery(c, inputs), b = replayArchery(c, inputs);
    expect(archeryHash(a.state)).toBe(archeryHash(b.state));
    expect({ hash: archeryHash(a.state), inputs: inputs.length, ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "apple": 0,
          "arrows": 20,
          "bulls": 20,
          "chain": 4,
          "hits": 20,
        },
        "hash": "3e76ecc3",
        "inputs": 20,
        "perfect": true,
        "score": 2668,
        "ticks": 973,
      }
    `);
  });

  it("nocks between shots, holds twenty arrows, and stops loosing at the bell", () => {
    const c = archeryCourseFor(DAY), st = initArchery();
    stepArchery(st, c, [{ t: 0, k: "loose", dx: 300, dy: 100 }]);
    expect(st.quiver).toBe(ARROWS - 1);
    stepArchery(st, c, [{ t: 1, k: "loose", dx: 300, dy: 100 }]);
    expect(st.quiver).toBe(ARROWS - 1);
    while (st.tick < NOCK_TICKS) stepArchery(st, c, []);
    expect(canLoose(st)).toBe(true);
    st.quiver = 3; st.tick = RUN_TICKS - 1; st.nockAt = 0;
    stepArchery(st, c, [{ t: st.tick, k: "loose", dx: 300, dy: 100 }]);
    expect(st.quiver).toBe(2);
    expect(canLoose(st)).toBe(false);
  });

  it("refuses a pull the bow can't make", () => {
    expect(validAim(MAX_DRAW, 0)).toBe(true);
    expect(validAim(MAX_DRAW, 1)).toBe(false);
    expect(validAim(0, 100)).toBe(false);
    expect(validAim(100, -101)).toBe(false);
    expect(validAim(100.5, 10)).toBe(false);
    const c = archeryCourseFor(DAY), st = initArchery();
    stepArchery(st, c, [{ t: 0, k: "loose", dx: 999, dy: 999 }]);
    expect(st.arrows).toHaveLength(0);
  });

  it("pays the golden apple once, only while it's on the hat", () => {
    const c = archeryCourseFor(DAY);
    const at = (_t: number) => ({ x: c.apple.x, y: c.apple.y });
    // Before the apple is up, the same shot sails past the hat.
    const early = bestPull(c, 0, at);
    const st0 = initArchery();
    stepArchery(st0, c, [{ t: 0, k: "loose", dx: early.dx, dy: early.dy }]);
    while (!st0.done && st0.arrows[0].state === "fly") stepArchery(st0, c, []);
    expect(st0.apple).toBe(false);
    // While it's up: shoot it (from a state with the clock there).
    const t = c.apple.from + 10;
    expect(appleUp(c, t)).toBe(true);
    const p = bestPull(c, t, at);
    const st = initArchery();
    st.tick = t;
    stepArchery(st, c, [{ t, k: "loose", dx: p.dx, dy: p.dy }]);
    while (st.arrows[0].state === "fly") stepArchery(st, c, []);
    if (st.arrows[0].state === "apple") {
      expect(st.apple).toBe(true);
      expect(st.points).toBe(APPLE_BONUS);
    } else {
      // A butt in front took it first: a hit all the same.
      expect(st.arrows[0].state).toBe("stuck");
    }
  });

  it("follows the day's wind: the same pull lands further downwind", () => {
    const c = archeryCourseFor(DAY);
    const calm = { ...c, targets: [], wind: c.wind.map(() => 0) }, tail = { ...calm, wind: c.wind.map(() => WIND_MAX) };
    const land = (course: ArcheryCourse) => { const a = launch(280, 200, 0); let t = 0; while (!flyStep(a, course, t, false)) t++; return a.x; };
    expect(land(tail)).toBeGreaterThan(land(calm) + 1);
    expect(windAt(c, 0)).toBe(c.wind[0]);
    expect(windAt(c, 1e6)).toBe(c.wind[c.wind.length - 1]);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanArcheryInputs([{ t: 0, k: "loose", dx: 300, dy: 100 }, { t: 30, k: "loose", dx: 200, dy: 50 }])).toHaveLength(2);
    expect(cleanArcheryInputs([{ t: 5, k: "loose", dx: 300, dy: 100 }, { t: 4, k: "loose", dx: 300, dy: 100 }])).toBeNull();
    expect(cleanArcheryInputs([{ t: 0, k: "loose", dx: 300.5, dy: 100 }])).toBeNull();
    expect(cleanArcheryInputs([{ t: 0, k: "loose", dx: 400, dy: 400 }])).toBeNull();
    expect(cleanArcheryInputs([{ t: 0, k: "draw", dx: 300, dy: 100 }])).toBeNull();
    expect(cleanArcheryInputs([{ t: RUN_TICKS, k: "loose", dx: 300, dy: 100 }])).toBeNull();
    expect(cleanArcheryInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = archeryCourseFor(DAY), inputs = archer(c);
    replayArchery(c, inputs);
    const t0 = performance.now();
    replayArchery(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["archery/sim.ts", "archery/course.ts", "archery/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("archery in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.archery, c = g.courseFor(DAY, "") as ArcheryCourse;
    const r = g.replay(c, archer(c, 4));
    expect(Object.keys(r.detail).sort()).toEqual(["apple", "arrows", "bulls", "chain", "hits"]);
    expect(scoreArchery(replayArchery(c, []).state).score).toBe(0);
    expect(g.describe({ detail: { hits: 14, bulls: 5, apple: 1 } })).toBe("14/20 hits, 5 bulls, the golden apple");
    expect(g.describe({ detail: { hits: 9, bulls: 1, apple: 0 } })).toBe("9/20 hits, 1 bull");
    expect(g.describe({ detail: { hits: 0, bulls: 0, apple: 0 } })).toBe("0/20 hits");
    expect(courseNumber("archery", ARCHERY_EPOCH)).toBe(1);
  });

  it("gives a prize that can be worn and never sold", () => {
    const prize = cosmoByKey(ARCADE_GAMES.archery.prize.cosmetic);
    expect(prize).toBeDefined();
    expect(prize!.coinPrice).toBe(0);
    expect(prize!.gemPrice).toBe(0);
  });
});
