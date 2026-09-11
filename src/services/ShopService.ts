// Shop service. Thin facade over the CosmeticService so route handlers can
// depend on one port and let the service decide coin vs gem purchase paths.

import type { CharacterRepository } from "@/types/ports";
import type { AnalyticsPort } from "@/types/ports";
import type { DrizzleCosmeticRepo } from "@/db/repos/cosmetic";
import { CosmeticService } from "./CosmeticService";
import { GemService } from "./GemService";

export class ShopService {
  constructor(
    private characters: CharacterRepository,
    private cosmetics: DrizzleCosmeticRepo,
    private analytics: AnalyticsPort,
  ) {}

  /** Returns the cosmetic service so callers can call all shop operations. */
  buildCosmeticService(): CosmeticService {
    return new CosmeticService(this.cosmetics, this.characters, this.analytics);
  }
}
