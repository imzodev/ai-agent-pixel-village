// GET /api/gems/packs — public list of gem packs for the shop.
// POST /api/gems/checkout — start a Stripe Checkout session for a pack.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { requireCharacter, handleApiError } from "@/lib/auth";
import { checkoutOpen } from "@/lib/payments";

export async function GET() {
  const c = getContainer();
  // `open: false`: no payments here yet (the shop says "coming soon").
  return NextResponse.json({ packs: c.services.gem.getPacks(), open: checkoutOpen() });
}

export async function POST(req: Request) {
  try {
    const ch = await requireCharacter();
    if (!checkoutOpen()) return NextResponse.json({ error: "The gem shop opens soon." }, { status: 503 });
    const body = (await req.json()) as { packKey?: string };
    if (!body.packKey) return NextResponse.json({ error: "packKey required" }, { status: 400 });
    const c = getContainer();
    const { url } = await c.services.gem.startCheckout({ characterId: ch.id, packKey: body.packKey as never, userId: ch.userId });
    return NextResponse.json({ url });
  } catch (e) {
    return handleApiError(e);
  }
}
