import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { buildings, npcs, sponsors } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Stripe webhook: activates / cancels sponsorships as money moves. */
export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key) return Response.json({ error: "Payments not configured" }, { status: 400 });
  const stripe = new Stripe(key);
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    const sig = req.headers.get("stripe-signature") ?? "";
    event = secret ? stripe.webhooks.constructEvent(raw, sig, secret) : (JSON.parse(raw) as Stripe.Event);
  } catch (e) {
    return Response.json({ error: `Webhook error: ${(e as Error).message}` }, { status: 400 });
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const sponsorId = Number(s.metadata?.sponsorId);
    if (sponsorId) {
      await db.update(sponsors).set({
        status: "active",
        stripeCustomerId: typeof s.customer === "string" ? s.customer : null,
        stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : null,
      }).where(eq(sponsors.id, sponsorId));
    }
  }
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const sponsorId = Number(sub.metadata?.sponsorId);
    if (sponsorId) {
      const [sp] = await db.select().from(sponsors).where(eq(sponsors.id, sponsorId));
      if (sp) {
        await db.update(sponsors).set({ status: "cancelled" }).where(eq(sponsors.id, sp.id));
        await db.update(npcs).set({ active: false }).where(eq(npcs.sponsorId, sp.id));
        if (sp.buildingId) await db.update(buildings).set({ sponsorId: null }).where(eq(buildings.id, sp.buildingId));
      }
    }
  }
  return Response.json({ received: true });
}
