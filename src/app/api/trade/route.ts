// Thin transport shell for the trade action. The db-touching logic lives
// here (not in src/lib/trade.ts, which must stay client-safe to avoid
// pulling the pg driver into the browser bundle).
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, npcs } from "@/db/schema";
import { handleApiError, requireCharacter } from "@/lib/auth";
import { stockForNpc } from "@/lib/trade";
import { performSell } from "@/lib/sellServer";
import { pricesAt } from "@/lib/marketServer";
import { addItem, logEvent } from "@/lib/game";
import { tutorialEvent } from "@/lib/tutorialServer";
import { REP_PER_TRADE, discounted, townName, townOfNpc } from "@/lib/reputation";
import { addReputation, reputationWith } from "@/lib/reputationServer";
import { getLivePlayerPosition, markWorldDirty, refreshBikeOwnership } from "@/lib/world-stream";
import { BIKE_ITEM } from "@/lib/bike";

import { mindPurse, shelfSale, undoShelfSale } from "@/lib/mind/mindServer";
import type { BuyerPurse } from "@/types/trade";
import { isMindNpc } from "@/lib/mind/config";
import { DEAR_DISCOUNT } from "@/lib/economy";
import { regardHelped, tierFor } from "@/lib/mind/regard";

export const dynamic = "force-dynamic";


/** What an NPC pays now and can pay with: GET /api/trade?npcKey=… → { purse, prices } (purse null = no limit). */
export async function GET(req: Request) {
  try {
    await requireCharacter();
    const npcKey = new URL(req.url).searchParams.get("npcKey") ?? "";
    const body: BuyerPurse = { purse: npcKey ? await mindPurse(npcKey) : null, prices: npcKey ? await pricesAt(npcKey) : {} };
    return Response.json(body);
  } catch (e) {
    return handleApiError(e);
  }
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
      if (seller && (await tierFor(seller.id, me.id)) === "dear") unit = Math.max(1, Math.ceil(unit * (1 - DEAR_DISCOUNT)));
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

    if (!npcKey) return Response.json({ error: "Who are you selling to?" }, { status: 400 });
    const r = await performSell({ characterId: me.id, at: me, itemKey, qty, npcKey });
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
    return Response.json({ ok: true, soldTo: r.soldTo, itemKey: r.itemKey, qty: r.qty, wanted: r.wanted, gained: r.gained, coins: r.coins, purse: r.purse, notices: [...(step ? [step] : []), ...(rep?.reached ? [`🏘️ ${townName(sellTown!)} now sees you as ${rep.reached}!`] : [])] });
  } catch (e) {
    return handleApiError(e);
  }
}
