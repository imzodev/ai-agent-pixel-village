// What E does: one option acts at once, several open the menu first.
import { describe, expect, it } from "vitest";
import { eDecision, npcOptions, optionCount, selectionKey } from "./selectionOptions";
import { SETTLEMENT_NPCS } from "@/lib/settlements";
import type { Selection } from "@/types/world";

const npc = (id: number, name = "x"): Selection => ({ type: "npc", id, name, role: "", sponsored: false, distance: 20 });

describe("selection options", () => {
  it("shopkeepers have several options; a plain townsperson has one", () => {
    const shop = SETTLEMENT_NPCS.find((n) => n.job === "shopkeeper")!;
    const folk = SETTLEMENT_NPCS.find((n) => n.job === "folk")!;
    const npcs = [{ id: 1, key: "village_pip" }, { id: 2, key: shop.key }, { id: 3, key: folk.key }];
    expect(optionCount(npc(1), npcs, [])).toBeGreaterThan(1);
    expect(optionCount(npc(2), npcs, [])).toBeGreaterThan(1);
    expect(optionCount(npc(3), npcs, [])).toBe(1);
    expect(optionCount(npc(99), npcs, [])).toBe(1); // unknown: talk
  });
  it("selling only counts when you carry something they buy", () => {
    expect(npcOptions("village_pip", []).sellable).toBe(false);
    expect(npcOptions("village_pip", [{ itemKey: "stone", qty: 3 }]).sellable).toBe(true);
  });
  it("everything else is a single option", () => {
    const tree: Selection = { type: "tree", vx: 1, vy: 2, kind: "oak", x: 0, y: 0, distance: 10 };
    expect(optionCount(tree, [], [])).toBe(1);
  });
  it("E: menu for many options in reach; act otherwise, and on the second press", () => {
    expect(eDecision({ count: 5, inReach: true, menuOpenForIt: false })).toBe("menu");
    expect(eDecision({ count: 5, inReach: true, menuOpenForIt: true })).toBe("act");
    expect(eDecision({ count: 5, inReach: false, menuOpenForIt: false })).toBe("act");
    expect(eDecision({ count: 1, inReach: true, menuOpenForIt: false })).toBe("act");
  });
  it("the same target keeps the same key", () => {
    expect(selectionKey(npc(4, "a"))).toBe(selectionKey({ ...npc(4, "a"), distance: 99 }));
    expect(selectionKey(npc(4))).not.toBe(selectionKey(npc(5)));
  });
});
