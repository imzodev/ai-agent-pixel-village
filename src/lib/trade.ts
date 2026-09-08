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
  ],
  // Different character sells the crafted good — keeps the economy moving.
  tinker: [
    { itemKey: "bread", qty: 1, price: 5, line: "My bread, back so soon? Lovely." },
  ],
  // Future examples:
  //   grocer:   [{ itemKey: "grapes", ... }, { itemKey: "oranges", ... }, { itemKey: "strawberries", ... }],
  //   herbalist: [{ itemKey: "herb", ... }, { itemKey: "grapes", ... }],
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
