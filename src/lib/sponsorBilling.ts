// Sponsors' money events (src/lib/stripeWebhook.ts): a paid checkout opens
// the business, an ended subscription closes it and frees its building.

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { buildings, npcs, sponsors } from "@/db/schema";

export async function sponsorPaid(sponsorId: number, s: Stripe.Checkout.Session): Promise<void> {
  await db.update(sponsors).set({
    status: "active",
    stripeCustomerId: typeof s.customer === "string" ? s.customer : null,
    stripeSubscriptionId: typeof s.subscription === "string" ? s.subscription : null,
  }).where(eq(sponsors.id, sponsorId));
}

export async function sponsorEnded(sponsorId: number): Promise<void> {
  const [sp] = await db.select().from(sponsors).where(eq(sponsors.id, sponsorId));
  if (!sp) return;
  await db.update(sponsors).set({ status: "cancelled" }).where(eq(sponsors.id, sp.id));
  await db.update(npcs).set({ active: false }).where(eq(npcs.sponsorId, sp.id));
  if (sp.buildingId) await db.update(buildings).set({ sponsorId: null }).where(eq(buildings.id, sp.buildingId));
}
