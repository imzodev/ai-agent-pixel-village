// Sponsor attribution middleware. Hooks the NPC talk + accept routes to
// fire SponsorEvent records. Pure functions so route handlers stay thin.

import type { SponsorAttribution } from "@/services/SponsorAttribution";
import type { SponsorEventType } from "@/types/sponsor";

export type AttributionContext = {
  attribution: SponsorAttribution;
};

export async function fire(
  ctx: AttributionContext,
  input: { sponsorId: number; characterId: number; type: SponsorEventType; meta?: Record<string, unknown>; utmSource?: string; utmCampaign?: string },
): Promise<void> {
  try {
    await ctx.attribution.record(input);
  } catch (e) {
    // Attribution must never break gameplay; log and continue.
    console.error("sponsor attribution failed", e);
  }
}
