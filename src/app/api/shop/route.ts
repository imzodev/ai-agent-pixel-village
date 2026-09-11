// Shop endpoints. GET returns the catalog with ownership/affordability info.
// POST = buy/equip/unequip actions.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { requireCharacter, handleApiError } from "@/lib/auth";

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
    const body = (await req.json()) as { action: "buy_coins" | "equip" | "unequip"; itemKey?: string };
    const c = getContainer();
    if (body.action === "buy_coins") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      const r = await c.services.cosmetic.buyWithCoins(ch.id, body.itemKey, ch.userId);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.action === "equip") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      // The route handler doesn't know the slot; the client picks it from the catalog entry.
      // For server-side validation we re-fetch the catalog row.
      const item = await c.services.cosmetic.findItem(body.itemKey);
      if (!item) return NextResponse.json({ error: "unknown item" }, { status: 404 });
      await c.services.cosmetic.equip(ch.id, item.slot, body.itemKey, ch.userId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "unequip") {
      if (!body.itemKey) return NextResponse.json({ error: "itemKey required" }, { status: 400 });
      const item = await c.services.cosmetic.findItem(body.itemKey);
      if (!item) return NextResponse.json({ error: "unknown item" }, { status: 404 });
      await c.services.cosmetic.unequip(ch.id, item.slot, ch.userId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return handleApiError(e);
  }
}
