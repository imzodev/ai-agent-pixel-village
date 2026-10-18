// The kinds of mind, as data (logic: src/lib/mind/profile.ts). A new kind
// of NPC with a mind = one profile here + its NPC key in PROFILE_OF, and
// the key listed in MIND_NPCS. Shelf items also need a SHOP_STOCK entry
// (src/lib/trade.ts) so players can buy them.

import { buyPrice, shopPrice } from "../economy";
import type { MindProfile, SellDef, SellTarget } from "@/types/mind";

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

// ── Traders who move goods (src/lib/economy.ts prices) ─────────────────
/** A shelf priced from the model: what players pay for each. */
const shelfOf = (...keys: string[]): Record<string, number> => Object.fromEntries(keys.map((k) => [k, shopPrice(k)]));
const INNS: readonly SellTarget[] = [
  { buyerKey: "village_hettie", place: "the Wayfarer's Rest" },
  { buyerKey: "hollowmere_ivy", place: "the Sawdust & Ale" },
  { buyerKey: "brightwater_coral", place: "the Salted Gull" },
];
const FURNITURE_BUYERS: readonly SellTarget[] = [
  { buyerKey: "village_pip", place: "Pip's in the grove" },
  { buyerKey: "hollowmere_ivy", place: "the Sawdust & Ale" },
];
/** Delivered to whichever buyer pays most: a buyer without a mind pays its market's price (`price` is for one with). */
const toBest = (item: string, to: readonly SellTarget[], min: number, keep = 0): SellDef => ({ buyerKey: to[0].buyerKey, place: to[0].place, price: buyPrice(item, true), min, to, keep });

/** Maren: saws Ansel's logs into planks and makes furniture with Bjorn's fittings; sells it off her shelf and carries it to Pip's or the inn. */
export const CARPENTER: MindProfile = {
  key: "carpenter",
  trade: "the carpenter of Hollowmere",
  startStock: { wood: 10, plank: 6, fittings: 2, stool: 1, chair: 1, table: 0, bookshelf: 0 },
  startPurse: 60,
  income: { basePerHour: 80, perPlayerPerHour: 15, baseTarget: 300, perPlayerTarget: 60 },
  shelf: shelfOf("plank", "stool", "chair", "table", "bookshelf"),
  shelfFull: 4,
  shelfCap: { plank: 24 },
  minCraftGapMs: 8 * MIN,
  tableStaleMs: 0,
  crafts: {
    saw_planks: { itemKey: "plank", uses: { wood: 2 }, makes: 3, toTable: 0, verb: "saw 2 logs into 3 planks", line: "Fresh planks, straight and true." },
    make_stool: { itemKey: "stool", uses: { plank: 2 }, makes: 1, toTable: 0, verb: "make a stool", line: "A stool. Three legs, no wobble." },
    make_chair: { itemKey: "chair", uses: { plank: 4 }, makes: 1, toTable: 0, verb: "make an oak chair", line: "A new chair on the porch. Sit, try it." },
    make_table: { itemKey: "table", uses: { plank: 6, fittings: 1 }, makes: 1, toTable: 0, verb: "make a round table", line: "A table, fit for four friends." },
    make_bookshelf: { itemKey: "bookshelf", uses: { plank: 8, fittings: 2 }, makes: 1, toTable: 0, verb: "make a bookshelf", line: "A bookshelf. Now you need books." },
  },
  supplies: {
    wood: { supplierKey: "hollowmere_ansel", place: "Ansel's woodpile", price: 2, buy: 10, low: 6 },
    fittings: { supplierKey: "hollowmere_bjorn", place: "Bjorn's forge", price: shopPrice("fittings"), buy: 4, low: 1 },
  },
  sells: {
    chair: toBest("chair", FURNITURE_BUYERS, 2, 1),
    table: toBest("table", FURNITURE_BUYERS, 2, 1),
    bookshelf: toBest("bookshelf", FURNITURE_BUYERS, 2, 1),
  },
  outings: { ale: { placeKey: "building:inn_hollowmere", place: "the Sawdust & Ale", doing: "have an ale at the Sawdust & Ale", hours: [19, 22], lingerMs: 5 * MIN } },
  asks: { wood: { qty: 8, pay: 2, low: 4 } },
  gift: { itemKey: "stool", qty: 1 },
  orders: { wood: { qty: 12, pay: 2 }, plank: { qty: 12, pay: 1 } },
  words: { wood: "logs", plank: "planks", fittings: "iron fittings", stool: "stools", chair: "chairs", table: "tables", bookshelf: "bookshelves" },
};

