// Trade module — pure data + client-safe helpers. Owns the NPC buy list.
// The db-touching sell logic lives in the route, not here, so the client
// bundle doesn't pull in the pg driver.
//
// To add a new trader or a new item:
//   1. Add the item to src/lib/itemDefs.ts (its value) and its category in
//      src/lib/economy.ts.
//   2. Add a buyer to BUYERS (or a category to one) below.
// Prices come from the model (src/lib/economy.ts); the modal, route, NPC
// Sell offer and the in-character "I buy X" line pick it up automatically.
import { ORCHARD_FRUITS } from "./orchard";
import type { TradeConfig, TradeItem } from "./types";
import type { BuyerSpec } from "@/types/economy";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import { MERCHANT_STOCK, isMerchantKey } from "./encounters";
import { buyList, marketOf, shopPrice, specCovers } from "./economy";
import { depthOf } from "./market";

/**
 * Who buys what from players, keyed by `npc.key`: categories or item keys
 * (src/lib/economy.ts), and the ones each is a specialist in (full value;
 * everything else at BUY_RATE). Prices come from the model and fall as a
 * market fills up (src/lib/market.ts); lines carry no numbers for that reason.
 */
export const BUYERS: Record<string, BuyerSpec> = {
  village_marigold: {
    buys: ["egg", "pumpkin", "tomato", "onion", "bell_pepper", "berry", "apple", "cherry", "peach", "honey"],
    specialty: ["egg", "pumpkin", "tomato", "onion", "bell_pepper", "berry", "apple", "cherry", "peach", "honey"],
    line: "Hand it here, love. Fresh things go in the oven, and I pay fair for them.",
  },
  village_greta: {
    buys: ["raw", "wool", "slime_gel", "thorn", "boar_hide", "wolf_pelt", "chitin", "plank"],
    specialty: ["raw", "slime_gel", "chitin", "plank"],
    line: "Oak, stone, gel for the bearings: I can use all of it.",
  },
  village_hollis: {
    buys: ["wheat", "milk"],
    specialty: ["wheat"],
    line: "I'll buy your wheat. Mind, when the whole village brings me sheaves, I pay less.",
  },
  village_wren: {
    buys: ["herb", "mushroom", "berry", "bat_wing", "wisp_essence", "shade_essence"],
    specialty: ["herb", "mushroom", "bat_wing", "wisp_essence", "shade_essence"],
    line: "Herbs in good nick, and the odd strange thing. Don't ask what for.",
  },
  village_pip: {
    buys: ["fruit", "furniture", "cloth", "fine_wool", "mushroom", "carrot", "radish", "stone", "slime_gel"],
    specialty: ["fruit", "furniture", "carrot", "radish"],
    line: "Good furniture and good fruit always sell. Let's see what you've got.",
  },
  // Odo: the grove's trader, buys nearly anything at the general rate.
  village_odo: {
    buys: ["produce", "fruit", "fish", "animal", "food", "drink", "craft", "furniture", "monster"],
    line: "Odo buys everything! Not always at the best price, mind — the specialists pay more.",
  },
  hollowmere_bjorn: {
    buys: ["stone", "wood", "thorn", "boar_hide", "wolf_pelt", "lurker_hide", "frost_pelt", "chitin"],
    specialty: ["stone", "thorn", "boar_hide", "wolf_pelt", "lurker_hide", "frost_pelt"],
    line: "Good stone and good hide are always welcome at the forge.",
  },
  hollowmere_ivy: {
    buys: ["furniture", "drink", "cheese", "honey", "milk", "egg", "berry", "herb", "food"],
    specialty: ["furniture", "drink", "cheese", "honey", "milk"],
    line: "For the Sawdust & Ale? Gladly. The woodcutters drink and eat like bears.",
  },
  // Vesna: the curio dealer, for what the far lands and their bosses leave behind.
  hollowmere_vesna: {
    buys: ["farland", "trophy", "monster"],
    specialty: ["farland", "trophy"],
    line: "Scale, bone, a wraith's cold breath… bring me what the far lands keep, and I'll pay what it's worth.",
  },
  village_hettie: {
    buys: ["red_grape", "white_grape", "apple", "drink", "jam", "cheese", "honey", "golden_egg", "rich_milk", "milk", "egg", "food"],
    specialty: ["drink", "jam", "cheese", "golden_egg", "rich_milk"],
    line: "For the Wayfarer's kitchen and the bar? Let's have a look, dear.",
  },
  brightwater_coral: {
    buys: ["drink", "cheese", "honey", "milk", "egg", "food"],
    specialty: ["drink", "cheese", "milk"],
    line: "Cheese and wine, out here by the sea? The captains will pay for that.",
  },
  brightwater_marina: {
    buys: ["fish", "carrot", "tomato", "onion", "cabbage", "bell_pepper", "pumpkin"],
    specialty: ["fish", "carrot", "tomato", "onion", "cabbage", "bell_pepper", "pumpkin"],
    line: "Fish for the market, veg for the stew pot. I pay better than anyone east of the river.",
  },
  // Living traders (src/lib/mind/profiles.ts): they pay from their purse for what they make things from.
  hollowmere_maren: {
    buys: ["wood", "plank"],
    specialty: ["wood", "plank"],
    line: "Logs and planks, always. Good timber makes good chairs.",
  },
  village_della: {
    buys: ["milk", "wool", "rich_milk", "fine_wool"],
    specialty: ["milk", "wool", "rich_milk", "fine_wool"],
    line: "Milk for the cheese press, wool for the loom. I pay fair for good stuff.",
  },
  village_fenwick: {
    buys: ["apple", "red_grape", "white_grape", "pear"],
    specialty: ["apple", "red_grape", "white_grape", "pear"],
    line: "Apples, grapes, pears — the press is hungry!",
  },
  brightwater_tobias: {
    buys: ["wood", "plank"],
    specialty: ["wood", "plank"],
    line: "Good timber's hard to come by this side of the mountains. Boats don't build themselves.",
  },
};

