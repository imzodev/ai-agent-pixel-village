// Billboards on the server: renting a spot (a monthly Stripe subscription),
// review by an admin, what the world shows, and the advertiser's numbers.
// Rules and spots: src/lib/billboards.ts. Posters: src/lib/billboardPoster.ts.
//
// A rental's Stripe metadata only ever carries `billboardRentalId`: the
// webhook dispatcher (src/lib/stripeWebhook.ts) routes by metadata, and a
// `sponsorId` there would activate or cancel that sponsor.

import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { billboardDaily, billboardRentals } from "@/db/schema";
import { BILLBOARD_SPOTS, BILLBOARD_TIERS, holdsSpot, spotByKey } from "./billboards";
import { townAt } from "./settlements";
import { log } from "./logger";
import { paymentsLive } from "./payments";
import type {
  AdminBillboardAction, AdminBillboardRow, BillboardDashboard, BillboardPublicSpot, BillboardSnapshot, BillboardStatus, LiveBillboard,
} from "@/types/billboard";

type Rental = typeof billboardRentals.$inferSelect;

const stripe = (): Stripe | null => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);
const today = (): string => new Date().toISOString().slice(0, 10);

// ── What the world shows ────────────────────────────────────────────────
const LIVE_TTL_MS = 30_000;
let live: { at: number; bySpot: Map<string, LiveBillboard> } | null = null;
let loading: Promise<Map<string, LiveBillboard>> | null = null;

/** The posters up in the world, by spot (cached 30 s per process). */
export async function liveBillboards(): Promise<Map<string, LiveBillboard>> {
  if (live && Date.now() - live.at < LIVE_TTL_MS) return live.bySpot;
  loading ??= (async () => {
    const rows = await db
      .select({ id: billboardRentals.id, spotKey: billboardRentals.spotKey, imagePath: billboardRentals.imagePath, title: billboardRentals.title })
      .from(billboardRentals)
      .where(and(eq(billboardRentals.status, "active"), isNotNull(billboardRentals.imagePath)));
    const bySpot = new Map<string, LiveBillboard>();
    for (const r of rows) if (r.imagePath) bySpot.set(r.spotKey, { rentalId: r.id, spotKey: r.spotKey, poster: r.imagePath, title: r.title ?? "" });
    live = { at: Date.now(), bySpot };
    return bySpot;
  })().finally(() => { loading = null; });
  return loading;
}

/** Forget the cache (after an approval or a cancellation in this process). */
export function invalidateBillboards(): void {
  live = null;
}

/** The billboards inside a pixel box, with their posters (snapshot). */
export async function billboardsInBox(box: { xMin: number; xMax: number; yMin: number; yMax: number }): Promise<BillboardSnapshot[]> {
  const near = BILLBOARD_SPOTS.filter((s) => {
    const x = s.tx * 16, y = s.ty * 16;
    return x + 112 >= box.xMin && x < box.xMax && y + 80 >= box.yMin && y < box.yMax;
  });
  if (!near.length) return [];
  const bySpot = await liveBillboards();
  return near.map((s) => {
    const r = bySpot.get(s.key);
    return { key: s.key, rentalId: r?.rentalId ?? null, poster: r?.poster ?? null, title: r?.title ?? null };
  });
}

// ── Renting ─────────────────────────────────────────────────────────────
async function holdsBySpot(): Promise<Map<string, Rental[]>> {
  const rows = await db.select().from(billboardRentals).where(inArray(billboardRentals.status, ["pending", "review", "active"]));
  const out = new Map<string, Rental[]>();
  for (const r of rows) out.set(r.spotKey, [...(out.get(r.spotKey) ?? []), r]);
  return out;
}

/** Every spot with its price and whether it's free (the advertise page). */
export async function publicSpots(): Promise<BillboardPublicSpot[]> {
  const holds = await holdsBySpot();
  const now = Date.now();
  return BILLBOARD_SPOTS.map((s) => ({
    ...s,
    priceCents: BILLBOARD_TIERS[s.tier].priceCents,
    taken: (holds.get(s.key) ?? []).some((r) => holdsSpot(r, now)),
    town: townAt(s.tx, s.ty)?.name ?? null,
  }));
}

export class BillboardError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/**
 * Rent a spot: the row (holding the spot), then Stripe Checkout. Without a
 * Stripe key outside production (the sandbox) it goes straight to review.
 */
