import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catchCourseFor, catchCourseSolvable, isGood, landingOf, windAt } from "../catch/course";
import { catchHash, cleanCatchInputs, initCatch, multOf, replayCatch, scoreCatch, stepCatch } from "../catch/sim";
import {
  BASKET_CAP, CATCH_EPOCH, CHAIN_MAX, CHAIN_STEP, FRUIT, LAST_DROP_TICKS, PRESS_X, RUN_TICKS, STUN_TICKS, SUB, WASP_LAST_TICKS, WIND_MAX,
} from "../catch/rules";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import { cosmoByKey } from "../cosmetics";
import type { CatchCourse, CatchInput, CatchState } from "@/types/catch";

const DAY = "2026-11-02";
const SATURDAY = "2026-10-31";

type Picker = {
  /** Look again only every this many ticks (slow hands). */
  every?: number;
  /** Head for the press once the basket holds this many. */
  pressAt?: number;
  /** Aim this far off the landing (px). */
  off?: number;
};

/** A picker who knows where every good fruit lands: goes for the next one, and to the press when the basket fills. */
function picker(c: CatchCourse, p: Picker = {}): { inputs: CatchInput[]; state: CatchState } {
  const { every = 1, pressAt = BASKET_CAP, off = 0 } = p;
  const lands = c.drops.map((d) => (isGood(d.kind) ? landingOf(c, d) : null));
  const st = initCatch(), inputs: CatchInput[] = [];
  let sent = -1;
  while (!st.done) {
    let want = sent;
    if (st.tick % every === 0) {
      if (st.load >= pressAt) want = PRESS_X - 20;
      else {
        let best: { t: number; x: number } | null = null;
        for (let i = 0; i < lands.length; i++) {
          const l = lands[i];
          if (!l || l.t < st.tick) continue;
          const f = st.fruit[i];
          if (f && f.state !== "fall") continue;
          if (!best || l.t < best.t) best = l;
        }
        if (best) want = Math.round(best.x / SUB) + off;
      }
    }
    const now: CatchInput[] = [];
    if (want !== sent && want >= 0) { now.push({ t: st.tick, k: "to", x: Math.max(0, Math.min(480, want)) }); sent = want; }
    stepCatch(st, c, now);
    inputs.push(...now);
  }
  return { inputs, state: st };
}

describe("catch course", () => {
  it("is the same every time for a day, and differs between days and salts", () => {
    expect(catchCourseFor(DAY)).toEqual(catchCourseFor(DAY));
    expect(catchCourseFor(DAY).drops).not.toEqual(catchCourseFor("2026-11-03").drops);
    expect(catchCourseFor(DAY, "a").drops).not.toEqual(catchCourseFor(DAY, "b").drops);
  });

  it("lays out a fair orchard every day of a year: every good fruit in reach, one golden pear", () => {
    let d = new Date(`${CATCH_EPOCH}T00:00:00Z`);
    for (let i = 0; i < 366; i++) {
      const day = arcadeDay(d.getTime());
      const c = catchCourseFor(day, "salt");
      expect(catchCourseSolvable(c), day).toBe(true);
      expect(c.weekend).toBe([0, 6].includes(d.getUTCDay()));
      expect(c.drops.filter((x) => isGood(x.kind)).length).toBeGreaterThan(25);
      expect(c.drops.every((x) => x.at <= LAST_DROP_TICKS && (x.kind !== "wasp" || x.at <= WASP_LAST_TICKS))).toBe(true);
      expect(c.wind.every((w) => Math.abs(w) <= WIND_MAX)).toBe(true);
      d = new Date(d.getTime() + 86_400_000);
    }
  });

  it("shakes a tree before its fruit drops, and three times over on harvest day", () => {
    const c = catchCourseFor(SATURDAY);
    for (const d of c.drops) expect(c.shakes.some((s) => s.tree === d.tree && s.at < d.at)).toBe(true);
    const runs = c.shakes.filter((s, i) => i >= 2 && c.shakes[i - 1].tree === s.tree && c.shakes[i - 2].tree === s.tree);
    expect(runs.length).toBeGreaterThan(0);
  });
});

