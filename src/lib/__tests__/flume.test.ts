import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { flumeCourseFor, freeGap, gatesOf, passable, riverAt, roomBeside } from "../flume/course";
import { canGrab, cleanFlumeInputs, flumeDetail, flumeHash, initFlume, replayFlume, scoreFlume, stepFlume } from "../flume/sim";
import { BEACH_TICKS, BIRCH_BONUS, LOGS, LOG_KINDS, MILL_Y, MIN_GAP, RUN_TICKS } from "../flume/rules";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { addDays, arcadeDay } from "../arcade/days";
import type { FlumeCourse, FlumeInput, FlumeState } from "@/types/flume";

const DAY = "2026-10-25";

/**
 * A test pilot: always holds the lowest log not yet lined up, steering it to the
 * nearer saw (the birch to its own) and around rocks just ahead. Returns the
 * inputs that took effect (and the end state).
 */
function pilot(c: FlumeCourse): { inputs: FlumeInput[]; st: FlumeState } {
  const st = initFlume(c), out: FlumeInput[] = [];
  const { spans } = gatesOf(c);
  const saws = [0, 1, 2].filter((g) => g !== c.mill.spillway);
  const mid = (g: number) => (spans[g].x0 + spans[g].x1) / 2;
  const targetX = (i: number) => {
    const l = st.logs[i], k = LOG_KINDS[c.logs[i].kind];
    const gate = c.logs[i].kind === "birch" ? c.mill.birchSaw : saws.reduce((b, g) => (Math.abs(mid(g) - l.x) < Math.abs(mid(b) - l.x) ? g : b), saws[0]);
    let tx = mid(gate);
    for (const r of c.rocks) {
      if (r.y < l.y - 10 || r.y > l.y + 110) continue;
      const pad = r.r + k.radius + 8;
      if (Math.abs(tx - r.x) < pad || Math.abs(l.x - r.x) < pad) tx = l.x >= r.x ? r.x + pad : r.x - pad;
    }
    const { cx, hw } = riverAt(c.river, l.y + 30);
    return Math.round(Math.max(cx - hw + k.radius + 4, Math.min(cx + hw - k.radius - 4, tx)));
  };
  let held = -1, sentX = -999;
  while (!st.done) {
    const now: FlumeInput[] = [];
    if (held >= 0 && st.logs[held].status !== "afloat") held = -1;
    let pick = -1;
    st.logs.forEach((l, i) => {
      if (l.status !== "afloat") return;
      const lined = Math.abs(l.x - targetX(i)) < 4 && l.y > MILL_Y - 90;
      if (!lined && (pick < 0 || l.y > st.logs[pick].y)) pick = i;
    });
    if (pick >= 0 && pick !== held) { held = pick; sentX = targetX(pick); now.push({ t: st.tick, k: "grab", log: pick, x: sentX }); }
    else if (held >= 0) { const tx = targetX(held); if (tx !== sentX) { sentX = tx; now.push({ t: st.tick, k: "move", x: tx }); } }
    stepFlume(st, c, now);
    out.push(...now);
  }
  return { inputs: out, st };
}

/** Let the river run with no hands on it. */
const drift = (c: FlumeCourse) => replayFlume(c, []).state;
/** A plain course: a straight river, no rocks, no rapids, the given logs. */
const plain = (logs: FlumeCourse["logs"], extra: Partial<FlumeCourse> = {}): FlumeCourse => ({
  ...flumeCourseFor(DAY),
  river: Array.from({ length: 10 }, (_, k) => ({ y: -60 + k * 60, cx: 150, hw: 100 })),
  rocks: [], rapids: [], mill: { spillway: 2, birchSaw: 1 }, logs, ...extra,
});

