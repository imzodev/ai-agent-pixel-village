// Selling to NPCs (src/app/api/trade/route.ts). Types only — no logic.

/** The outcome of selling to an NPC. A buyer with a purse may take fewer than `wanted`. */
export type SellResult =
  | {
      ok: true;
      soldTo: string;
      itemKey: string;
      /** How many were sold… */
      qty: number;
      /** …of how many the player offered (fewer when the buyer's purse ran short). */
      wanted: number;
      gained: number;
      coins: number;
      /** The buyer's purse after the sale (null: an NPC without one, who always pays). */
      purse: number | null;
    }
  | { ok: false; error: string };

/** GET /api/trade?npcKey=…: what a buyer can pay with (null = no limit). */
export type BuyerPurse = { purse: number | null };