export async function createRental(input: {
  spotKey: string; contactEmail: string; title: string; linkUrl: string; posterFile: string; sponsorId: number | null; baseUrl: string;
}): Promise<{ ownerToken: string; checkoutUrl: string | null; status: BillboardStatus }> {
  const spot = spotByKey(input.spotKey);
  if (!spot) throw new BillboardError("That spot doesn't exist.");
  const priceCents = BILLBOARD_TIERS[spot.tier].priceCents;
  const ownerToken = randomBytes(18).toString("hex");
  const s = stripe();

  const rental = await db.transaction(async (tx) => {
    // One rental at a time per spot: two people can't both start paying for it.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`billboard:${spot.key}`}))`);
    const rows = await tx.select().from(billboardRentals).where(and(eq(billboardRentals.spotKey, spot.key), inArray(billboardRentals.status, ["pending", "review", "active"])));
    if (rows.some((r) => holdsSpot(r, Date.now()))) throw new BillboardError("Someone has just taken that spot. Pick another one.", 409);
    const [row] = await tx.insert(billboardRentals).values({
      spotKey: spot.key, tier: spot.tier, priceCents, ownerToken, contactEmail: input.contactEmail,
      sponsorId: input.sponsorId, pendingTitle: input.title, pendingLinkUrl: input.linkUrl, pendingImagePath: input.posterFile,
      status: s ? "pending" : "review",
      paidAt: s ? null : new Date(),
    }).returning();
    return row;
  });

  if (!s) return { ownerToken, checkoutUrl: null, status: rental.status };
  const tier = BILLBOARD_TIERS[spot.tier];
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer_email: input.contactEmail,
    line_items: [{
      price_data: {
        currency: "usd", recurring: { interval: "month" }, unit_amount: priceCents,
        product_data: { name: `thegroove billboard: ${spot.name}`, description: `${tier.label} ad space, billed monthly. Reviewed before it goes up; refunded if it isn't approved.` },
      },
      quantity: 1,
    }],
    metadata: { billboardRentalId: String(rental.id) },
    subscription_data: { metadata: { billboardRentalId: String(rental.id) } },
    success_url: `${input.baseUrl}/advertise/dashboard?token=${ownerToken}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.baseUrl}/advertise?spot=${spot.key}&cancelled=1`,
  });
  await db.update(billboardRentals).set({ stripeCheckoutId: session.id }).where(eq(billboardRentals.id, rental.id));
  return { ownerToken, checkoutUrl: session.url, status: rental.status };
}

/** Refund a subscription's latest payment (best effort; logged on failure). */
async function refundLatest(s: Stripe, subscriptionId: string): Promise<void> {
  try {
    const invoices = await s.invoices.list({ subscription: subscriptionId, limit: 1, expand: ["data.payments"] });
    const payment = invoices.data[0]?.payments?.data.find((p) => p.status === "paid")?.payment;
    const intent = typeof payment?.payment_intent === "string" ? payment.payment_intent : payment?.payment_intent?.id;
    if (intent) await s.refunds.create({ payment_intent: intent });
  } catch (e) {
    log.error({ err: e, subscriptionId }, "billboard refund failed");
  }
}

async function cancelStripe(r: Rental, refund: boolean): Promise<void> {
  const s = stripe();
  if (!s || !r.stripeSubscriptionId) return;
  if (refund) await refundLatest(s, r.stripeSubscriptionId);
  await s.subscriptions.cancel(r.stripeSubscriptionId).catch((e) => log.error({ err: e, rentalId: r.id }, "billboard cancel failed"));
}

/**
 * A checkout was paid (webhook, or the dashboard's return with session_id).
 * Idempotent: only a still-pending rental moves on. If the spot went to
 * someone else meanwhile (an abandoned hold expired), it's refunded.
 */
export async function markPaid(rentalId: number, session: Stripe.Checkout.Session): Promise<void> {
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const [r] = await db.update(billboardRentals).set({
    status: "review", paidAt: new Date(),
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId: subscriptionId,
  }).where(and(eq(billboardRentals.id, rentalId), eq(billboardRentals.status, "pending"))).returning();
  if (!r) return;
  const others = await db.select({ id: billboardRentals.id }).from(billboardRentals)
    .where(and(eq(billboardRentals.spotKey, r.spotKey), inArray(billboardRentals.status, ["review", "active"]), sql`${billboardRentals.id} <> ${r.id}`));
  if (others.length) {
    await db.update(billboardRentals).set({ status: "rejected", rejectReason: "Someone else took this spot while the payment was open. You've been refunded." }).where(eq(billboardRentals.id, r.id));
    await cancelStripe(r, true);
  }
}