/** What each kind of town's shopkeeper buys on top of the rest, as a specialist (the land's own goods). */
const REGIONAL_BUYS: Readonly<Record<string, readonly string[]>> = {
  port: ["fish"],
  desert: ["chitin", "stalker_scale", "basalt_core"],
  snow: ["frost_pelt", "wood", "troll_hide", "rime_essence", "wyvern_bone"],
  swamp: ["lurker_hide", "herb", "hag_charm"],
  darkwood: ["shade_essence", "mushroom", "gloam_antler", "elder_heartwood"],
  hills: ["wheat", "pumpkin", "wool"],
};
for (const n of SETTLEMENT_NPCS) {
  const town = TOWNS.find((t) => t.key === n.town);
  if (!town) continue;
  if (n.job === "innkeeper") {
    BUYERS[n.key] = { buys: ["drink", "cheese", "honey", "milk", "egg", "food"], specialty: ["drink", "cheese"], line: `Good things from the road are rare in ${town.name}. Let's see.` };
  } else if (n.job === "shopkeeper") {
    BUYERS[n.key] = { buys: ["stone", "furniture", "fruit", ...REGIONAL_BUYS[town.family]], specialty: ["furniture", ...REGIONAL_BUYS[town.family]], line: `${town.name} pays well for what the land around it gives, and for good furniture.` };
  }
}

/** Per-NPC buy lists, built from BUYERS and the price model. */
export const TRADES: TradeConfig = Object.fromEntries(
  Object.entries(BUYERS).map(([npcKey, spec]) => [npcKey, buyList(spec).map((t) => ({ ...t, qty: 1, line: spec.line }))]),
);

/** A shop line: what it sells (qty per sale) and how it's said. Price comes from the model. */
const sells = (itemKey: string, line: string, qty = 1, minLevel?: number): TradeItem => ({ itemKey, qty, price: Math.round(shopPrice(itemKey) * qty), line, ...(minLevel ? { minLevel } : {}) });

/**
 * What NPCs SELL to players (the other direction from TRADES), keyed by
 * `npc.key`. `price` is per `qty`, from the price model (src/lib/economy.ts).
 */
