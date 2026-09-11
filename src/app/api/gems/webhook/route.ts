// Stripe webhook for gem purchases. Verifies the signature, then credits
// gems via the GemService. Idempotent on stripe session id.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getContainer } from "@/lib/container";
import type { GemPackKey } from "@/types/cosmetic";

export const dynamic = "force-dynamic";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

export async function POST(req: Request) {
  if (!stripe || !WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, mode: "sandbox" });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const md = session.metadata ?? {};
    const characterId = Number(md.characterId);
    const packKey = md.packKey as GemPackKey | undefined;
    if (characterId && packKey) {
      const c = getContainer();
      await c.services.gem.fulfill({ characterId, packKey, stripeSessionId: session.id, userId: undefined });
    }
  }
  return NextResponse.json({ ok: true });
}
