import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loomCourseFor, loomCourseSolvable, rowLen, showTicks } from "../loom/course";
import { canReady, cleanLoomInputs, expected, initLoom, loomHash, replayLoom, scoreLoom, shownBy, stepLoom } from "../loom/sim";
import {
  BACK_MULT, CHAIN_MAX, COLORS, GOLD, GOLD_BONUS, LOOM_EPOCH, MAX_LEN, MEMORY_BONUS, ROW_BONUS, ROWS, RUN_TICKS, SNAG_MAX, START_LEN, THREAD_POINTS,
} from "../loom/rules";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import { cosmoByKey } from "../cosmetics";
import type { LoomCourse, LoomInput, LoomState } from "@/types/loom";

const DAY = "2026-10-31"; // a Saturday: the gold thread is out
const WEEKDAY = "2026-11-02";

type Plan = {
  /** Say Ready once this many threads have lit (first shows only); null waits out the show. */
  readyAt?: number | null;
  /** Ticks between taps. */
  gap?: number;
  /** Tap a wrong spool at these (row, thread) places, once each. */
  slips?: [number, number][];
  /** Stop after this many rows. */
  rows?: number;
};

/** A weaver who knows the cloth: plays the run live and records what took effect. */
function weaver(c: LoomCourse, plan: Plan = {}): { inputs: LoomInput[]; state: LoomState } {
  const { readyAt = null, gap = 6, slips = [], rows = ROWS } = plan;
  const st = initLoom(), inputs: LoomInput[] = [], slipped = new Set<string>();
  let next = 0;
  while (!st.done) {
    const now: LoomInput[] = [];
    const row = c.rows[st.row];
    if (st.row < rows && row) {
      if (st.phase === "show" && readyAt !== null && st.firstShow && canReady(st, c) && shownBy(row, st.showAt, st.tick) >= readyAt) {
        now.push({ t: st.tick, k: "ready" });
        next = st.tick + gap;
      } else if (st.phase === "weave" && st.tick >= next) {
        const key = `${st.row}:${st.at}`;
        const want = expected(row, st.at);
        const slip = slips.some(([r, i]) => r === st.row && i === st.at) && !slipped.has(key);
        if (slip) slipped.add(key);
        now.push({ t: st.tick, k: "pick", c: slip ? (want + 1) % COLORS : want });
        next = st.tick + gap;
      }
    }
    const before = st.log.length;
    stepLoom(st, c, now);
    // Only inputs that did something are kept (the field does the same).
    if (now.length && st.log.length > before) inputs.push(...now);
    if (st.row >= rows && !st.done) { while (!st.done) stepLoom(st, c, []); }
  }
  return { inputs, state: st };
}

describe("loom course", () => {
  it("is the same every time for a day, and differs between days and salts", () => {
    expect(loomCourseFor(DAY)).toEqual(loomCourseFor(DAY));
    expect(loomCourseFor(DAY).rows).not.toEqual(loomCourseFor(WEEKDAY).rows);
    expect(loomCourseFor(DAY, "a").rows).not.toEqual(loomCourseFor(DAY, "b").rows);
  });

  it("weaves a usable cloth every day of a year, gold only at weekends", () => {
    let d = new Date(`${LOOM_EPOCH}T00:00:00Z`);
    let backs = 0, total = 0;
    for (let i = 0; i < 366; i++) {
      const day = arcadeDay(d.getTime());
      const c = loomCourseFor(day, "salt");
      expect(loomCourseSolvable(c), day).toBe(true);
      const wk = [0, 6].includes(d.getUTCDay());
      expect(c.colors).toBe(wk ? COLORS + 1 : COLORS);
      expect(c.figure.length).toBeGreaterThanOrEqual(2);
      expect(c.figure.length).toBeLessThanOrEqual(4);
      for (const r of c.rows) { total++; if (r.kind === "back") backs++; }
      d = new Date(d.getTime() + 86_400_000);
    }
    // About one row in four or five is "and back again".
    expect(backs / total).toBeGreaterThan(0.15);
    expect(backs / total).toBeLessThan(0.35);
  });

  it("grows the rows a thread at a time and shows them quicker", () => {
    const c = loomCourseFor(WEEKDAY);
    expect(c.rows[0].threads).toHaveLength(START_LEN);
    expect(c.rows[ROWS - 1].threads).toHaveLength(MAX_LEN);
    for (let r = 1; r < ROWS; r++) {
      expect(c.rows[r].threads.length).toBe(rowLen(r));
      expect(c.rows[r].show).toBeLessThanOrEqual(c.rows[r - 1].show);
    }
  });
});

