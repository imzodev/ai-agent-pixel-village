import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CELLS, LINES, cellIndex } from "../hive/board";
import { hiveCourseFor } from "../hive/course";
import { anyFits, canPlace, cellsFor, cleanHiveInputs, hiveHash, initHive, replayHive, scoreHive, stepHive } from "../hive/sim";
import { HONEY_PER_CELL, MIN_SINGLES, PIECES, RUN_TICKS, SHAPES, TICKS_PER_SEC, TIME_BONUS_PER_SEC, TRAY } from "../hive/rules";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import type { HiveCourse, HiveInput, HiveShapeKey, HiveState } from "@/types/hive";

const DAY = "2026-10-24"; // a Saturday: royal jelly
/** A plain course: no old comb, no flowers, the given pieces. */
const plain = (pieces: HiveShapeKey[], extra: Partial<HiveCourse> = {}): HiveCourse =>
  ({ ...hiveCourseFor(DAY), comb: [], flowers: [], jelly: null, pieces: [...pieces, ...Array<HiveShapeKey>(PIECES).fill("one")].slice(0, PIECES), ...extra });

/** A greedy player: every two seconds, the placement worth most right now (ties: the first slot, the first cell). */
function greedy(course: HiveCourse): HiveInput[] {
  const st = initHive(course), out: HiveInput[] = [];
  while (!st.done) {
    let best: HiveInput | null = null, bestGain = -1;
    if (st.tick % (2 * TICKS_PER_SEC) === 0) for (let s = 0; s < TRAY; s++) for (const [q, r] of CELLS) {
      if (!cellsFor(st, course, s, q, r)) continue;
      const trial: HiveState = structuredClone(st);
      stepHive(trial, course, [{ t: st.tick, k: "place", slot: s, q, r }]);
      if (trial.points - st.points > bestGain) { bestGain = trial.points - st.points; best = { t: st.tick, k: "place", slot: s, q, r }; }
    }
    const now = best ? [best] : [];
    stepHive(st, course, now);
    out.push(...now);
  }
  return out;
}

describe("hive board and course", () => {
  it("is a radius-3 hexagon: 37 cells, 21 lines of 4 to 7", () => {
    expect(CELLS).toHaveLength(37);
    expect(LINES).toHaveLength(21);
    expect(Math.min(...LINES.map((l) => l.length))).toBe(4);
    expect(Math.max(...LINES.map((l) => l.length))).toBe(7);
    expect(cellIndex(4, 0)).toBe(-1);
    expect(cellIndex(0, 0)).toBeGreaterThanOrEqual(0);
  });

  it("is the same every time for a day, and differs between days", () => {
    expect(hiveCourseFor(DAY)).toEqual(hiveCourseFor(DAY));
    expect(hiveCourseFor(DAY).seed).not.toBe(hiveCourseFor("2026-10-25").seed);
    expect(hiveCourseFor(DAY, "salt").seed).not.toBe(hiveCourseFor(DAY).seed);
  });

  it("puts old comb, flowers and the weekend's jelly on distinct cells, never a full line, and deals enough singles (a year of days)", () => {
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 24 + d));
      const c = hiveCourseFor(day);
      const marks = [...c.comb, ...c.flowers, ...(c.jelly ? [c.jelly] : [])].map(([q, r]) => cellIndex(q, r));
      expect(marks.every((i) => i >= 0), day).toBe(true);
      expect(new Set(marks).size, day).toBe(marks.length);
      const st = initHive(c);
      expect(LINES.some((l) => l.every((i) => st.filled[i])), day).toBe(false);
      expect(c.pieces, day).toHaveLength(PIECES);
      expect(c.pieces.filter((k) => k === "one").length, day).toBeGreaterThanOrEqual(MIN_SINGLES);
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(c.jelly !== null, day).toBe(dow === 0 || dow === 6);
    }
  });

  it("deals pieces whose cells all touch", () => {
    const touch = ([a, b]: readonly number[], [c, d]: readonly number[]) => { const dq = c - a, dr = d - b; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) === 1; };
    for (const s of Object.values(SHAPES)) {
      const seen = new Set([0]);
      for (let grew = true; grew;) { grew = false; s.cells.forEach((cell, i) => { if (!seen.has(i) && [...seen].some((j) => touch(cell, s.cells[j]))) { seen.add(i); grew = true; } }); }
      expect(seen.size, s.key).toBe(s.cells.length);
    }
  });
});

