// Pure tests for the per-entity path cache. Uses fake timers via
// vi.useFakeTimers (where needed) or runs against the real Date with
// known offsets. We keep this dependency-free.

import { describe, expect, it } from "vitest";
import { makeNavCache } from "@/lib/nav/navCache";

function fakePath(waypoints: { x: number; y: number }[]) {
  return { waypoints, cost: waypoints.length - 1 };
}

describe("NavCache", () => {
  it("set/get round-trip", () => {
    const c = makeNavCache();
    const p = fakePath([{ x: 0, y: 0 }, { x: 32, y: 0 }]);
    c.set(42, p);
    expect(c.get(42)).toEqual(p);
  });

  it("set replaces existing entry for the same id", () => {
    const c = makeNavCache();
    c.set(42, fakePath([{ x: 0, y: 0 }, { x: 32, y: 0 }]));
    const next = fakePath([{ x: 0, y: 0 }, { x: 32, y: 32 }]);
    c.set(42, next);
    expect(c.get(42)).toEqual(next);
    expect(c.size()).toBe(1);
  });

  it("clear(id) drops a single entry without affecting others", () => {
    const c = makeNavCache();
    c.set(1, fakePath([{ x: 0, y: 0 }, { x: 32, y: 0 }]));
    c.set(2, fakePath([{ x: 0, y: 0 }, { x: 64, y: 0 }]));
    c.clear(1);
    expect(c.get(1)).toBeUndefined();
    expect(c.get(2)).toBeDefined();
    expect(c.size()).toBe(1);
  });

  it("clear() drops everything", () => {
    const c = makeNavCache();
    c.set(1, fakePath([{ x: 0, y: 0 }, { x: 32, y: 0 }]));
    c.set(2, fakePath([{ x: 0, y: 0 }, { x: 64, y: 0 }]));
    c.clear();
    expect(c.size()).toBe(0);
  });

  it("prune drops entries older than ttl", () => {
    const c = makeNavCache();
    // Use a known clock by reading the real Date.now and stepping it
    // through jest-free vi fake timers.
    const baseNow = 1_000_000;
    const realNow = Date.now;
    let now = baseNow;
    Date.now = () => now;
    try {
      c.set(1, fakePath([{ x: 0, y: 0 }, { x: 32, y: 0 }]));
      now = baseNow + 100;
      c.set(2, fakePath([{ x: 0, y: 0 }, { x: 64, y: 0 }]));
      // ttl = 60ms: only entry #1 (100ms old) should be evicted; #2 is
      // 0ms old.
      const evicted = c.prune(60, now);
      expect(evicted).toBe(1);
      expect(c.get(1)).toBeUndefined();
      expect(c.get(2)).toBeDefined();
    } finally {
      Date.now = realNow;
    }
  });
});
