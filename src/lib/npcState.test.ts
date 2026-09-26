// Pure tests for the NPC state classifier. Pure inputs → string, no I/O.

import { describe, expect, it } from "vitest";
import { classifyNpc, type NpcStateInput } from "@/lib/npcState";

function base(over: Partial<NpcStateInput> = {}): NpcStateInput {
  return {
    x: 100, y: 100,
    targetX: null, targetY: null,
    homeX: 100, homeY: 100,
    hasPlayerNearby: false,
    hour: 12,
    ...over,
  };
}

describe("classifyNpc", () => {
  it("idle when no target and not at home", () => {
    expect(classifyNpc(base({ homeX: 0, homeY: 0, hour: 12 }))).toBe("idle");
  });

  it("walking when target is far enough away", () => {
    expect(classifyNpc(base({ targetX: 200, targetY: 100 }))).toBe("walking");
  });

  it("idle when target is set but already at it", () => {
    expect(classifyNpc(base({ targetX: 100, targetY: 100 }))).toBe("idle");
  });

  it("facing_player wins over walking", () => {
    expect(classifyNpc(base({
      targetX: 200, targetY: 100,
      hasPlayerNearby: true,
    }))).toBe("facing_player");
  });

  it("resting when at home during night", () => {
    expect(classifyNpc(base({ hour: 22 }))).toBe("resting");
  });

  it("resting when at home during early morning", () => {
    expect(classifyNpc(base({ hour: 4 }))).toBe("resting");
  });

  it("not resting at home during day", () => {
    expect(classifyNpc(base({ hour: 13 }))).toBe("idle");
  });

  it("not resting when far from home at night", () => {
    expect(classifyNpc(base({ hour: 23, x: 1000, y: 1000 }))).toBe("idle");
  });

  it("walking wins over resting", () => {
    expect(classifyNpc(base({
      hour: 23, targetX: 100, targetY: 200,
    }))).toBe("walking");
  });
});
