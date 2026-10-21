// Membership on the server (rules: src/lib/membership.ts): Stripe Checkout in
// subscription mode, kept in step by the webhook dispatcher
// (src/lib/stripeWebhook.ts, metadata `membershipCharacterId`), and each
// month's gems and outfit handed over the first time a member shows up.
// Without a Stripe key outside production (the sandbox) it starts at once.

import { and, eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { characters, cosmeticOwnerships, gemTransactions, memberGrants, memberships, users } from "@/db/schema";
import { cosmoByKey } from "./cosmetics";
import { MEMBERSHIP_PLANS, MEMBER_MONTHLY_GEMS, MEMBER_PERKS, memberCosmeticFor, memberNow, monthKey } from "./membership";
import { checkoutOpen, sandboxAllowed } from "./payments";
import { track } from "./track";
import type { MembershipPlan, MembershipView } from "@/types/membership";

type Row = typeof memberships.$inferSelect;

const stripe = (): Stripe | null => (process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null);

// ── Who's a member (cached briefly: the snapshot asks every few seconds) ──
const CACHE_MS = 60_000;
const cache = new Map<number, { at: number; member: boolean }>();

/** Of these characters, the ones who are members now. */
export async function membersAmong(ids: readonly number[]): Promise<Set<number>> {
  const now = Date.now();
  const out = new Set<number>();
  const ask = ids.filter((id) => {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_MS) { if (hit.member) out.add(id); return false; }
    return true;
  });
  if (ask.length) {
    const rows = await db.select({ characterId: memberships.characterId, status: memberships.status, currentPeriodEnd: memberships.currentPeriodEnd })
      .from(memberships).where(inArray(memberships.characterId, ask));
    const by = new Map(rows.map((r) => [r.characterId, r]));
    for (const id of ask) {
      const member = memberNow(by.get(id), now);
      if (cache.size > 20_000) cache.clear();
      cache.set(id, { at: now, member });
      if (member) out.add(id);
    }
  }
  return out;
}

export const isMember = async (characterId: number): Promise<boolean> => (await membersAmong([characterId])).has(characterId);
const forget = (characterId: number) => cache.delete(characterId);

async function rowOf(characterId: number): Promise<Row | null> {
  const [r] = await db.select().from(memberships).where(eq(memberships.characterId, characterId));
  return r ?? null;
}

/** The Stripe customer to open the billing portal for, if any. */
export async function memberCustomerId(characterId: number): Promise<string | null> {
  return (await rowOf(characterId))?.stripeCustomerId ?? null;
}

// ── The monthly perks ──────────────────────────────────────────────────
/**
 * This month's gems and members-only outfit, once (member_grants is unique
 * per character and month). Null when not a member or already handed over.
 */
export async function claimMonthly(characterId: number, nowMs = Date.now()): Promise<{ gems: number; itemName: string } | null> {
  if (!(await isMember(characterId))) return null;
  const month = monthKey(nowMs);
  const itemKey = memberCosmeticFor(month);
  return db.transaction(async (tx) => {
    const [g] = await tx.insert(memberGrants).values({ characterId, month, gems: MEMBER_MONTHLY_GEMS, itemKey })
      .onConflictDoNothing().returning({ month: memberGrants.month });
    if (!g) return null;
    await tx.update(characters).set({ gems: sql`${characters.gems} + ${MEMBER_MONTHLY_GEMS}` }).where(eq(characters.id, characterId));
    await tx.insert(gemTransactions).values({ characterId, delta: MEMBER_MONTHLY_GEMS, source: "member_grant", packKey: null, stripeSessionId: null });
    const [owned] = await tx.select({ k: cosmeticOwnerships.itemKey }).from(cosmeticOwnerships)
      .where(and(eq(cosmeticOwnerships.characterId, characterId), eq(cosmeticOwnerships.itemKey, itemKey)));
    if (!owned) await tx.insert(cosmeticOwnerships).values({ characterId, itemKey, source: "member" });
    return { gems: MEMBER_MONTHLY_GEMS, itemName: cosmoByKey(itemKey)?.name ?? itemKey };
  });
}

// ── What the shop shows ────────────────────────────────────────────────
export async function membershipView(characterId: number, userId: number): Promise<MembershipView> {
  const granted = await claimMonthly(characterId);
  const r = await rowOf(characterId);
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  const member = memberNow(r, Date.now());
  return {
    member,
    plan: member ? r?.plan ?? null : null,
    currentPeriodEnd: member ? r?.currentPeriodEnd?.toISOString() ?? null : null,
    cancelAtPeriodEnd: !!r?.cancelAtPeriodEnd,
    granted,
    plans: MEMBERSHIP_PLANS,
    perks: [...MEMBER_PERKS],
    open: checkoutOpen(),
    needsSave: !u?.hash,
    canManage: !!r?.stripeCustomerId && !!stripe(),
  };
}

