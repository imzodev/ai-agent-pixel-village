// What E does: chopping acts at once, everything else opens the menu first.
import { describe, expect, it } from "vitest";
import { eDecision, isChopTarget, npcOptions, selectionKey } from "./selectionOptions";
import { SETTLEMENT_NPCS } from "@/lib/settlements";
import type { Selection } from "@/types/world";

const npc = (id: number, name = "x"): Selection => ({ type: "npc", id, name, role: "", sponsored: false, distance: 20 });
const tree: Selection = { type: "tree", vx: 1, vy: 2, kind: "oak", x: 0, y: 0, distance: 10 };
const oak: Selection = { type: "node", id: 5, kind: "oak_tree", stage: 3, stages: 4, distance: 10 };
const berries: Selection = { type: "node", id: 6, kind: "radish", stage: 3, stages: 4, distance: 10 };

describe("selection options", () => {
  it("shopkeepers sell and craft; a plain townsperson only talks", () => {
    const shop = SETTLEMENT_NPCS.find((n) => n.job === "shopkeeper")!;
    const folk = SETTLEMENT_NPCS.find((n) => n.job === "folk")!;
    expect(npcOptions("village_pip", []).stock.length).toBeGreaterThan(0);
    expect(npcOptions(shop.key, []).stock.length).toBeGreaterThan(0);
    expect(npcOptions(folk.key, []).stock.length).toBe(0);
  });
  it("selling only counts when you carry something they buy", () => {
    expect(npcOptions("village_pip", []).sellable).toBe(false);
    expect(npcOptions("village_pip", [{ itemKey: "stone", qty: 3 }]).sellable).toBe(true);
  });
  it("only chopping a tree is instant", () => {
    expect(isChopTarget(tree)).toBe(true);
    expect(isChopTarget(oak)).toBe(true);
    expect(isChopTarget(berries)).toBe(false);
    expect(isChopTarget(npc(1))).toBe(false);
    expect(isChopTarget({ type: "plot", lotKey: "land_0", plot: 1, x: 0, y: 0, distance: 5 })).toBe(false);
    expect(isChopTarget({ type: "item", id: 1, itemKey: "stone", distance: 5 })).toBe(false);
    expect(isChopTarget({ type: "building", id: 1, key: "home_1", name: "h", reservable: false, hasSponsor: false, distance: 5 })).toBe(false);
  });
  it("E: acts at once on a tree; opens the menu first on anything else, acts on the second press", () => {
    expect(eDecision({ inReach: true, instant: true, menuOpenForIt: false })).toBe("act");
    expect(eDecision({ inReach: true, instant: false, menuOpenForIt: false })).toBe("menu");
    expect(eDecision({ inReach: true, instant: false, menuOpenForIt: true })).toBe("act");
  });
  it("E out of reach always acts (it walks you over)", () => {
    expect(eDecision({ inReach: false, instant: false, menuOpenForIt: false })).toBe("act");
  });
  it("the same target keeps the same key", () => {
    expect(selectionKey(npc(4, "a"))).toBe(selectionKey({ ...npc(4, "a"), distance: 99 }));
    expect(selectionKey(npc(4))).not.toBe(selectionKey(npc(5)));
  });
});
