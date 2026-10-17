// The kinds of mind, as data (logic: src/lib/mind/profile.ts). A new kind
// of NPC with a mind = one profile here + its NPC key in PROFILE_OF, and
// the key listed in MIND_NPCS. Shelf items also need a SHOP_STOCK entry
// (src/lib/trade.ts) so players can buy them.

import type { MindProfile } from "@/types/mind";

const MIN = 60_000;

/** Marigold: bakes for her free table and her shelf, buys flour from Hollis. */
export const BAKER: MindProfile = {
  key: "baker",
  trade: "the village baker",
  startStock: { flour: 12, egg: 6, honey: 4, milk: 0, bread: 4, honey_bun: 2 },
  startPurse: 40,
  // At 100 active players: 6,300 coins/hour, up to 21,000.
  income: { basePerHour: 300, perPlayerPerHour: 60, baseTarget: 1000, perPlayerTarget: 200 },
  shelf: { bread: 4, honey_bun: 6, apple_pie: 9, cherry_pie: 9, peach_pie: 9 },
  shelfFull: 12,
  minCraftGapMs: 10 * MIN,
  tableStaleMs: 20 * MIN,
  crafts: {
    bake_bread: { itemKey: "bread", uses: { flour: 4 }, makes: 12, toTable: 6, verb: "bake a batch of 12 loaves", line: "Fresh bread on the table, loves! One each, mind." },
    bake_pies: { itemKey: "apple_pie", uses: { apple: 3, flour: 2 }, makes: 6, toTable: 3, verb: "bake 6 apple pies", line: "Apple pies, from the vineyard's apples! One each, loves." },
    bake_cherry_pies: { itemKey: "cherry_pie", uses: { cherry: 4, flour: 2 }, makes: 6, toTable: 3, verb: "bake 6 cherry pies", line: "Cherry pies, from the orchards' cherries! One each, loves." },
    bake_peach_pies: { itemKey: "peach_pie", uses: { peach: 3, flour: 2 }, makes: 6, toTable: 3, verb: "bake 6 peach pies", line: "Peach pies, still bubbling! One each, loves." },
    bake_buns: { itemKey: "honey_bun", uses: { flour: 2, egg: 4, honey: 1 }, makes: 8, toTable: 4, verb: "bake a batch of 8 honey buns", line: "Honey buns, still warm! One each, loves." },
  },
  supplies: { flour: { supplierKey: "village_hollis", place: "Hollis's mill", price: 3, buy: 8, low: 5 } },
  // Supper at the inn after the day's baking (game hours).
  outings: { supper: { placeKey: "building:inn_village", place: "the Wayfarer's Rest", doing: "have supper at the Wayfarer's Rest", hours: [18, 21], lingerMs: 6 * MIN } },
  asks: { egg: { qty: 6, pay: 2, low: 4 }, flour: { qty: 4, pay: 5, low: 5 }, honey: { qty: 2, pay: 7, low: 1 } },
  gift: { itemKey: "honey_bun", qty: 1 },
  // Players' farms supply her week by week (src/lib/ordersServer.ts).
  orders: { egg: { qty: 12, pay: 2 }, flour: { qty: 6, pay: 5 }, milk: { qty: 4, pay: 4 }, honey: { qty: 3, pay: 6 }, apple: { qty: 8, pay: 3 }, jam: { qty: 2, pay: 11 }, cherry: { qty: 8, pay: 7 }, peach: { qty: 6, pay: 6 } },
  words: { flour: "bags of flour", egg: "eggs", honey: "jars of honey", milk: "jugs of milk", apple: "apples", jam: "jars of jam", bread: "loaves", honey_bun: "honey buns", apple_pie: "apple pies", cherry: "cherries", peach: "peaches", cherry_pie: "cherry pies", peach_pie: "peach pies" },
};

/** Bjorn: forges axes and swords and fletches arrows for his shelf from the
 *  stone and wood players bring him, logs he buys off Ansel's woodpile, and
 *  stone he goes out and gathers himself in the Greyspine pass. */
export const SMITH: MindProfile = {
  key: "smith",
  trade: "the blacksmith of Hollowmere",
  startStock: { stone: 10, wood: 8, axe: 1, arrow: 20, stone_sword: 0, fittings: 8 },
  startPurse: 60,
  // At 100 active players: 4,200 coins/hour, up to 15,800.
  income: { basePerHour: 200, perPlayerPerHour: 40, baseTarget: 800, perPlayerTarget: 150 },
  shelf: { axe: 25, arrow: 1, stone_sword: 30, fittings: 6 },
  shelfFull: 4,
  shelfCap: { arrow: 30, fittings: 16 },
  minCraftGapMs: 8 * MIN,
  tableStaleMs: 0,
  crafts: {
    forge_axes: { itemKey: "axe", uses: { stone: 4, wood: 3 }, makes: 2, toTable: 0, verb: "forge 2 woodcutter's axes", line: "Two fresh axes on the rack. Sharp as the day is long." },
    forge_sword: { itemKey: "stone_sword", uses: { stone: 4, wood: 4 }, makes: 1, toTable: 0, verb: "forge a stone sword", line: "A new sword, and a fine one. Come see." },
    fletch_arrows: { itemKey: "arrow", uses: { wood: 2, stone: 1 }, makes: 20, toTable: 0, verb: "fletch 20 arrows", line: "Twenty arrows, true as a plumb line." },
    // Ranchers build with these (src/lib/ranchUpgrades.ts).
    forge_fittings: { itemKey: "fittings", uses: { stone: 2, wood: 1 }, makes: 4, toTable: 0, verb: "forge 4 iron fittings", line: "Hinges and nails, fresh off the anvil. Building something?" },
  },
  // No supplier in Hollowmere: he walks out for them (free, but the forge is shut meanwhile).
  supplies: {
    wood: { supplierKey: "hollowmere_ansel", place: "Ansel's woodpile", price: 2, buy: 8, low: 3 },
    stone: { spot: { tx: -466, ty: 11 }, place: "the Greyspine pass", price: 0, buy: 10, low: 4 },
  },
  outings: {
    // A walk down the King's Road to the grove, to see what the village is up to.
    grove: { spot: { tx: 32, ty: 21 }, place: "the grove's plaza", doing: "walk to the grove to see the village", hours: [10, 14], lingerMs: 5 * MIN },
    ale: { placeKey: "building:inn_hollowmere", place: "the Sawdust & Ale", doing: "have an ale at the Sawdust & Ale", hours: [19, 22], lingerMs: 6 * MIN },
  },
  asks: { stone: { qty: 8, pay: 1, low: 4 }, wood: { qty: 6, pay: 2, low: 3 } },
  gift: { itemKey: "arrow", qty: 10 },
  orders: { wood: { qty: 10, pay: 2 }, stone: { qty: 12, pay: 1 } },
  words: { stone: "stones", wood: "logs", axe: "axes", arrow: "arrows", stone_sword: "stone swords", fittings: "iron fittings" },
};

