// Trade module — pure data + client-safe helpers. Owns the NPC buy list.
// The db-touching sell logic lives in the route, not here, so the client
// bundle doesn't pull in the pg driver.
//
// To add a new trader or a new item:
//   1. Seed the item in src/lib/seed.ts ITEM_DEFS.
//   2. Add an entry to TRADES below.
// That's it — the modal, route, NPC-conversation Sell offer, and the
// in-character "I buy X" line pick it up automatically.
import { FURNITURE_ITEMS, FURNITURE_VALUE } from "./furniture";
import type { TradeConfig, TradeItem } from "./types";
import { SETTLEMENT_NPCS, TOWNS } from "./settlements";
import { MERCHANT_STOCK, isMerchantKey } from "./encounters";
import { FISH_DEFS } from "./fishing";

export const TRADES: TradeConfig = {
  village_marigold: [
    { itemKey: "egg", qty: 1, price: 1, line: "Hand it here, love. A copper for a fresh egg, same as ever." },
    { itemKey: "pumpkin", qty: 1, price: 20, line: "A whole pumpkin! Twenty coppers — that's three pies." },
    { itemKey: "tomato", qty: 1, price: 3, line: "Garden tomatoes, three coppers each. Sauce day!" },
    { itemKey: "berry", qty: 1, price: 2, line: "Fresh berries? Two coppers a basket. For the pie." },
  ],
  // Different character sells the crafted good — keeps the economy moving.
  village_greta: [
    { itemKey: "bread", qty: 1, price: 5, line: "My bread, back so soon? Lovely." },
    { itemKey: "stone", qty: 1, price: 1, line: "I'll take river stones off your hands. A copper each." },
    { itemKey: "wool", qty: 1, price: 2, line: "Wool tufts? Two coppers. I can always use more." },
    { itemKey: "slime_gel", qty: 1, price: 2, line: "Slime gel — two coppers. The bearings need the slip." },
    { itemKey: "wood", qty: 1, price: 2, line: "Oak logs! Two coppers each — or let me make you something with them." },
    { itemKey: "thorn", qty: 1, price: 2, line: "Thornling thorns — two coppers. Good for pins and blades." },
    { itemKey: "boar_hide", qty: 1, price: 5, line: "A boar hide! Five coppers. Makes a fine grip." },
    { itemKey: "wolf_pelt", qty: 1, price: 6, line: "A wolf pelt? Six coppers — it'll line a good many gloves." },
    { itemKey: "chitin", qty: 1, price: 4, line: "Scorpion chitin! Four coppers — makes the toughest buttons." },
  ],
  // Real economy: miller buys your wheat, sells you flour. Wheat → flour is
  // a 1:1 grind; the miller charges 1 copper for the service.
  village_hollis: [
    { itemKey: "milk", qty: 1, price: 3, line: "Milk for the dairy? Three coppers a jug." },
    { itemKey: "wheat", qty: 1, price: 1, line: "I'll buy your wheat for a copper." },
    { itemKey: "flour", qty: 1, price: 2, line: "Flour for your baking — two coppers." },
  ],
  village_wren: [
    { itemKey: "herb", qty: 1, price: 2, line: "Herbs in good nick. Two coppers a bundle." },
    { itemKey: "mushroom", qty: 1, price: 3, line: "Speckled mushrooms? Three coppers. Best in the grove." },
    { itemKey: "bat_wing", qty: 1, price: 2, line: "Bat wings, two coppers. Don't ask what for." },
    { itemKey: "wisp_essence", qty: 1, price: 10, line: "Wisp essence... ten coppers, and handle it gently." },
    { itemKey: "shade_essence", qty: 1, price: 8, line: "Shade essence from the darkwood? Eight coppers. It hums, doesn't it." },
  ],
  village_pip: [
    ...FURNITURE_ITEMS.map((itemKey) => ({ itemKey, qty: 1, price: Math.round((FURNITURE_VALUE[itemKey] ?? 8) * 1.0), line: `Good furniture always sells. I'll give you ${Math.round((FURNITURE_VALUE[itemKey] ?? 8) * 1.0)} coppers for the ${itemKey.replace(/_/g, " ")}.` })),
    { itemKey: "cloth", qty: 1, price: 16, line: "Good cloth! Sixteen coppers — I'll sell it on to the tailors." },
    { itemKey: "fine_wool", qty: 1, price: 12, line: "Fine wool, twelve coppers. Softest I've seen." },
    { itemKey: "mushroom", qty: 1, price: 2, line: "Mushrooms, two coppers. I'll pickle 'em." },
    { itemKey: "carrot", qty: 1, price: 2, line: "Carrots, two coppers apiece. The rabbits'll be jealous." },
    { itemKey: "radish", qty: 1, price: 2, line: "Radishes — two coppers. Crunchy!" },
    { itemKey: "stone", qty: 1, price: 1, line: "Stones for a copper. I stack 'em out back." },
    { itemKey: "slime_gel", qty: 1, price: 2, line: "Slime gel, two coppers. I find a use for everything." },
  ],
  // Hollowmere: the smith buys raw materials for blades.
  hollowmere_bjorn: [
    { itemKey: "stone", qty: 1, price: 1, line: "Good stone's always welcome at the forge. A copper each." },
    { itemKey: "thorn", qty: 1, price: 2, line: "Thornling thorns! Two coppers. They take an edge like nothing else." },
    { itemKey: "boar_hide", qty: 1, price: 5, line: "Boar hide, five coppers. Best grip wrapping there is." },
    { itemKey: "wolf_pelt", qty: 1, price: 6, line: "Wolf pelt — six coppers. You've been in Whisperwood, I see." },
    { itemKey: "lurker_hide", qty: 1, price: 7, line: "Lurker hide, seven coppers. Wraps a hilt like nothing else." },
    { itemKey: "frost_pelt", qty: 1, price: 9, line: "A frost pelt! Nine coppers — you've been up in the cold." },
  ],
  hollowmere_ivy: [
    ...FURNITURE_ITEMS.map((itemKey) => ({ itemKey, qty: 1, price: Math.round((FURNITURE_VALUE[itemKey] ?? 8) * 1.1), line: `For the Sawdust & Ale? Gladly — ${Math.round((FURNITURE_VALUE[itemKey] ?? 8) * 1.1)} coppers for the ${itemKey.replace(/_/g, " ")}.` })),
    { itemKey: "cider", qty: 1, price: 13, line: "Cider for the woodcutters, thirteen coppers." },
    { itemKey: "red_wine", qty: 1, price: 21, line: "Red wine, twenty-one coppers." },
    { itemKey: "aged_red_wine", qty: 1, price: 62, line: "Aged red! Sixty-two coppers." },
    { itemKey: "grape_juice", qty: 1, price: 9, line: "Grape juice, nine coppers. For the little ones." },
    { itemKey: "cheese", qty: 1, price: 15, line: "Cheese! Fifteen coppers — the woodcutters will fight over it." },
    { itemKey: "honey", qty: 1, price: 8, line: "Honey, eight coppers. Mead season is coming." },
    { itemKey: "milk", qty: 1, price: 4, line: "Fresh milk! Four coppers — the woodcutters drink it by the bucket." },
    { itemKey: "egg", qty: 1, price: 2, line: "Eggs for breakfast, two coppers each." },
    { itemKey: "berry", qty: 1, price: 2, line: "Berries for the jam pot — two coppers a handful." },
    { itemKey: "herb", qty: 1, price: 2, line: "Herbs for the tea, two coppers. Bless you." },
  ],
  village_hettie: [
    { itemKey: "red_grape", qty: 1, price: 2, line: "Grapes for the table, two coppers a bunch." },
    { itemKey: "white_grape", qty: 1, price: 2, line: "White grapes, two coppers. Lovely with cheese." },
    { itemKey: "apple", qty: 1, price: 2, line: "Apples, two coppers each. Marigold will want them for pies." },
    { itemKey: "cider", qty: 1, price: 12, line: "Cider! Twelve coppers — the regulars will cheer." },
    { itemKey: "red_wine", qty: 1, price: 20, line: "A red, twenty coppers. Young, but honest." },
    { itemKey: "white_wine", qty: 1, price: 22, line: "A white, twenty-two coppers." },
    { itemKey: "aged_red_wine", qty: 1, price: 60, line: "An aged red?! Sixty coppers, and it goes behind the bar." },
    { itemKey: "aged_white_wine", qty: 1, price: 65, line: "Aged white — sixty-five coppers. For the mayor's table." },
    { itemKey: "jam", qty: 1, price: 10, line: "Jam for the breakfast bread, ten coppers." },
    { itemKey: "cheese", qty: 1, price: 14, line: "A whole wheel of cheese! Fourteen coppers — the stew will sing." },
    { itemKey: "honey", qty: 1, price: 7, line: "Honey for the tea, seven coppers a jar." },
    { itemKey: "golden_egg", qty: 1, price: 15, line: "A golden egg?! Fifteen coppers, and I'll frame the shell." },
    { itemKey: "rich_milk", qty: 1, price: 14, line: "Rich milk — fourteen coppers. Cream on everything tonight." },
    { itemKey: "milk", qty: 1, price: 4, line: "Milk for the stew pot — four coppers a jug." },
    { itemKey: "egg", qty: 1, price: 2, line: "Fresh eggs, two coppers each. Breakfast is sorted!" },
  ],
  brightwater_coral: [
    { itemKey: "cider", qty: 1, price: 14, line: "Cider by the sea, fourteen coppers." },
    { itemKey: "white_wine", qty: 1, price: 24, line: "White wine with fish — twenty-four coppers." },
    { itemKey: "aged_white_wine", qty: 1, price: 70, line: "Aged white?! Seventy coppers. The captains will pay double." },
    { itemKey: "cheese", qty: 1, price: 16, line: "Cheese, out here? Sixteen coppers!" },
    { itemKey: "honey", qty: 1, price: 8, line: "Honey for the sailors' tea, eight coppers." },
    { itemKey: "milk", qty: 1, price: 5, line: "Milk's dear out here on the coast. Five coppers!" },
    { itemKey: "egg", qty: 1, price: 2, line: "Eggs! Two coppers each." },
  ],
  // Brightwater pays a little more: it's a long road.
  brightwater_marina: [
    // Every fish in the river and the ponds, at its price.
    ...FISH_DEFS.map((f) => ({ itemKey: f.key, qty: 1, price: f.price, line: `${f.name}? ${f.price} coppers — ${f.rarity === "legendary" ? "and a story for the whole town!" : "fresh for the stew pot."}` })),
    { itemKey: "carrot", qty: 1, price: 3, line: "Carrots for the stew — three coppers each." },
    { itemKey: "tomato", qty: 1, price: 4, line: "Tomatoes! Four coppers. The sailors love a red stew." },
    { itemKey: "pumpkin", qty: 1, price: 24, line: "A whole pumpkin? Twenty-four coppers, and a smile." },
  ],
  brightwater_tobias: [
    { itemKey: "wood", qty: 1, price: 3, line: "Oak logs — three coppers each. Boats don't build themselves." },
  ],
  // Future examples:
  //   grocer:   [{ itemKey: "grapes", ... }, { itemKey: "oranges", ... }, { itemKey: "strawberries", ... }],
};