export const SHOP_STOCK: TradeConfig = {
  // Marigold sells off her shelf, only while she has it (src/lib/mind/profiles.ts BAKER).
  village_marigold: [
    sells("bread", "A loaf from the shelf. Still warm, love."),
    sells("honey_bun", "Honey bun. Sticky fingers guaranteed."),
    sells("apple_pie", "Apple pie. Your apples, my oven."),
    sells("cherry_pie", "Cherry pie. Mind the stones, love."),
    sells("peach_pie", "Peach pie. Summer in a dish."),
  ],
  village_pip: [
    sells("grape_cutting", "A red grapevine cutting, for a vineyard trellis."),
    sells("white_grape_cutting", "White grape cutting. Fussier, but the wine!"),
    sells("apple_sapling", "An apple sapling. Patience, then apples forever."),
    sells("radish_seeds", "Radish seeds — quick growers."),
    sells("carrot_seeds", "Carrot seeds. Patience pays.", 1, 2),
    sells("tomato_seeds", "Tomato seeds. Water them well!", 1, 3),
    sells("pumpkin_seeds", "Pumpkin seeds — slow, but oh, the payoff.", 1, 5),
    sells("axe", "A woodcutter's axe. The oaks are out west, past the woods."),
    sells("fishing_rod", "A fishing rod. Ponds, rivers — face the water and cast."),
    sells("bicycle", "A bicycle! The roads to the new towns go by in no time. Press V to ride."),
    sells("short_bow", "A short bow. Equip it and you can hit things from a safe distance."),
    sells("arrow", "Ten arrows. Every shot uses one.", 10),
  ],
  brightwater_marina: [
    sells("fishing_rod", "A good rod. The Silverrun's full of them — fish, I mean."),
  ],
  hollowmere_ivy: [
    sells("hot_stew", "Hot stew. Sticks to your ribs."),
    sells("bread", "Fresh bread. Restores a body after the road."),
    sells("tea", "Calming tea. Good for what ails you."),
    sells("honey_bun", "Honey bun — worth every coin."),
  ],
  village_hettie: [
    sells("hot_stew", "A bowl of hot stew. Warms you right through."),
    sells("bread", "Bread's fresh from Marigold's oven."),
    sells("tea", "Calming tea."),
  ],
  brightwater_coral: [
    sells("hot_stew", "Fish stew. Caught this morning."),
    sells("bread", "Bread. Good for mopping up the stew."),
  ],
  // Hollis sells the flour he has milled, Ansel the logs on his pile, Rowan
  // the wheat he's cut — only while they have it (src/lib/mind/profiles.ts).
  village_hollis: [
    sells("flour", "A bag of flour. Ground this morning."),
  ],
  hollowmere_ansel: [
    sells("wood", "A good oak log. Seasoned."),
  ],
  village_rowan: [
    sells("wheat", "A sheaf of the gold!"),
  ],
  // The living traders sell off their shelves, only while they have it (src/lib/mind/profiles.ts).
  hollowmere_maren: [
    sells("plank", "A plank, sawn this morning."),
    sells("stool", "A stool. Three legs, no wobble."),
    sells("chair", "An oak chair. Sturdy as they come."),
    sells("table", "A round table, fits four friends."),
    sells("bookshelf", "A bookshelf. Now you need books."),
  ],
  village_della: [
    sells("cheese", "A wheel of my cheese. Pressed this week."),
    sells("cloth", "A bolt of cloth, off the loom."),
    sells("milk", "Fresh milk, this morning's."),
  ],
  village_fenwick: [
    sells("cider", "A bottle of cider, sharp and cold."),
    sells("pear_cider", "Pear cider. Goes down easy."),
    sells("red_wine", "A young red."),
    sells("white_wine", "A white, pale as morning."),
    sells("grape_juice", "Grape juice, for the little ones."),
  ],
  // Tamsin's wagon: whatever she's carrying from the last towns, while she has it.
  village_tamsin: [
    ...["apple", "orange", "lemon", "peach", "cherry", "pear", "plum", "coconut", "banana"].map((k) => sells(k, "Fruit from the road, fresh as it travels.")),
    sells("honey", "Honey from the grove's hives."),
    sells("cheese", "Cheese from the ranch, aged on the road."),
    sells("cloth", "Cloth for your sewing."),
    sells("river_trout", "Trout from Brightwater, on ice."),
    sells("catfish", "Catfish, caught at night."),
  ],
  // Bjorn sells off his rack, only while he has it (src/lib/mind/profiles.ts SMITH).
  hollowmere_bjorn: [
    sells("axe", "A plain woodcutter's axe."),
    sells("arrow", "Ten arrows. Fletched them myself.", 10),
    sells("stone_sword", "A stone sword. Heavy, honest, sharp enough."),
    sells("fittings", "Iron fittings. Every barn needs a few."),
  ],
};