// ── Joining ────────────────────────────────────────────────────────────
export class MembershipError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Start a membership: the Stripe Checkout URL, or (sandbox) start it now. */
export async function startMembership(characterId: number, userId: number, plan: MembershipPlan, baseUrl: string): Promise<{ url: string | null }> {
  if (!checkoutOpen()) throw new MembershipError("Membership opens soon.", 503);
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u?.hash) throw new MembershipError("Save your character first (menu → Save character), so your membership can't be lost.");
  if (await isMember(characterId)) throw new MembershipError("You're already a member.");
  const def = MEMBERSHIP_PLANS[plan];
  const s = stripe();
  if (!s) {
    if (!sandboxAllowed()) throw new MembershipError("Membership opens soon.", 503);
    const end = new Date(Date.now() + (plan === "yearly" ? 365 : 30) * 86_400_000);
    await upsert(characterId, { plan, status: "active", currentPeriodEnd: end, cancelAtPeriodEnd: false, startedAt: new Date(), endedAt: null });
    track("membership_started", characterId, { plan, cents: 0 });
    return { url: null };
  }
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{
      price_data: { currency: "usd", recurring: { interval: plan === "yearly" ? "year" : "month" }, unit_amount: def.priceCents, product_data: { name: `thegroove membership (${def.label.toLowerCase()})` } },
      quantity: 1,
    }],
    metadata: { membershipCharacterId: String(characterId), plan },
    subscription_data: { metadata: { membershipCharacterId: String(characterId), plan } },
    success_url: `${baseUrl}/shop?tab=member&joined=1`,
    cancel_url: `${baseUrl}/shop?tab=member`,
  });
  await upsert(characterId, { plan, status: (await rowOf(characterId))?.status === "active" ? "active" : "pending", stripeCheckoutId: session.id });
  track("membership_checkout_started", characterId, { plan });
  return { url: session.url };
}

async function upsert(characterId: number, set: Partial<typeof memberships.$inferInsert> & { plan: MembershipPlan }): Promise<void> {
  await db.insert(memberships).values({ characterId, ...set }).onConflictDoUpdate({ target: memberships.characterId, set });
  forget(characterId);
}

/** End a sandbox membership (real ones are ended in the Stripe portal). */
export async function endSandboxMembership(characterId: number): Promise<void> {
  const r = await rowOf(characterId);
  if (!r || r.stripeSubscriptionId) throw new MembershipError("Manage your membership from “Manage billing”.");
  await db.update(memberships).set({ status: "cancelled", endedAt: new Date() }).where(eq(memberships.id, r.id));
  forget(characterId);
}

// ── Stripe events (src/lib/stripeWebhook.ts) ───────────────────────────
const periodEndOf = (sub: Stripe.Subscription): Date | null => {
  const end = sub.items?.data[0]?.current_period_end;
  return end ? new Date(end * 1000) : null;
};

/** A membership checkout was paid. Idempotent: activating twice changes nothing. */
export async function memberPaid(characterId: number, session: Stripe.Checkout.Session): Promise<void> {
  const s = stripe();
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const sub = s && subId ? await s.subscriptions.retrieve(subId) : null;
  const plan: MembershipPlan = session.metadata?.plan === "yearly" ? "yearly" : "monthly";
  const was = await rowOf(characterId);
  await upsert(characterId, {
    plan, status: "active", stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId: subId, currentPeriodEnd: sub ? periodEndOf(sub) : null, cancelAtPeriodEnd: false,
    startedAt: was?.status === "active" ? was.startedAt : new Date(), endedAt: null,
  });
  if (was?.status !== "active") track("membership_started", characterId, { plan, cents: MEMBERSHIP_PLANS[plan].priceCents });
}

/** The subscription renewed, changed or ended. */
export async function memberSubscription(sub: Stripe.Subscription, deleted: boolean): Promise<void> {
  const characterId = Number(sub.metadata?.membershipCharacterId);
  if (!characterId) return;
  const r = await rowOf(characterId);
  if (!r || (r.stripeSubscriptionId && r.stripeSubscriptionId !== sub.id)) return; // an older subscription
  const ended = deleted || ["canceled", "unpaid", "incomplete_expired"].includes(sub.status);
  await db.update(memberships).set({
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: periodEndOf(sub) ?? r.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    ...(ended ? { status: "cancelled" as const, endedAt: new Date() } : sub.status === "active" ? { status: "active" as const } : {}),
  }).where(eq(memberships.id, r.id));
  if (ended) track("membership_ended", characterId, { plan: r.plan });
  forget(characterId);
}
