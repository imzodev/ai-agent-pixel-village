// One Stripe webhook for everything that's paid for. A Stripe endpoint has a
// single signing secret, so gems, memberships, sponsors and billboards share
// this dispatcher, routed by the checkout's metadata (packKey /
// membershipCharacterId / billboardRentalId / sponsorId). Each route under /api/*/webhook is a thin wrapper, so
// whichever URL is registered in Stripe handles them all. Every handler is
// idempotent: a redelivered event changes nothing.

import Stripe from "stripe";
import { getContainer } from "./container";
import { sponsorEnded, sponsorPaid } from "./sponsorBilling";
import { markPaid, syncSubscription } from "./billboardServer";
import { memberPaid, memberSubscription } from "./membershipServer";
import { GEM_PACKS, type GemPackKey } from "@/types/cosmetic";

/** The verified event, or the response to send back. */
async function verify(req: Request): Promise<Stripe.Event | Response> {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key) return Response.json({ error: "Payments not configured" }, { status: 400 });
  // Never accept unsigned events in production: anyone could credit gems or open a business.
  if (!secret && process.env.NODE_ENV === "production") return Response.json({ error: "webhook secret not configured" }, { status: 503 });
  const raw = await req.text();
  try {
    const sig = req.headers.get("stripe-signature") ?? "";
    return secret ? new Stripe(key).webhooks.constructEvent(raw, sig, secret) : (JSON.parse(raw) as Stripe.Event);
  } catch (e) {
    return Response.json({ error: `Webhook error: ${(e as Error).message}` }, { status: 400 });
  }
}

async function dispatch(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const md = s.metadata ?? {};
    if (md.packKey && md.characterId) {
      const packKey = md.packKey as GemPackKey;
      if (GEM_PACKS.some((p) => p.key === packKey)) {
        await getContainer().services.gem.fulfill({ characterId: Number(md.characterId), packKey, stripeSessionId: s.id });
      }
    } else if (md.membershipCharacterId) {
      await memberPaid(Number(md.membershipCharacterId), s);
    } else if (md.billboardRentalId) {
      await markPaid(Number(md.billboardRentalId), s);
    } else if (md.sponsorId) {
      await sponsorPaid(Number(md.sponsorId), s);
    }
    return;
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    if (sub.metadata?.membershipCharacterId) await memberSubscription(sub, event.type === "customer.subscription.deleted");
    else if (sub.metadata?.billboardRentalId) await syncSubscription(sub, event.type === "customer.subscription.deleted");
    else if (sub.metadata?.sponsorId && event.type === "customer.subscription.deleted") await sponsorEnded(Number(sub.metadata.sponsorId));
  }
}

/** POST handler for every Stripe webhook route. */
export async function handleStripeWebhook(req: Request): Promise<Response> {
  const event = await verify(req);
  if (event instanceof Response) return event;
  await dispatch(event);
  return Response.json({ received: true });
}