describe("flume course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(flumeCourseFor(DAY)).toEqual(flumeCourseFor(DAY));
    expect(flumeCourseFor(DAY).seed).not.toBe(flumeCourseFor("2026-10-26").seed);
    expect(flumeCourseFor(DAY, "salt").seed).not.toBe(flumeCourseFor(DAY).seed);
  });

  it("always leaves a channel and no log traps; logs in order, one birch, one spillway (a year of days)", () => {
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 25 + d));
      const c = flumeCourseFor(day);
      expect(passable(c), day).toBe(true);
      expect(c.rocks.length, day).toBeGreaterThanOrEqual(4);
      for (const r of c.rocks) {
        const { left, right } = roomBeside(c, r);
        expect(left <= 0 || left >= 2 * LOG_KINDS.oak.radius + 8, day).toBe(true);
        expect(right <= 0 || right >= 2 * LOG_KINDS.oak.radius + 8, day).toBe(true);
      }
      expect(c.logs, day).toHaveLength(LOGS);
      for (let i = 1; i < c.logs.length; i++) expect(c.logs[i].at, day).toBeGreaterThan(c.logs[i - 1].at);
      expect(c.logs.filter((l) => l.kind === "birch"), day).toHaveLength(1);
      expect(c.mill.birchSaw, day).not.toBe(c.mill.spillway);
      const top = riverAt(c.river, 0);
      for (const l of c.logs) expect(Math.abs(l.x - top.cx), day).toBeLessThan(top.hw);
    }
    expect(MIN_GAP).toBeGreaterThan(2 * LOG_KINDS.oak.radius);
  });

  it("reads the river between its points", () => {
    const river = [{ y: 0, cx: 100, hw: 50 }, { y: 60, cx: 160, hw: 80 }];
    expect(riverAt(river, 30)).toEqual({ cx: 130, hw: 65, slope: 1 });
    const c = { river, rocks: [{ x: 130, y: 30, r: 10 }] };
    const g = freeGap(c, 30);
    expect(g.x1 - g.x0).toBeGreaterThan(30);
  });
});