/** A subscription changed or ended (webhook). */
export async function syncSubscription(sub: Stripe.Subscription, deleted: boolean): Promise<void> {
  const rentalId = Number(sub.metadata?.billboardRentalId);
  if (!rentalId) return;
  const periodEnd = sub.items?.data[0]?.current_period_end;
  const ended = deleted || ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
  const [r] = await db.select().from(billboardRentals).where(eq(billboardRentals.id, rentalId));
  if (!r) return;
  await db.update(billboardRentals).set({
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : r.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    ...(ended && (r.status === "review" || r.status === "active" || r.status === "pending") ? { status: "cancelled" as const, cancelledAt: new Date() } : {}),
  }).where(eq(billboardRentals.id, r.id));
  if (ended) invalidateBillboards();
}

// ── The advertiser's dashboard ──────────────────────────────────────────
async function rentalByToken(token: string): Promise<Rental | null> {
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  const [r] = await db.select().from(billboardRentals).where(eq(billboardRentals.ownerToken, token));
  return r ?? null;
}

export async function dashboard(token: string, sessionId: string | null): Promise<BillboardDashboard | null> {
  let r = await rentalByToken(token);
  if (!r) return null;
  const s = stripe();
  if (sessionId && s && r.status === "pending" && r.stripeCheckoutId === sessionId) {
    const session = await s.checkout.sessions.retrieve(sessionId).catch(() => null);
    if (session && session.status === "complete") {
      await markPaid(r.id, session);
      r = (await rentalByToken(token)) ?? r;
    }
  }
  // The last 30 days, oldest first, every day there (a quiet one as zero).
  const dayAt = (i: number) => new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select({ day: billboardDaily.day, impressions: billboardDaily.impressions, clicks: billboardDaily.clicks })
    .from(billboardDaily).where(and(eq(billboardDaily.rentalId, r.id), gte(billboardDaily.day, dayAt(0))));
  const byDay = new Map(rows.map((x) => [x.day, x]));
  const days = Array.from({ length: 30 }, (_, i) => byDay.get(dayAt(i)) ?? { day: dayAt(i), impressions: 0, clicks: 0 });
  return {
    id: r.id, spot: spotByKey(r.spotKey) ?? null, status: r.status, priceCents: r.priceCents,
    title: r.title, linkUrl: r.linkUrl, poster: r.imagePath,
    pendingTitle: r.pendingTitle, pendingLinkUrl: r.pendingLinkUrl, pendingPoster: r.pendingImagePath,
    rejectReason: r.rejectReason, cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
    impressions: r.impressions, clicks: r.clicks, days, paymentsConfigured: paymentsLive(),
  };
}

/** Change the poster, title or link: held for review, the live one stays up meanwhile. */
export async function proposeChange(token: string, change: { title?: string; linkUrl?: string; posterFile?: string }): Promise<void> {
  const r = await rentalByToken(token);
  if (!r) throw new BillboardError("Unknown billboard.", 404);
  if (r.status === "rejected" || r.status === "cancelled") throw new BillboardError("This billboard has ended.");
  await db.update(billboardRentals).set({
    pendingTitle: change.title ?? r.pendingTitle ?? r.title,
    pendingLinkUrl: change.linkUrl ?? r.pendingLinkUrl ?? r.linkUrl,
    pendingImagePath: change.posterFile ?? r.pendingImagePath ?? r.imagePath,
  }).where(eq(billboardRentals.id, r.id));
}

/** Stop renewing; the poster stays up until the paid month runs out. */
export async function cancelAtPeriodEnd(token: string): Promise<void> {
  const r = await rentalByToken(token);
  if (!r) throw new BillboardError("Unknown billboard.", 404);
  const s = stripe();
  if (s && r.stripeSubscriptionId) {
    await s.subscriptions.update(r.stripeSubscriptionId, { cancel_at_period_end: true });
    await db.update(billboardRentals).set({ cancelAtPeriodEnd: true }).where(eq(billboardRentals.id, r.id));
    return;
  }
  // No subscription (an unpaid checkout, or the sandbox): it simply ends.
  await db.update(billboardRentals).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(billboardRentals.id, r.id));
  invalidateBillboards();
}

