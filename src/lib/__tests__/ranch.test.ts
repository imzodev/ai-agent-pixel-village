// Ranch production: fed animals make one item per PRODUCE_MS, hold up to
// MAX_STORED, stop when hungry, and collecting keeps partial progress.
import { describe, expect, it } from "vitest";
import { FEED_ITEMS, HUNGRY_AT, MAX_STORED, PRODUCE_MS, RANCH_PEN, RANCH_SPECIES, afterCollect, afterFeed, nextIn, nextName, penRect, readyCount } from "@/lib/ranch";

const T0 = 1_000_000_000;

describe("production", () => {
  it("one item per PRODUCE_MS while fed, capped", () => {
    expect(readyCount(T0, 0, T0 + PRODUCE_MS - 1)).toBe(0);
    expect(readyCount(T0, 0, T0 + PRODUCE_MS)).toBe(1);
    expect(readyCount(T0, 10, T0 + 2.5 * PRODUCE_MS)).toBe(2);
    expect(readyCount(T0, 10, T0 + 50 * PRODUCE_MS)).toBe(MAX_STORED);
  });
  it("a hungry animal produces nothing", () => {
    expect(readyCount(T0, HUNGRY_AT, T0 + 3 * PRODUCE_MS)).toBe(0);
    expect(nextIn(T0, HUNGRY_AT, T0)).toBeNull();
  });
  it("collecting keeps partial progress, unless it was full", () => {
    const now = T0 + 2.5 * PRODUCE_MS;
    const last = afterCollect(T0, 2, now);
    expect(readyCount(last, 0, now)).toBe(0);
    expect(nextIn(last, 0, now)).toBe(PRODUCE_MS / 2);
    expect(afterCollect(T0, MAX_STORED, now)).toBe(now);
  });
  it("feeding a starving animal restarts its clock", () => {
    expect(afterFeed(T0, HUNGRY_AT, T0 + 9 * PRODUCE_MS)).toBe(T0 + 9 * PRODUCE_MS);
    expect(afterFeed(T0, 30, T0 + 9 * PRODUCE_MS)).toBe(T0);
  });
});

describe("ranch data", () => {
  it("species produce real goods; feed includes wheat and field crops", () => {
    expect(RANCH_SPECIES.chicken.produce).toBe("egg");
    expect(RANCH_SPECIES.sheep.produce).toBe("wool");
    expect(RANCH_SPECIES.cow.produce).toBe("milk");
    expect(FEED_ITEMS).toContain("wheat");
    expect(FEED_ITEMS).toContain("radish");
  });
  it("the pen sits inside the ranch template", () => {
    const p = penRect(10, 20);
    expect(p).toEqual({ x: (10 + RANCH_PEN.c) * 16, y: (20 + RANCH_PEN.r) * 16, w: RANCH_PEN.w * 16, h: RANCH_PEN.h * 16 });
    expect(RANCH_PEN.c + RANCH_PEN.w).toBeLessThanOrEqual(22);
    expect(RANCH_PEN.r + RANCH_PEN.h).toBeLessThanOrEqual(13);
  });
  it("names don't repeat on a ranch", () => {
    const a = nextName("cow", []);
    expect(nextName("cow", [a])).not.toBe(a);
  });
});
