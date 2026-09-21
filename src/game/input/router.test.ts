import { describe, expect, it } from "vitest";
import { createInputRouter } from "./router";

describe("InputRouter", () => {
  it("registers and runs commands", () => {
    const router = createInputRouter();
    let calls = 0;
    router.register({ id: "ui.bag", scope: "ui", run: () => { calls += 1; } });
    router.trigger("ui.bag");
    router.trigger("ui.bag");
    expect(calls).toBe(2);
    router.dispose();
  });

  it("disposer removes a registered command", () => {
    const router = createInputRouter();
    let calls = 0;
    const off = router.register({ id: "ui.bag", scope: "ui", run: () => { calls += 1; } });
    router.trigger("ui.bag");
    off();
    router.trigger("ui.bag");
    expect(calls).toBe(1);
  });

  it("gates gameplay commands when textFocused is true", () => {
    const router = createInputRouter();
    let calls = 0;
    router.register({ id: "player.interact", scope: "gameplay", run: () => { calls += 1; } });
    router.setTextFocused(true);
    router.trigger("player.interact");
    expect(calls).toBe(0);
    router.setTextFocused(false);
    router.trigger("player.interact");
    expect(calls).toBe(1);
  });

  it("does not gate UI commands when textFocused is true", () => {
    const router = createInputRouter();
    let calls = 0;
    router.register({ id: "ui.close", scope: "ui", run: () => { calls += 1; } });
    router.setTextFocused(true);
    router.trigger("ui.close");
    expect(calls).toBe(1);
  });

  it("axis() returns (0,0) when textFocused", () => {
    const router = createInputRouter();
    router.setHeld("move.up", true);
    expect(router.axis()).toEqual({ x: 0, y: -1 });
    router.setTextFocused(true);
    expect(router.axis()).toEqual({ x: 0, y: 0 });
  });

  it("axis() prefers the virtual (touch) axis when non-zero", () => {
    const router = createInputRouter();
    router.setHeld("move.up", true);
    router.setVirtualAxis(0.5, 0);
    expect(router.axis()).toEqual({ x: 0.5, y: 0 });
    router.setVirtualAxis(0, 0);
    expect(router.axis()).toEqual({ x: 0, y: -1 });
  });

  it("axis() falls back to held-key axis when virtual is zero", () => {
    const router = createInputRouter();
    router.setHeld("move.left", true);
    router.setHeld("move.down", true);
    // |x| == |y|, tie-breaker snaps to y (matches the original scene).
    expect(router.axis()).toEqual({ x: 0, y: 1 });
  });

  it("isHeld reflects the held-set", () => {
    const router = createInputRouter();
    expect(router.isHeld("move.up")).toBe(false);
    router.setHeld("move.up", true);
    expect(router.isHeld("move.up")).toBe(true);
    router.setHeld("move.up", false);
    expect(router.isHeld("move.up")).toBe(false);
  });

  it("dispose clears state", () => {
    const router = createInputRouter();
    router.register({ id: "ui.bag", scope: "ui", run: () => {} });
    router.setHeld("move.up", true);
    router.setVirtualAxis(1, 0);
    router.setTextFocused(true);
    router.dispose();
    expect(router.isHeld("move.up")).toBe(false);
    expect(router.axis()).toEqual({ x: 0, y: 0 });
    let called = false;
    router.register({ id: "ui.bag", scope: "ui", run: () => { called = true; } });
    router.trigger("ui.bag");
    expect(called).toBe(true);
    // textFocused is reset to false on dispose.
    router.trigger("player.interact");
  });
});
