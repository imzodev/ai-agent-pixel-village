// The inns' rumour board and the boss countdown it relies on.
import { describe, expect, it } from "vitest";
import { healOf, rumours } from "@/lib/inn";
import { BOSS_WINDOW_MS, nextBossWindow } from "@/lib/progression";
import type { InnWorld } from "@/types/inn";

const base: InnWorld = { now: Date.UTC(2026, 9, 1, 12), hour: 12, weather: "clear", boss: { active: false, at: Date.UTC(2026, 9, 3, 18) }, freeFields: 3, freeRanches: 0, lastCatch: null };

describe("rumours", () => {
  it("leads with the Rootking and mentions what's going on", () => {
    const r = rumours(base);
    expect(r[0]).toMatch(/Rootking stirs again in 2 days/);
    expect(r.some((x) => /3 fields are still free/.test(x))).toBe(true);
    expect(r.some((x) => /ranch/.test(x))).toBe(false);
    expect(r.some((x) => /wolves/i.test(x))).toBe(true);
  });
  it("follows the hour, the weather and the news", () => {
    const night = rumours({ ...base, hour: 23, weather: "rain", boss: { active: true, at: base.now }, lastCatch: "Ana landed a Ghost Koi!" });
    expect(night[0]).toMatch(/awake in the north woods/);
    expect(night.some((x) => /Moonfin/.test(x))).toBe(true);
    expect(night.some((x) => /storm eels/.test(x))).toBe(true);
    expect(night.some((x) => /wisps/.test(x))).toBe(true);
    expect(night.some((x) => /Ana landed a Ghost Koi!/.test(x))).toBe(true);
  });
  it("stew heals more than bread", () => {
    expect(healOf("hot_stew")).toBeGreaterThan(healOf("bread"));
  });
});

describe("nextBossWindow", () => {
  const sat18 = Date.UTC(2026, 9, 3, 18); // Saturday 3 Oct 2026, 18:00 UTC
  it("points at the next window, or says it's open", () => {
    expect(nextBossWindow(Date.UTC(2026, 9, 1, 12))).toEqual({ active: false, at: sat18 });
    expect(nextBossWindow(sat18 + 60_000)).toEqual({ active: true, at: sat18 });
    expect(nextBossWindow(sat18 + BOSS_WINDOW_MS + 1)).toEqual({ active: false, at: sat18 + 7 * 86_400_000 });
  });
});