/**
 * What NPCs SELL to players (the other direction from TRADES), keyed by
 * `npc.key`. `price` is per `qty`. Seeds for home gardens live here.
 */
export const SHOP_STOCK: TradeConfig = {
  // Marigold sells off her shelf, only while she has it (src/lib/mind/profiles.ts BAKER).
  village_marigold: [
    { itemKey: "bread", qty: 1, price: 4, line: "A loaf from the shelf, four coppers. Still warm, love." },
    { itemKey: "honey_bun", qty: 1, price: 6, line: "Honey bun, six coppers. Sticky fingers guaranteed." },
    { itemKey: "apple_pie", qty: 1, price: 9, line: "Apple pie, nine coppers. Your apples, my oven." },
  ],
  village_pip: [
    { itemKey: "grape_cutting", qty: 1, price: 25, line: "A red grapevine cutting, twenty-five coppers. For a vineyard trellis." },
    { itemKey: "white_grape_cutting", qty: 1, price: 35, line: "White grape cutting, thirty-five. Fussier, but the wine!" },
    { itemKey: "apple_sapling", qty: 1, price: 45, line: "An apple sapling, forty-five coppers. Patience, then apples forever." },
    { itemKey: "radish_seeds", qty: 1, price: 2, line: "Radish seeds — quick growers. Two coppers." },
    { itemKey: "carrot_seeds", qty: 1, price: 3, line: "Carrot seeds, three coppers. Patience pays.", minLevel: 2 },
    { itemKey: "tomato_seeds", qty: 1, price: 5, line: "Tomato seeds, five coppers. Water them well!", minLevel: 3 },
    { itemKey: "pumpkin_seeds", qty: 1, price: 8, line: "Pumpkin seeds — eight coppers. Slow, but oh, the payoff.", minLevel: 5 },
    { itemKey: "axe", qty: 1, price: 25, line: "A woodcutter's axe, twenty-five coppers. The oaks are out west, past the woods." },
    { itemKey: "fishing_rod", qty: 1, price: 30, line: "A fishing rod, thirty coppers. Ponds, rivers — face the water and cast." },
    { itemKey: "bicycle", qty: 1, price: 150, line: "A bicycle! A hundred and fifty coppers — the roads to the new towns go by in no time. Press V to ride." },
    { itemKey: "short_bow", qty: 1, price: 60, line: "A short bow, sixty coppers. Equip it and you can hit things from a safe distance." },
    { itemKey: "arrow", qty: 10, price: 8, line: "Ten arrows for eight coppers. Every shot uses one." },
  ],
  brightwater_marina: [
    { itemKey: "fishing_rod", qty: 1, price: 30, line: "Thirty coppers for a good rod. The Silverrun's full of them — fish, I mean." },
  ],
  hollowmere_ivy: [
    { itemKey: "hot_stew", qty: 1, price: 8, line: "Hot stew, eight coppers. Sticks to your ribs." },
    { itemKey: "bread", qty: 1, price: 4, line: "Fresh bread, four coppers. Restores a body after the road." },
    { itemKey: "tea", qty: 1, price: 6, line: "Calming tea, six coppers. Good for what ails you." },
    { itemKey: "honey_bun", qty: 1, price: 9, line: "Honey bun — nine coppers. Worth every one." },
  ],
  village_hettie: [
    { itemKey: "hot_stew", qty: 1, price: 8, line: "A bowl of hot stew, eight coppers. Warms you right through." },
    { itemKey: "bread", qty: 1, price: 4, line: "Bread's fresh from Marigold's oven, four coppers." },
    { itemKey: "tea", qty: 1, price: 6, line: "Calming tea, six coppers." },
  ],
  brightwater_coral: [
    { itemKey: "hot_stew", qty: 1, price: 8, line: "Fish stew, eight coppers. Caught this morning." },
    { itemKey: "bread", qty: 1, price: 4, line: "Bread, four coppers. Good for mopping up the stew." },
  ],
  // Bjorn sells off his rack, only while he has it (src/lib/mind/profiles.ts SMITH).
  hollowmere_bjorn: [
    { itemKey: "axe", qty: 1, price: 25, line: "A plain woodcutter's axe, twenty-five coppers." },
    { itemKey: "arrow", qty: 10, price: 10, line: "Ten arrows, ten coppers. Fletched them myself." },
    { itemKey: "stone_sword", qty: 1, price: 30, line: "A stone sword, thirty coppers. Heavy, honest, sharp enough." },
    { itemKey: "fittings", qty: 1, price: 6, line: "Iron fittings, six coppers each. Every barn needs a few." },
  ],
};

