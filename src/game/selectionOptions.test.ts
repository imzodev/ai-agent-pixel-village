// What E does: one option acts at once, several open the menu first.
import { describe, expect, it } from "vitest";
import { eDecision, npcOptions, optionCount, selectionKey } from "./selectionOptions";
import { SETTLEMENT_NPCS } from "@/lib/settlements";
import type { Selection } from "@/types/world";

const none = { npcs: [], bag: [], lots: [], myId: null };
const building = (key: string, reservable = false): Selection => ({ type: "building", id: 1, key, name: key, reservable, hasSponsor: false, distance: 20 });
const npc = (id: number, name = "x"): Selection => ({ type: "npc", id, name, role: "", sponsored: false, distance: 20 });

describe("selection options", () => {
  it("shopkeepers have several options; a plain townsperson has one", () => {
    const shop = SETTLEMENT_NPCS.find((n) => n.job === "shopkeeper")!;
    const folk = SETTLEMENT_NPCS.find((n) => n.job === "folk")!;
    const npcs = [{ id: 1, key: "village_pip" }, { id: 2, key: shop.key }, { id: 3, key: folk.key }];
    const ctx = { ...none, npcs };
    expect(optionCount(npc(1), ctx)).toBeGreaterThan(1);
    expect(optionCount(npc(2), ctx)).toBeGreaterThan(1);
    expect(optionCount(npc(3), ctx)).toBe(1);
    expect(optionCount(npc(99), ctx)).toBe(1); // unknown: talk
  });
  it("selling only counts when you carry something they buy", () => {
    expect(npcOptions("village_pip", []).sellable).toBe(false);
    expect(npcOptions("village_pip", [{ itemKey: "stone", qty: 3 }]).sellable).toBe(true);
  });
  it("everything else is a single option", () => {
    const tree: Selection = { type: "tree", vx: 1, vy: 2, kind: "oak", x: 0, y: 0, distance: 10 };
    expect(optionCount(tree, none)).toBe(1);
  });
  it("a home offers entering and its lot action; a cave just entering", () => {
    const home = building("home_1");
    const free = { buildingKey: "home_1", owner: null };
    expect(optionCount(home, { ...none, lots: [free] })).toBe(2); // enter, move in
    expect(optionCount(home, { ...none, lots: [{ ...free, owner: { id: 7, name: "me" } }], myId: 7 })).toBe(2); // enter, move out
    expect(optionCount(home, { ...none, lots: [{ ...free, owner: { id: 8, name: "them" } }], myId: 7 })).toBe(1); // enter
    expect(optionCount(building("cave_mouth"), none)).toBe(1);
    expect(optionCount(building("bakery", true), none)).toBe(2); // enter, reserve
    expect(optionCount(building("land_3"), { ...none, lots: [{ buildingKey: "land_3", owner: null }] })).toBe(1); // claim
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
