// Hidden relics and treasure: every relic is placed where its set belongs,
// and chests get richer with danger.
import { describe, expect, it } from "vitest";
import { RELICS, RELIC_SETS, relicByKey } from "@/lib/relics";
import { LEGENDARY_LOOT, RUMOUR_PRICE, lootFor } from "@/lib/treasure";
import { biomeAt, inHeartland } from "@/lib/continent";
import { townAt } from "@/lib/settlements";
import { openGround } from "@/lib/forage";
import { WEAPONS } from "@/lib/progression";
import { collectionPages } from "@/lib/collection";

describe("relics", () => {
  it("every piece of every set is placed, once", () => {
    for (const s of RELIC_SETS) expect(RELICS.filter((r) => r.set === s.key).length, s.key).toBe(s.names.length);
    expect(new Set(RELICS.map((r) => `${r.tx},${r.ty}`)).size).toBe(RELICS.length);
    expect(relicByKey("coins_0")?.name).toBe("Crown Penny");
  });
  it("relics lie on open ground outside the heartland, where their set belongs", () => {
    for (const r of RELICS) {
      expect(inHeartland(r.tx, r.ty), r.key).toBe(false);
      if (r.set !== "cards") {
        expect(townAt(r.tx, r.ty), r.key).toBeNull();
        expect(openGround(r.tx, r.ty), r.key).toBe(true);
      }
    }
    for (const r of RELICS.filter((r) => r.set === "fossils")) expect(["desert", "badlands", "beach"], r.key).toContain(biomeAt(r.tx, r.ty));
    for (const r of RELICS.filter((r) => r.set === "carvings")) expect(["snow", "darkwood", "swamp"], r.key).toContain(biomeAt(r.tx, r.ty));
    expect(RELICS.filter((r) => r.set === "cards" && townAt(r.tx, r.ty)).length).toBeGreaterThanOrEqual(6);
  });
  it("a set is spread out, not clumped", () => {
    for (const s of RELIC_SETS) {
      const rs = RELICS.filter((r) => r.set === s.key);
      for (const a of rs) {
        const nearest = Math.min(...rs.filter((b) => b !== a).map((b) => Math.hypot(a.tx - b.tx, a.ty - b.ty)));
        expect(nearest, a.key).toBeGreaterThan(40);
      }
    }
  });
  it("each set has a book page with hints and a treasure map reward", () => {
    const pages = collectionPages([]).filter((p) => p.kind === "relic");
    expect(pages.length).toBe(RELIC_SETS.length);
    for (const p of pages) {
      expect(p.reward.treasureMap).toBe(true);
      for (const e of p.entries) expect(e.hint, e.key).toMatch(/^(In|Somewhere in) /);
    }
  });
});

describe("treasure", () => {
  it("deeper danger, richer chests", () => {
    const mid = () => 0.5;
    const t = [1, 2, 3, 4].map((tier) => lootFor(tier, mid));
    for (let i = 1; i < 4; i++) {
      expect(t[i].coins).toBeGreaterThan(t[i - 1].coins);
      expect(t[i].xp).toBeGreaterThan(t[i - 1].xp);
    }
    expect(t[0].gems).toBe(0);
    expect(t[3].gems).toBeGreaterThan(0);
    for (const l of t) expect(l.items.length).toBe(1);
  });
  it("the legendary cache beats any chest, with the best blade of the near lands", () => {
    expect(LEGENDARY_LOOT.coins).toBeGreaterThan(lootFor(4, () => 0.99).coins);
    // Bjorn's far-land blades (forged from tier 5–8 trophies) are meant to outclass it.
    const farLand = new Set(["steel_sword", "wyvernbone_blade", "elder_blade"]);
    expect(WEAPONS[LEGENDARY_LOOT.items[0].itemKey].damage).toBeGreaterThan(Math.max(...Object.entries(WEAPONS).filter(([k]) => k !== "sunken_cutlass" && !farLand.has(k)).map(([, w]) => w.damage)));
  });
  it("a bought map doesn't pay back its price in coins (no money loop)", () => {
    let total = 0, n = 0;
    for (const tier of [1, 2]) for (let k = 0; k < 100; k++) { total += lootFor(tier, () => k / 100, true).coins; n++; }
    expect(total / n).toBeLessThanOrEqual(RUMOUR_PRICE);
    expect(lootFor(2, () => 0.5, true).coins).toBeLessThan(lootFor(2, () => 0.5).coins);
  });
});
