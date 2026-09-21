import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEY_BINDINGS,
  commandFor,
  formatBinding,
  normalizeKey,
  prettyKey,
} from "./bindings";

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
  it("rejects unknown / non-bindable keys", () => {
    expect(normalizeKey("F1")).toBeNull();
    expect(normalizeKey("PageUp")).toBeNull();
    expect(normalizeKey("Backspace")).toBeNull();
  });
});

describe("commandFor", () => {
  it("returns the bound command for known keys", () => {
    expect(commandFor("e")).toEqual({ command: "player.interact", mode: "press" });
    expect(commandFor("space")).toEqual({ command: "player.interact", mode: "press" });
    expect(commandFor("w")).toEqual({ command: "move.up", mode: "hold" });
    expect(commandFor("arrowdown")).toEqual({ command: "move.down", mode: "hold" });
    expect(commandFor("escape")).toEqual({ command: "ui.close", mode: "press" });
  });
  it("returns null for unbound keys", () => {
    expect(commandFor("q")).toBeNull();
    expect(commandFor("f12")).toBeNull();
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
