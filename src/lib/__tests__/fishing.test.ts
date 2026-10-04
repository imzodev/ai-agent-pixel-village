// Fishing: twelve sellable fish, the roll respects water / time / weather,
// and only deep water within reach counts.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CATCH_ZONE, FISH_DEFS, fishFor, rollFish, waterAt, waterInFront } from "@/lib/fishing";
import { TRADES } from "@/lib/trade";

const RIVER = { tx: -621, ty: -111 };
const POND = { tx: -297, ty: 26 };

// seed.ts talks to the database on import, so read its keys as text.
const SEED_KEYS = new Set([...fs.readFileSync("src/lib/seed.ts", "utf8").matchAll(/\bkey: "([a-z_]+)"/g)].map((m) => m[1]));

describe("fish data", () => {
  it("12 fish, each an item Marina buys", () => {
    expect(FISH_DEFS).toHaveLength(12);
    const items = SEED_KEYS;
    const marina = new Set((TRADES.brightwater_marina ?? []).map((t) => t.itemKey));
    for (const f of FISH_DEFS) {
      expect(items.has(f.key), f.key).toBe(true);
      expect(marina.has(f.key), f.key).toBe(true);
    }
  });
  it("rarer fish leave a smaller catch zone", () => {
    expect(CATCH_ZONE.common).toBeGreaterThan(CATCH_ZONE.uncommon);
    expect(CATCH_ZONE.uncommon).toBeGreaterThan(CATCH_ZONE.rare);
    expect(CATCH_ZONE.rare).toBeGreaterThan(CATCH_ZONE.legendary);
  });
});

describe("the roll", () => {
  it("always has something to catch, anywhere, any time", () => {
    for (const water of ["river", "pond"] as const)
      for (let h = 0; h < 24; h++)
        for (const w of ["clear", "rain", "fog", "snow"]) expect(fishFor(water, h, w).length, `${water} ${h} ${w}`).toBeGreaterThan(0);
  });
  it("respects water, time and weather", () => {
    const keys = (water: "river" | "pond", h: number, w: string) => fishFor(water, h, w).map((f) => f.key);
    expect(keys("river", 23, "clear")).toContain("moonfin");
    expect(keys("river", 12, "clear")).not.toContain("moonfin");
    expect(keys("pond", 23, "clear")).not.toContain("moonfin");
    expect(keys("pond", 18, "clear")).toContain("golden_carp");
    expect(keys("pond", 12, "rain").includes("storm_eel") || keys("river", 12, "rain").includes("storm_eel")).toBe(true);
    expect(keys("river", 12, "clear")).not.toContain("storm_eel");
  });
  it("rollFish draws from the eligible pool", () => {
    for (const r of [0, 0.3, 0.6, 0.999]) {
      const f = rollFish("pond", 12, "clear", () => r);
      expect(fishFor("pond", 12, "clear")).toContain(f);
    }
  });
});

describe("water", () => {
  it("knows the Silverrun from a pond, and dry land from both", () => {
    expect(waterAt(RIVER.tx, RIVER.ty)).toBe("river");
    expect(waterAt(POND.tx, POND.ty)).toBe("pond");
    expect(waterAt(0, 5)).toBeNull();
  });
  it("finds water just in front of you, not behind", () => {
    // Stand one tile left of the pond tile, facing right.
    const x = (POND.tx - 1) * 16 + 8, y = POND.ty * 16 + 8 + 6;
    const hit = waterInFront(x, y, "right");
    expect(hit?.water).toBe("pond");
    if (!waterAt(POND.tx - 2, POND.ty) && !waterAt(POND.tx - 3, POND.ty) && !waterAt(POND.tx - 4, POND.ty)) expect(waterInFront(x, y, "left")).toBeNull();
  });
});