/** Ansel: chops logs in the Whisperwood and keeps his woodpile stacked;
 *  Bjorn buys his logs from it, and so can players. */
export const WOODCUTTER: MindProfile = {
  key: "woodcutter",
  trade: "the woodcutter of Hollowmere",
  startStock: { wood: 16 },
  startPurse: 30,
  income: { basePerHour: 60, perPlayerPerHour: 10, baseTarget: 200, perPlayerTarget: 40 },
  shelf: { wood: 3 },
  shelfFull: 40,
  minCraftGapMs: 10 * MIN,
  tableStaleMs: 0,
  crafts: {},
  // Below 20 logs he goes out with his axe for 12 more.
  // He fells real trees there (stumps that grow back), 4 logs a tree.
  supplies: { wood: { spot: { tx: -256, ty: 11 }, place: "the Whisperwood", price: 0, buy: 12, low: 20, gather: { from: "trees", perTree: 4, radius: 6 } } },
  outings: { ale: { placeKey: "building:inn_hollowmere", place: "the Sawdust & Ale", doing: "have an ale at the Sawdust & Ale", hours: [19, 22], lingerMs: 5 * MIN } },
  asks: {},
  gift: null,
  orders: {},
  words: { wood: "logs" },
};

/** Rowan: cuts wheat in the Common Field and carries it to Hollis's mill. */
export const FARMHAND: MindProfile = {
  key: "farmhand",
  trade: "a farmhand who works the Common Field for Hollis",
  startStock: { wheat: 6 },
  startPurse: 10,
  income: { basePerHour: 30, perPlayerPerHour: 5, baseTarget: 100, perPlayerTarget: 20 },
  shelf: { wheat: 2 },
  shelfFull: 40,
  minCraftGapMs: 10 * MIN,
  tableStaleMs: 0,
  crafts: {},
  // He cuts real ripe stalks in the north half of the Common Field (they regrow as when
  // players pick them), 12 to a load; then carries the load across the field to the mill.
  supplies: { wheat: { spot: { tx: 48, ty: -80 }, place: "the Common Field", price: 0, buy: 12, low: 12, gather: { from: "nodes", kind: "wheat_field", radius: 8 } } },
  sells: { wheat: { buyerKey: "village_hollis", place: "Hollis's mill", price: 1, min: 12 } },
  outings: { supper: { placeKey: "building:inn_village", place: "the Wayfarer's Rest", doing: "have supper at the Wayfarer's Rest", hours: [18, 21], lingerMs: 5 * MIN } },
  asks: {},
  gift: null,
  orders: {},
  words: { wheat: "sheaves of wheat" },
};

/** Hollis: mills the wheat Rowan (and players) bring into the flour Marigold buys. */
export const MILLER: MindProfile = {
  key: "miller",
  trade: "the miller at the Common Field",
  startStock: { wheat: 12, flour: 12 },
  startPurse: 80,
  income: { basePerHour: 120, perPlayerPerHour: 25, baseTarget: 500, perPlayerTarget: 80 },
  shelf: { flour: 2 },
  shelfFull: 30,
  minCraftGapMs: 5 * MIN,
  tableStaleMs: 0,
  crafts: {
    mill_flour: { itemKey: "flour", uses: { wheat: 3 }, makes: 2, toTable: 0, verb: "mill 3 sheaves of wheat into 2 bags of flour", line: "Fresh flour off the stones. Marigold'll be pleased." },
  },
  supplies: {},
  asks: { wheat: { qty: 9, pay: 1, low: 3 } },
  gift: null,
  orders: { wheat: { qty: 30, pay: 1 } },
  words: { wheat: "sheaves of wheat", flour: "bags of flour" },
};

export const PROFILES: Readonly<Record<string, MindProfile>> = { baker: BAKER, smith: SMITH, woodcutter: WOODCUTTER, farmhand: FARMHAND, miller: MILLER };

/** Which NPC thinks with which profile. */
export const PROFILE_OF: Readonly<Record<string, string>> = {
  village_marigold: "baker", hollowmere_bjorn: "smith",
  hollowmere_ansel: "woodcutter", village_rowan: "farmhand", village_hollis: "miller",
};

export function profileFor(npcKey: string): MindProfile | null {
  return PROFILES[PROFILE_OF[npcKey] ?? ""] ?? null;
}
