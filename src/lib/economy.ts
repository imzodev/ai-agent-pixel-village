// The price model: one value per item (src/lib/itemDefs.ts), and every NPC
// price derived from it. Pure, so the HUD, the routes and the tests agree.
//
// - A specialist pays the item's full value; anyone else BUY_RATE of it.
// - Shops sell goods for SELL_MARKUP × value (at least value + 1); gear and
//   seeds aren't bought back, so they sell at their value.
// - What a buyer pays then falls as its market fills up (src/lib/market.ts).
//
// The rule that keeps it honest (src/lib/__tests__/economy.test.ts): the most
// anyone pays for an item — specialist, Haggler, an empty market — is less
// than the least it can be bought for — a shop's price after the best
// discount. So nothing can be bought and sold back at a profit.

import { ITEM_DEFS, itemValue } from "./itemDefs";
import { FISH_DEFS } from "./fishing";
import { ORCHARD_FRUITS } from "./orchard";
import type { BuyerSpec, GoodsCategory } from "@/types/economy";

export type { BuyerSpec, GoodsCategory, MarketPrice, MarketTrend } from "@/types/economy";

/** What a buyer that isn't a specialist pays, as a share of value. */
export const BUY_RATE = 0.7;
/** Shops sell goods for this × value. */
export const SELL_MARKUP = 1.5;
/** What an NPC with a mind takes off for a dear friend (src/lib/mind/regard.ts tiers). */
export const DEAR_DISCOUNT = 0.2;

const set = (...keys: string[]) => new Set(keys);
const CATEGORY_SETS: readonly [GoodsCategory, ReadonlySet<string>][] = [
  ["fish", new Set(FISH_DEFS.map((f) => f.key))],
  ["produce", set("wheat", "radish", "carrot", "tomato", "bell_pepper", "onion", "cabbage", "pumpkin", "herb", "mushroom", "berry")],
  ["fruit", set("red_grape", "white_grape", "apple", ...ORCHARD_FRUITS.map((f) => f.fruit))],
  ["animal", set("egg", "milk", "wool", "honey", "golden_egg", "fine_wool", "rich_milk")],
  ["drink", set("grape_juice", "cider", "red_wine", "white_wine", "aged_red_wine", "aged_white_wine", "orange_juice", "lemonade", "pear_cider")],
  ["food", set("bread", "flour", "honey_bun", "tea", "cinnamon_knot", "hot_stew", "cheese", "jam", "cherry_jam", "peach_jam", "plum_jam", "apple_pie", "cherry_pie", "peach_pie")],
  ["craft", set("cloth", "plank", "fittings")],
  ["raw", set("wood", "stone")],
  ["monster", set("slime_gel", "bat_wing", "thorn", "boar_hide", "wolf_pelt", "chitin", "lurker_hide", "frost_pelt", "shade_essence", "wisp_essence")],
  ["farland", set("stalker_scale", "hag_charm", "troll_hide", "gloam_antler", "basalt_core", "wyvern_bone", "rime_essence", "elder_heartwood")],
  ["trophy", set("wyrm_fang", "giant_heart", "drake_horn", "hollow_eye", "rootking_heartwood")],
  ["gear", set("arrow")],
];

/** The category of an item (keepsake for anything without a value). */
export function categoryOf(itemKey: string): GoodsCategory {
  for (const [cat, keys] of CATEGORY_SETS) if (keys.has(itemKey)) return cat;
  const def = ITEM_DEFS.find((i) => i.key === itemKey);
  if (!def || def.value <= 0) return "keepsake";
  if (def.kind === "furniture") return "furniture";
  if (def.kind === "seed") return "seed";
  if (def.kind === "tool") return "gear";
  return "keepsake";
}

/** Goods are what NPCs buy from players (not gear, seeds or keepsakes). */
export const isGoods = (itemKey: string): boolean => !["gear", "seed", "keepsake"].includes(categoryOf(itemKey));

/** A category in words, for NPCs' knowledge. */
export const CATEGORY_WORDS: Readonly<Partial<Record<GoodsCategory, string>>> = {
  produce: "crops", fruit: "fruit", fish: "fish", animal: "eggs, milk, wool and honey", drink: "drinks",
  food: "food", craft: "cloth, planks and fittings", furniture: "furniture", raw: "wood and stone",
  monster: "hides and essences from the wilds", farland: "far-land materials", trophy: "boss trophies",
};

/** Every item a buyer spec takes (its categories expanded). */
export function itemsOf(keys: readonly string[]): string[] {
  const out = new Set<string>();
  for (const k of keys) {
    if (ITEM_DEFS.some((i) => i.key === k)) { out.add(k); continue; }
    for (const i of ITEM_DEFS) if (i.value > 0 && categoryOf(i.key) === k) out.add(i.key);
  }
  return [...out];
}

/** Does this spec list the item, by key or by its category? */
export const specCovers = (keys: readonly string[] | undefined, itemKey: string): boolean =>
  !!keys && (keys.includes(itemKey) || keys.includes(categoryOf(itemKey)));

/** What a buyer pays for one when its market isn't full of it: full value for a specialist, BUY_RATE of it otherwise. */
export function buyPrice(itemKey: string, specialist: boolean): number {
  const v = itemValue(itemKey);
  if (v <= 0) return 0;
  return Math.max(1, Math.floor(v * (specialist ? 1 : BUY_RATE)));
}

/** A few items whose shop price is a deal rather than the markup (per one). */
const PRICE_OVERRIDE: Readonly<Record<string, number>> = {
  fittings: 6, // building material: kept cheap so barns cost coins, not fittings
  arrow: 0.8, // sold in tens: 8 for 10
};

/** What a shop charges for one. */
export function shopPrice(itemKey: string): number {
  if (itemKey in PRICE_OVERRIDE) return PRICE_OVERRIDE[itemKey];
  const v = itemValue(itemKey);
  if (!isGoods(itemKey)) return v;
  return Math.max(v + 1, Math.ceil(v * SELL_MARKUP));
}

/** The market an NPC trades in: the place in its key (village, hollowmere, a town…). */
export const marketOf = (npcKey: string): string => npcKey.split("_")[0];

/** A market's name in words. */
export function marketName(market: string): string {
  return market === "village" ? "the village" : market.charAt(0).toUpperCase() + market.slice(1);
}

/** The buy list for a buyer spec: every item it takes, at its price. */
export function buyList(spec: BuyerSpec): { itemKey: string; price: number }[] {
  return itemsOf(spec.buys).map((itemKey) => ({ itemKey, price: buyPrice(itemKey, specCovers(spec.specialty, itemKey)) })).filter((t) => t.price > 0);
}
