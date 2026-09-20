import { describe, expect, it } from "vitest";
import { facingOf, stepTowardWalkable } from "@/lib/movement";

// stepTowardWalkable takes the walkability check as a parameter, so these
// tests exercise the collision-sliding behaviour without a DB, a scene, or
// any chunk registry.

const alwaysWalkable = () => true;
const neverWalkable = () => false;

describe("facingOf", () => {
  it("picks the dominant axis", () => {
    expect(facingOf(5, 1)).toBe("right");
    expect(facingOf(-5, 1)).toBe("left");
    expect(facingOf(1, 5)).toBe("down");
    expect(facingOf(1, -5)).toBe("up");
  });

  it("breaks ties toward vertical", () => {
    expect(facingOf(3, 3)).toBe("down");
    expect(facingOf(-3, -3)).toBe("up");
  });
});

describe("stepTowardWalkable", () => {
  it("arrives when the target is within the step", async () => {
    const r = await stepTowardWalkable(0, 0, 3, 4, 10, alwaysWalkable);
    expect(r).toMatchObject({ x: 3, y: 4, arrived: true, stuck: false, facing: "down" });
  });

  it("moves the full step along a walkable diagonal", async () => {
    const r = await stepTowardWalkable(0, 0, 10, 0, 5, alwaysWalkable);
    expect(r.arrived).toBe(false);
    expect(r.stuck).toBe(false);
    expect(r.x).toBeCloseTo(5);
    expect(r.y).toBeCloseTo(0);
    expect(r.facing).toBe("right");
  });

  it("slides along the larger axis when the diagonal is blocked and both axes are open", async () => {
    // Block the diagonal destination only; the x-only and y-only probes pass.
    const isWalkable = (nx: number, ny: number) => !(nx > 0 && ny > 0);
    const r = await stepTowardWalkable(0, 0, 10, 10, 5, isWalkable);
    expect(r.arrived).toBe(false);
    expect(r.stuck).toBe(false);
    // |ux| === |uy| → the >= comparison prefers the x slide.
    expect(r.x).toBeCloseTo(3.535, 2);
    expect(r.y).toBe(0);
  });

  it("slides on x only when y is blocked", async () => {
    // Diagonal blocked and the y-only probe blocked, but the x-only probe
    // passes → the step keeps y fixed and advances x.
    const isWalkable = (nx: number, ny: number) => ny <= 0;
    const r = await stepTowardWalkable(0, 0, 10, 10, 5, isWalkable);
    expect(r.stuck).toBe(false);
    expect(r.x).toBeCloseTo(3.535, 2);
    expect(r.y).toBe(0);
  });

  it("reports stuck and keeps the position when fully blocked", async () => {
    const r = await stepTowardWalkable(10, 20, 100, 200, 5, neverWalkable);
    expect(r).toMatchObject({ x: 10, y: 20, arrived: false, stuck: true });
  });

  it("treats a zero-distance step as an immediate arrival", async () => {
    const r = await stepTowardWalkable(7, 8, 7, 8, 5, neverWalkable);
    expect(r).toMatchObject({ x: 7, y: 8, arrived: true, stuck: false });
  });
});
