import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_GRADE, haulCourseFor, marketX, roadAt, roadOk } from "../haul/course";
import { CART_PARTS, canDrop, cleanHaulInputs, haulHash, initHaul, replayHaul, scoreHaul, stepHaul } from "../haul/sim";
import { DROP_GAP, FRAGILE, HAUL_ITEMS, PERFECT_BONUS, ROAD_STEP, TICKS_PER_SEC } from "../haul/rules";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay, weekOf } from "../arcade/days";
import type { HaulInput, HaulItemKey } from "@/types/haul";

const DAY = "2026-10-24"; // a Saturday: the wedding cake rides
/** Load everything, a column at a time, flat side down; never lean. */
const loadAll = (n: number): HaulInput[] => Array.from({ length: n }, (_, i) => ({ t: 10 + i * (DROP_GAP + 25), k: "drop" as const, x: ((i % 3) - 1) * 40, r: 0 }));

describe("haul course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(haulCourseFor(DAY)).toEqual(haulCourseFor(DAY));
    expect(haulCourseFor(DAY).seed).not.toBe(haulCourseFor("2026-10-25").seed);
    expect(haulCourseFor(DAY, "salt").seed).not.toBe(haulCourseFor(DAY).seed);
  });

  it("has 8–10 things to load, at least one fragile, the cake at weekends; a road with no slope too steep (a year of days)", () => {
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 22 + d));
      const c = haulCourseFor(day);
      expect(c.items.length, day).toBeGreaterThanOrEqual(8);
      expect(c.items.length, day).toBeLessThanOrEqual(10);
      expect(c.items.some((k) => FRAGILE.includes(k)), day).toBe(true);
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) expect(c.items, day).toContain("cake");
      expect(roadOk(c.road), day).toBe(true);
      expect(marketX(c.road), day).toBeGreaterThan(3000);
    }
  });

  it("reads the road between its points, flat past the ends", () => {
    const road = { heights: [0, -10, 10], length: 2 * ROAD_STEP };
    expect(roadAt(road, ROAD_STEP / 2)).toBe(-5);
    expect(roadAt(road, -50)).toBe(0);
    expect(roadAt(road, 999)).toBe(10);
    expect(MAX_GRADE).toBeLessThan(0.5);
  });
});

