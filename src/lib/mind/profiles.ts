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
  shelf: { bread: 4, honey_bun: 6, apple_pie: 9 },
  shelfFull: 12,
  minCraftGapMs: 10 * MIN,
  tableStaleMs: 20 * MIN,
  crafts: {
    bake_bread: { itemKey: "bread", uses: { flour: 4 }, makes: 12, toTable: 6, verb: "bake a batch of 12 loaves", line: "Fresh bread on the table, loves! One each, mind." },
    bake_pies: { itemKey: "apple_pie", uses: { apple: 3, flour: 2 }, makes: 6, toTable: 3, verb: "bake 6 apple pies", line: "Apple pies, from the vineyard's apples! One each, loves." },
    bake_buns: { itemKey: "honey_bun", uses: { flour: 2, egg: 4, honey: 1 }, makes: 8, toTable: 4, verb: "bake a batch of 8 honey buns", line: "Honey buns, still warm! One each, loves." },
  },
  supplies: { flour: { supplierKey: "village_hollis", place: "Hollis's mill", price: 3, buy: 8, low: 5 } },
  asks: { egg: { qty: 6, pay: 2, low: 4 }, flour: { qty: 4, pay: 5, low: 5 }, honey: { qty: 2, pay: 7, low: 1 } },
  gift: { itemKey: "honey_bun", qty: 1 },
  // Players' farms supply her week by week (src/lib/ordersServer.ts).
  orders: { egg: { qty: 12, pay: 2 }, flour: { qty: 6, pay: 5 }, milk: { qty: 4, pay: 4 }, honey: { qty: 3, pay: 6 }, apple: { qty: 8, pay: 3 }, jam: { qty: 2, pay: 11 } },
  words: { flour: "bags of flour", egg: "eggs", honey: "jars of honey", milk: "jugs of milk", apple: "apples", jam: "jars of jam", bread: "loaves", honey_bun: "honey buns", apple_pie: "apple pies" },
};

/** Bjorn: forges axes and swords and fletches arrows for his shelf from the
 *  stone and wood players bring him; no supplier nearby, so he asks. */
export const SMITH: MindProfile = {
  key: "smith",
  trade: "the blacksmith of Hollowmere",
  startStock: { stone: 10, wood: 8, axe: 1, arrow: 20, stone_sword: 0, fittings: 8 },
  startPurse: 60,
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
  supplies: {},
  asks: { stone: { qty: 8, pay: 1, low: 4 }, wood: { qty: 6, pay: 2, low: 3 } },
  gift: { itemKey: "arrow", qty: 10 },
  orders: { wood: { qty: 10, pay: 2 }, stone: { qty: 12, pay: 1 } },
  words: { stone: "stones", wood: "logs", axe: "axes", arrow: "arrows", stone_sword: "stone swords", fittings: "iron fittings" },
};

export const PROFILES: Readonly<Record<string, MindProfile>> = { baker: BAKER, smith: SMITH };

/** Which NPC thinks with which profile. */
export const PROFILE_OF: Readonly<Record<string, string>> = { village_marigold: "baker", hollowmere_bjorn: "smith" };

export function profileFor(npcKey: string): MindProfile | null {
  return PROFILES[PROFILE_OF[npcKey] ?? ""] ?? null;
}