// ── The continent's towns: stock and buyers by job and kind of town ─────
const REGIONAL_BUYS: Record<string, Omit<TradeItem, "qty">[]> = {
  port: FISH_DEFS.map((f) => ({ itemKey: f.key, price: f.price, line: `${f.name}? ${f.price} coppers — fresh off the boat or not, I'll take it.` })),
  desert: [{ itemKey: "chitin", price: 5, line: "Chitin! Five coppers — the dunes are full of it, if you're brave." }],
  snow: [{ itemKey: "frost_pelt", price: 10, line: "A frost pelt — ten coppers. Worth its weight up here." }, { itemKey: "wood", price: 3, line: "Firewood, three coppers. Winter eats it." }],
  swamp: [{ itemKey: "lurker_hide", price: 8, line: "Lurker hide, eight coppers. We patch the stilts with it." }, { itemKey: "herb", price: 3, line: "Fen herbs, three coppers." }],
  darkwood: [{ itemKey: "shade_essence", price: 9, line: "Shade essence. Nine coppers, and keep your voice down." }, { itemKey: "mushroom", price: 3, line: "Darkwood mushrooms, three coppers." }],
  hills: [{ itemKey: "wheat", price: 2, line: "Wheat, two coppers a sheaf." }, { itemKey: "pumpkin", price: 22, line: "A pumpkin! Twenty-two coppers." }, { itemKey: "wool", price: 3, line: "Wool, three coppers." }],
};
for (const n of SETTLEMENT_NPCS) {
  const town = TOWNS.find((t) => t.key === n.town);
  if (!town) continue;
  if (n.job === "innkeeper") {
    SHOP_STOCK[n.key] = [
      { itemKey: "hot_stew", qty: 1, price: 8, line: `Hot stew, eight coppers. Best in ${town.name}.` },
      { itemKey: "bread", qty: 1, price: 4, line: "Bread, four coppers." },
      { itemKey: "tea", qty: 1, price: 6, line: "Tea, six coppers. Warms the bones." },
    ];
    TRADES[n.key] = [
      { itemKey: "cheese", qty: 1, price: 15, line: `Cheese! Fifteen coppers — rare in ${town.name}.` },
      { itemKey: "honey", qty: 1, price: 8, line: "Honey, eight coppers a jar." },
      { itemKey: "cider", qty: 1, price: 14, line: "Cider, fourteen coppers." },
      { itemKey: "red_wine", qty: 1, price: 22, line: "Wine! Twenty-two coppers." },
      { itemKey: "aged_red_wine", qty: 1, price: 66, line: `An aged red, out here in ${town.name}? Sixty-six coppers.` },
      { itemKey: "milk", qty: 1, price: 5, line: "Milk for the kitchen — five coppers." },
      { itemKey: "egg", qty: 1, price: 2, line: "Eggs, two coppers each." },
    ];
  } else if (n.job === "shopkeeper") {
    SHOP_STOCK[n.key] = [
      { itemKey: "radish_seeds", qty: 1, price: 2, line: "Radish seeds, two coppers." },
      { itemKey: "carrot_seeds", qty: 1, price: 3, line: "Carrot seeds, three coppers." },
      { itemKey: "axe", qty: 1, price: 25, line: "An axe, twenty-five coppers. Clears a road, too." },
      { itemKey: "fishing_rod", qty: 1, price: 30, line: "A fishing rod, thirty coppers." },
      { itemKey: "hot_stew", qty: 1, price: 9, line: "Stew for the road, nine coppers." },
      { itemKey: "bicycle", qty: 1, price: 150, line: "A bicycle, a hundred and fifty coppers. Press V to ride." },
      { itemKey: "short_bow", qty: 1, price: 60, line: "A short bow, sixty coppers." },
      { itemKey: "arrow", qty: 10, price: 8, line: "Ten arrows, eight coppers." },
    ];
    TRADES[n.key] = [
      { itemKey: "stone", qty: 1, price: 1, line: "Stone, a copper each." },
      ...FURNITURE_ITEMS.map((itemKey) => ({ itemKey, qty: 1, price: Math.round((FURNITURE_VALUE[itemKey] ?? 8) * 1.15), line: `Furniture's dear out in ${town.name}. ${Math.round((FURNITURE_VALUE[itemKey] ?? 8) * 1.15)} coppers.` })),
      ...REGIONAL_BUYS[town.family].map((b) => ({ ...b, qty: 1 })),
    ];
  }
}

/** What this NPC sells to players. */
export function stockForNpc(npcKey: string): TradeItem[] {
  if (isMerchantKey(npcKey)) return [...MERCHANT_STOCK]; // a stranded merchant you helped (src/lib/encounters.ts)
  return SHOP_STOCK[npcKey] ?? [];
}

/** All trades this NPC will pay for, regardless of what the player carries. */
export function tradesForNpc(npcKey: string): TradeItem[] {
  return TRADES[npcKey] ?? [];
}

/** Pick the canonical buyer for an item. Returns null if no NPC buys it. */
export function findBuyer(itemKey: string): { npcKey: string; trade: TradeItem } | null {
  for (const npcKey of Object.keys(TRADES)) {
    const t = TRADES[npcKey].find((x) => x.itemKey === itemKey);
    if (t) return { npcKey, trade: t };
  }
  return null;
}
