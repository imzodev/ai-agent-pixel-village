import { describe, expect, it } from "vitest";
import { quickUsername, USERNAME_RE } from "@/lib/quickPlay";

describe("Play now usernames", () => {
  it("are readable and valid", () => {
    expect(quickUsername("Clover Hale", () => 0)).toBe("clover_hale_1000");
    expect(quickUsername("Ñandú  Pérez!", () => 0.5)).toBe("nandu_perez_5500");
  });

  it("fall back for names with nothing usable", () => {
    expect(quickUsername("🌳🌳", () => 0)).toBe("villager_1000");
    expect(quickUsername("Z", () => 0)).toBe("villager_1000");
  });

  it("always fit the username rules, even for long names", () => {
    for (const name of ["A".repeat(24), "a b c d e f g h i j k l m", "x_y", "Mary-Jane O'Neil", "___"]) {
      for (const r of [0, 0.3, 0.9999]) expect(quickUsername(name, () => r)).toMatch(USERNAME_RE);
    }
  });
});
