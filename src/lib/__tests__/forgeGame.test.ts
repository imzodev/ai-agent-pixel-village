import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { forgeCourseFor, forgeCourseSolvable } from "../forgeGame/course";
import { bandOf, canStrike, cleanForgeInputs, initForge, forgeHash, replayForge, scoreForge, setLoadout, stepForge, swingOffset } from "../forgeGame/sim";
import {
  COLD_MAX, COMMISSIONS, FIRE_MAX, FIRE_MIN, FIRE_SEGS, FORGE_EPOCH, FORGE_HAMMERS, FORGE_PIECES, FORGE_TONGS, HEAT_MAX, HOT_MIN, PREP_TICKS,
  QUENCH_DROP, RUN_TICKS, SWEET_MID, SWING_TICKS,
} from "../forgeGame/rules";
import { itemDef } from "../itemDefs";
import { ARCADE_GAMES, courseNumber } from "../arcade/games";
import { arcadeDay } from "../arcade/days";
import { cosmoByKey } from "../cosmetics";
import type { ForgeCourse, ForgeInput, ForgeLoadout, ForgeState } from "@/types/forgeGame";

const DAY = "2026-10-25";

const LOADOUT: ForgeLoadout = { fuel: "coal", hammer: "stone", tongs: "short" };

/**
 * A steady smith: lights the fire at once, heats the billet to the top of the
 * sweet band, pulls it out, knocks the scale off and strikes on the beat until
 * it cools to the bottom of the band. Returns the inputs that took effect.
 * `offBeat` strikes just outside the hammer's window, so every blow glances.
 */
function smith(course: ForgeCourse, loadout = LOADOUT, offBeat = false): ForgeInput[] {
  const st = initForge(course), out: ForgeInput[] = [];
  const step = (now: ForgeInput[]) => { stepForge(st, course, now); out.push(...now); };
  step([{ t: 0, k: "prep", loadout: { ...loadout } }]);
  const want = offBeat ? FORGE_HAMMERS[loadout.hammer].window + 1 : 0;
  while (!st.done) {
    const now: ForgeInput[] = [];
    if (st.phase === "work" && st.moving === 0) {
      const band = bandOf(st.work.piece);
      if (st.place === "fire") {
        if (st.heat >= band.high - 40) now.push({ t: st.tick, k: "move", to: "anvil" });
      } else if (st.scale) now.push({ t: st.tick, k: "knock" });
      else if (st.heat < band.low + 30) now.push({ t: st.tick, k: "move", to: "fire" });
      else if (canStrike(st) && swingOffset(st) === want) now.push({ t: st.tick, k: "strike" });
    }
    step(now);
  }
  return out;
}

/** A state in the work phase with the billet hot on the anvil, on a beat. */
function atAnvil(c: ForgeCourse, heat = SWEET_MID): ForgeState {
  const st = initForge(c);
  st.phase = "work"; st.heat = heat; st.tick = PREP_TICKS + SWING_TICKS;
  return st;
}

const wait = (st: ForgeState, c: ForgeCourse, n: number) => { for (let i = 0; i < n; i++) stepForge(st, c, []); };

describe("forge course", () => {
  it("is the same every time for a day, and differs between days", () => {
    expect(forgeCourseFor(DAY)).toEqual(forgeCourseFor(DAY));
    expect(forgeCourseFor(DAY).seed).not.toBe(forgeCourseFor("2026-10-26").seed);
    expect(forgeCourseFor(DAY, "salt").seed).not.toBe(forgeCourseFor(DAY).seed);
  });

  it("has four real commissions, easiest first, and a fire in range (a year of days)", () => {
    const fires = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const day = arcadeDay(Date.UTC(2026, 9, 25 + d));
      const c = forgeCourseFor(day);
      expect(c.commissions.length, day).toBe(COMMISSIONS);
      expect(forgeCourseSolvable(c), day).toBe(true);
      for (let i = 1; i < c.commissions.length; i++) expect(c.commissions[i].points, day).toBeGreaterThanOrEqual(c.commissions[i - 1].points);
      expect(c.fire.length, day).toBe(FIRE_SEGS);
      expect(c.fire.every((f) => f >= FIRE_MIN && f <= FIRE_MAX), day).toBe(true);
      fires.add(c.fire.join(""));
    }
    expect(fires.size).toBeGreaterThan(300);
  });

  it("forges Bjorn's real pieces, each band inside the workable heat", () => {
    for (const p of Object.values(FORGE_PIECES)) {
      const item = itemDef(p.key);
      expect(item, p.key).toBeDefined();
      expect(p.name, p.key).toBe(item!.name);
      expect(p.icon, p.key).toBe(item!.icon);
      const b = bandOf(p.key);
      expect(b.low, p.key).toBeGreaterThan(COLD_MAX);
      expect(b.high, p.key).toBeLessThan(HOT_MIN);
    }
  });

  it("every day's board can be forged in full by a steady smith", () => {
    for (let d = 0; d < 60; d++) {
      const c = forgeCourseFor(arcadeDay(Date.UTC(2026, 9, 25 + d)));
      const r = replayForge(c, smith(c)).result;
      expect(r.detail.completed, c.day).toBe(COMMISSIONS);
      expect(r.perfect, c.day).toBe(true);
    }
  });
});

