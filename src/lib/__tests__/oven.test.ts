import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { doughsOf, ovenCourseFor } from "../oven/course";
import { bakeOf, cleanOvenInputs, initOven, ovenHash, replayOven, scoreOven, stepOven, takeResult } from "../oven/sim";
import { HOT_HEAT, OVENS, OVEN_GOODS, PIES, RUN_TICKS, RUSH } from "../oven/rules";
import { itemDef } from "../itemDefs";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import type { OvenCourse, OvenGoodKey, OvenInput, OvenState } from "@/types/oven";

const DAY = "2026-10-24"; // a Saturday: the wedding party comes in

/**
 * A greedy baker: takes each bake out at the middle of its golden window, and
 * fills an empty oven with whatever the customers in (or about to come in) are
 * shortest of. Returns the inputs that took effect.
 */
function baker(course: OvenCourse): OvenInput[] {
  const st = initOven(course), out: OvenInput[] = [];
  while (!st.done) {
    const now: OvenInput[] = [];
    for (let o = 0; o < OVENS; o++) {
      const s = st.ovens[o];
      if (s && bakeOf(course, o, s.item, s.at, st.tick).e >= bakeOf(course, o, s.item, s.at, st.tick).mid) now.push({ t: st.tick, k: "take", oven: o });
    }
    const need: Partial<Record<OvenGoodKey, number>> = {};
    course.tickets.forEach((t, i) => {
      const ts = st.tickets[i];
      if (ts.status === "open" || (ts.status === "coming" && t.at <= st.tick + 150)) t.items.forEach((g, j) => { if (!ts.got[j]) need[g] = (need[g] ?? 0) + 1; });
    });
    for (const s of st.ovens) if (s) need[s.item] = (need[s.item] ?? 0) - 1;
    for (const g of doughsOf(course)) need[g] = (need[g] ?? 0) - st.shelf[g].length;
    for (let o = 0; o < OVENS; o++) {
      if (st.ovens[o] || now.some((i) => i.oven === o)) continue;
      let best: OvenGoodKey | null = null;
      for (const g of doughsOf(course)) {
        const n = need[g] ?? 0, b = best ? need[best] ?? 0 : 0;
        if (n > 0 && (!best || n > b || (n === b && OVEN_GOODS[g].bakeTicks > OVEN_GOODS[best].bakeTicks))) best = g;
      }
      if (best) { now.push({ t: st.tick, k: "load", oven: o, item: best }); need[best] = (need[best] ?? 0) - 1; }
    }
    stepOven(st, course, now);
    out.push(...now);
  }
  return out;
}

/** Step `n` ticks with no inputs. */
const wait = (st: OvenState, c: OvenCourse, n: number) => { for (let i = 0; i < n; i++) stepOven(st, c, []); };
/** An oven at normal heat on this course. */
const coolOven = (c: OvenCourse) => c.heat.findIndex((h) => h !== HOT_HEAT);

describe("oven course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(ovenCourseFor(DAY)).toEqual(ovenCourseFor(DAY));
    expect(ovenCourseFor(DAY).seed).not.toBe(ovenCourseFor("2026-10-25").seed);
    expect(ovenCourseFor(DAY, "salt").seed).not.toBe(ovenCourseFor(DAY).seed);
  });

  it("has one hot oven, only the day's pie, customers in order, the wedding party at weekends; the greedy baker serves at least half (a year of days)", () => {
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 22 + d));
      const c = ovenCourseFor(day);
      expect(c.heat.filter((h) => h === HOT_HEAT), day).toHaveLength(1);
      expect(PIES, day).toContain(c.pie);
      const doughs = doughsOf(c);
      expect(c.tickets.length, day).toBeGreaterThanOrEqual(10);
      for (let i = 0; i < c.tickets.length; i++) {
        expect(c.tickets[i].items.every((g) => doughs.includes(g)), day).toBe(true);
        if (i) expect(c.tickets[i].at, day).toBeGreaterThan(c.tickets[i - 1].at);
        expect(c.tickets[i].at, day).toBeLessThan(RUN_TICKS);
      }
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(c.tickets.filter((t) => t.rush).length, day).toBe(dow === 0 || dow === 6 ? 1 : 0);
      if (d % 7 === 0) {
        const r = replayOven(c, baker(c)).result;
        expect(r.detail.served, day).toBeGreaterThanOrEqual(c.tickets.length / 2);
      }
    }
    expect(RUSH).toHaveLength(5);
  });

  it("bakes Marigold's real goods", () => {
    for (const g of Object.values(OVEN_GOODS)) {
      const item = itemDef(g.key);
      expect(item, g.key).toBeDefined();
      expect(g.name, g.key).toBe(item!.name);
      expect(g.icon, g.key).toBe(item!.icon);
    }
  });
});

