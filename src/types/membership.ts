// Membership: a monthly or yearly subscription with cosmetic and convenience
// perks (src/lib/membership.ts rules, src/lib/membershipServer.ts server). Types only.

export type MembershipPlan = "monthly" | "yearly";

export type MembershipPlanDef = { label: string; priceCents: number; per: string; blurb: string };

/** pending: checkout started · active: paid up · cancelled: ended. */
export type MembershipStatus = "pending" | "active" | "cancelled";

/** GET /api/membership. */
export type MembershipView = {
  member: boolean;
  plan: MembershipPlan | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** This month's gems and outfit, when they were just handed over. */
  granted: { gems: number; itemName: string } | null;
  plans: Record<MembershipPlan, MembershipPlanDef>;
  perks: string[];
  /** Buying is open (payments live, or the dev sandbox). */
  open: boolean;
  /** A "Play now" character must be saved (username + password) before paying for it. */
  needsSave: boolean;
  /** There's a Stripe customer, so "Manage billing" works. */
  canManage: boolean;
};
