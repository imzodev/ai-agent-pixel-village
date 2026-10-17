// Planting, the pure part: what may go where (a home's garden or a
// homestead's field, vineyard or orchard parcel), and how perennials (vines
// and fruit trees) grow and fruit again. Perennial growth is in
// src/lib/crops.ts and src/lib/garden.ts; presses, cellars and jam kitchens
// are homestead growth (ranchUpgrades.ts).

import type { GardenCropDef, PlantSpot } from "@/types/garden";
import { ORCHARD_FRUITS } from "./orchard";

const growsIn = (crop: GardenCropDef): readonly PlantSpot[] => crop.grows ?? ["field", "garden"];

/** Can this crop be planted here? null = yes, else why not. */
export function plantRule(crop: GardenCropDef, spot: PlantSpot, farmLevel: number): string | null {
  const where = growsIn(crop);
  if (!where.includes(spot)) {
    if (spot === "vineyard") return "Only grapevines grow in a vineyard.";
    if (spot === "orchard") return "Only fruit trees grow in an orchard.";
    return where.includes("orchard") ? "Plant that in an orchard parcel." : "Plant that in a vineyard parcel.";
  }
  if (crop.minFarmLevel && farmLevel < crop.minFarmLevel) return `Your homestead needs to reach farm level ${crop.minFarmLevel} for that.`;
  return null;
}

/** The seeds, cuttings and saplings in a bag that grow in any of these spots. */
export function plantablesFor<T extends { itemKey: string; qty: number }>(spots: readonly PlantSpot[], bag: readonly T[], crops: Readonly<Record<string, GardenCropDef>>): T[] {
  return bag.filter((i) => i.qty > 0 && crops[i.itemKey] && growsIn(crops[i.itemKey]).some((k) => spots.includes(k)));
}

/** Time per fruit-ripening stage (the stages after `mature`). */
export function fruitStepMs(stages: number, p: { fruitMs: number; mature: number }): number {
  return Math.round(p.fruitMs / Math.max(1, stages - 1 - p.mature));
}

/** Time to the next stage from `stage`: growth until mature, then ripening. */
export function stageMs(cfg: { stages: number; regrowthMs: number; perennial?: { fruitMs: number; mature: number } }, stage: number): number {
  return cfg.perennial && stage >= cfg.perennial.mature ? fruitStepMs(cfg.stages, cfg.perennial) : cfg.regrowthMs;
}

/** After harvesting a perennial: back to mature, ripening again. */
export function afterPerennialHarvest(stages: number, p: { fruitMs: number; mature: number }, now: number): { stage: number; nextAdvanceAt: number } {
  return { stage: p.mature, nextAdvanceAt: now + fruitStepMs(stages, p) };
}

/**
 * What grows in an empty plot and where to get it, for the plot's card and
 * the quick-plant toast (players are never told otherwise).
 */
export function plotHint(spot: PlantSpot | undefined): string {
  switch (spot) {
    case "vineyard":
      return "Vineyard: grapevines grow on the trellises. Pip sells grape cuttings.";
    case "orchard":
      return `Orchard: fruit trees only (${ORCHARD_FRUITS.map((f) => f.name.toLowerCase()).join(", ")}, apple). Pip sells apple saplings; the other saplings come from towns whose land suits them.`;
    default:
      return "Field: vegetables grow here. The shopkeeper sells seeds.";
  }
}