// ── Review (admin) ──────────────────────────────────────────────────────
export async function adminList(): Promise<AdminBillboardRow[]> {
  const rows = await db.select().from(billboardRentals)
    .where(inArray(billboardRentals.status, ["review", "active"]))
    .orderBy(desc(billboardRentals.id)).limit(200);
  return rows.map((r) => ({
      id: r.id, spotKey: r.spotKey, spotName: spotByKey(r.spotKey)?.name ?? r.spotKey, tier: r.tier, status: r.status,
      contactEmail: r.contactEmail, priceCents: r.priceCents, title: r.title, linkUrl: r.linkUrl, poster: r.imagePath,
      pendingTitle: r.pendingTitle, pendingLinkUrl: r.pendingLinkUrl, pendingPoster: r.pendingImagePath,
      impressions: r.impressions, clicks: r.clicks, createdAt: r.createdAt.toISOString(),
    }));
}

export async function adminAction(id: number, action: AdminBillboardAction, reason: string): Promise<void> {
  const [r] = await db.select().from(billboardRentals).where(eq(billboardRentals.id, id));
  if (!r) throw new BillboardError("Unknown billboard.", 404);
  if (action === "approve") {
    if (r.status !== "review" && r.status !== "active") throw new BillboardError("Only a paid billboard can be approved.");
    if (!r.pendingImagePath && !r.pendingTitle && !r.pendingLinkUrl) throw new BillboardError("Nothing is waiting for review.");
    await db.update(billboardRentals).set({
      status: "active", approvedAt: new Date(), rejectReason: null,
      title: r.pendingTitle ?? r.title, linkUrl: r.pendingLinkUrl ?? r.linkUrl, imagePath: r.pendingImagePath ?? r.imagePath,
      pendingTitle: null, pendingLinkUrl: null, pendingImagePath: null,
    }).where(eq(billboardRentals.id, r.id));
  } else if (action === "reject") {
    if (r.status === "active") {
      // A change was refused: the approved poster stays up.
      await db.update(billboardRentals).set({ pendingTitle: null, pendingLinkUrl: null, pendingImagePath: null, rejectReason: reason || "The change wasn't approved." }).where(eq(billboardRentals.id, r.id));
    } else {
      await db.update(billboardRentals).set({ status: "rejected", rejectReason: reason || "The poster wasn't approved.", cancelledAt: new Date() }).where(eq(billboardRentals.id, r.id));
      await cancelStripe(r, true);
    }
  } else {
    await db.update(billboardRentals).set({ status: "cancelled", rejectReason: reason || "Taken down.", cancelledAt: new Date() }).where(eq(billboardRentals.id, r.id));
    await cancelStripe(r, false);
  }
  invalidateBillboards();
}

// ── Numbers ─────────────────────────────────────────────────────────────
async function bumpDaily(ids: number[], field: "impressions" | "clicks"): Promise<void> {
  const day = today();
  const col = field === "impressions" ? billboardDaily.impressions : billboardDaily.clicks;
  await db.insert(billboardDaily).values(ids.map((rentalId) => ({ rentalId, day, [field]: 1 })))
    .onConflictDoUpdate({ target: [billboardDaily.rentalId, billboardDaily.day], set: { [field]: sql`${col} + 1` } });
}

/** Players saw these posters (the client's batches, already checked against live ones). */
export async function countImpressions(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await db.update(billboardRentals).set({ impressions: sql`${billboardRentals.impressions} + 1` })
    .where(and(inArray(billboardRentals.id, ids), eq(billboardRentals.status, "active")));
  await bumpDaily(ids, "impressions");
}

/** The link of a live poster, counting the click when `count`. Null when it isn't live. */
export async function clickThrough(id: number, count: boolean): Promise<string | null> {
  const [r] = await db.select({ linkUrl: billboardRentals.linkUrl, status: billboardRentals.status }).from(billboardRentals).where(eq(billboardRentals.id, id));
  if (!r || r.status !== "active" || !r.linkUrl) return null;
  if (count) {
    await db.update(billboardRentals).set({ clicks: sql`${billboardRentals.clicks} + 1` }).where(eq(billboardRentals.id, id));
    await bumpDaily([id], "clicks");
  }
  return r.linkUrl;
}

/** Whether a poster file may be shown to this viewer: live, or theirs, or an admin. */
export async function posterVisible(file: string, opts: { token: string | null; admin: boolean }): Promise<{ ok: boolean; live: boolean }> {
  if (opts.admin) return { ok: true, live: false };
  const rows = await db.select({ imagePath: billboardRentals.imagePath, status: billboardRentals.status, ownerToken: billboardRentals.ownerToken })
    .from(billboardRentals).where(or(eq(billboardRentals.imagePath, file), eq(billboardRentals.pendingImagePath, file)));
  if (rows.some((r) => r.status === "active" && r.imagePath === file)) return { ok: true, live: true };
  return { ok: !!opts.token && rows.some((r) => r.ownerToken === opts.token), live: false };
}
