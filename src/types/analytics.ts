// Analytics events and the admin stats view (src/lib/track.ts,
// src/lib/statsServer.ts). Types only.

export type TrackKind =
  | "signup"
  | "login"
  // A "Play now" character saved with a username and password.
  | "character_saved"
  | "tutorial_step"
  | "tutorial_skip"
  | "journey_step"
  | "moment_created"
  | "share_click"
  | "profile_view"
  | "moment_view"
  | "visitor"
  // Someone's first page view, with where they came from (src/lib/acquisition.ts).
  | "landing"
  // The money funnel (src/lib/adapters/analytics.ts keeps these from the services).
  | "shop_view"
  | "gem_checkout_started"
  | "gem_purchase_fulfilled"
  | "cosmetic_bought_gems"
  | "cosmetic_bought_coins"
  | "membership_checkout_started"
  | "membership_started"
  | "membership_ended";

/** Where a visitor came from: a source ("x", "reddit", "direct"…) and, when tagged, a campaign. */
export type Acquisition = { src: string; campaign: string };

/** One source in the stats: who landed, who signed up, who came back (d1/d7 of those old enough to). */
export type SourceRow = { src: string; landings: number; signups: number; d1: number; d1Of: number; d7: number; d7Of: number; campaigns: string[] };

/** One day's number. */
export type DayCount = { day: string; n: number };

/** GET /api/admin/stats. */
export type StatsView = {
  generatedAt: string;
  totals: { players: number; signups30d: number; activeToday: number; active7d: number };
  signups: DayCount[];
  daily: DayCount[];
  visitors: DayCount[];
  /** Of the players who signed up that day, the share who came back 1 and 7 days later. */
  retention: { day: string; cohort: number; d1: number | null; d7: number | null }[];
  /** Players (signed up in the last 30 days) who reached each tutorial step. */
  tutorial: { step: string; n: number }[];
  sharing: { momentsCreated: number; shareClicks: Record<string, number>; profileViews: number; momentViews: number; signupsFromShares: number };
  /** Last 30 days, by where people came from (busiest first). */
  bySource: SourceRow[];
  revenue: RevenueView;
};

/** Money: what recurs each month, and the last 30 days' one-off sales. */
export type RevenueView = {
  /** Monthly recurring revenue: members (yearly plans as a twelfth), sponsors' rent, paid billboards. */
  mrrCents: number;
  /** Of that, billboards set to end at the close of their paid month. */
  cancellingCents: number;
  sponsors: { active: number; mrrCents: number };
  members: { active: number; monthly: number; yearly: number; mrrCents: number; joined30d: number; ended30d: number };
  billboards: {
    paid: number;
    inReview: number;
    changesWaiting: number;
    mrrCents: number;
    byTier: { tier: string; held: number; total: number; priceCents: number }[];
  };
  /** Lead fees sponsors' codes earned in the last 30 days (not billed yet). */
  leadFees30dCents: number;
  /** Gem packs bought through Stripe in the last 30 days. */
  gems30d: { cents: number; purchases: number; payers: number; byPack: { packKey: string; n: number; cents: number }[] };
  /** Gem sales a day, in cents. */
  gemDaily: DayCount[];
  /** Billboard views and clicks in the last 30 days. */
  ads30d: { impressions: number; clicks: number };
  /** Players at each step towards paying, last 30 days (each counted once per step). */
  funnel30d: { step: string; players: number }[];
};
