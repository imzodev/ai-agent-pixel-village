import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { derbyCourseFor, fishAbout, inPond, regularPool } from "../derby/course";
import { cleanDerbyInputs, derbyHash, initDerby, replayDerby, scoreDerby, stepDerby } from "../derby/sim";
import {
  BITE_WINDOW, CATCH_BONUS, DERBY_FISH, FLIGHT_TICKS, REGULARS, RUN_TICKS, SETTLE_TICKS, SLACK_TICKS, TIP, TROPHY_FROM, TROPHY_SPAN,
} from "../derby/rules";
import { FISH_DEFS, fishDef, fishFor } from "../fishing";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import type { DerbyCourse, DerbyFishKey, DerbyInput, DerbyState } from "@/types/derby";

const DAY = "2026-10-24";

/**
 * A careful angler: casts short of the nearest fish (the trophy first), strikes
 * on the bite, reels while the line's easy and the fish rests. Plays a whole run
 * and returns the inputs that took effect.
 */
function angler(course: DerbyCourse): DerbyInput[] {
  const st = initDerby(course), out: DerbyInput[] = [];
  let reeling = false;
  while (!st.done) {
    const now: DerbyInput[] = [];
    if (st.phase === "idle") {
      let best = -1, bd = Infinity;
      st.fish.forEach((f, i) => {
        if (f.status !== "swim") return;
        const d = Math.hypot(f.x - TIP.x, f.y - TIP.y) - (i === course.fish.length - 1 ? 1000 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) {
        const f = st.fish[best], d = Math.hypot(TIP.x - f.x, TIP.y - f.y) || 1;
        const x = Math.round(f.x + ((TIP.x - f.x) / d) * 36), y = Math.round(f.y + ((TIP.y - f.y) / d) * 36);
        if (inPond(course.pond, x, y)) now.push({ t: st.tick, k: "cast", x, y });
      }
    }
    if (st.phase === "bite" && st.tick - st.phaseAt >= 5) now.push({ t: st.tick, k: "strike" });
    const want = st.phase === "reel" && st.tension < 0.7 && (!st.running || st.tension < 0.3);
    if (want !== reeling) { now.push({ t: st.tick, k: "reel", v: want ? 1 : 0 }); reeling = want; }
    stepDerby(st, course, now);
    out.push(...now);
  }
  return out;
}

/** Step until `done(st)` (or a limit), with no inputs. */
function until(st: DerbyState, c: DerbyCourse, done: (s: DerbyState) => boolean, limit = 3000): void {
  for (let i = 0; i < limit && !done(st); i++) stepDerby(st, c, []);
}

/** A run with one cast right beside a regular, so it comes to the bobber. */
function castBeside(c: DerbyCourse, st: DerbyState): void {
  const f = st.fish[0];
  const x = Math.round(f.x + 40), y = Math.round(f.y);
  const at = inPond(c.pond, x, y) ? { x, y } : { x: Math.round(f.x - 40), y };
  stepDerby(st, c, [{ t: st.tick, k: "cast", ...at }]);
}

describe("derby course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(derbyCourseFor(DAY)).toEqual(derbyCourseFor(DAY));
    expect(derbyCourseFor(DAY).seed).not.toBe(derbyCourseFor("2026-10-25").seed);
    expect(derbyCourseFor(DAY, "salt").seed).not.toBe(derbyCourseFor(DAY).seed);
  });

  it("has water round the dock, every fish in it, and a trophy that suits the hour and the weather (a year of days)", () => {
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 22 + d));
      const c = derbyCourseFor(day);
      expect(inPond(c.pond, TIP.x, TIP.y - 20, 10), day).toBe(true);
      expect(c.fish.length, day).toBe(REGULARS + 1);
      for (const f of c.fish) {
        const def = DERBY_FISH[f.key];
        expect(inPond(c.pond, f.x, f.y), day).toBe(true);
        expect(f.grams, day).toBeGreaterThanOrEqual(def.minG);
        expect(f.grams, day).toBeLessThanOrEqual(def.maxG);
        expect(fishAbout(def, c.time, c.weather), `${day} ${f.key}`).toBe(true);
      }
      const trophy = c.fish[c.fish.length - 1];
      expect(DERBY_FISH[trophy.key].trophy, day).toBe(true);
      expect(trophy.appearAt, day).toBeGreaterThanOrEqual(TROPHY_FROM);
      expect(trophy.appearAt, day).toBeLessThan(TROPHY_FROM + TROPHY_SPAN);
      expect(c.fish.slice(0, -1).every((f) => !DERBY_FISH[f.key].trophy && f.appearAt === 0), day).toBe(true);
      for (const p of c.pads) expect(inPond(c.pond, p.x, p.y), day).toBe(true);
    }
  });

  it("uses the world's pond fish, about when the world says they bite", () => {
    for (const key of Object.keys(DERBY_FISH) as DerbyFishKey[]) {
      const world = fishDef(key);
      expect(world, key).toBeDefined();
      expect(world!.waters, key).toContain("pond");
      expect(DERBY_FISH[key].name, key).toBe(world!.name);
      expect(DERBY_FISH[key].icon, key).toBe(world!.icon);
    }
    const trophies = new Set(Object.values(DERBY_FISH).filter((d) => d.trophy).map((d) => d.key));
    const hour = { day: 12, dusk: 18, night: 23 } as const;
    for (const time of ["day", "dusk", "night"] as const) for (const weather of ["clear", "rain"] as const) {
      const world = fishFor("pond", hour[time], weather).map((f) => f.key).filter((k) => !trophies.has(k as DerbyFishKey)).sort();
      expect(regularPool(time, weather).map((d) => d.key).sort(), `${time} ${weather}`).toEqual(world);
    }
    expect(FISH_DEFS.filter((f) => f.waters.includes("pond")).length).toBe(Object.keys(DERBY_FISH).length);
  });
});

