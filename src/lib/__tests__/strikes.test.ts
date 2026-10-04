// Combat rules: attack shapes, dodging and the enemies' move sets.
import { describe, expect, it } from "vitest";
import { ROLL_COOLDOWN_MS, ROLL_IFRAMES_MS, canRoll, cardinalTo, dodged, inShape } from "@/lib/combat/strikes";
import { MOVESETS, planStrike, speedScale, usableMoves } from "@/lib/combat/movesets";
import { ENEMY_KINDS, isAggressive } from "@/lib/progression";

const o = { x: 100, y: 100 };

describe("attack shapes", () => {
  it("circle, cone and line cover what they should", () => {
    expect(inShape({ type: "circle", r: 40 }, o, "down", { x: 130, y: 100 })).toBe(true);
    expect(inShape({ type: "circle", r: 40 }, o, "down", { x: 160, y: 100 })).toBe(false);
    const cone = { type: "cone" as const, r: 40, half: 0.5 };
    expect(inShape(cone, o, "right", { x: 130, y: 104 })).toBe(true);
    expect(inShape(cone, o, "right", { x: 70, y: 100 })).toBe(false); // behind
    expect(inShape(cone, o, "right", { x: 110, y: 135 })).toBe(false); // off to the side
    const line = { type: "line" as const, length: 64, width: 18 };
    expect(inShape(line, o, "up", { x: 100, y: 50 })).toBe(true);
    expect(inShape(line, o, "up", { x: 130, y: 50 })).toBe(false); // stepped aside
    expect(inShape(line, o, "up", { x: 100, y: 20 })).toBe(false); // beyond its reach
  });
  it("attacks read in four directions", () => {
    expect(cardinalTo(o, { x: 150, y: 110 })).toBe("right");
    expect(cardinalTo(o, { x: 95, y: 40 })).toBe("up");
  });
});

describe("dodging", () => {
  it("a roll's window makes a hit miss, but only while it lasts", () => {
    expect(dodged([1000], 1100)).toBe(true);
    expect(dodged([1000], 1000 + ROLL_IFRAMES_MS + 1)).toBe(false);
    expect(dodged([], 1100)).toBe(false);
  });
  it("rolls have a short cooldown", () => {
    expect(canRoll(undefined, 0)).toBe(true);
    expect(canRoll(1000, 1000 + ROLL_COOLDOWN_MS - 1)).toBe(false);
    expect(canRoll(1000, 1000 + ROLL_COOLDOWN_MS)).toBe(true);
  });
});

describe("move sets", () => {
  it("every aggressive enemy knows how to attack", () => {
    for (const k of Object.keys(ENEMY_KINDS)) if (isAggressive(k)) expect(MOVESETS[k]?.length ?? 0, k).toBeGreaterThan(0);
  });
  it("plans strikes that telegraph first, and tougher fights telegraph for less time", () => {
    for (const [kind, moves] of Object.entries(MOVESETS)) for (const m of moves) {
      const s = planStrike({ id: 1, enemyId: 2, kind, move: m, at: o, target: { x: 140, y: 100 }, now: 0, baseDmg: 3, scale: 1 });
      expect(s.releaseAt, `${kind} ${m.name}`).toBeGreaterThan(s.windupAt);
      expect(s.hitAt).toBeGreaterThanOrEqual(s.releaseAt);
      expect(s.dmg).toBeGreaterThan(0);
    }
    expect(speedScale(3, true)).toBeLessThan(speedScale(2, false));
  });
  it("only moves in reach are used", () => {
    expect(usableMoves("boar", 30).map((m) => m.name)).toContain("gore");
    expect(usableMoves("boar", 100).map((m) => m.name)).toEqual(["charge"]);
    expect(usableMoves("slime", 10)).toEqual([]);
  });
});

describe("the land sets the danger", () => {
  it("further out, beasts have more HP, hit harder and give more XP; the boss is its own", async () => {
    const { enemyHpAt, enemyDmgAt, enemyXpAt } = await import("@/lib/progression");
    for (let t = 2; t <= 4; t++) {
      expect(enemyHpAt("wolf", t)).toBeGreaterThan(enemyHpAt("wolf", t - 1));
      expect(enemyDmgAt("wolf", t)).toBeGreaterThan(enemyDmgAt("wolf", t - 1));
      expect(enemyXpAt("wolf", t)).toBeGreaterThan(enemyXpAt("wolf", t - 1));
    }
    expect(enemyHpAt("rootking", 4)).toBe(enemyHpAt("rootking", 1));
    // A level-21 fighter (~13 a hit, no weapon) needs real fights out there.
    expect(Math.ceil(enemyHpAt("lurker", 3) / 13)).toBeGreaterThanOrEqual(8);
  });
});

describe("pressure", () => {
  it("standing in a telegraph chips a little off; the full hit is the heavy one", async () => {
    const { chipDamage } = await import("@/lib/combat/strikes");
    expect(chipDamage(20)).toBe(4); // 20%
    expect(chipDamage(5)).toBe(2); // 20% would be 1: at least 2
    expect(chipDamage(2)).toBe(2);
    expect(chipDamage(20)).toBeLessThan(20);
  });
  it("the wilds hold more enemies, in packs, the further out you go", async () => {
    const { wildTarget, wildPackSize } = await import("@/lib/wildlife");
    expect(wildTarget(2)).toBeGreaterThanOrEqual(10);
    expect(wildTarget(4)).toBeGreaterThan(wildTarget(2));
    expect(wildPackSize(3, () => 0.99)).toBe(4);
    expect(wildPackSize(4, () => 0.99)).toBe(5);
    expect(wildPackSize(1, () => 0)).toBe(1);
  });
});

describe("spatial grid", () => {
  it("finds what's near without missing anything a full scan would find", async () => {
    const { buildGrid, countWithin } = await import("@/lib/spatialGrid");
    const pts = Array.from({ length: 2000 }, (_, i) => ({ x: (i * 7919) % 5000, y: (i * 104729) % 5000 }));
    const g = buildGrid(pts, (p) => p, 128);
    for (const q of [{ x: 100, y: 100 }, { x: 2500, y: 4000 }, { x: 4999, y: 0 }]) {
      const brute = pts.filter((p) => Math.hypot(p.x - q.x, p.y - q.y) <= 300).length;
      expect(countWithin(g, q.x, q.y, 300, (p) => p)).toBe(brute);
    }
  });
});
