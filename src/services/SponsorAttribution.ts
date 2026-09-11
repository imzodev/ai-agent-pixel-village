// Sponsor attribution. Records events and exposes aggregates for the dashboard.
// New event types = add to SponsorEventType (type system enforces exhaustive).

import type { SponsorEventType } from "@/types/sponsor";
import type { DrizzleSponsorEventRepo } from "@/db/repos/sponsorEvent";
import type { SponsorRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";

export class SponsorAttribution {
  constructor(
    private events: DrizzleSponsorEventRepo,
    private sponsors: SponsorRepository,
    private analytics: AnalyticsPort,
  ) {}

  async record(input: {
    sponsorId: number;
    characterId: number;
    type: SponsorEventType;
    utmSource?: string;
    utmCampaign?: string;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.events.record({
      sponsorId: input.sponsorId,
      characterId: input.characterId,
      type: input.type,
      utmSource: input.utmSource ?? null,
      utmCampaign: input.utmCampaign ?? null,
      meta: input.meta ?? {},
    });
    this.analytics.track("sponsor_event", { type: input.type, sponsorId: input.sponsorId });
  }

  async weeklySummary(sponsorId: number): Promise<{ totals: Record<SponsorEventType, number> }> {
    const since = new Date(Date.now() - 7 * 86400_000);
    const totals = await this.events.countByType(sponsorId, since);
    return { totals };
  }

  async recentForSponsor(sponsorId: number, limit = 100) {
    return this.events.listForSponsor(sponsorId, limit);
  }
}
