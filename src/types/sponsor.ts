// Sponsor placements + attribution. New placements = new union member +
// new strategy in src/services/PlacementRegistry.ts.

export const SPONSOR_PLACEMENT_TYPES = [
  "npc", // base: the NPC at the reserved building
  "quest_line", // daily quest line that mentions sponsor
  "billboard", // two large posters on main street
  "event", // weekly tournament sponsorship
  "cosmetic_drop", // brand hat granted on first visit
  "home_perk", // sponsor-paying players get extra home visitor slots
] as const;

export type SponsorPlacementType = (typeof SPONSOR_PLACEMENT_TYPES)[number];

export type SponsorPlacement = {
  type: SponsorPlacementType;
  /** Monthly cost in cents (additive on top of base NPC rent). */
  priceCents: number;
  /** True if the placement is currently enabled for the sponsor. */
  enabled: boolean;
  /** Type-specific config (e.g. logo URL, quest line copy). */
  config: Record<string, unknown>;
};

export type BrandHatSpec = {
  /** Item key in the cosmetic catalog; typically `hat_brand_<sponsorId>`. */
  itemKey: string;
  /** Hex tint applied over the base hat layer. */
  tintColor: string;
  /** Optional small overlay PNG (logo) composited onto the hat layer. */
  overlayRef: string | null;
};

export const SPONSOR_EVENT_TYPES = [
  "impression",
  "approach",
  "dialogue_start",
  "mission_accept",
  "discount_claimed",
  "lead_submitted",
  "site_click",
  "cosmetic_grant",
  "event_join",
] as const;

export type SponsorEventType = (typeof SPONSOR_EVENT_TYPES)[number];

export type SponsorEvent = {
  id: number;
  sponsorId: number;
  characterId: number;
  type: SponsorEventType;
  /** Optional UTM/campaign tag for cross-channel attribution. */
  utmSource: string | null;
  utmCampaign: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
};

export type SponsorDashboardSummary = {
  sponsorId: number;
  totals: Record<SponsorEventType, number>;
  weekly: Array<{ weekStart: string; events: number; leads: number }>;
  topQuests: Array<{ missionId: number; title: string; accepts: number }>;
};