describe("forge run", () => {
  it("replays exactly (golden run: changing the rules or the board changes this hash)", () => {
    const c = forgeCourseFor(DAY), inputs = smith(c);
    const a = replayForge(c, inputs), b = replayForge(c, inputs);
    expect(forgeHash(a.state)).toBe(forgeHash(b.state));
    expect(a.result).toEqual(b.result);
    expect({ hash: forgeHash(a.state), ...a.result }).toMatchInlineSnapshot(`
      {
        "detail": {
          "chain": 33,
          "commissions": 4,
          "completed": 4,
          "perfect": 33,
          "ruined": 0,
        },
        "hash": "353c9f39",
        "perfect": true,
        "score": 1459,
        "ticks": 1172,
      }
    `);
  });

  it("rewards careful work over busy work", () => {
    const c = forgeCourseFor(DAY);
    const careful = replayForge(c, smith(c)).result;
    const sloppy = replayForge(c, smith(c, LOADOUT, true)).result;
    expect(careful.detail.perfect).toBeGreaterThan(0);
    expect(sloppy.detail.perfect).toBe(0);
    expect(careful.score).toBeGreaterThan(sloppy.score * 2);
    expect(replayForge(c, []).result.score).toBe(0);
  });

  it("every loadout can forge the day's board", () => {
    const c = forgeCourseFor(DAY);
    for (const fuel of ["charcoal", "coal", "coke"] as const) for (const hammer of ["stone", "iron", "tinker"] as const) for (const tongs of ["short", "long", "quench"] as const) {
      const r = replayForge(c, smith(c, { fuel, hammer, tongs })).result;
      expect(r.detail.completed, `${fuel} ${hammer} ${tongs}`).toBe(COMMISSIONS);
    }
  });

  it("starts the minute when the fire is lit, or when the prep runs out", () => {
    const c = forgeCourseFor(DAY);
    const early = initForge(c);
    expect(early.phase).toBe("prep");
    wait(early, c, 40);
    stepForge(early, c, [{ t: early.tick, k: "prep", loadout: { fuel: "coke", hammer: "iron", tongs: "quench" } }]);
    expect(early.phase).toBe("work");
    expect(early.startAt).toBe(41);
    expect(early.loadout.fuel).toBe("coke");
    expect(early.quenchesLeft).toBe(FORGE_TONGS.quench.quenches);
    // A second choice once it's lit changes nothing.
    stepForge(early, c, [{ t: early.tick, k: "prep", loadout: LOADOUT }]);
    expect(early.loadout.fuel).toBe("coke");
    const late = initForge(c);
    wait(late, c, PREP_TICKS);
    expect(late.phase).toBe("work");
    expect(late.loadout).toEqual({ fuel: "coal", hammer: "stone", tongs: "short" });
    const r = replayForge(c, [{ t: 40, k: "prep", loadout: LOADOUT }]);
    expect(r.result.ticks).toBe(41 + RUN_TICKS);
  });

  it("heats in the fire, cools on the anvil, and burns out if left in", () => {
    const c = forgeCourseFor(DAY), st = atAnvil(c, 300);
    wait(st, c, 5);
    expect(st.heat).toBeLessThan(300);
    stepForge(st, c, [{ t: st.tick, k: "move", to: "fire" }]);
    expect(st.moving).toBeGreaterThan(0);
    expect(canStrike(st)).toBe(false);
    const h = st.heat;
    wait(st, c, FORGE_TONGS.short.moveTicks + 10);
    expect(st.heat).toBeGreaterThan(h);
    wait(st, c, 400);
    expect(st.log.map((e) => e.k)).toContain("burnt");
    expect(st.outcomes[0]).toBe("ruined");
    expect(st.commission).toBe(1);
    expect(st.heat).toBe(0);
    expect(st.heat).toBeLessThan(HEAT_MAX);
  });

  it("cracks the billet when it is struck too cold and burns it out when too hot", () => {
    const c = forgeCourseFor(DAY);
    const cold = atAnvil(c, COLD_MAX);
    cold.work.strikes = 3; cold.work.quality = 20;
    stepForge(cold, c, [{ t: cold.tick, k: "strike" }]);
    expect(cold.log.map((e) => e.k)).toContain("cold_crack");
    expect(cold.ruined).toBe(1);
    // A crack starts the piece again; the commission itself survives.
    expect(cold.commission).toBe(0);
    expect(cold.work.strikes).toBe(0);
    expect(cold.outcomes[0]).toBe(null);
    const hot = atAnvil(c, HOT_MIN);
    stepForge(hot, c, [{ t: hot.tick, k: "strike" }]);
    expect(hot.log.map((e) => e.k)).toContain("burnt");
    expect(hot.ruined).toBe(1);
    expect(hot.commission).toBe(1);
    expect(hot.outcomes[0]).toBe("ruined");
  });

  it("scores a strike on the beat higher than one off it, and one in the band higher than out of it", () => {
    const c = forgeCourseFor(DAY);
    const onBeat = atAnvil(c);
    expect(swingOffset(onBeat)).toBe(0);
    stepForge(onBeat, c, [{ t: onBeat.tick, k: "strike" }]);
    expect(onBeat.perfectStrikes).toBe(1);
    expect(onBeat.work.quality).toBe(FORGE_HAMMERS.stone.perfectGain);
    const offBeat = atAnvil(c);
    offBeat.tick += FORGE_HAMMERS.stone.window + 1;
    stepForge(offBeat, c, [{ t: offBeat.tick, k: "strike" }]);
    expect(offBeat.perfectStrikes).toBe(0);
    expect(offBeat.work.quality).toBeLessThan(FORGE_HAMMERS.stone.gain);
    expect(offBeat.chain).toBe(0);
    const dull = atAnvil(c, bandOf(c.commissions[0].piece).high + 10);
    stepForge(dull, c, [{ t: dull.tick, k: "strike" }]);
    expect(dull.perfectStrikes).toBe(0);
    expect(dull.work.quality).toBe(FORGE_HAMMERS.stone.gain);
    expect(dull.log[0].dull).toBe(true);
  });

  it("allows one blow a beat, so mashing doesn't pay", () => {
    const c = forgeCourseFor(DAY), st = atAnvil(c);
    stepForge(st, c, [{ t: st.tick, k: "strike" }]);
    expect(st.work.strikes).toBe(1);
    for (let i = 0; i < SWING_TICKS / 2 - 1; i++) stepForge(st, c, [{ t: st.tick, k: "strike" }]);
    expect(st.work.strikes).toBe(1);
    stepForge(st, c, [{ t: st.tick, k: "strike" }]);
    expect(st.work.strikes).toBe(2);
  });

  it("blocks the next strike until the scale is knocked off", () => {
    const c = forgeCourseFor(DAY), st = atAnvil(c);
    st.scale = true;
    expect(canStrike(st)).toBe(false);
    stepForge(st, c, [{ t: st.tick, k: "strike" }]);
    expect(st.work.strikes).toBe(0);
    stepForge(st, c, [{ t: st.tick, k: "knock" }]);
    expect(st.scale).toBe(false);
    expect(canStrike(st)).toBe(true);
  });

  it("quenches only with the quench tongs, and only as often as they allow", () => {
    const c = forgeCourseFor(DAY), st = atAnvil(c, 600);
    stepForge(st, c, [{ t: st.tick, k: "quench" }]);
    expect(st.log.map((e) => e.k)).not.toContain("quench");
    setLoadout(st, { fuel: "coal", hammer: "stone", tongs: "quench" });
    st.scale = true;
    const h = st.heat;
    stepForge(st, c, [{ t: st.tick, k: "quench" }]);
    expect(st.heat).toBeLessThanOrEqual(h - QUENCH_DROP);
    expect(st.scale).toBe(false);
    stepForge(st, c, [{ t: st.tick, k: "quench" }]);
    stepForge(st, c, [{ t: st.tick, k: "quench" }]);
    expect(st.log.filter((e) => e.k === "quench")).toHaveLength(FORGE_TONGS.quench.quenches);
  });

  it("hands an unfinished piece over for half its worth", () => {
    const c = forgeCourseFor(DAY), st = atAnvil(c);
    stepForge(st, c, [{ t: st.tick, k: "finish" }]);
    expect(st.commission).toBe(0);
    stepForge(st, c, [{ t: st.tick, k: "strike" }]);
    const before = st.points;
    stepForge(st, c, [{ t: st.tick, k: "finish" }]);
    expect(st.commission).toBe(1);
    expect(st.outcomes[0]).toBe("half");
    expect(st.points - before).toBe(Math.round(c.commissions[0].points / 2));
  });

  it("refuses inputs it can't replay", () => {
    expect(cleanForgeInputs([{ t: 0, k: "prep", loadout: LOADOUT }, { t: 5, k: "move", to: "fire" }, { t: 6, k: "strike" }])).toHaveLength(3);
    expect(cleanForgeInputs([{ t: 5, k: "strike" }, { t: 4, k: "strike" }])).toBeNull();
    expect(cleanForgeInputs([{ t: 0, k: "move", to: "barrel" }])).toBeNull();
    expect(cleanForgeInputs([{ t: 1.5, k: "strike" }])).toBeNull();
    expect(cleanForgeInputs([{ t: 0, k: "melt" }])).toBeNull();
    expect(cleanForgeInputs([{ t: 0, k: "prep", loadout: { fuel: "cake", hammer: "stone", tongs: "short" } }])).toBeNull();
    expect(cleanForgeInputs([{ t: 0, k: "prep", loadout: LOADOUT }, { t: 1, k: "prep", loadout: LOADOUT }])).toBeNull();
    expect(cleanForgeInputs([{ t: PREP_TICKS, k: "prep", loadout: LOADOUT }])).toBeNull();
    expect(cleanForgeInputs([{ t: PREP_TICKS + RUN_TICKS, k: "strike" }])).toBeNull();
    expect(cleanForgeInputs("nope")).toBeNull();
  });

  it("replays a whole run fast enough to check on the server", () => {
    const c = forgeCourseFor(DAY), inputs = smith(c);
    replayForge(c, inputs);
    const t0 = performance.now();
    replayForge(c, inputs);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it("uses only maths that's the same on every engine", () => {
    for (const f of ["forgeGame/sim.ts", "forgeGame/course.ts", "forgeGame/rules.ts"]) {
      const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|hypot|cbrt|random|sinh|cosh|tanh)\b/);
      expect(src, f).not.toMatch(/\*\*/);
    }
  });
});

