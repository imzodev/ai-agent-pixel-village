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

describe("speed guard: timed by each report's own stamp", () => {
  const RUN = PLAYER_SPEED * RUN_SPEED_MULT;

  /** Run at `speed` for `secs` from x=0, reporting every 200 ms, all held by the network until `arrive` (ms). */
  function heldThenBurst(speed: number, secs: number, arrive: number, stamped: boolean) {
    const g = newGuard(0, 0, 0);
    let refused = 0;
    for (let t = 200; t <= secs * 1000; t += 200) {
      const r = guardStep(g, (speed * t) / 1000, 0, Math.max(t, arrive), false, stamped ? t : undefined);
      if (!r.ok) refused++;
    }
    return refused;
  }

  it("a sprint the network held up and then delivered at once passes when stamped (the snap-back bug)", () => {
    expect(heldThenBurst(RUN, 2.5, 2500, false)).toBeGreaterThan(0); // timed by arrival: snapped back
    expect(heldThenBurst(RUN, 2.5, 2500, true)).toBe(0); // timed by the stamps: fine
  });

  it("still clamps a speed hack with honest stamps", () => {
    const g = newGuard(0, 0, 0);
    let refused = 0;
    for (let t = 200; t <= 10_000; t += 200) if (!guardStep(g, (PLAYER_SPEED * 3 * t) / 1000, 0, t, false, t).ok) refused++;
    expect(refused).toBeGreaterThan(5);
  });

  it("a stamp from the future earns no extra time", async () => {
    const { CLOCK_AHEAD_MS } = await import("@/lib/speedGuard");
    const g = newGuard(0, 0, 0);
    g.budget = 0;
    // Claims an hour has passed; only CLOCK_AHEAD_MS past the server clock counts.
    const allowed = (maxSpeedPx(false) * CLOCK_AHEAD_MS) / 1000;
    const r = guardStep(g, 10_000, 0, 0, false, 3_600_000);
    expect(r.ok).toBe(false);
    expect(r.x).toBeCloseTo(allowed, 0);
  });

  it("a stamp older than the last report counts as no time passing", () => {
    const g = newGuard(0, 0, 0);
    g.budget = 0;
    guardStep(g, 0, 0, 1000, false, 1000);
    expect(g.budget).toBeCloseTo(maxSpeedPx(false), 0);
    const before = g.budget;
    guardStep(g, 0, 0, 1200, false, 500); // stamped before the previous report
    expect(g.budget).toBeCloseTo(before, 5);
  });

  it("an old client without stamps behaves as before (arrival time)", () => {
    expect(walk(RUN, 20, 200)).toBe(0);
    expect(walk(PLAYER_SPEED * 3, 10, 200)).toBeGreaterThan(5);
  });
});
