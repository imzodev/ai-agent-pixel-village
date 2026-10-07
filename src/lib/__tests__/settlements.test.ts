// The continent's towns: on dry land in the wilds, connected to the King's
// Road, fully built (square, inn, waystone, houses), peopled and stocked;
// and town reputation.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ROADS, SETTLEMENT_NPCS, TOWNS, TOWN_LAYOUT, townAt } from "@/lib/settlements";
import { continentAt, inHeartland } from "@/lib/continent";
import { ROAD, regionAt } from "@/lib/regions";
import { SHOP_STOCK, TRADES } from "@/lib/trade";
import { INNS } from "@/lib/inn";
import { REP_TIERS, discounted, repTier, townOfNpc } from "@/lib/reputation";

const manifest = JSON.parse(fs.readFileSync("public/buildings/buildings.json", "utf8")).buildings as { key: string; kind: string }[];

describe("towns", () => {
  it("twenty towns of every kind, in the wilds, apart from each other", () => {
    expect(TOWNS).toHaveLength(20);
    expect(new Set(TOWNS.map((t) => t.family)).size).toBe(6);
    expect(new Set(TOWNS.map((t) => t.key)).size).toBe(20);
    for (const t of TOWNS) {
      expect(inHeartland(t.sq.tx, t.sq.ty), t.name).toBe(false);
      for (const o of TOWNS) if (o !== t) expect(Math.hypot(o.sq.tx - t.sq.tx, o.sq.ty - t.sq.ty), `${t.name}–${o.name}`).toBeGreaterThan(100);
    }
  });
  it("are dry and open inside", () => {
    for (const t of TOWNS) for (let ty = t.box.ty0; ty <= t.box.ty1; ty += 4) for (let tx = t.box.tx0; tx <= t.box.tx1; tx += 5) {
      const c = continentAt(tx, ty);
      expect(c.collide, `${t.name} ${tx},${ty}`).toBeFalsy();
      expect(c.ground.startsWith("water_") || c.ground.startsWith("deep_"), `${t.name} ${tx},${ty}`).toBe(false);
      expect(c.lower?.startsWith("tree_") ?? false, `${t.name} ${tx},${ty}`).toBe(false);
    }
  });
  it("are fully built and named places", () => {
    for (const t of TOWNS) {
      for (const slot of TOWN_LAYOUT) expect(manifest.some((b) => b.key === `st_${t.key}_${slot.suffix}`), `${t.name} ${slot.suffix}`).toBe(true);
      expect(townAt(t.sq.tx + 12, t.sq.ty + 7)).toBe(t);
      expect(regionAt((t.sq.tx + 12) * 16, (t.sq.ty + 7) * 16)?.name).toBe(t.name);
    }
  });
  it("each road leaves a town and reaches the King's Road or another road", () => {
    expect(ROADS).toHaveLength(20); // one per town
    const roadTiles = new Set(ROADS.flatMap((r) => r.map(([x, y]) => `${x},${y}`)));
    for (const r of ROADS) {
      const [ex, ey] = r[r.length - 1];
      const onKingsRoad = ey >= ROAD.ty0 && ey <= ROAD.ty1 && ex >= ROAD.tx0 && ex <= ROAD.tx1;
      const onOther = ROADS.some((o) => o !== r && o.some(([x, y]) => x === ex && y === ey));
      expect(onKingsRoad || onOther, `road ending at ${ex},${ey}`).toBe(true);
      expect(TOWNS.some((t) => townAt(r[0][0], r[0][1]) === t || townAt(r[0][0] - 1, r[0][1]) === t || townAt(r[0][0] + 1, r[0][1]) === t)).toBe(true);
    }
    expect(roadTiles.size).toBeGreaterThan(500);
  });
  it("have an innkeeper, a shopkeeper, a bounty master and locals — stocked and housed", () => {
    for (const t of TOWNS) {
      const folk = SETTLEMENT_NPCS.filter((n) => n.town === t.key);
      for (const job of ["innkeeper", "shopkeeper", "bounty", "folk"]) expect(folk.some((n) => n.job === job), `${t.name} ${job}`).toBe(true);
      const inn = folk.find((n) => n.job === "innkeeper")!;
      const shop = folk.find((n) => n.job === "shopkeeper")!;
      expect(SHOP_STOCK[inn.key]?.length).toBeGreaterThan(0);
      expect(SHOP_STOCK[shop.key]?.length).toBeGreaterThan(0);
      expect(TRADES[shop.key]?.length).toBeGreaterThan(1);
      expect(INNS[`st_${t.key}_inn`]).toBe(inn.key);
    }
    expect(new Set(SETTLEMENT_NPCS.map((n) => n.key)).size).toBe(SETTLEMENT_NPCS.length);
  });
});

describe("reputation", () => {
  it("climbs through the tiers and discounts shop prices", () => {
    expect(repTier(0).name).toBe("Neutral");
    expect(repTier(REP_TIERS[1].min).name).toBe("Friendly");
    expect(repTier(10_000).name).toBe("Revered");
    expect(discounted(100, 0)).toBe(100);
    expect(discounted(100, 400)).toBe(85);
    expect(discounted(1, 400)).toBe(1);
  });
  it("knows whose town an NPC belongs to", () => {
    const n = SETTLEMENT_NPCS[0];
    expect(townOfNpc(n.key)).toBe(n.town);
    expect(townOfNpc("shopkeeper")).toBeNull(); // the village's Pip isn't a continent townsperson
  });
});