describe("loom run", () => {
  it("weaves a row as shown, and a back row in reverse", () => {
    const c = loomCourseFor(WEEKDAY);
    const r = c.rows.findIndex((x) => x.kind === "back");
    expect(r).toBeGreaterThan(0);
    const row = c.rows[r];
    expect(expected(row, 0)).toBe(row.threads[row.threads.length - 1]);
    expect(expected(c.rows[0], 0)).toBe(c.rows[0].threads[0]);
    const { state } = weaver(c, { rows: r + 1 });
    expect(state.row).toBe(r + 1);
    expect(state.snags).toBe(0);
  });

  it("pays threads, back rows double, clean rows by the run of clean rows", () => {
    const c = loomCourseFor(WEEKDAY);
    const { state } = weaver(c, { rows: 3 });
    let want = 0, chain = 0;
    for (let r = 0; r < 3; r++) {
      const row = c.rows[r], len = row.threads.length;
      chain = Math.min(CHAIN_MAX, chain + 1);
      want += len * THREAD_POINTS * (row.kind === "back" ? BACK_MULT : 1) + ROW_BONUS * len * chain;
    }
    expect(state.points).toBe(want);
    expect(state.bestChain).toBe(3);
  });

  it("snags on a wrong thread: shows the row again, breaks the run, and three end it", () => {
    const c = loomCourseFor(WEEKDAY);
    const one = weaver(c, { rows: 2, slips: [[1, 1]] }).state;
    expect(one.snags).toBe(1);
    expect(one.row).toBe(2);
    expect(one.cleanRows).toBe(1);
    expect(one.snagged).toEqual([{ row: 1, i: 1 }]);
    const shows = one.log.filter((e) => e.k === "show" && e.row === 1).length;
    expect(shows).toBe(2);
    const three = weaver(c, { slips: [[0, 0], [0, 1], [1, 0]] }).state;
    expect(three.snags).toBe(SNAG_MAX);
    expect(three.done).toBe(true);
    expect(three.tick).toBeLessThan(RUN_TICKS);
  });

  it("pays for threads woven from memory only on a first show, and only if the row is clean", () => {
    const c = loomCourseFor(WEEKDAY);
    const len = c.rows[2].threads.length;
    const early = weaver(c, { rows: 3, readyAt: 1 }).state;
    const late = weaver(c, { rows: 3 }).state;
    const unseen = (c.rows[0].threads.length - 1) + (c.rows[1].threads.length - 1) + (len - 1);
    expect(early.remembered).toBe(unseen);
    expect(early.points - late.points).toBe(unseen * MEMORY_BONUS);
    // A slip loses the row's memory bonus, and Ready on its second show pays nothing.
    const slip = weaver(c, { rows: 3, readyAt: 1, slips: [[2, 0]] }).state;
    expect(slip.remembered).toBe(unseen - (len - 1));
  });

  it("ends the show on its own, and refuses Ready before a thread has lit", () => {
    const c = loomCourseFor(WEEKDAY), st = initLoom();
    stepLoom(st, c, [{ t: 0, k: "ready" }]);
    expect(st.phase).toBe("show");
    stepLoom(st, c, [{ t: 1, k: "pick", c: c.rows[0].threads[0] }]);
    expect(st.at).toBe(0);
    while (st.tick < showTicks(c.rows[0])) stepLoom(st, c, []);
    stepLoom(st, c, []);
    expect(st.phase).toBe("weave");
  });

  it("weaves the gold thread at weekends", () => {
    const c = loomCourseFor(DAY);
    const golds = c.rows.flatMap((r) => r.threads).filter((t) => t === GOLD).length;
    const { state } = weaver(c, { readyAt: 1, gap: 2 });
    expect(state.golds).toBe(golds);
    expect(state.points).toBeGreaterThanOrEqual(golds * GOLD_BONUS);
  });

  it("replays exactly (golden run: changing the rules or the cloth changes this hash)", () => {
    const c = loomCourseFor(DAY);
    const live = weaver(c, { readyAt: 2, gap: 4, slips: [[4, 2]] });
    const again = replayLoom(c, live.inputs);
    expect(loomHash(again.state)).toBe(loomHash(live.state));
    expect({ hash: loomHash(again.state), inputs: live.inputs.length, ...again.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "chain": 4,
          "clean": 23,
          "golds": 9,
          "memory": 190,
          "rows": 24,
          "snags": 1,
        },
        "hash": "35902a27",
        "inputs": 270,
        "perfect": false,
        "score": 8500,
        "ticks": 1831,
      }
    `);
  });

  it("finishes the whole cloth with time to spare only at a quick, sure hand", () => {
    const c = loomCourseFor(WEEKDAY);
    const sure = weaver(c, { readyAt: 1, gap: 2 });
    expect(sure.state.row).toBe(ROWS);
    expect(scoreLoom(sure.state).perfect).toBe(true);
    expect(scoreLoom(sure.state).score).toBeGreaterThan(sure.state.points);
    // Watching every show to the end runs out of time well before the last row.
    const careful = weaver(c, { gap: 8 });
    expect(careful.state.row).toBeLessThan(ROWS);
    expect(careful.state.row).toBeGreaterThan(5);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanLoomInputs([{ t: 20, k: "ready" }, { t: 30, k: "pick", c: 2 }])).toHaveLength(2);
    expect(cleanLoomInputs([{ t: 5, k: "pick", c: 1 }, { t: 4, k: "pick", c: 1 }])).toBeNull();
    expect(cleanLoomInputs([{ t: 0, k: "pick", c: 5 }])).toBeNull();
    expect(cleanLoomInputs([{ t: 0, k: "pick", c: 1.5 }])).toBeNull();
    expect(cleanLoomInputs([{ t: 0, k: "weave", c: 1 }])).toBeNull();
    expect(cleanLoomInputs([{ t: RUN_TICKS, k: "ready" }])).toBeNull();
    expect(cleanLoomInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = loomCourseFor(DAY), { inputs } = weaver(c, { readyAt: 2, gap: 4 });
    replayLoom(c, inputs);
    const t0 = performance.now();
    replayLoom(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["loom/sim.ts", "loom/course.ts", "loom/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("loom in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.loom, c = g.courseFor(DAY, "") as LoomCourse;
    const r = g.replay(c, weaver(c, { rows: 4 }).inputs);
    expect(Object.keys(r.detail).sort()).toEqual(["chain", "clean", "golds", "memory", "rows", "snags"]);
    expect(r.detail.rows).toBe(4);
    expect(scoreLoom(replayLoom(c, []).state).score).toBe(0);
    expect(g.describe({ detail: { rows: 9, chain: 3, snags: 1 } })).toBe("9 rows woven, 3 clean in a row, 1 snag");
    expect(g.describe({ detail: { rows: 1, chain: 1, snags: 0 } })).toBe("1 row woven");
    expect(g.describe({ detail: { rows: 0, chain: 0, snags: 3 } })).toBe("0 rows woven, 3 snags");
    expect(courseNumber("loom", LOOM_EPOCH)).toBe(1);
  });

  it("gives a prize that can be worn and never sold", () => {
    const prize = cosmoByKey(ARCADE_GAMES.loom.prize.cosmetic);
    expect(prize).toBeDefined();
    expect(prize!.coinPrice).toBe(0);
    expect(prize!.gemPrice).toBe(0);
  });
});
