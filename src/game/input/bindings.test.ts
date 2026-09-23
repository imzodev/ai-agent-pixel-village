import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEY_BINDINGS,
  formatBinding,
  normalizeKey,
  prettyKey,
} from "./bindings";
import { inputRouter } from "./router";

describe("normalizeKey", () => {
  it("lowercases ASCII letters and digits", () => {
    expect(normalizeKey("E")).toBe("e");
    expect(normalizeKey("w")).toBe("w");
    expect(normalizeKey("5")).toBe("5");
  });
  it("maps space and arrow keys", () => {
    expect(normalizeKey(" ")).toBe("space");
    expect(normalizeKey("ArrowUp")).toBe("arrowup");
    expect(normalizeKey("ArrowLeft")).toBe("arrowleft");
  });
  it("maps Escape", () => {
    expect(normalizeKey("Escape")).toBe("escape");
  });
  it("maps Enter and Tab to lowercase tokens", () => {
    expect(normalizeKey("Enter")).toBe("enter");
    expect(normalizeKey("Tab")).toBe("tab");
  });
  it("rejects unknown / non-bindable keys", () => {
    expect(normalizeKey("F1")).toBeNull();
    expect(normalizeKey("PageUp")).toBeNull();
    expect(normalizeKey("Backspace")).toBeNull();
  });
});

describe("router.lookup", () => {
  it("returns the bound command for known keys", () => {
    expect(inputRouter.lookup("e")).toEqual({ command: "player.interact", mode: "press" });
    expect(inputRouter.lookup("space")).toEqual({ command: "player.interact", mode: "press" });
    expect(inputRouter.lookup("w")).toEqual({ command: "move.up", mode: "hold" });
    expect(inputRouter.lookup("arrowdown")).toEqual({ command: "move.down", mode: "hold" });
    expect(inputRouter.lookup("escape")).toEqual({ command: "ui.close", mode: "press" });
  });
  it("returns null for unbound keys", () => {
    expect(inputRouter.lookup("q")).toBeNull();
    expect(inputRouter.lookup("f12")).toBeNull();
  });
});

describe("DEFAULT_KEY_BINDINGS / formatBinding / prettyKey", () => {
  it("is non-empty and only uses unique command ids", () => {
    expect(DEFAULT_KEY_BINDINGS.length).toBeGreaterThan(0);
    const ids = new Set(DEFAULT_KEY_BINDINGS.map((b) => b.command));
    expect(ids.size).toBe(DEFAULT_KEY_BINDINGS.length);
  });
  it("formatBinding returns the first (primary) key", () => {
    expect(formatBinding("player.interact")).toBe("e");
    expect(formatBinding("ui.close")).toBe("escape");
    expect(formatBinding("move.up")).toBe("w");
    expect(formatBinding("nonexistent.command" as never)).toBeNull();
  });
  it("prettyKey renders common tokens nicely", () => {
    expect(prettyKey("space")).toBe("Space");
    expect(prettyKey("escape")).toBe("Esc");
    expect(prettyKey("arrowup")).toBe("ArrowUp");
    expect(prettyKey("e")).toBe("E");
  });
});
