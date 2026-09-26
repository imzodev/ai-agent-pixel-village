// Shop endpoints. GET returns the catalog with ownership/affordability info.
// POST = buy/equip/unequip actions.
//
// Cosmetics (hats, glasses, outfits) live in `character_equipped` and are
// managed here. Inventory items (lantern, wooden_sword, …) live in
// `inventory.equipped` and are equipped through /api/items instead — this
// route refuses anything not in the cosmetic catalog so callers can't
// accidentally write a cosmetic slot into the inventory table.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { requireCharacter, handleApiError } from "@/lib/auth";
import { getLivePlayerPosition, markWorldDirty } from "@/lib/world-stream";

/** Fire-and-forget daily-quest event for shop spending. */
function daily(characterId: number, kind: "spend_coins", payload: Record<string, number | string>, amount: number): void {
  void getContainer().services.quest
    .recordEvent(characterId, { kind, payload }, amount)
    .catch((e) => console.error("[shop] daily quest event failed:", e));
}

export async function GET() {
  try {
    const ch = await requireCharacter();
    const c = getContainer();
    const view = await c.services.cosmetic.getShopView(ch.id);
    return NextResponse.json({ items: view, balance: { coins: ch.coins, gems: ch.gems } });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ch = await requireCharacter();
    const body = (await req.json()) as { action: "buy_coins" | "buy_gems" | "equip" | "unequip"; itemKey?: string };
    const c = getContainer();
    if (body.action === "buy_coins") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      const r = await c.services.cosmetic.buyWithCoins(ch.id, body.itemKey, ch.userId);
      // Emit the actual coin cost for the daily "spend coins" quest.
      const item = await c.services.cosmetic.findItem(body.itemKey);
      if (item?.coinPrice) daily(ch.id, "spend_coins", { itemKey: body.itemKey }, item.coinPrice);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.action === "buy_gems") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      const r = await c.services.cosmetic.buyWithGems(ch.id, body.itemKey, ch.userId);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.action === "equip") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      // The route handler doesn't know the slot; the client picks it from the catalog entry.
      // For server-side validation we re-fetch the catalog row.
      const item = await c.services.cosmetic.findItem(body.itemKey);
      if (!item) return NextResponse.json({ error: "not a cosmetic" }, { status: 404 });
      await c.services.cosmetic.equip(ch.id, item.slot, body.itemKey, ch.userId);
      // Push a fresh snapshot to nearby players (and the local cache
      // invalidation) so the new cosmetics show up immediately.
      const live = getLivePlayerPosition(ch.id);
      markWorldDirty(live?.x ?? ch.x, live?.y ?? ch.y);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "unequip") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      const item = await c.services.cosmetic.findItem(body.itemKey);
      if (!item) return NextResponse.json({ error: "not a cosmetic" }, { status: 404 });
      await c.services.cosmetic.unequip(ch.id, item.slot, ch.userId);
      const live = getLivePlayerPosition(ch.id);
      markWorldDirty(live?.x ?? ch.x, live?.y ?? ch.y);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
