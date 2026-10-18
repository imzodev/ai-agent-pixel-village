// The economy: one value per item, prices derived from it, no buy-and-sell-
// back loops, a buyer for everything worth something, and supply & demand.
import { describe, expect, it } from "vitest";
import { BUY_RATE, DEAR_DISCOUNT, buyPrice, categoryOf, isGoods, marketOf, shopPrice } from "@/lib/economy";
import { ITEM_DEFS, itemValue } from "@/lib/itemDefs";
import { BUYERS, GENERAL_WEIGHT, SHOP_STOCK, SPECIALIST_WEIGHT, TRADES, buyerWeight, findBuyer, marketDepth } from "@/lib/trade";
import { DEMAND_HALF_LIFE_MS, PRICE_FLOOR, affordableBulk, bulkPay, decayGlut, demandFactor, depthOf, trendOf, unitPrice } from "@/lib/market";
import { MERCHANT_STOCK } from "@/lib/encounters";
import { REP_TIERS, townOfNpc } from "@/lib/reputation";
import { HAGGLER_MULT } from "@/lib/progression";
import { PROFILE_OF } from "@/lib/mind/profiles";
import { FURNITURE_VALUE } from "@/lib/furniture";
import { FISH_DEFS } from "@/lib/fishing";

const MAX_REP_DISCOUNT = Math.max(...REP_TIERS.map((t) => t.discount));

/** The least a player can buy one for from this seller: its price after every discount it can give. */
function cheapest(sellerKey: string, t: { price: number; qty: number }): number {
  let unit = t.price;
  if (townOfNpc(sellerKey)) unit = Math.max(1, Math.round(unit * (1 - MAX_REP_DISCOUNT)));
  if (PROFILE_OF[sellerKey]) unit = Math.max(1, Math.ceil(unit * (1 - DEAR_DISCOUNT))); // rounded up, as the route does
  return unit / t.qty;
}

describe("one price model", () => {
  it("every item has one value, and furniture's agrees with the workshop's", () => {
    const keys = ITEM_DEFS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [k, v] of Object.entries(FURNITURE_VALUE)) expect(itemValue(k), k).toBe(v);
    for (const f of FISH_DEFS) expect(itemValue(f.key), f.key).toBe(f.price);
  });
  it("specialists pay value, others BUY_RATE of it; shops sell goods at a markup", () => {
    expect(buyPrice("pumpkin", true)).toBe(20);
    expect(buyPrice("pumpkin", false)).toBe(Math.floor(20 * BUY_RATE));
    expect(buyPrice("wheat", false)).toBe(1); // never nothing
    expect(shopPrice("bread")).toBeGreaterThan(itemValue("bread"));
    expect(shopPrice("axe")).toBe(itemValue("axe")); // gear isn't bought back
    expect(categoryOf("silverrun_pike")).toBe("fish");
    expect(categoryOf("lost_doll")).toBe("keepsake");
    expect(isGoods("wyvern_bone")).toBe(true);
    expect(isGoods("axe")).toBe(false);
  });
  it("no item can be bought and sold back at a profit, with every discount and Haggler", () => {
    const maxPay = new Map<string, number>();
    for (const list of Object.values(TRADES)) for (const t of list) maxPay.set(t.itemKey, Math.max(maxPay.get(t.itemKey) ?? 0, t.price * HAGGLER_MULT));
    const sellers = [...Object.entries(SHOP_STOCK), ["enc_merchant_1", MERCHANT_STOCK] as const];
    const loops: string[] = [];
    for (const [seller, stock] of sellers) for (const t of stock) {
      const pay = maxPay.get(t.itemKey);
      if (pay != null && pay >= cheapest(seller, t)) loops.push(`${t.itemKey}: ${seller} sells at ${cheapest(seller, t)}, someone pays ${pay}`);
    }
    expect(loops).toEqual([]);
  });
  it("every good worth something has a buyer somewhere", () => {
    const bought = new Set(Object.values(TRADES).flat().map((t) => t.itemKey));
    const orphans = ITEM_DEFS.filter((i) => i.value > 0 && isGoods(i.key) && !bought.has(i.key)).map((i) => i.key);
    expect(orphans).toEqual([]);
  });
  it("buy lists only hold goods, each once", () => {
    for (const [npcKey, list] of Object.entries(TRADES)) {
      const keys = list.map((t) => t.itemKey);
      expect(new Set(keys).size, npcKey).toBe(keys.length);
      for (const k of keys) expect(isGoods(k), `${npcKey} buys ${k}`).toBe(true);
    }
    expect(Object.keys(BUYERS).every((k) => TRADES[k])).toBe(true);
  });
  it("the far lands and the bosses finally pay", () => {
    expect(findBuyer("wyvern_bone")?.npcKey).toBeTruthy();
    expect(findBuyer("hollow_eye")?.trade.price).toBe(itemValue("hollow_eye"));
    expect(TRADES.hollowmere_vesna.some((t) => t.itemKey === "rime_essence")).toBe(true);
  });
  it("findBuyer takes the best price, in the market asked for", () => {
    expect(findBuyer("egg", "village")?.npcKey).toBe("village_marigold"); // specialist beats Odo
    expect(findBuyer("egg", "village")!.trade.price).toBeGreaterThan(TRADES.village_odo.find((t) => t.itemKey === "egg")!.price - 1);
    expect(marketOf(findBuyer("wood", "brightwater")!.npcKey)).toBe("brightwater");
    expect(findBuyer("silverrun_pike", "hollowmere")).toBeNull();
  });
  it("the main prices (change them on purpose)", () => {
    const shop = (npc: string, item: string) => SHOP_STOCK[npc].find((t) => t.itemKey === item)!.price;
    const buy = (npc: string, item: string) => TRADES[npc].find((t) => t.itemKey === item)!.price;
    expect({
      bread: shop("village_marigold", "bread"), stew: shop("village_hettie", "hot_stew"), flour: shop("village_hollis", "flour"),
      wood: shop("hollowmere_ansel", "wood"), axe: shop("village_pip", "axe"), arrows: shop("village_pip", "arrow"),
      wheat: buy("village_hollis", "wheat"), pumpkin: buy("village_marigold", "pumpkin"), pumpkinOdo: buy("village_odo", "pumpkin"),
      pike: buy("brightwater_marina", "silverrun_pike"), woodTobias: buy("brightwater_tobias", "wood"), cheese: buy("village_hettie", "cheese"),
    }).toMatchInlineSnapshot(`
      {
        "arrows": 8,
        "axe": 25,
        "bread": 5,
        "cheese": 12,
        "flour": 5,
        "pike": 90,
        "pumpkin": 20,
        "pumpkinOdo": 14,
        "stew": 8,
        "wheat": 1,
        "wood": 3,
        "woodTobias": 2,
      }
    `);
  });
});