/** Della: milks the cows and shears the sheep at the Village Ranch, presses cheese and weaves cloth; the inns buy her cheese, Pip her cloth. */
export const DAIRY: MindProfile = {
  key: "dairy",
  trade: "the dairymaid and weaver at the Village Ranch",
  startStock: { milk: 6, wool: 4, rich_milk: 0, fine_wool: 0, cheese: 2, cloth: 1 },
  startPurse: 50,
  income: { basePerHour: 80, perPlayerPerHour: 15, baseTarget: 300, perPlayerTarget: 60 },
  shelf: shelfOf("cheese", "cloth", "milk"),
  shelfFull: 8,
  shelfCap: { milk: 20 },
  minCraftGapMs: 8 * MIN,
  tableStaleMs: 0,
  crafts: {
    press_cheese: { itemKey: "cheese", uses: { milk: 6 }, makes: 2, toTable: 0, verb: "press 6 jugs of milk into 2 wheels of cheese", line: "Two wheels of cheese, pressed and salted." },
    press_rich_cheese: { itemKey: "cheese", uses: { rich_milk: 1 }, makes: 1, toTable: 0, verb: "press a jug of rich milk into a wheel of cheese", line: "Rich milk makes the best cheese. Smell that." },
    weave_cloth: { itemKey: "cloth", uses: { wool: 4 }, makes: 1, toTable: 0, verb: "weave 4 tufts of wool into a bolt of cloth", line: "A bolt of cloth off the loom. Soft, isn't it?" },
    weave_fine_cloth: { itemKey: "cloth", uses: { fine_wool: 1 }, makes: 1, toTable: 0, verb: "weave fine wool into a bolt of cloth", line: "Fine wool weaves itself, nearly." },
  },
  // Out to the paddocks with her pail and shears (free, but a walk).
  supplies: {
    milk: { spot: { tx: 166, ty: 11 }, place: "the cow paddock", price: 0, buy: 6, low: 6 },
    wool: { spot: { tx: 166, ty: 27 }, place: "the sheep paddock", price: 0, buy: 8, low: 4 },
  },
  sells: {
    cheese: toBest("cheese", INNS, 3, 2),
    cloth: toBest("cloth", [{ buyerKey: "village_pip", place: "Pip's in the grove" }], 2, 1),
  },
  outings: { supper: { placeKey: "building:inn_village", place: "the Wayfarer's Rest", doing: "have supper at the Wayfarer's Rest", hours: [18, 21], lingerMs: 5 * MIN } },
  asks: {},
  gift: { itemKey: "milk", qty: 1 },
  // Players' homesteads supply her week by week.
  orders: { milk: { qty: 10, pay: 4 }, wool: { qty: 12, pay: 3 }, rich_milk: { qty: 2, pay: 14 }, fine_wool: { qty: 2, pay: 12 } },
  words: { milk: "jugs of milk", wool: "tufts of wool", rich_milk: "jugs of rich milk", fine_wool: "tufts of fine wool", cheese: "wheels of cheese", cloth: "bolts of cloth" },
};