describe("derby run", () => {
  it("replays exactly (golden run: changing the rules or the fish changes this hash)", () => {
    const c = derbyCourseFor(DAY), inputs = angler(c);
    const a = replayDerby(c, inputs), b = replayDerby(c, inputs);
    expect(derbyHash(a.state)).toBe(derbyHash(b.state));
    expect(a.result).toEqual(b.result);
    expect(a.result.detail.caught).toBeGreaterThan(3);
    expect({ hash: derbyHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "caught": 5,
          "grams": 11378,
          "lost": 0,
          "trophy": 1,
        },
        "hash": "b8b55e03",
        "perfect": true,
        "score": 15160,
        "ticks": 2250,
      }
    `);
  });

  it("brings a fish to a still bobber; striking before the bite comes up empty", () => {
    const c = derbyCourseFor(DAY), st = initDerby(c);
    castBeside(c, st);
    until(st, c, (s) => s.phase === "waiting");
    expect(st.tick).toBe(FLIGHT_TICKS + 1);
    until(st, c, (s) => s.target >= 0);
    expect(st.tick - st.phaseAt).toBeGreaterThanOrEqual(SETTLE_TICKS);
    stepDerby(st, c, [{ t: st.tick, k: "strike" }]);
    expect(st.last?.k).toBe("early");
    expect(st.phase).toBe("recover");
  });

  it("hooks on the bite, and the fish takes the bait if you're too slow", () => {
    const c = derbyCourseFor(DAY);
    const st = initDerby(c);
    castBeside(c, st);
    until(st, c, (s) => s.phase === "bite");
    expect(st.phase).toBe("bite");
    stepDerby(st, c, [{ t: st.tick, k: "strike" }]);
    expect(st.phase).toBe("reel");
    expect(st.fish[st.target].status).toBe("hooked");

    const slow = initDerby(c);
    castBeside(c, slow);
    until(slow, c, (s) => s.phase === "bite");
    until(slow, c, (s) => s.phase !== "bite", BITE_WINDOW + 2);
    expect(slow.last?.k).toBe("stolen");
  });

  it("snaps the line when it's too tight, and loses a fish left slack too long", () => {
    const c = derbyCourseFor(DAY);
    const hooked = () => {
      const st = initDerby(c);
      castBeside(c, st);
      until(st, c, (s) => s.phase === "bite");
      stepDerby(st, c, [{ t: st.tick, k: "strike" }]);
      return st;
    };
    const tight = hooked();
    tight.tension = 0.99;
    stepDerby(tight, c, [{ t: tight.tick, k: "reel", v: 1 }]);
    expect(tight.last?.k).toBe("snap");
    expect(tight.lost).toBe(1);

    const slack = hooked();
    slack.tension = 0; slack.running = false; slack.fightUntil = slack.tick + 10_000;
    until(slack, c, (s) => s.phase !== "reel", SLACK_TICKS + 2);
    expect(slack.last?.k).toBe("thrown");
  });

  it("lands a fish reeled all the way in; it scores its grams and the catch bonus", () => {
    const c = derbyCourseFor(DAY), st = initDerby(c);
    castBeside(c, st);
    until(st, c, (s) => s.phase === "bite");
    const i = st.target;
    stepDerby(st, c, [{ t: st.tick, k: "strike" }]);
    st.fish[i].x = TIP.x; st.fish[i].y = TIP.y - 30;
    stepDerby(st, c, [{ t: st.tick, k: "reel", v: 1 }]);
    until(st, c, (s) => s.phase !== "reel");
    expect(st.last?.k).toBe("caught");
    expect(st.caught).toEqual([i]);
    until(st, c, (s) => s.done, RUN_TICKS + 10);
    expect(scoreDerby(st, c).score).toBe(c.fish[i].grams + CATCH_BONUS);
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanDerbyInputs([{ t: 0, k: "cast", x: 10, y: 10 }, { t: 3, k: "strike" }, { t: 4, k: "reel", v: 1 }])).toHaveLength(3);
    expect(cleanDerbyInputs([{ t: 5, k: "strike" }, { t: 4, k: "strike" }])).toBeNull();
    expect(cleanDerbyInputs([{ t: 0, k: "cast", x: 1.5, y: 10 }])).toBeNull();
    expect(cleanDerbyInputs([{ t: 0, k: "cast", x: 10, y: 9999 }])).toBeNull();
    expect(cleanDerbyInputs([{ t: 0, k: "reel", v: 2 }])).toBeNull();
    expect(cleanDerbyInputs([{ t: 0, k: "teleport" }])).toBeNull();
    expect(cleanDerbyInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = derbyCourseFor(DAY), inputs = angler(c);
    replayDerby(c, inputs);
    const t0 = performance.now();
    replayDerby(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["derby/sim.ts", "derby/course.ts", "derby/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("derby in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.derby, c = g.courseFor(DAY, "") as DerbyCourse;
    const r = g.replay(c, angler(c));
    expect(Object.keys(r.detail).sort()).toEqual(["caught", "grams", "lost", "trophy"]);
    expect(g.describe({ detail: { caught: 6, grams: 4210, lost: 1, trophy: 1 } })).toBe("6 fish, 4.2 kg, the trophy landed, 1 got away");
    expect(g.describe({ detail: { caught: 1, grams: 80, lost: 0, trophy: 0 } })).toBe("1 fish, 0.1 kg");
    expect(courseNumber("derby", "2026-10-22")).toBe(1);
  });
});