describe("supply and demand", () => {
  it("the price falls as the market fills, never below the floor", () => {
    const d = depthOf("wheat");
    expect(demandFactor(0, d)).toBe(1);
    expect(demandFactor(d, d)).toBeCloseTo(0.5);
    expect(demandFactor(1e9, d)).toBe(PRICE_FLOOR);
    expect(unitPrice(10, d, d)).toBeCloseTo(5);
    expect(trendOf(0, d)).toBe("fresh");
    expect(trendOf(d, d)).toBe("plenty");
    expect(trendOf(d * 5, d)).toBe("glut");
  });
  it("cheap bulk goods are shallow, dear ones barely move", () => {
    expect(depthOf("wheat")).toBeGreaterThan(depthOf("river_trout"));
    expect(1 - demandFactor(1, depthOf("silverrun_pike"))).toBeLessThan(0.12);
  });
  it("a market with more buyers for something takes more of it", () => {
    // the village: Marigold (specialist) and Odo and Hettie (general) all buy eggs; only Odo buys fish
    expect(buyerWeight("village", "egg")).toBe(SPECIALIST_WEIGHT + 2 * GENERAL_WEIGHT);
    expect(buyerWeight("village", "river_trout")).toBe(GENERAL_WEIGHT);
    expect(buyerWeight("hollowmere", "silverrun_pike")).toBe(0);
    expect(marketDepth("village", "egg")).toBe(depthOf("egg") * 2);
    expect(marketDepth("brightwater", "river_trout")).toBeGreaterThan(marketDepth("village", "river_trout"));
    expect(marketDepth("hollowmere", "silverrun_pike")).toBe(depthOf("silverrun_pike") * GENERAL_WEIGHT); // never zero
  });
  it("forgets a flood over time", () => {
    expect(decayGlut(100, DEMAND_HALF_LIFE_MS)).toBeCloseTo(50);
    expect(decayGlut(100, 24 * 3600_000)).toBeLessThan(1);
    expect(decayGlut(100, -5)).toBe(100);
  });
  it("selling in bulk pays each one after the one before", () => {
    const d = depthOf("wheat");
    expect(bulkPay(1, 0, d, 1)).toBe(1);
    const flood = bulkPay(1, 0, d, 300);
    expect(flood).toBeLessThan(300 * 0.4);
    expect(flood).toBeGreaterThan(300 * PRICE_FLOOR);
    expect(bulkPay(1, 0, d, 100) + bulkPay(1, 100, d, 100)).toBeCloseTo(bulkPay(1, 0, d, 200));
  });
  it("a buyer with a purse takes what it can pay for", () => {
    expect(affordableBulk(10, 0, 20, 5, null)).toBe(5);
    expect(affordableBulk(10, 0, 20, 5, 25)).toBe(2);
    expect(affordableBulk(10, 0, 20, 5, 0)).toBe(0);
    expect(affordableBulk(10, 0, 20, 5, 25, 1.2)).toBe(2);
  });
});

describe("a person's pace, not a bot's", () => {
  it("gathering allows a short burst, then refuses; casting one at a time", async () => {
    const { gatherLimiter, castLimiter } = await import("@/lib/rateLimit");
    const who = `t${Math.random()}`;
    expect(Array.from({ length: 5 }, () => gatherLimiter.allow(who)).every(Boolean)).toBe(true);
    expect(gatherLimiter.allow(who)).toBe(false);
    expect(castLimiter.allow(who)).toBe(true);
    expect(castLimiter.allow(who)).toBe(false);
  });
});
