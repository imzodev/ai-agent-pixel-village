// Billboards: ad spaces anyone can rent in the world (src/lib/billboards.ts
// rules, src/lib/billboardServer.ts server). Types only.

/** How busy a spot is, which sets its monthly price. */
export type BillboardTier = "plaza" | "town" | "roadside";

export type BillboardTierDef = { label: string; priceCents: number; blurb: string };

/** A fixed place a billboard stands (src/lib/billboardSpotsData.json). Top-left tile. */
export type BillboardSpotDef = { key: string; name: string; tier: BillboardTier; tx: number; ty: number };

/**
 * pending: checkout started, not paid · review: paid, waiting for an admin ·
 * active: up in the world · rejected: refused (refunded) · cancelled: ended.
 */
export type BillboardStatus = "pending" | "review" | "active" | "rejected" | "cancelled";

/** Enough of a rental to know whether it still holds its spot. */
export type BillboardHold = { spotKey: string; status: BillboardStatus; createdAt: Date };

/** What the world shows at a spot: its live poster, or an empty board. */
export type BillboardSnapshot = { key: string; rentalId: number | null; poster: string | null; title: string | null };

/** A live rental, as cached for the snapshot. */
export type LiveBillboard = { rentalId: number; spotKey: string; poster: string; title: string };

/** A spot on the advertise page. */
export type BillboardPublicSpot = BillboardSpotDef & { priceCents: number; taken: boolean; town: string | null };

export type BillboardDay = { day: string; impressions: number; clicks: number };

/** The advertiser's dashboard (by owner token). */
export type BillboardDashboard = {
  id: number;
  spot: BillboardSpotDef | null;
  status: BillboardStatus;
  priceCents: number;
  title: string | null;
  linkUrl: string | null;
  poster: string | null;
  pendingTitle: string | null;
  pendingLinkUrl: string | null;
  pendingPoster: string | null;
  rejectReason: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  impressions: number;
  clicks: number;
  days: BillboardDay[];
  paymentsConfigured: boolean;
};

/** A row of the admin review list. */
export type AdminBillboardRow = {
  id: number;
  spotKey: string;
  spotName: string;
  tier: BillboardTier;
  status: BillboardStatus;
  contactEmail: string;
  priceCents: number;
  title: string | null;
  linkUrl: string | null;
  poster: string | null;
  pendingTitle: string | null;
  pendingLinkUrl: string | null;
  pendingPoster: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
};

export type AdminBillboardAction = "approve" | "reject" | "takedown";

/** A processed poster upload. */
export type PosterResult = { ok: true; file: string } | { ok: false; error: string };

/** A cleaned advertiser link. */
export type AdLinkResult = { ok: true; url: string } | { ok: false; error: string };

/** GET /api/billboards: what the advertise page shows. */
export type BillboardCatalog = {
  tiers: Record<BillboardTier, BillboardTierDef>;
  spots: BillboardPublicSpot[];
  open: boolean;
  paymentsConfigured: boolean;
};