describe("haul run", () => {
  it("replays exactly (golden run: changing the rules or the physics changes this hash)", () => {
    const c = haulCourseFor(DAY), inputs = loadAll(c.items.length);
    const a = replayHaul(c, inputs), b = replayHaul(c, inputs);
    expect(haulHash(a.state)).toBe(haulHash(b.state));
    expect(a.result).toEqual(b.result);
    expect({ hash: haulHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "broken": 0,
          "delivered": 8,
          "lost": 1,
        },
        "hash": "9bfbfb10",
        "perfect": false,
        "score": 345,
        "ticks": 2303,
      }
    `);
  });

  it("keeps a loaded cart standing still while it waits (a stable stack)", () => {
    const c = haulCourseFor(DAY);
    const st = initHaul(c);
    const inputs = loadAll(4);
    while (st.tick < 4 * (DROP_GAP + 25) + 60) stepHaul(st, c, inputs.filter((i) => i.t === st.tick));
    const before = st.bodies.slice(CART_PARTS).map((b) => ({ x: b.x, y: b.y }));
    for (let i = 0; i < 6 * TICKS_PER_SEC && st.phase === "stack"; i++) stepHaul(st, c, []);
    st.bodies.slice(CART_PARTS).forEach((b, i) => {
      expect(Math.abs(b.x - before[i].x)).toBeLessThan(1);
      expect(Math.abs(b.y - before[i].y)).toBeLessThan(1);
    });
    expect(st.status.slice(0, 4)).toEqual(["placed", "placed", "placed", "placed"]);
  });

  it("drops only when ready, and a gentle drop doesn't break the eggs", () => {
    const course = { ...haulCourseFor(DAY), items: ["eggs", "hay", "crate", "flour", "cheese", "crate", "hay", "flour"] as HaulItemKey[] };
    const st = initHaul(course);
    stepHaul(st, course, [{ t: 0, k: "drop", x: 0, r: 0 }, { t: 0, k: "drop", x: 30, r: 0 }]);
    expect(st.next).toBe(1); // the second waits DROP_GAP
    expect(canDrop(st, course)).toBe(false);
    for (let i = 0; i < 90; i++) stepHaul(st, course, []);
    expect(st.broken[0]).toBe(false);
  });

  it("breaks a fragile thing that lands hard", () => {
    const course = { ...haulCourseFor(DAY), items: ["eggs", "hay", "crate", "flour", "cheese", "crate", "hay", "flour"] as HaulItemKey[] };
    const st = initHaul(course);
    stepHaul(st, course, [{ t: 0, k: "drop", x: 0, r: 0 }]);
    st.bodies[CART_PARTS].y -= 150; // lift it high before it falls
    for (let i = 0; i < 90; i++) stepHaul(st, course, []);
    expect(st.broken[0]).toBe(true);
  });

  it("scores what arrives whole, plus a quarter for a perfect load", () => {
    const c = haulCourseFor(DAY);
    const st = initHaul(c);
    st.status = c.items.map(() => "placed");
    st.done = true;
    const all = c.items.reduce((s, k) => s + HAUL_ITEMS[k].value, 0);
    expect(scoreHaul(st, c)).toMatchObject({ score: all + Math.round(all * PERFECT_BONUS), perfect: true });
    st.broken[0] = true;
    expect(scoreHaul(st, c).score).toBe(all - HAUL_ITEMS[c.items[0]].value);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanHaulInputs([{ t: 1, k: "drop", x: 10, r: 1 }, { t: 2, k: "lean", v: -1 }, { t: 3, k: "go" }])).toHaveLength(3);
    expect(cleanHaulInputs([{ t: 1, k: "drop", x: 999, r: 0 }])).toBeNull();
    expect(cleanHaulInputs([{ t: 1, k: "drop", x: 1, r: 4 }])).toBeNull();
    expect(cleanHaulInputs([{ t: 1, k: "lean", v: 0.5 }])).toBeNull();
    expect(cleanHaulInputs([{ t: 5, k: "go" }, { t: 4, k: "go" }])).toBeNull();
    expect(cleanHaulInputs([{ t: 1, k: "fly" }])).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = haulCourseFor(DAY), inputs = loadAll(c.items.length);
    replayHaul(c, inputs);
    const t0 = performance.now();
    replayHaul(c, inputs);
    expect(performance.now() - t0).toBeLessThan(300);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["haul/physics.ts", "haul/sim.ts", "haul/course.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("arcade", () => {
  it("replays either game through the registry, in the same shape", () => {
    const h = ARCADE_GAMES.haul, w = ARCADE_GAMES.whistle;
    const hr = h.replay(h.courseFor(DAY, ""), loadAll(8));
    expect(Object.keys(hr.detail).sort()).toEqual(["broken", "delivered", "lost"]);
    const wr = w.replay(w.courseFor(DAY, ""), []);
    expect(wr).toMatchObject({ score: 0, detail: { penned: 0, lost: 0 } });
    expect(h.describe({ detail: { delivered: 7, broken: 1, lost: 2 } })).toBe("7/10 delivered whole, 1 broken, 2 lost on the road");
    expect(w.describe({ detail: { penned: 26, lost: 0 } })).toBe("26/30 sheep penned");
  });

  it("numbers each game's courses from its own first day; weeks start on Monday", () => {
    expect(courseNumber("whistle", "2026-10-21")).toBe(1);
    expect(courseNumber("haul", "2026-10-22")).toBe(1);
    expect(weekOf("2026-10-25")).toBe("2026-10-19");
  });
});
