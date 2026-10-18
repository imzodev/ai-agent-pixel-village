// Selling to an NPC: the one path for the Sell window (/api/trade) and the
// "sell" offer in a conversation (/api/npc/[id]/accept). The buyer must be
// near; what it pays comes from its market's demand (src/lib/market.ts), with
// Haggler on top; an NPC with a mind pays from its purse; coins are added
// atomically.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, npcs } from "@/db/schema";
import { TRADES, marketDepth } from "./trade";
import { marketOf } from "./economy";
import { affordableBulk, bulkPay } from "./market";
import { gluts, recordSale, undoSale } from "./marketServer";
import { addCoins, removeItem } from "./game";
import { perksOf } from "./combat";
import { HAGGLER_MULT } from "./progression";
import { rowPositionAt } from "./motion";
import { getLivePlayerPosition } from "./world-stream";
import { adjustStock, mindPurse, npcBuys } from "./mind/mindServer";
import { cantAffordText } from "./mind/profile";
import { regardHelped } from "./mind/regard";
import type { SellResult } from "@/types/trade";

/** How close (px) a player must stand to sell to someone (the HUD offers it at 160). */
export const SELL_REACH_PX = 14 * 16;

export async function performSell(opts: { characterId: number; at: { x: number; y: number }; itemKey: string; qty: number; npcKey: string }): Promise<SellResult> {
  const wanted = Math.max(1, Math.min(99, Math.floor(opts.qty || 1)));
  if (!opts.itemKey) return { ok: false, error: "What are you selling?" };
  const trade = TRADES[opts.npcKey]?.find((t) => t.itemKey === opts.itemKey);
  if (!trade) return { ok: false, error: "Nobody here buys that." };

  const [npc] = await db.select().from(npcs).where(eq(npcs.key, opts.npcKey));
  if (!npc) return { ok: false, error: "Nobody here buys that." };
  const me = getLivePlayerPosition(opts.characterId) ?? opts.at;
  const them = rowPositionAt(npc, Date.now());
  if (Math.hypot(me.x - them.x, me.y - them.y) > SELL_REACH_PX) return { ok: false, error: `You need to be next to ${npc.name} to sell.` };

  const market = marketOf(opts.npcKey), depth = marketDepth(market, opts.itemKey);
  const mult = (await perksOf(opts.characterId)).has("haggler") ? HAGGLER_MULT : 1; // Haggler: NPCs pay 20% more
  // An NPC with a mind pays from its own purse (src/lib/mind/): it takes as many as it can pay for.
  const before = await mindPurse(opts.npcKey);
  const glutNow = (await gluts(market, [opts.itemKey])).get(opts.itemKey) ?? 0;
  const qty = affordableBulk(trade.price, glutNow, depth, wanted, before, mult);
  if (qty === 0) return { ok: false, error: cantAffordText(npc.name, before ?? 0, opts.itemKey, trade.price * mult) };

  // Priced from the glut just before this sale, recorded atomically.
  const glut = await recordSale(market, opts.itemKey, qty);
  const gained = Math.max(1, Math.round(bulkPay(trade.price, glut, depth, qty) * mult));
  const purse = await npcBuys(opts.npcKey, opts.itemKey, qty, gained);
  if (!purse.ok) {
    await undoSale(market, opts.itemKey, qty);
    return { ok: false, error: cantAffordText(npc.name, (await mindPurse(opts.npcKey)) ?? 0, opts.itemKey, trade.price * mult) };
  }
  if (!(await removeItem(opts.characterId, opts.itemKey, qty))) {
    await undoSale(market, opts.itemKey, qty);
    if (purse.npcId) await adjustStock(purse.npcId, { [opts.itemKey]: -qty }, gained, true);
    return { ok: false, error: "You don't have that." };
  }
  if (purse.npcId) await regardHelped(purse.npcId, opts.characterId, 1);
  await addCoins(opts.characterId, gained);
  const [row] = await db.select({ coins: sql<number>`coalesce(${characters.coins}, 0)::int` }).from(characters).where(eq(characters.id, opts.characterId));
  return { ok: true, soldTo: npc.name, itemKey: opts.itemKey, qty, wanted, gained, coins: row?.coins ?? 0, purse: before == null ? null : await mindPurse(opts.npcKey) };
}
