// Per-beat move fan-out: proximity filter, serialise-once buckets and
// backpressure skipping.

import { describe, expect, it } from "vitest";
import { planMoveFanout } from "@/lib/moveFanout";
import type { ScheduledMove } from "@/types/motion";

function mv(id: number, tx: number, ty: number, toTx: number): ScheduledMove {
  return {
    kind: "npc",
    id,
    x: toTx * 16 + 8,
    y: ty * 16 + 8,
    move: { path: [{ tx, ty }, { tx: toTx, ty }], startAt: 1000, speed: 38 },
  };
}

describe("planMoveFanout", () => {
  const near = mv(1, 10, 10, 12); // ~ (170, 168)
  const far = mv(2, 1000, 1000, 1002); // ~ (16000, 16000)

  it("only sends moves within the proximity radius", () => {
    const out = planMoveFanout([{ x: 200, y: 200, backedUp: false }], [near, far], 512, 1152);
    expect(out).toHaveLength(1);
    expect(out[0].moves.map((m) => m.id)).toEqual([1]);
  });

  it("groups peers in the same bucket so the payload is built once", () => {
    const a = { x: 100, y: 100, backedUp: false };
    const b = { x: 400, y: 300, backedUp: false };
    const out = planMoveFanout([a, b], [near], 512, 1152);
    expect(out).toHaveLength(1);
    expect(out[0].peers).toEqual([a, b]);
  });

  it("skips backed-up peers", () => {
    const out = planMoveFanout([{ x: 100, y: 100, backedUp: true }], [near], 512, 1152);
    expect(out).toHaveLength(0);
  });

  it("drops buckets with nothing nearby", () => {
    const out = planMoveFanout([{ x: 100, y: 100, backedUp: false }], [far], 512, 1152);
    expect(out).toHaveLength(0);
  });

  it("includes a move whose destination is near even if its origin is not", () => {
    const longWalk: ScheduledMove = {
      kind: "animal",
      id: 3,
      x: 200,
      y: 200,
      move: { path: [{ tx: 500, ty: 12 }, { tx: 12, ty: 12 }], startAt: 1000, speed: 60 },
    };
    const out = planMoveFanout([{ x: 100, y: 100, backedUp: false }], [longWalk], 512, 1152);
    expect(out[0]?.moves.map((m) => m.id)).toEqual([3]);
  });
});
