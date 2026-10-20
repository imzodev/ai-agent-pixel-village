// Sandbox completion: with no STRIPE_SECRET_KEY, the checkout adapter sends a
// purchase here and it's fulfilled at once, so the shop can be tried locally.
// Development only (src/lib/payments.ts): in production it doesn't exist, and
// it only ever credits the signed-in player's own character.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { GEM_PACKS } from "@/types/cosmetic";
import { getCurrentCharacter } from "@/lib/auth";
import { sandboxAllowed } from "@/lib/payments";

export async function GET(req: Request) {
  if (!sandboxAllowed()) return new NextResponse("Not found", { status: 404 });
  const me = await getCurrentCharacter();
  const pack = GEM_PACKS.find((p) => p.key === new URL(req.url).searchParams.get("packKey"));
  if (!me || !pack) return NextResponse.redirect(new URL("/shop?purchase=invalid", req.url));
  // Logged like a real purchase but with no Stripe session, so revenue stats skip it.
  await getContainer().services.gem.fulfill({ characterId: me.id, packKey: pack.key, stripeSessionId: null });
  return NextResponse.redirect(new URL(`/shop?purchase=ok&packKey=${pack.key}`, req.url));
}