describe("catch run", () => {
  it("pays good fruit, more for every five in a row", () => {
    expect([0, 4, 5, 9, 10, 15, 40].map(multOf)).toEqual([1, 1, 2, 2, 3, 4, CHAIN_MAX]);
    const c = catchCourseFor(DAY);
    const { state } = picker(c, { pressAt: 8 });
    expect(state.caught).toBeGreaterThan(30);
    expect(state.bestStreak).toBeGreaterThanOrEqual(CHAIN_STEP);
    const catches = state.log.filter((e) => e.k === "catch");
    const paid = catches.reduce((s, e) => s + (e.points ?? 0), 0), plain = catches.reduce((s, e) => s + (e.points ?? 0) / (e.n ?? 1), 0);
    expect(paid).toBeGreaterThan(plain);
  });

  it("bounces fruit off a full basket, and the press empties it", () => {
    const c = catchCourseFor(DAY);
    const hoarder = picker(c, { pressAt: 99 }).state;
    expect(hoarder.log.some((e) => e.k === "bounce")).toBe(true);
    expect(hoarder.pressed).toBe(0);
    const tidy = picker(c, { pressAt: 8 }).state;
    expect(tidy.pressed).toBeGreaterThan(0);
    expect(tidy.caught).toBeGreaterThan(hoarder.caught);
  });

  it("a rotten apple costs and a wasp holds the basket still", () => {
    const c = catchCourseFor(DAY);
    const i = c.drops.findIndex((d) => d.kind === "wasp");
    expect(i).toBeGreaterThanOrEqual(0);
    // Sit under the wasp and nothing else.
    const l = landingOf(c, { ...c.drops[i], kind: "apple" });
    const st = initCatch();
    let stungAt = -1;
    while (!st.done && stungAt < 0) {
      stepCatch(st, c, st.tick === 0 ? [] : []);
      if (st.stings) stungAt = st.tick;
      if (st.tick > c.drops[i].at + 400) break;
      if (st.tick === 1) { st.target = 0; }
      // Follow the wasp itself.
      const w = st.fruit[i];
      if (w && w.state === "fall") st.target = Math.max(34 * SUB, Math.min(452 * SUB, w.x));
    }
    expect(l.t).toBeGreaterThan(0);
    expect(stungAt).toBeGreaterThan(0);
    const x = st.basketX;
    stepCatch(st, c, [{ t: st.tick, k: "to", x: 450 }]);
    expect(st.basketX).toBe(x);
    expect(st.stunUntil - stungAt).toBe(STUN_TICKS - 1);
    expect(FRUIT.rotten.points).toBeLessThan(0);
  });

  it("moves landings with the day's gusts", () => {
    const c = catchCourseFor(DAY);
    const d = c.drops.find((x) => x.kind === "apple")!;
    const calm = landingOf({ wind: c.wind.map(() => 0) }, d), gusty = landingOf({ wind: c.wind.map(() => 3) }, d);
    expect(gusty.x).toBeGreaterThan(calm.x);
    expect(windAt(c, 0)).toBe(c.wind[0]);
  });

  it("replays exactly (golden run: changing the rules or the orchard changes this hash)", () => {
    const c = catchCourseFor(SATURDAY);
    const live = picker(c, { pressAt: 8, every: 3, off: 4 });
    const again = replayCatch(c, live.inputs);
    expect(catchHash(again.state)).toBe(catchHash(live.state));
    expect({ hash: catchHash(again.state), inputs: live.inputs.length, ...again.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "caught": 38,
          "golden": 1,
          "missed": 10,
          "rotten": 1,
          "stings": 0,
          "streak": 8,
        },
        "hash": "2153b10f",
        "inputs": 51,
        "perfect": false,
        "score": 661,
        "ticks": 1800,
      }
    `);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanCatchInputs([{ t: 0, k: "to", x: 100 }, { t: 1, k: "to", x: 300 }])).toHaveLength(2);
    expect(cleanCatchInputs([{ t: 3, k: "to", x: 100 }, { t: 3, k: "to", x: 120 }])).toBeNull();
    expect(cleanCatchInputs([{ t: 0, k: "to", x: 100.5 }])).toBeNull();
    expect(cleanCatchInputs([{ t: 0, k: "to", x: 481 }])).toBeNull();
    expect(cleanCatchInputs([{ t: 0, k: "go", x: 100 }])).toBeNull();
    expect(cleanCatchInputs([{ t: RUN_TICKS, k: "to", x: 100 }])).toBeNull();
    expect(cleanCatchInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = catchCourseFor(DAY), { inputs } = picker(c, { pressAt: 8 });
    replayCatch(c, inputs);
    const t0 = performance.now();
    replayCatch(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["catch/sim.ts", "catch/course.ts", "catch/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh|sqrt)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("catch in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.catch, c = g.courseFor(DAY, "") as CatchCourse;
    const r = g.replay(c, picker(c, { pressAt: 8 }).inputs);
    expect(Object.keys(r.detail).sort()).toEqual(["caught", "golden", "missed", "rotten", "stings", "streak"]);
    expect(scoreCatch(replayCatch(c, []).state).score).toBeGreaterThanOrEqual(0);
    expect(g.describe({ detail: { caught: 42, golden: 1, stings: 2 } })).toBe("42 fruit caught, the golden pear, 2 stings");
    expect(g.describe({ detail: { caught: 9, golden: 0, stings: 1 } })).toBe("9 fruit caught, 1 sting");
    expect(courseNumber("catch", CATCH_EPOCH)).toBe(1);
  });

  it("gives a prize that can be worn and never sold", () => {
    const prize = cosmoByKey(ARCADE_GAMES.catch.prize.cosmetic);
    expect(prize).toBeDefined();
    expect(prize!.coinPrice).toBe(0);
    expect(prize!.gemPrice).toBe(0);
  });
});