describe("forge in the arcade", () => {
  it("replays through the registry and reads as a sentence", () => {
    const g = ARCADE_GAMES.forge, c = g.courseFor(DAY, "") as ForgeCourse;
    const r = g.replay(c, smith(c));
    expect(Object.keys(r.detail).sort()).toEqual(["chain", "commissions", "completed", "perfect", "ruined"]);
    expect(scoreForge(replayForge(c, []).state, c).score).toBe(0);
    expect(g.describe({ detail: { completed: 3, perfect: 5, ruined: 1, commissions: 4 } })).toBe("3/4 commissions forged, 5 perfect strikes, 1 billet lost");
    expect(g.describe({ detail: { completed: 4, perfect: 0, ruined: 2, commissions: 4 } })).toBe("4/4 commissions forged, 2 billets lost");
    expect(g.describe({ detail: { completed: 4, perfect: 0, ruined: 0, commissions: 4 } })).toBe("4/4 commissions forged");
    expect(courseNumber("forge", FORGE_EPOCH)).toBe(1);
  });

  it("gives a prize that can be worn and never sold", () => {
    const prize = cosmoByKey(ARCADE_GAMES.forge.prize.cosmetic);
    expect(prize).toBeDefined();
    expect(prize!.coinPrice).toBe(0);
    expect(prize!.gemPrice).toBe(0);
  });
});
