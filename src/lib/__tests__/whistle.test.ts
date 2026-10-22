import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { courseFor, reachable, weekOf, whistleDay, whistleNumber } from "../whistle/course";
import { canWhistle, cleanInputs, initRun, replay, scoreOf, stateHash, step } from "../whistle/sim";
import { BREATH_COST, MAX_TICKS, MIN_GAP, PERFECT_BONUS, PER_SECOND_LEFT, PER_SHEEP } from "../whistle/rules";
import type { WhistleInput } from "@/types/whistle";

const DAY = "2026-10-25";
/** Whistle behind the flock's furthest sheep, towards the pen, every 10 ticks. */
function botInputs(day: string): WhistleInput[] {
  const c = courseFor(day);
  const st = initRun(c);
  const out: WhistleInput[] = [];
  while (!st.done) {
    const taps: WhistleInput[] = [];
    if (st.tick % 10 === 0 && canWhistle(st)) {
      const gx = c.pen.x + c.pen.w / 2, gy = c.pen.y + c.pen.h + 10;
      let far = null as null | { x: number; y: number }, fd = -1;
      for (const s of st.sheep) if (s.status === "free") { const d = (s.x - gx) ** 2 + (s.y - gy) ** 2; if (d > fd) { fd = d; far = s; } }
      if (far) {
        const dx = gx - far.x, dy = gy - far.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        taps.push({ t: st.tick, x: Math.round(Math.min(270, Math.max(0, far.x - (dx / d) * 22))), y: Math.round(Math.min(480, Math.max(0, far.y - (dy / d) * 22))) });
        out.push(taps[0]);
      }
    }
    step(st, c, taps);
  }
  return out;
}

describe("whistle course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(courseFor(DAY)).toEqual(courseFor(DAY));
    expect(courseFor(DAY).seed).not.toBe(courseFor("2026-10-26").seed);
  });

  it("can always be finished: a sheep can walk from the start into the pen (a year of days)", () => {
    for (let d = 0; d < 365; d++) {
      const day = whistleDay(Date.UTC(2026, 9, 21 + d));
      expect(reachable(courseFor(day)), day).toBe(true);
    }
  });

  it("numbers days from the epoch and finds the week's Monday", () => {
    expect(whistleNumber("2026-10-21")).toBe(1);
    expect(whistleNumber("2026-11-21")).toBe(32);
    expect(weekOf("2026-10-25")).toBe("2026-10-19"); // a Sunday
    expect(weekOf("2026-10-26")).toBe("2026-10-26"); // a Monday
  });

  it("brings more wolves later in the week", () => {
    expect(courseFor("2026-10-26").dens).toHaveLength(1); // Monday
    expect(courseFor("2026-11-01").dens).toHaveLength(3); // Sunday
  });
});

describe("whistle simulation", () => {
  it("replays a run exactly (golden run: changing the rules or the maths changes this hash)", () => {
    const inputs = botInputs(DAY);
    const a = replay(courseFor(DAY), inputs), b = replay(courseFor(DAY), inputs);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(a.result).toEqual(b.result);
    expect({ hash: stateHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "hash": "a44998cc",
        "lost": 0,
        "penned": 27,
        "perfect": false,
        "score": 2700,
        "ticks": 2250,
      }
    `);
  });

  it("whistles only with breath, and not twice within MIN_GAP", () => {
    const c = courseFor(DAY);
    const st = initRun(c);
    for (let t = 0; t < MIN_GAP * 5; t++) step(st, c, [{ t, x: 100, y: 300 }]);
    // Three whistles' breath to start with, a unit back each tick, a whistle at most every MIN_GAP.
    expect(st.whistles).toBe(3);
    expect(st.breath).toBeLessThan(BREATH_COST);
    expect(canWhistle(st)).toBe(false);
  });

  it("scores penned sheep, seconds left once none is out, and a perfect round", () => {
    const c = courseFor(DAY);
    const st = initRun(c);
    expect(scoreOf(st).score).toBe(0);
    st.penned = 28; st.lost = 2; st.tick = MAX_TICKS - 30 * 20;
    expect(scoreOf(st).score).toBe(28 * PER_SHEEP + 20 * PER_SECOND_LEFT);
    st.penned = 30; st.lost = 0;
    expect(scoreOf(st)).toMatchObject({ score: 30 * PER_SHEEP + 20 * PER_SECOND_LEFT + PERFECT_BONUS, perfect: true });
    st.penned = 25; st.lost = 0;
    expect(scoreOf(st).score).toBe(25 * PER_SHEEP); // five still out: no time bonus
  });

  it("refuses taps that aren't whole, in order, on the field", () => {
    expect(cleanInputs([{ t: 1, x: 2, y: 3 }, { t: 1, x: 4, y: 5 }])).toHaveLength(2);
    expect(cleanInputs([{ t: 5, x: 2, y: 3 }, { t: 4, x: 2, y: 3 }])).toBeNull();
    expect(cleanInputs([{ t: 1.5, x: 2, y: 3 }])).toBeNull();
    expect(cleanInputs([{ t: 1, x: -1, y: 3 }])).toBeNull();
    expect(cleanInputs([{ t: MAX_TICKS, x: 1, y: 3 }])).toBeNull();
    expect(cleanInputs("nope")).toBeNull();
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["whistle/sim.ts", "whistle/course.ts", "arcade/rng.ts", "arcade/days.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});