for (const n of SETTLEMENT_NPCS) {
  const town = TOWNS.find((t) => t.key === n.town);
  if (!town) continue;
  if (n.job === "innkeeper") {
    SHOP_STOCK[n.key] = [
      sells("hot_stew", `Hot stew. Best in ${town.name}.`),
      sells("bread", "Bread, fresh today."),
      sells("tea", "Tea. Warms the bones."),
    ];
  } else if (n.job === "shopkeeper") {
    SHOP_STOCK[n.key] = [
      sells("radish_seeds", "Radish seeds."),
      sells("carrot_seeds", "Carrot seeds."),
      sells("axe", "An axe. Clears a road, too."),
      sells("fishing_rod", "A fishing rod."),
      sells("hot_stew", "Stew for the road."),
      sells("bicycle", "A bicycle. Press V to ride."),
      sells("short_bow", "A short bow."),
      sells("arrow", "Ten arrows.", 10),
      // saplings of the trees this land suits (src/lib/orchard.ts)
      ...ORCHARD_FRUITS.filter((f) => f.families.includes(town.family)).map((f) => sells(f.sapling, `A ${f.name.toLowerCase()} sapling. They grow well out here — plant it in an orchard.`)),
    ];
  }
}

/** How a buyer counts towards its market's appetite for an item. */
export const SPECIALIST_WEIGHT = 1, GENERAL_WEIGHT = 0.5;

/**
 * How many buyers a market has for an item: each NPC there who takes it,
 * a specialist counting SPECIALIST_WEIGHT and anyone else GENERAL_WEIGHT.
 * More buyers, a deeper market (marketDepth).
 */
export function buyerWeight(market: string, itemKey: string): number {
  let w = 0;
  for (const [npcKey, list] of Object.entries(TRADES)) {
    if (marketOf(npcKey) !== market || !list.some((t) => t.itemKey === itemKey)) continue;
    w += specCovers(BUYERS[npcKey]?.specialty, itemKey) ? SPECIALIST_WEIGHT : GENERAL_WEIGHT;
  }
  return w;
}

/** How much of an item a market takes before its price halves: the item's depth per buyer × its buyers (at least half of one). */
export const marketDepth = (market: string, itemKey: string): number => depthOf(itemKey) * Math.max(GENERAL_WEIGHT, buyerWeight(market, itemKey));

/** What this NPC sells to players. */
export function stockForNpc(npcKey: string): TradeItem[] {
  if (isMerchantKey(npcKey)) return [...MERCHANT_STOCK]; // a stranded merchant you helped (src/lib/encounters.ts)
  return SHOP_STOCK[npcKey] ?? [];
}

/** All trades this NPC will pay for, regardless of what the player carries. */
export function tradesForNpc(npcKey: string): TradeItem[] {
  return TRADES[npcKey] ?? [];
}

/**
 * The buyer that pays most for an item, among those in one market (or
 * anywhere). Buyers in a market share its demand (src/lib/market.ts), so the
 * best base price there is the best price now too.
 */
export function findBuyer(itemKey: string, market?: string): { npcKey: string; trade: TradeItem } | null {
  let best: { npcKey: string; trade: TradeItem } | null = null;
  for (const npcKey of Object.keys(TRADES)) {
    if (market && marketOf(npcKey) !== market) continue;
    const t = TRADES[npcKey].find((x) => x.itemKey === itemKey);
    if (t && (!best || t.price > best.trade.price)) best = { npcKey, trade: t };
  }
  return best;
}
