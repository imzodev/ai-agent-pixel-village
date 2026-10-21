// Membership: what it costs and what it gives. Cosmetic and convenience only:
// nothing here wins fights or touches the coin economy (economy.test.ts).
// Pure; src/lib/membershipServer.ts carries it out.

import type { MembershipPlan, MembershipPlanDef } from "@/types/membership";

export const MEMBERSHIP_PLANS: Readonly<Record<MembershipPlan, MembershipPlanDef>> = {
  monthly: { label: "Monthly", priceCents: 499, per: "month", blurb: "Cancel any time." },
  yearly: { label: "Yearly", priceCents: 3999, per: "year", blurb: "Two months free." },
};

/** Gems a member gets each calendar month (UTC). */
export const MEMBER_MONTHLY_GEMS = 500;

/** How many times faster than everyone else a member may talk to AI villagers. */
export const MEMBER_TALK_MULT = 2;

/** A lapsed payment keeps the perks this long while Stripe retries. */
export const MEMBER_GRACE_MS = 3 * 86_400_000;

/** The members-only outfits, one handed out each month in turn (src/lib/cosmetics.ts). */
export const MEMBER_COSMETICS = ["member_crown", "member_cone", "member_apron"] as const;

export const MEMBER_PERKS: readonly string[] = [
  `💎 ${MEMBER_MONTHLY_GEMS} gems every month`,
  "👑 A members-only outfit every month, yours to keep",
  "⭐ A member's star on your nameplate",
  `💬 ${MEMBER_TALK_MULT}× more conversations with the AI villagers`,
  "🌱 Keeps thegroove running and growing",
];

/** The month a grant belongs to ("2026-10"). */
export const monthKey = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 7);

/** The members-only outfit for a month (they take turns). */
export function memberCosmeticFor(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MEMBER_COSMETICS[(y * 12 + (m - 1)) % MEMBER_COSMETICS.length];
}

/** Whether a membership gives its perks now: active and paid up (with a short grace). */
export function memberNow(m: { status: string; currentPeriodEnd: Date | null } | null | undefined, nowMs: number): boolean {
  if (!m || m.status !== "active") return false;
  return !m.currentPeriodEnd || m.currentPeriodEnd.getTime() + MEMBER_GRACE_MS > nowMs;
}

/** A nameplate title with the member's star. */
export const memberTitle = (title: string | null, member: boolean): string | null =>
  member ? `⭐ ${title ?? "Member"}` : title;