describe("flume run", () => {
  it("replays exactly (golden run: changing the rules or the river changes this hash)", () => {
    const c = flumeCourseFor(DAY), { inputs } = pilot(c);
    const a = replayFlume(c, inputs), b = replayFlume(c, inputs);
    expect(flumeHash(a.state)).toBe(flumeHash(b.state));
    expect(a.result).toEqual(b.result);
    expect({ hash: flumeHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "birch": 1,
          "lost": 3,
          "milled": 19,
          "split": 2,
        },
        "hash": "d36b419e",
        "perfect": false,
        "score": 250,
        "ticks": 2000,
      }
    `);
  });

  it("carries a log down to the mill on its own; a saw mills it, the spillway loses it", () => {
    const saw = plain([{ kind: "pine", x: 150, at: 0 }]);
    const st = drift(saw);
    expect(st.logs[0].status).toBe("milled");
    expect(st.logs[0].gate).toBe(1);
    expect(st.points).toBe(LOG_KINDS.pine.points);
    const spill = drift(plain([{ kind: "pine", x: 210, at: 0 }]));
    expect(spill.logs[0].status).toBe("spilled");
    expect(spill.points).toBe(0);
  });

  it("steers a held log sideways at its own speed, oak slower than pine", () => {
    const sideways = (kind: "pine" | "oak") => {
      const c = plain([{ kind, x: 150, at: 0 }]), st = initFlume(c);
      stepFlume(st, c, []);
      stepFlume(st, c, [{ t: 1, k: "grab", log: 0, x: 60 }]);
      for (let i = 0; i < 15; i++) stepFlume(st, c, []);
      return 150 - st.logs[0].x;
    };
    expect(sideways("pine")).toBeGreaterThan(sideways("oak"));
    expect(sideways("oak")).toBeGreaterThan(10);
  });

  it("splits a log that hits a rock hard, bounces one that hits it gently", () => {
    const hit = (vx: number, vy: number) => {
      const c = plain([{ kind: "pine", x: 150, at: 0 }], { rocks: [{ x: 150, y: 200, r: 14 }] });
      const st = initFlume(c);
      stepFlume(st, c, []);
      // Just above the rock, moving into it.
      Object.assign(st.logs[0], { x: 150, y: 200 - 14 - LOG_KINDS.pine.halfLen - LOG_KINDS.pine.radius + 2, vx, vy });
      stepFlume(st, c, []);
      return st.logs[0];
    };
    expect(hit(0, 300).status).toBe("split");
    const soft = hit(0, 40);
    expect(soft.status).toBe("afloat");
    expect(soft.vy).toBeLessThan(40);
  });

  it("beaches a log that's barely moved for too long", () => {
    const c = plain([{ kind: "oak", x: 150, at: 0 }]), st = initFlume(c);
    stepFlume(st, c, []);
    Object.assign(st.logs[0], { vx: 0, vy: 0, stall: BEACH_TICKS - 1 });
    stepFlume(st, c, []);
    expect(st.logs[0].status).toBe("beached");
  });

  it("pays the golden birch its bonus only through its own saw", () => {
    const own = drift(plain([{ kind: "birch", x: 150, at: 0 }], { mill: { spillway: 2, birchSaw: 1 } }));
    expect(own.points).toBe(BIRCH_BONUS);
    const other = drift(plain([{ kind: "birch", x: 150, at: 0 }], { mill: { spillway: 2, birchSaw: 0 } }));
    expect(other.points).toBe(LOG_KINDS.birch.points);
  });

  it("only lets go of logs that are afloat, and ends with every log accounted for", () => {
    const c = flumeCourseFor(DAY), st = initFlume(c);
    expect(canGrab(st, 0)).toBe(false); // not there yet
    const end = drift(c);
    expect(end.done).toBe(true);
    expect(end.tick).toBeLessThanOrEqual(RUN_TICKS);
    const d = flumeDetail(end, c);
    expect(d.milled + d.split + d.lost).toBe(LOGS);
  });

  it("is worth steering: the pilot mills far more than the river alone (30 days)", () => {
    let piloted = 0, alone = 0;
    for (let n = 0; n < 30; n++) {
      const c = flumeCourseFor(addDays(DAY, n));
      piloted += flumeDetail(pilot(c).st, c).milled;
      alone += flumeDetail(drift(c), c).milled;
    }
    expect(piloted).toBeGreaterThan(alone * 1.2);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanFlumeInputs([{ t: 0, k: "grab", log: 0, x: 100 }, { t: 3, k: "move", x: 120 }, { t: 9, k: "drop" }])).toHaveLength(3);
    expect(cleanFlumeInputs([{ t: 5, k: "drop" }, { t: 4, k: "drop" }])).toBeNull();
    expect(cleanFlumeInputs([{ t: 0, k: "grab", log: LOGS, x: 100 }])).toBeNull();
    expect(cleanFlumeInputs([{ t: 0, k: "move", x: 10.5 }])).toBeNull();
    expect(cleanFlumeInputs([{ t: RUN_TICKS, k: "drop" }])).toBeNull();
    expect(cleanFlumeInputs([{ t: 0, k: "paddle" }])).toBeNull();
    expect(cleanFlumeInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = flumeCourseFor(DAY), { inputs } = pilot(c);
    replayFlume(c, inputs);
    const t0 = performance.now();
    replayFlume(c, inputs);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["flume/sim.ts", "flume/course.ts", "flume/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("flume in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.flume, c = g.courseFor(DAY, "") as FlumeCourse;
    const r = g.replay(c, pilot(c).inputs);
    expect(Object.keys(r.detail).sort()).toEqual(["birch", "lost", "milled", "split"]);
    expect(scoreFlume(drift(c), c).ticks).toBeGreaterThan(0);
    expect(g.describe({ detail: { milled: 18, split: 2, lost: 4, birch: 1 } })).toBe("18/24 milled, 2 split, the golden birch");
    expect(g.describe({ detail: { milled: 24, split: 0, lost: 0, birch: 0 } })).toBe("24/24 milled");
    expect(courseNumber("flume", "2026-10-25")).toBe(1);
  });
});
