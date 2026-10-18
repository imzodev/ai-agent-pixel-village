// Gear slots: a weapon, the lantern and a charm are worn side by side; a
// second item for a slot replaces the first.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { GEAR_SLOT, GEAR_SLOT_LABEL, slotOf, toUnequip } from "@/lib/gear";

const SEED = (fs.readFileSync("src/lib/seed.ts", "utf8") + fs.readFileSync("src/lib/itemDefs.ts", "utf8")); // ITEM_DEFS (importing seed.ts needs a database)
const equippable = [...SEED.matchAll(/key: "([a-z_]+)",[^\n]*equippable: true/g)].map((m) => m[1]);

describe("gear slots", () => {
  it("puts every equippable item in a slot that's open", () => {
    expect(equippable.length).toBeGreaterThan(10);
    for (const key of equippable) expect(GEAR_SLOT_LABEL[slotOf(key)], key).toBeDefined();
    for (const key of Object.keys(GEAR_SLOT)) expect(equippable, `${key} is equippable`).toContain(key);
  });

  it("knows the lantern, the charm and the weapons", () => {
    expect(slotOf("lantern")).toBe("offhand");
    expect(slotOf("fox_charm")).toBe("charm");
    for (const k of ["wooden_sword", "steel_sword", "short_bow", "glacier_blade"]) expect(slotOf(k)).toBe("weapon");
  });

  it("swaps only what shares a slot", () => {
    expect(toUnequip(["stone_sword", "lantern"], "steel_sword")).toEqual(["stone_sword"]); // a sword replaces a sword
    expect(toUnequip(["stone_sword"], "lantern")).toEqual([]); // the lantern goes beside it
    expect(toUnequip(["stone_sword", "lantern"], "fox_charm")).toEqual([]);
    expect(toUnequip(["short_bow", "lantern", "fox_charm"], "wisp_blade")).toEqual(["short_bow"]);
  });
});
