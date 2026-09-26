// Trade module — pure data + client-safe helpers. Owns the NPC buy list.
// The db-touching sell logic lives in the route, not here, so the client
// bundle doesn't pull in the pg driver.
//
// To add a new trader or a new item:
//   1. Seed the item in src/lib/seed.ts ITEM_DEFS.
//   2. Add an entry to TRADES below.
// That's it — the modal, route, NPC-conversation Sell offer, and the
// in-character "I buy X" line pick it up automatically.
import type { TradeConfig, TradeItem } from "./types";

export const TRADES: TradeConfig = {
  baker: [
    { itemKey: "egg", qty: 1, price: 1, line: "Hand it here, love. A copper for a fresh egg, same as ever." },
    { itemKey: "berry", qty: 1, price: 2, line: "Fresh berries? Two coppers a basket. For the pie." },
  ],
  // Different character sells the crafted good — keeps the economy moving.
  tinker: [
    { itemKey: "bread", qty: 1, price: 5, line: "My bread, back so soon? Lovely." },
    { itemKey: "stone", qty: 1, price: 1, line: "I'll take river stones off your hands. A copper each." },
    { itemKey: "wool", qty: 1, price: 2, line: "Wool tufts? Two coppers. I can always use more." },
    { itemKey: "slime_gel", qty: 1, price: 2, line: "Slime gel — two coppers. The bearings need the slip." },
  ],
  // Real economy: miller buys your wheat, sells you flour. Wheat → flour is
  // a 1:1 grind; the miller charges 1 copper for the service.
  miller: [
    { itemKey: "wheat", qty: 1, price: 1, line: "I'll buy your wheat for a copper." },
    { itemKey: "flour", qty: 1, price: 2, line: "Flour for your baking — two coppers." },
  ],
  herbalist: [
    { itemKey: "herb", qty: 1, price: 2, line: "Herbs in good nick. Two coppers a bundle." },
    { itemKey: "mushroom", qty: 1, price: 3, line: "Speckled mushrooms? Three coppers. Best in the grove." },
  ],
  shopkeeper: [
    { itemKey: "mushroom", qty: 1, price: 2, line: "Mushrooms, two coppers. I'll pickle 'em." },
    { itemKey: "stone", qty: 1, price: 1, line: "Stones for a copper. I stack 'em out back." },
    { itemKey: "slime_gel", qty: 1, price: 2, line: "Slime gel, two coppers. I find a use for everything." },
  ],
  // Future examples:
  //   grocer:   [{ itemKey: "grapes", ... }, { itemKey: "oranges", ... }, { itemKey: "strawberries", ... }],
};

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