describe("hive run", () => {
  it("replays exactly (golden run: changing the rules or the deal changes this hash)", () => {
    const c = hiveCourseFor(DAY), inputs = greedy(c);
    const a = replayHive(c, inputs), b = replayHive(c, inputs);
    expect(hiveHash(a.state)).toBe(hiveHash(b.state));
    expect(a.result).toEqual(b.result);
    expect(a.result.detail.lines).toBeGreaterThan(5);
    expect({ hash: hiveHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "flowers": 5,
          "honey": 1989,
          "lines": 17,
          "placed": 36,
        },
        "hash": "7ea94ab2",
        "perfect": true,
        "score": 1989,
        "ticks": 700,
      }
    `);
  });

  it("fits a piece only on empty cells of the comb", () => {
    const c = plain(["duo_e"], { comb: [[0, 0]] }), st = initHive(c);
    expect(canPlace(st, c, 0, 0, 0)).toBe(false); // old comb there
    expect(canPlace(st, c, 0, -1, 0)).toBe(false); // its second cell is the old comb
    expect(canPlace(st, c, 0, 3, 0)).toBe(false); // off the edge
    expect(canPlace(st, c, 0, 1, 0)).toBe(true);
    stepHive(st, c, [{ t: 0, k: "place", slot: 0, q: 1, r: 0 }]);
    expect(st.filled[cellIndex(1, 0)] && st.filled[cellIndex(2, 0)]).toBe(true);
    expect(canPlace(st, c, 0, 1, 0)).toBe(false); // that slot is used
  });

  it("turns a full line to honey; two at once count their crossing once and double; a flower line counts double", () => {
    // The r = 0 line is 7 cells; fill six of them first.
    const row = [-3, -2, -1, 1, 2, 3].map((q) => [q, 0] as const);
    const one = plain(["one"], { comb: row }), a = initHive(one);
    stepHive(a, one, [{ t: 0, k: "place", slot: 0, q: 0, r: 0 }]);
    expect(a.lines).toBe(1);
    expect(a.points).toBe(1 + 7 * HONEY_PER_CELL);
    expect(a.filled.some(Boolean)).toBe(false);

    // The r = 0 row and the q = 0 column, both full but for (0, 0).
    const col = [-3, -2, -1, 1, 2, 3].map((r) => [0, r] as const);
    const two = plain(["one"], { comb: [...row, ...col] }), b = initHive(two);
    stepHive(b, two, [{ t: 0, k: "place", slot: 0, q: 0, r: 0 }]);
    expect(b.lines).toBe(2);
    expect(b.points).toBe(1 + 13 * HONEY_PER_CELL * 2);

    const flower = plain(["one"], { comb: row, flowers: [[3, 0]] }), f = initHive(flower);
    stepHive(f, flower, [{ t: 0, k: "place", slot: 0, q: 0, r: 0 }]);
    expect(f.points).toBe(1 + (7 + 7) * HONEY_PER_CELL);
    expect(f.flowers).toBe(1);
  });

  it("deals the next tray once all three are down", () => {
    const c = plain(["one", "duo_e", "one", "tri_a"]), st = initHive(c);
    stepHive(st, c, [{ t: 0, k: "place", slot: 0, q: -3, r: 0 }, { t: 0, k: "place", slot: 1, q: -1, r: 2 }]);
    expect(st.trayAt).toBe(0);
    stepHive(st, c, [{ t: 1, k: "place", slot: 2, q: 3, r: -3 }]);
    expect(st.trayAt).toBe(TRAY);
    expect(st.used).toEqual([false, false, false]);
  });

  it("ends when nothing fits, when every piece is down (with the time bonus), and at the clock", () => {
    // Everything but two cells far apart filled, and a tray of dominoes: nothing fits.
    const keep = new Set([cellIndex(-3, 0), cellIndex(3, -3)]);
    const almost = CELLS.filter((_, i) => !keep.has(i));
    const c = plain(["duo_e", "duo_e", "duo_e"], { comb: almost }), st = initHive(c);
    expect(anyFits(st, c)).toBe(false);

    const all = plain([]), done = initHive(all);
    let t = 0;
    for (const [q, r] of CELLS) { if (done.done) break; stepHive(done, all, [{ t, k: "place", slot: done.used.indexOf(false), q, r }]); t++; }
    expect(done.end).toBe("done");
    expect(done.placed).toBe(PIECES);
    const timeBonus = TIME_BONUS_PER_SEC * Math.floor((RUN_TICKS - done.tick) / TICKS_PER_SEC);
    expect(done.points).toBeGreaterThanOrEqual(PIECES + timeBonus);
    expect(scoreHive(done).perfect).toBe(true);

    const idle = replayHive(all, []).state;
    expect(idle.end).toBe("time");
    expect(idle.tick).toBe(RUN_TICKS);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanHiveInputs([{ t: 0, k: "place", slot: 0, q: 1, r: -1 }])).toHaveLength(1);
    expect(cleanHiveInputs([{ t: 5, k: "place", slot: 0, q: 0, r: 0 }, { t: 4, k: "place", slot: 1, q: 0, r: 0 }])).toBeNull();
    expect(cleanHiveInputs([{ t: 0, k: "place", slot: 3, q: 0, r: 0 }])).toBeNull();
    expect(cleanHiveInputs([{ t: 0, k: "place", slot: 0, q: 0.5, r: 0 }])).toBeNull();
    expect(cleanHiveInputs([{ t: RUN_TICKS, k: "place", slot: 0, q: 0, r: 0 }])).toBeNull();
    expect(cleanHiveInputs([{ t: 0, k: "swap" }])).toBeNull();
    expect(cleanHiveInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = hiveCourseFor(DAY), inputs = greedy(c);
    replayHive(c, inputs);
    const t0 = performance.now();
    replayHive(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["hive/sim.ts", "hive/course.ts", "hive/board.ts", "hive/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("hive in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.hive, c = g.courseFor(DAY, "") as HiveCourse;
    const r = g.replay(c, greedy(c));
    expect(Object.keys(r.detail).sort()).toEqual(["flowers", "honey", "lines", "placed"]);
    expect(g.describe({ detail: { honey: 1240, lines: 9, placed: 33, flowers: 2 } })).toBe("1,240 honey, 9 lines, 33/36 placed");
    expect(g.describe({ detail: { honey: 40, lines: 0, placed: 36, flowers: 0 } })).toBe("40 honey, every piece placed");
    expect(courseNumber("hive", "2026-10-24")).toBe(1);
  });
});
