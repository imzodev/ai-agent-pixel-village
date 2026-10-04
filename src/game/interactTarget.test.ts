// E acts on what you face (or what's underfoot), never what's behind you.
import { describe, expect, it } from "vitest";
import { pickTarget, REACH_PX } from "./interactTarget";

const me = { x: 100, y: 100 };
const c = (sel: string, dx: number, dy: number) => ({ x: me.x + dx, y: me.y + dy, sel });

describe("pickTarget", () => {
  it("a nearer tree behind you loses to an NPC in front", () => {
    expect(pickTarget([c("tree", 0, 40), c("npc", 0, -80)], me, "up")).toBe("npc");
  });
  it("things beside you don't count", () => {
    expect(pickTarget([c("tree", 30, 0)], me, "up")).toBeNull();
    expect(pickTarget([c("tree", -30, 0), c("bush", 0, 30)], me, "down")).toBe("bush");
  });
  it("something underfoot counts whichever way you face", () => {
    expect(pickTarget([c("item", 0, 10), c("npc", 0, -60)], me, "up")).toBe("item");
  });
  it("the nearest of the things in front wins, within reach", () => {
    expect(pickTarget([c("far", 60, 0), c("near", 30, 10)], me, "right")).toBe("near");
    expect(pickTarget([c("away", REACH_PX + 5, 0)], me, "right")).toBeNull();
  });
  it("nothing in front: nothing", () => {
    expect(pickTarget([c("tree", 0, 40)], me, "up")).toBeNull();
    expect(pickTarget([], me, "left")).toBeNull();
  });
});
