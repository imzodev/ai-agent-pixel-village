// New-enemy fan-out: each spawn reaches only the buckets of players within
// range, and each bucket gets one payload for all its members.
import { describe, expect, it } from "vitest";
import { planPointFanout } from "@/lib/moveFanout";

describe("planPointFanout", () => {
  const peers = [
    { id: "a", x: 100, y: 100, backedUp: false },
    { id: "b", x: 120, y: 140, backedUp: false }, // same bucket as a
    { id: "far", x: 20_000, y: 20_000, backedUp: false },
    { id: "slow", x: 110, y: 110, backedUp: true },
  ];
  it("sends a spawn to the players near it, once per bucket", () => {
    const out = planPointFanout(peers, [{ id: 1, x: 300, y: 200 }], 512, 1152);
    expect(out).toHaveLength(1);
    expect(out[0].peers.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(out[0].items.map((i) => i.id)).toEqual([1]);
  });
  it("skips players far away and backed-up sockets, and empty buckets", () => {
    const out = planPointFanout(peers, [{ id: 2, x: 20_100, y: 20_050 }], 512, 1152);
    expect(out.map((b) => b.peers.map((p) => p.id))).toEqual([["far"]]);
    expect(planPointFanout(peers, [], 512, 1152)).toEqual([]);
  });
});
