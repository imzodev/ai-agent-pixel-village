// Placement registry (Open/Closed). New sponsor placements = register one
// entry here + implement the handler in src/services/PlacementHandlers.
// Adding a placement never requires editing existing strategies.

import type { SponsorPlacement, SponsorPlacementType } from "@/types/sponsor";

export type PlacementHandler = {
  /** Required monthly price (cents) above the base NPC rent. */
  priceCents: number;
  /** Human-readable label for the pricing table. */
  label: string;
  /** True if the placement is enabled by default for new sponsors. */
  defaultEnabled: boolean;
  /** Validation for the placement's per-sponsor config payload. */
  validateConfig?: (config: Record<string, unknown>) => string | null;
};

const REGISTRY: Record<SponsorPlacementType, PlacementHandler> = {
  npc: { priceCents: 4900, label: "Sponsored NPC (base)", defaultEnabled: true },
  quest_line: { priceCents: 2000, label: "Sponsored quest line", defaultEnabled: false },
  billboard: { priceCents: 1500, label: "Billboard posters", defaultEnabled: false },
  event: { priceCents: 3000, label: "Event sponsorship", defaultEnabled: false },
  cosmetic_drop: { priceCents: 2500, label: "Brand cosmetic drop", defaultEnabled: true },
  home_perk: { priceCents: 4000, label: "Premium home perk", defaultEnabled: false },
};

export function getPlacementHandler(type: SponsorPlacementType): PlacementHandler {
  return REGISTRY[type];
}

export function listPlacements(): Array<{ type: SponsorPlacementType; priceCents: number; label: string; defaultEnabled: boolean }> {
  return (Object.keys(REGISTRY) as SponsorPlacementType[]).map((type) => {
    const h = REGISTRY[type];
    return { type, priceCents: h.priceCents, label: h.label, defaultEnabled: h.defaultEnabled };
  });
}

export function defaultPlacementsFor(sponsorId: number): SponsorPlacement[] {
  return (Object.keys(REGISTRY) as SponsorPlacementType[]).map((type) => ({
    type,
    enabled: REGISTRY[type].defaultEnabled,
    priceCents: REGISTRY[type].priceCents,
    config: { sponsorId },
  }));
}
