// Standing orders, the server part (rules: src/lib/orders.ts): the offers in
// an NPC's conversation, signing up, and delivering. Deliveries go into the
// NPC's stock and are paid from its purse (src/lib/mind/mindServer.ts), so a
// broke baker can't buy; the player's ranch earns farm XP.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { npcs, standingOrders } from "@/db/schema";
import { addCoins, countItem, removeItem } from "@/lib/game";
import { adjustStock, npcBuys, remember } from "@/lib/mind/mindServer";
import { isMindNpc } from "@/lib/mind/config";
import { profileFor } from "@/lib/mind/profiles";
import { word } from "@/lib/mind/profile";
import { regardHelped } from "@/lib/mind/regard";
import { addFarmXp, ranchOfOwner } from "@/lib/ranchServer";
import { XP_PER_DELIVERY } from "@/lib/ranchUpgrades";
import { MAX_ORDERS_PER_ITEM, deliverable, deliveryPay, weekRolled } from "@/lib/orders";
import type { Offer } from "@/lib/types";

type NpcRow = typeof npcs.$inferSelect;
type Result = { ok: true; message: string; coins?: number } | { ok: false; error: string };

/** Order offers in this NPC's conversation: take one, or deliver. */
export async function orderOffers(npc: NpcRow, characterId: number, now = Date.now()): Promise<Offer[]> {
  const p = profileFor(npc.key);
  if (!p || !isMindNpc(npc.key) || !Object.keys(p.orders).length) return [];
  const mine = await db.select().from(standingOrders).where(and(eq(standingOrders.npcId, npc.id), eq(standingOrders.characterId, characterId)));
  const out: Offer[] = [];
  for (const [item, o] of Object.entries(p.orders)) {
    const row = mine.find((m) => m.itemKey === item);
    if (!row) {
      const [taken] = await db.select({ n: sql<number>`count(*)::int` }).from(standingOrders).where(and(eq(standingOrders.npcId, npc.id), eq(standingOrders.itemKey, item)));
      if ((taken?.n ?? 0) < MAX_ORDERS_PER_ITEM) {
        out.push({ id: `order:${item}`, type: "order", itemKey: item, qty: o.qty, price: o.pay, label: `📋 Take an order: ${o.qty} ${word(p, item)} a week (${o.pay}🪙 each)`, line: `I could use ${o.qty} ${word(p, item)} a week, if your farm can spare them.` });
      }
      continue;
    }
    const delivered = weekRolled(row.weekStart.getTime(), now) ? 0 : row.delivered;
    const n = deliverable(row.qtyPerWeek, delivered, await countItem(characterId, item));
    if (n > 0) out.push({ id: `deliver:${item}`, type: "deliver", itemKey: item, qty: n, price: o.pay, label: `📦 Deliver ${n} ${word(p, item)} (${row.qtyPerWeek - delivered} left this week)`, line: `Oh, the ${word(p, item)}! Right on time.` });
  }
  return out;
}

export async function takeOrder(npc: NpcRow, characterId: number, itemKey: string, now = Date.now()): Promise<Result> {
  const p = profileFor(npc.key);
  const o = p?.orders[itemKey];
  if (!p || !o) return { ok: false, error: "They don't need that." };
  const [taken] = await db.select({ n: sql<number>`count(*)::int` }).from(standingOrders).where(and(eq(standingOrders.npcId, npc.id), eq(standingOrders.itemKey, itemKey)));
  if ((taken?.n ?? 0) >= MAX_ORDERS_PER_ITEM) return { ok: false, error: "Enough farms supply that already." };
  const added = await db.insert(standingOrders).values({ npcId: npc.id, characterId, itemKey, qtyPerWeek: o.qty, weekStart: new Date(now) }).onConflictDoNothing().returning({ id: standingOrders.id });
  if (!added.length) return { ok: false, error: "You already supply that." };
  return { ok: true, message: `📋 You'll bring ${npc.name} ${o.qty} ${word(p, itemKey)} a week, ${o.pay}🪙 each.` };
}

export async function deliverOrder(npc: NpcRow, characterId: number, playerName: string, itemKey: string, now = Date.now()): Promise<Result> {
  const p = profileFor(npc.key);
  const o = p?.orders[itemKey];
  const [row] = await db.select().from(standingOrders).where(and(eq(standingOrders.npcId, npc.id), eq(standingOrders.characterId, characterId), eq(standingOrders.itemKey, itemKey)));
  if (!p || !o || !row) return { ok: false, error: "You don't supply that." };
  const fresh = weekRolled(row.weekStart.getTime(), now);
  const order = { qtyPerWeek: row.qtyPerWeek, delivered: fresh ? 0 : row.delivered };
  const n = deliverable(order.qtyPerWeek, order.delivered, await countItem(characterId, itemKey));
  if (n <= 0) return { ok: false, error: order.delivered >= order.qtyPerWeek ? "You've filled this week's order." : `You've no ${word(p, itemKey)} with you.` };
  const pay = deliveryPay(order, n, o.pay);
  const bought = await npcBuys(npc.key, itemKey, n, pay.coins);
  if (!bought.ok) return { ok: false, error: `${npc.name} can't afford it this week.` };
  if (!(await removeItem(characterId, itemKey, n))) {
    if (bought.npcId) await adjustStock(bought.npcId, { [itemKey]: -n }, pay.coins, true);
    return { ok: false, error: `You've no ${word(p, itemKey)} with you.` };
  }
  const bonus = pay.bonus && (await adjustStock(npc.id, {}, -pay.bonus)) ? pay.bonus : 0;
  await addCoins(characterId, pay.coins + bonus);
  await db.update(standingOrders).set({ delivered: order.delivered + n, ...(fresh ? { weekStart: new Date(now) } : {}) }).where(eq(standingOrders.id, row.id));
  await regardHelped(npc.id, characterId, pay.filled ? 4 : 1);
  await remember(npc.id, `${playerName} delivered ${n} ${word(p, itemKey)} on their order.`, now);
  const ranch = await ranchOfOwner(characterId);
  if (ranch) await addFarmXp(ranch, XP_PER_DELIVERY);
  return {
    ok: true, coins: pay.coins + bonus,
    message: `📦 Delivered ${n} ${word(p, itemKey)} for ${pay.coins}🪙${bonus ? ` + a ${bonus}🪙 bonus for filling the week!` : "."}`,
  };
}