describe("oven run", () => {
  it("replays exactly (golden run: changing the rules or the customers changes this hash)", () => {
    const c = ovenCourseFor(DAY), inputs = baker(c);
    const a = replayOven(c, inputs), b = replayOven(c, inputs);
    expect(ovenHash(a.state)).toBe(ovenHash(b.state));
    expect(a.result).toEqual(b.result);
    expect(a.result.detail.served).toBeGreaterThan(8);
    expect({ hash: ovenHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "left": 1,
          "perfect": 23,
          "served": 9,
          "spoiled": 0,
        },
        "hash": "ba3e3c8",
        "perfect": false,
        "score": 704,
        "ticks": 1800,
      }
    `);
  });

  it("comes out doughy, golden, perfect or burnt by the time it's had; the hot oven is quicker", () => {
    const c = ovenCourseFor(DAY), o = coolOven(c), hot = c.heat.indexOf(HOT_HEAT), bread = OVEN_GOODS.bread;
    const at = (oven: number, ticks: number) => {
      const st = initOven(c);
      stepOven(st, c, [{ t: 0, k: "load", oven, item: "bread" }]);
      wait(st, c, ticks - 1);
      return takeResult(c, st, oven);
    };
    expect(at(o, bread.bakeTicks - 1)).toBe("doughy");
    expect(at(o, bread.bakeTicks)).toBe("golden");
    expect(at(o, bread.bakeTicks + bread.goldenTicks / 2)).toBe("perfect");
    expect(at(o, bread.bakeTicks + bread.goldenTicks)).toBe("burnt");
    expect(at(hot, Math.ceil((bread.bakeTicks * 4) / HOT_HEAT))).toBe("golden");
    expect(at(o, Math.ceil((bread.bakeTicks * 4) / HOT_HEAT))).toBe("doughy");
  });

  it("serves the oldest customer first, keeps the rest on the shelf, and a customer kept waiting leaves", () => {
    const c: OvenCourse = { ...ovenCourseFor(DAY), heat: [4, 4, 4], tickets: [
      { at: 0, items: ["honey_bun"], patience: 900 },
      { at: 1, items: ["honey_bun"], patience: 900 },
      { at: 2, items: ["bread"], patience: 60 },
    ] };
    const st = initOven(c), bun = OVEN_GOODS.honey_bun;
    stepOven(st, c, [{ t: 0, k: "load", oven: 0, item: "honey_bun" }]);
    wait(st, c, 59);
    expect(st.tickets[2].status).toBe("open");
    wait(st, c, 3);
    expect(st.tickets[2].status).toBe("left");
    expect(st.left).toBe(1);
    wait(st, c, bun.bakeTicks + bun.goldenTicks / 2 - st.tick);
    stepOven(st, c, [{ t: st.tick, k: "take", oven: 0 }]);
    expect(st.tickets[0].status).toBe("served");
    expect(st.tickets[1].status).toBe("open");
    expect(st.perfect).toBe(1);
    expect(st.points).toBeGreaterThan(Math.round((bun.points * 3) / 2));
  });

  it("refuses inputs it can't replay, and ignores a load into a full oven", () => {
    expect(cleanOvenInputs([{ t: 0, k: "load", oven: 0, item: "bread" }, { t: 5, k: "take", oven: 0 }])).toHaveLength(2);
    expect(cleanOvenInputs([{ t: 5, k: "take", oven: 0 }, { t: 4, k: "take", oven: 0 }])).toBeNull();
    expect(cleanOvenInputs([{ t: 0, k: "take", oven: OVENS }])).toBeNull();
    expect(cleanOvenInputs([{ t: 0, k: "load", oven: 0, item: "cake" }])).toBeNull();
    expect(cleanOvenInputs([{ t: RUN_TICKS, k: "take", oven: 0 }])).toBeNull();
    expect(cleanOvenInputs("nope")).toBeNull();
    const c = ovenCourseFor(DAY), st = initOven(c);
    stepOven(st, c, [{ t: 0, k: "load", oven: 0, item: "bread" }, { t: 0, k: "load", oven: 0, item: "honey_bun" }]);
    expect(st.ovens[0]?.item).toBe("bread");
    const notToday = PIES.find((p) => p !== c.pie)!;
    stepOven(st, c, [{ t: 1, k: "load", oven: 1, item: notToday }]);
    expect(st.ovens[1]).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = ovenCourseFor(DAY), inputs = baker(c);
    replayOven(c, inputs);
    const t0 = performance.now();
    replayOven(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["oven/sim.ts", "oven/course.ts", "oven/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("oven in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.oven, c = g.courseFor(DAY, "") as OvenCourse;
    const r = g.replay(c, baker(c));
    expect(Object.keys(r.detail).sort()).toEqual(["left", "perfect", "served", "spoiled"]);
    expect(scoreOven(replayOven(c, []).state).score).toBe(0);
    expect(g.describe({ detail: { served: 12, perfect: 5, spoiled: 1, left: 2 } })).toBe("12 served, 5 perfect, 1 spoiled, 2 walked out");
    expect(g.describe({ detail: { served: 1, perfect: 0, spoiled: 0, left: 0 } })).toBe("1 served");
    expect(courseNumber("oven", "2026-10-22")).toBe(1);
  });
});
