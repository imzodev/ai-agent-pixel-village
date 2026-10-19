// Movement must go by real time: Phaser's 60 fps limiter over-reports its
// delta on uneven frames, which pushed running and riding past the server's
// speed limit (snapped back while the next chunks were being built).
import { describe, expect, it } from "vitest";
import { MAX_FRAME_S, frameSeconds } from "@/lib/frameTime";

/** Phaser 4's TimeStep.stepLimitFPS (smoothing off): the update calls it makes, as [time, delta]. */
function phaserLimited(rafTimes: number[], limit = 60): [number, number][] {
  const rate = 1000 / limit;
  const calls: [number, number][] = [];
  let acc = 0;
  let last = rafTimes[0];
  for (const time of rafTimes.slice(1)) {
    acc += time - last;
    if (acc >= rate) { calls.push([time, acc]); acc %= rate; }
    last = time;
  }
  return calls;
}

/** Frame times (ms) from `start`, one per interval. */
const frames = (intervals: number[]) => intervals.reduce<number[]>((ts, d) => [...ts, ts[ts.length - 1] + d], [1000]);

function sums(rafTimes: number[]) {
  const calls = phaserLimited(rafTimes);
  const real = (calls[calls.length - 1][0] - rafTimes[0]) / 1000;
  const phaser = calls.reduce((s, [, d]) => s + d, 0) / 1000;
  let last: number | null = rafTimes[0];
  let ours = 0;
  for (const [time] of calls) { ours += frameSeconds(time, last); last = time; }
  return { real, phaser, ours };
}

describe("frame time", () => {
  it("Phaser's limiter over-reports on uneven frames; the frame clock doesn't", () => {
    // Building chunks: 20 ms frames on a 60 Hz cap.
    const slow = sums(frames(Array(300).fill(20)));
    expect(slow.phaser / slow.real).toBeGreaterThan(1.2);
    expect(slow.ours).toBeCloseTo(slow.real, 6);
    // A 144 Hz screen.
    const fast = sums(frames(Array(1440).fill(1000 / 144)));
    expect(fast.phaser / fast.real).toBeGreaterThan(1.1);
    expect(fast.ours).toBeLessThanOrEqual(fast.real + 1e-9);
    expect(fast.ours).toBeCloseTo(fast.real, 6);
  });
  it("caps a hitch and starts at zero", () => {
    expect(frameSeconds(1000, null)).toBe(0);
    expect(frameSeconds(1000, 1000)).toBe(0);
    expect(frameSeconds(1500, 1000)).toBe(MAX_FRAME_S);
    expect(frameSeconds(1016, 1000)).toBeCloseTo(0.016);
  });
});
