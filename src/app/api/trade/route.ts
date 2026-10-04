// Thin transport shell for the trade action. The db-touching logic lives
// here (not in src/lib/trade.ts, which must stay client-safe to avoid
// pulling the pg driver into the browser bundle).
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { TRADES, findBuyer, stockForNpc } from "@/lib/trade";
import { addCoins, addItem, logEvent, removeItem } from "@/lib/game";
import { perksOf } from "@/lib/combat";
import { tutorialEvent } from "@/lib/tutorialServer";
import { REP_PER_TRADE, discounted, townName, townOfNpc } from "@/lib/reputation";
import { addReputation, reputationWith } from "@/lib/reputationServer";
import { HAGGLER_MULT } from "@/lib/progression";
import { getLivePlayerPosition, markWorldDirty, refreshBikeOwnership } from "@/lib/world-stream";
import { BIKE_ITEM } from "@/lib/bike";

import { adjustStock, npcBuys, shelfSale, undoShelfSale } from "@/lib/mind/mindServer";
import { isMindNpc } from "@/lib/mind/config";
import { regardHelped, tierFor } from "@/lib/mind/regard";

export const dynamic = "force-dynamic";

type SellResult =
  | { ok: true; soldTo: string; itemKey: string; qty: number; gained: number; coins: number }
  | { ok: false; error: string };

async function performSell(opts: {
  characterId: number;
  itemKey: string;
  qty: number;
  npcKey?: string;
}): Promise<SellResult> {
  const qty = Math.max(1, Math.min(99, Math.floor(opts.qty || 1)));
  if (!opts.itemKey) return { ok: false, error: "What are you selling?" };

  const buyer = opts.npcKey
    ? { npcKey: opts.npcKey, trade: TRADES[opts.npcKey]?.find((t) => t.itemKey === opts.itemKey) ?? null }
    : findBuyer(opts.itemKey);
  if (!buyer || !buyer.trade) return { ok: false, error: "Nobody here buys that." };

  const [npc] = await db.select().from(npcs).where(eq(npcs.key, buyer.npcKey));
  if (!npc) return { ok: false, error: "Nobody here buys that." };

  // Haggler: NPCs pay 20% more.
  const haggler = (await perksOf(opts.characterId)).has("haggler");
  const gained = Math.round(buyer.trade.price * qty * (haggler ? HAGGLER_MULT : 1));
  // An NPC with a mind pays from its own purse (src/lib/mind/).
  const purse = await npcBuys(buyer.npcKey, opts.itemKey, qty, gained);
  if (!purse.ok) return { ok: false, error: `${npc.name} can't afford that today.` };
  const ok = await removeItem(opts.characterId, opts.itemKey, qty);
  if (!ok) {
    if (purse.npcId) await adjustStock(purse.npcId, { [opts.itemKey]: -qty }, gained, true);
    return { ok: false, error: "You don't have that." };
  }
  if (purse.npcId) await regardHelped(purse.npcId, opts.characterId, 1);
  await addCoins(opts.characterId, gained);
  const [row] = await db
    .select({ coins: sql<number>`coalesce(${characters.coins}, 0)::int` })
    .from(characters)
    .where(eq(characters.id, opts.characterId));
  return { ok: true, soldTo: npc.name, itemKey: opts.itemKey, qty, gained, coins: row?.coins ?? 0 };
}

export async function POST(req: Request) {
  try {
    const me = await requireCharacter();
    const body = await req.json().catch(() => ({}));
    const itemKey = String(body.itemKey ?? "");
    const qty = Math.max(1, Math.min(99, Number(body.qty ?? 1)));
    const npcKey = body.npcKey ? String(body.npcKey) : undefined;

    // Buying from an NPC (seeds, …): { action: "buy", npcKey, itemKey, qty }.
    if (body.action === "buy") {
      const offer = npcKey ? stockForNpc(npcKey).find((t) => t.itemKey === itemKey) : undefined;
      if (!npcKey || !offer) return Response.json({ error: "They don't sell that." }, { status: 400 });
      if (offer.minLevel && me.level < offer.minLevel) return Response.json({ error: `Reach level ${offer.minLevel} to buy that.` }, { status: 400 });
      // A continent town's people give their friends a discount.
      const town = townOfNpc(npcKey);
      let unit = town ? discounted(offer.price, await reputationWith(me.id, town)) : offer.price;
      // A baker with a mind gives her dear friends 20% off (src/lib/mind/).
      const [seller] = isMindNpc(npcKey) ? await db.select({ id: npcs.id }).from(npcs).where(eq(npcs.key, npcKey)) : [];
      if (seller && (await tierFor(seller.id, me.id)) === "dear") unit = Math.max(1, Math.round(unit * 0.8));
      const cost = unit * qty;
      // …and only sells what's on her shelf.
      const shelf = await shelfSale(npcKey, itemKey, offer.qty * qty, cost);
      if (!shelf.ok) return Response.json({ error: "Sold out! Fresh ones come out of the oven soon." }, { status: 400 });
      // Conditional debit: never lets coins go negative, even on double clicks.
      const paid = await db
        .update(characters)
        .set({ coins: sql`${characters.coins} - ${cost}` })
        .where(and(eq(characters.id, me.id), gte(characters.coins, cost)))
        .returning({ coins: characters.coins });
      if (paid.length === 0) {
        if (shelf.handled && shelf.npcId) await undoShelfSale(shelf.npcId, itemKey, offer.qty * qty, cost);
        return Response.json({ error: `You need ${cost} coins.` }, { status: 400 });
      }
      await addItem(me.id, itemKey, offer.qty * qty);
      if (shelf.npcId) {
        await regardHelped(shelf.npcId, me.id, 1);
        const at = getLivePlayerPosition(me.id) ?? me;
        markWorldDirty(at.x, at.y); // the shop's display out front shows one fewer
      }
      // The speed limit lets you ride as soon as the bike is yours.
      if (itemKey === BIKE_ITEM) await refreshBikeOwnership(me.id);
      const rep = town ? await addReputation(me.id, town, REP_PER_TRADE) : null;
      return Response.json({ ok: true, itemKey, qty: offer.qty * qty, spent: cost, coins: paid[0].coins, notices: rep?.reached ? [`🏘️ ${townName(town!)} now sees you as ${rep.reached}!`] : [] });
    }

    const r = await performSell({ characterId: me.id, itemKey, qty, npcKey });
    if (!r.ok) return Response.json({ error: r.error }, { status: 400 });

    await logEvent(
      "trade",
      `${me.name} sold ${r.qty} ${r.itemKey} to ${r.soldTo} for ${r.gained} coin.`,
      "character",
      me.id,
      me.x,
      me.y,
    );
    const step = await tutorialEvent(me.id, "sell");
    const sellTown = r.ok && npcKey ? townOfNpc(npcKey) : null;
    const rep = sellTown ? await addReputation(me.id, sellTown, REP_PER_TRADE) : null;
    return Response.json({ ok: true, soldTo: r.soldTo, itemKey: r.itemKey, qty: r.qty, gained: r.gained, coins: r.coins, notices: [...(step ? [step] : []), ...(rep?.reached ? [`🏘️ ${townName(sellTown!)} now sees you as ${rep.reached}!`] : [])] });
  } catch (e) {
    return handleApiError(e);
  }
}
