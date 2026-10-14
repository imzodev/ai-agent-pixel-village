import { describe, expect, it } from "vitest";
import { dpadAxis, dpadRuns } from "./dpad";

describe("dpadAxis", () => {
  it("presses nothing near the centre", () => {
    expect(dpadAxis(0, 0)).toEqual({ x: 0, y: 0 });
    expect(dpadAxis(5, -6)).toEqual({ x: 0, y: 0 });
  });

  it("picks the arrow the thumb is on", () => {
    expect(dpadAxis(0, -40)).toEqual({ x: 0, y: -1 }); // up
    expect(dpadAxis(0, 40)).toEqual({ x: 0, y: 1 }); // down
    expect(dpadAxis(-40, 0)).toEqual({ x: -1, y: 0 }); // left
    expect(dpadAxis(40, 0)).toEqual({ x: 1, y: 0 }); // right
  });

  it("snaps a diagonal to the stronger direction", () => {
    expect(dpadAxis(30, -20)).toEqual({ x: 1, y: 0 });
    expect(dpadAxis(-10, 35)).toEqual({ x: 0, y: 1 });
  });
});

describe("dpadRuns", () => {
  it("runs only when pushed all the way out", () => {
    expect(dpadRuns(0, 0, 80)).toBe(false);
    expect(dpadRuns(40, 0, 80)).toBe(false); // halfway: walk
    expect(dpadRuns(56, 0, 80)).toBe(true); // 70%: run
    expect(dpadRuns(0, -78, 80)).toBe(true);
    expect(dpadRuns(10, 10, 0)).toBe(false); // no pad size yet
  });
});
