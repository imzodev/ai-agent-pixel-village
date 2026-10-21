// "Manage billing": a Stripe Customer Portal session (change card, see
// invoices, cancel), for whoever pays us by subscription.
//   POST { kind: "sponsor" | "billboard", token }   by owner token
//   POST { kind: "member" }                           the signed-in player
// Answers { url } to send them to.
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { billboardRentals, sponsors } from "@/db/schema";
import { getCurrentCharacter } from "@/lib/auth";
import { memberCustomerId } from "@/lib/membershipServer";

export const dynamic = "force-dynamic";

const baseUrl = (req: Request) => process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;

async function customerFor(kind: unknown, token: string): Promise<{ customer: string | null; back: string } | null> {
  if (kind === "sponsor") {
    const [sp] = await db.select({ c: sponsors.stripeCustomerId }).from(sponsors).where(eq(sponsors.ownerToken, token));
    return sp ? { customer: sp.c, back: `/sponsor/dashboard?token=${token}` } : null;
  }
  if (kind === "billboard") {
    const [r] = await db.select({ c: billboardRentals.stripeCustomerId }).from(billboardRentals).where(eq(billboardRentals.ownerToken, token));
    return r ? { customer: r.c, back: `/advertise/dashboard?token=${token}` } : null;
  }
  if (kind === "member") {
    const me = await getCurrentCharacter();
    return me ? { customer: await memberCustomerId(me.id), back: "/shop" } : null;
  }
  return null;
}

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return Response.json({ error: "Billing isn't set up yet." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; token?: unknown };
  const found = await customerFor(b.kind, typeof b.token === "string" ? b.token.slice(0, 80) : "");
  if (!found) return Response.json({ error: "Not found." }, { status: 404 });
  if (!found.customer) return Response.json({ error: "There's no billing to manage yet." }, { status: 400 });
  const session = await new Stripe(key).billingPortal.sessions.create({ customer: found.customer, return_url: `${baseUrl(req)}${found.back}` });
  return Response.json({ url: session.url });
}
