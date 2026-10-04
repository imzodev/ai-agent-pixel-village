// Picked wild patches hide for you until your cooldown ends, then come back.
import { describe, expect, it } from "vitest";
import { claimForage, pickedByMe, setForageClaims } from "./forageClaims";
import { forageKey } from "@/lib/forage";

describe("forage claims", () => {
  it("a picked patch is hidden until it's back; others aren't", () => {
    setForageClaims([]);
    claimForage("herb_patch", 100, 200, 5000);
    expect(pickedByMe("herb_patch", 100, 200, 1000)).toBe(true);
    expect(pickedByMe("herb_patch", 116, 200, 1000)).toBe(false);
    expect(pickedByMe("herb_patch", 100, 200, 5000)).toBe(false); // back
  });
  it("the server's list replaces it all; only wild patches count", () => {
    setForageClaims([{ patch: forageKey("rock", 10, 10), readyAt: 9000 }]);
    expect(pickedByMe("rock", 10, 10, 1)).toBe(true);
    expect(pickedByMe("oak_tree", 10, 10, 1)).toBe(false);
  });
});