/** Fenwick: presses players' apples, grapes and pears into cider and wine and carries them to the inn that pays most. */
export const BREWER: MindProfile = {
  key: "brewer",
  trade: "the village brewer and cider-maker",
  startStock: { apple: 8, red_grape: 6, white_grape: 0, pear: 0, cider: 2, red_wine: 1 },
  startPurse: 80,
  income: { basePerHour: 100, perPlayerPerHour: 20, baseTarget: 400, perPlayerTarget: 80 },
  shelf: shelfOf("cider", "pear_cider", "red_wine", "white_wine", "grape_juice"),
  shelfFull: 6,
  minCraftGapMs: 10 * MIN,
  tableStaleMs: 0,
  crafts: {
    press_cider: { itemKey: "cider", uses: { apple: 4 }, makes: 2, toTable: 0, verb: "press 4 apples into 2 bottles of cider", line: "Two bottles of cider, sharp and cold." },
    press_pear_cider: { itemKey: "pear_cider", uses: { pear: 3 }, makes: 1, toTable: 0, verb: "press 3 pears into a bottle of pear cider", line: "Perry! Pears, pressed and patient." },
    make_red_wine: { itemKey: "red_wine", uses: { red_grape: 6 }, makes: 1, toTable: 0, verb: "make a bottle of red wine from 6 bunches of red grapes", line: "A young red. Give it a year and it'll sing." },
    make_white_wine: { itemKey: "white_wine", uses: { white_grape: 6 }, makes: 1, toTable: 0, verb: "make a bottle of white wine from 6 bunches of white grapes", line: "White wine, pale as morning." },
    press_juice: { itemKey: "grape_juice", uses: { red_grape: 3 }, makes: 1, toTable: 0, verb: "press 3 bunches of grapes into juice", line: "Grape juice, for the little ones." },
  },
  supplies: {},
  sells: {
    cider: toBest("cider", INNS, 3, 2),
    pear_cider: toBest("pear_cider", INNS, 2, 1),
    red_wine: toBest("red_wine", INNS, 2, 1),
    white_wine: toBest("white_wine", INNS, 2, 1),
  },
  outings: { supper: { placeKey: "building:inn_village", place: "the Wayfarer's Rest", doing: "have a pint at the Wayfarer's Rest", hours: [19, 22], lingerMs: 6 * MIN } },
  // The fruit comes from players' vineyards and orchards (and the caravan).
  asks: { apple: { qty: 8, pay: 2, low: 4 }, red_grape: { qty: 12, pay: 2, low: 6 }, pear: { qty: 6, pay: 4, low: 3 } },
  gift: { itemKey: "grape_juice", qty: 1 },
  orders: { apple: { qty: 16, pay: 2 }, red_grape: { qty: 24, pay: 2 }, white_grape: { qty: 12, pay: 2 }, pear: { qty: 8, pay: 4 } },
  words: { apple: "apples", red_grape: "bunches of red grapes", white_grape: "bunches of white grapes", pear: "pears", cider: "bottles of cider", pear_cider: "bottles of pear cider", red_wine: "bottles of red wine", white_wine: "bottles of white wine", grape_juice: "bottles of grape juice" },
};

/** Tamsin: a caravan between the grove, Hollowmere, Brightwater and Coralwick (src/lib/mind/caravan.ts). */
export const CARAVAN: MindProfile = {
  key: "caravan",
  trade: "a travelling trader with a wagon, going round the grove, Hollowmere, Brightwater and Coralwick",
  startStock: { orange: 6, banana: 4 },
  startPurse: 150,
  income: { basePerHour: 60, perPlayerPerHour: 10, baseTarget: 300, perPlayerTarget: 40 },
  // What she may have in the wagon for players, while she has it.
  shelf: shelfOf("apple", "orange", "lemon", "peach", "cherry", "pear", "plum", "coconut", "banana", "honey", "cheese", "cloth", "river_trout", "catfish"),
  shelfFull: 99,
  minCraftGapMs: 0,
  tableStaleMs: 0,
  crafts: {},
  supplies: {},
  circuit: [
    { market: "village", place: "the grove's plaza", nearKey: "village_odo" },
    { market: "hollowmere", place: "Hollowmere", nearKey: "hollowmere_ivy" },
    { market: "brightwater", place: "Brightwater", nearKey: "brightwater_coral" },
    { market: "coralwick", place: "Coralwick", nearKey: "coralwick_lena" },
  ],
  asks: {},
  gift: null,
  orders: {},
  words: { orange: "oranges", banana: "bananas", lemon: "lemons", peach: "peaches", cherry: "cherries", pear: "pears", plum: "plums", coconut: "coconuts", apple: "apples", river_trout: "river trout", catfish: "catfish", wheat: "sheaves of wheat", wood: "logs" },
};

export const PROFILES: Readonly<Record<string, MindProfile>> = { baker: BAKER, smith: SMITH, woodcutter: WOODCUTTER, farmhand: FARMHAND, miller: MILLER, carpenter: CARPENTER, dairy: DAIRY, brewer: BREWER, caravan: CARAVAN };

/** Which NPC thinks with which profile. */
export const PROFILE_OF: Readonly<Record<string, string>> = {
  village_marigold: "baker", hollowmere_bjorn: "smith",
  hollowmere_ansel: "woodcutter", village_rowan: "farmhand", village_hollis: "miller",
  hollowmere_maren: "carpenter", village_della: "dairy", village_fenwick: "brewer", village_tamsin: "caravan",
};

export function profileFor(npcKey: string): MindProfile | null {
  return PROFILES[PROFILE_OF[npcKey] ?? ""] ?? null;
}
