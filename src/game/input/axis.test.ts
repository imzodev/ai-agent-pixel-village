import { describe, expect, it } from "vitest";
import type { CommandId } from "@/types/input";
import { axisFromHeld } from "./axis";

const held = (keys: CommandId[]) => new Set<CommandId>(keys);

describe("axisFromHeld", () => {
  it("returns zero when nothing is held", () => {
    expect(axisFromHeld(held([]))).toEqual({ x: 0, y: 0 });
  });

  it("maps single movement commands", () => {
    expect(axisFromHeld(held(["move.left"]))).toEqual({ x: -1, y: 0 });
    expect(axisFromHeld(held(["move.right"]))).toEqual({ x: 1, y: 0 });
    expect(axisFromHeld(held(["move.up"]))).toEqual({ x: 0, y: -1 });
    expect(axisFromHeld(held(["move.down"]))).toEqual({ x: 0, y: 1 });
  });

  it("snaps to a single axis on diagonal presses", () => {
    // Diagonal: |x| === |y|, the scene's tie-breaker picks y. Cardinal
    // ties (opposing keys) cancel out per axis.
    expect(axisFromHeld(held(["move.up", "move.left"]))).toEqual({ x: 0, y: -1 });
    expect(axisFromHeld(held(["move.down", "move.right"]))).toEqual({ x: 0, y: 1 });
  });

  it("ignores non-movement commands", () => {
    expect(axisFromHeld(held(["player.interact", "ui.bag"]))).toEqual({ x: 0, y: 0 });
  });
});
