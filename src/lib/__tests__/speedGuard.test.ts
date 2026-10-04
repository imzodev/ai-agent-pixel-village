// The server-side speed limit: honest movement (even jittery) passes; speed
// hacks and teleports are clamped; the bike only counts if you own one.
import { describe, expect, it } from "vitest";
import { BIKE_SPEED_MULT, BURST_S, PLAYER_SPEED, RUN_SPEED_MULT, SLACK_PX, guardStep, maxSpeedPx, newGuard, placeGuard, resumeGuard } from "@/lib/speedGuard";

/** Walk at `speed` px/s for `secs`, reporting every `every` ms; how many reports were refused. */
function walk(speed: number, secs: number, every: number, mounted = false, jitter = 0): number {
  const g = newGuard(0, 0, 0, mounted);
  let refused = 0;
  for (let t = every; t <= secs * 1000; t += every) {
    // Bunched packets: some arrive late, then two at once.
    const at = t + (jitter && (t / every) % 5 === 0 ? jitter : 0);
    if (!guardStep(g, (speed * t) / 1000, 0, at, mounted).ok) refused++;
  }
  return refused;
}

describe("speed guard", () => {
  it("lets honest walking, running and riding through, even with jitter", () => {
    expect(walk(PLAYER_SPEED, 20, 200)).toBe(0);
    expect(walk(PLAYER_SPEED * RUN_SPEED_MULT, 20, 200)).toBe(0);
    expect(walk(PLAYER_SPEED * RUN_SPEED_MULT, 20, 200, false, -180)).toBe(0);
    expect(walk(PLAYER_SPEED * BIKE_SPEED_MULT, 20, 200, true)).toBe(0);
  });
  it("clamps a speed hack, and riding speed without a bike", () => {
    expect(walk(PLAYER_SPEED * 3, 10, 200)).toBeGreaterThan(5);
    expect(walk(PLAYER_SPEED * BIKE_SPEED_MULT, 60, 200, false)).toBeGreaterThan(5);
  });
  it("a teleport is cut short to what the budget allows", () => {
    const g = newGuard(0, 0, 0);
    const r = guardStep(g, 5000, 0, 100, false);
    expect(r.ok).toBe(false);
    expect(r.x).toBeLessThanOrEqual(maxSpeedPx(false) * BURST_S + SLACK_PX);
    expect(g.budget).toBe(0);
  });
  it("server moves reset the guard; reconnecting can't bank more than real time", () => {
    const g = newGuard(0, 0, 0);
    placeGuard(g, 10_000, 10_000, 0);
    expect(guardStep(g, 10_010, 10_000, 100, false).ok).toBe(true);
    resumeGuard(g, 100 + 10_000); // ten seconds offline
    expect(guardStep(g, 10_010 + maxSpeedPx(true) * 9, 10_000, 10_100, false).ok).toBe(true);
    const h = newGuard(0, 0, 0);
    resumeGuard(h, 1000); // only a second
    expect(guardStep(h, maxSpeedPx(true) * 5, 0, 1000, false).ok).toBe(false);
  });
});
