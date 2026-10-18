// Supply and demand, the server part (the rules are src/lib/market.ts): the
// market_demand table, read with its decay, and written in one atomic upsert
// per sale so two sales at once each see the other.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { marketDemand } from "@/db/schema";
import { DEMAND_HALF_LIFE_MS, decayGlut, demandFactor, trendOf, unitPrice } from "./market";
import { marketName, marketOf } from "./economy";
import { marketDepth, tradesForNpc } from "./trade";
import { itemDef } from "./itemDefs";
import type { MarketPrice } from "@/types/economy";

const HALF_LIFE_S = DEMAND_HALF_LIFE_MS / 1000;

/** The glut now, per item, in a market (0 for items it hasn't been sold). */
export async function gluts(market: string, itemKeys?: readonly string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ itemKey: marketDemand.itemKey, glut: marketDemand.glut, updatedAt: marketDemand.updatedAt })
    .from(marketDemand)
    .where(itemKeys ? and(eq(marketDemand.market, market), inArray(marketDemand.itemKey, [...itemKeys])) : eq(marketDemand.market, market));
  const now = Date.now();
  return new Map(rows.map((r) => [r.itemKey, decayGlut(r.glut, now - r.updatedAt.getTime())]));
}

/**
 * Record `qty` sold into a market, atomically: decays the stored glut to now
 * and adds `qty`. Returns the glut just before this sale, which prices it.
 */
export async function recordSale(market: string, itemKey: string, qty: number): Promise<number> {
  const [row] = await db
    .insert(marketDemand)
    .values({ market, itemKey, glut: qty, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [marketDemand.market, marketDemand.itemKey],
      set: {
        glut: sql`${marketDemand.glut} * power(0.5, greatest(0, extract(epoch from (now() - ${marketDemand.updatedAt}))) / ${HALF_LIFE_S}) + ${qty}`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ glut: marketDemand.glut });
  return Math.max(0, (row?.glut ?? qty) - qty);
}

/** Take back a sale that didn't go through. */
export async function undoSale(market: string, itemKey: string, qty: number): Promise<void> {
  await db
    .update(marketDemand)
    .set({ glut: sql`greatest(0, ${marketDemand.glut} - ${qty})` })
    .where(and(eq(marketDemand.market, market), eq(marketDemand.itemKey, itemKey)));
}

/** What a buyer pays now for each item it takes. */
export async function pricesAt(npcKey: string): Promise<Record<string, MarketPrice>> {
  const trades = tradesForNpc(npcKey);
  if (!trades.length) return {};
  const g = await gluts(marketOf(npcKey), trades.map((t) => t.itemKey));
  const out: Record<string, MarketPrice> = {};
  for (const t of trades) {
    const glut = g.get(t.itemKey) ?? 0, depth = marketDepth(marketOf(npcKey), t.itemKey);
    out[t.itemKey] = { base: t.price, price: Math.round(unitPrice(t.price, glut, depth) * 100) / 100, trend: trendOf(glut, depth), glut, depth };
  }
  return out;
}

/** News for NPCs' talk: what their market has had too much of lately ("the village has had plenty of wheat"). */
export async function marketNews(npcKey: string, max = 3): Promise<string[]> {
  const market = marketOf(npcKey);
  const g = await gluts(market);
  return [...g.entries()]
    .map(([itemKey, glut]) => ({ itemKey, f: demandFactor(glut, marketDepth(market, itemKey)) }))
    .filter((x) => x.f < 0.6)
    .sort((a, b) => a.f - b.f)
    .slice(0, max)
    .map((x) => `Buyers in ${marketName(market)} have had plenty of ${(itemDef(x.itemKey)?.name ?? x.itemKey.replace(/_/g, " ")).toLowerCase()} lately and pay ${x.f < 0.3 ? "very little" : "less"} for it; other towns pay more.`);
}
