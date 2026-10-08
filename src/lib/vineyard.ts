// Vineyards, the pure part: which plots are trellises and which hold fruit
// trees (scripts/draw-vineyard-lot.mjs puts vines left of the path), and
// whether a plant may go in a plot. Perennial growth is in src/lib/crops.ts
// and src/lib/garden.ts; the winery reuses ranch growth (ranchUpgrades.ts).

import type { GardenCell, GardenCropDef, LotKind, VineyardSlot } from "@/types/garden";
import { ORCHARD_FRUITS } from "./orchard";

/** Garden cells left of this template column are vine plots, the rest trees. */
export const VINE_MAX_DX = 12;

export function vineyardSlot(cell: Pick<GardenCell, "dx">): VineyardSlot {
  return cell.dx < VINE_MAX_DX ? "vine" : "tree";
}

/** Can this crop be planted in this plot? null = yes, else why not. */
export function plantRule(crop: GardenCropDef, lotKind: LotKind, slot: VineyardSlot | null, farmLevel: number): string | null {
  const lots = crop.lots ?? ["land", "home"];
  if (!lots.includes(lotKind)) {
    if (lotKind === "vineyard") return "Only vines and apple trees grow in a vineyard.";
    if (lotKind === "orchard") return "Only fruit trees grow in an orchard.";
    return lots.includes("orchard") ? "Plant that in an orchard." : "Plant that in a vineyard.";
  }
  if (crop.slot && slot && crop.slot !== slot) return crop.slot === "vine" ? "Vines go on the trellises." : "Fruit trees go in the orchard, right of the path.";
  if (crop.minFarmLevel && farmLevel < crop.minFarmLevel) return `Your ${lotKind} needs to reach level ${crop.minFarmLevel} for that.`;
  return null;
}

/** The seeds / cuttings / saplings in a bag that grow in this kind of lot. */
export function plantablesFor<T extends { itemKey: string; qty: number }>(lotKind: LotKind | undefined, bag: readonly T[], crops: Readonly<Record<string, GardenCropDef>>): T[] {
  return bag.filter((i) => i.qty > 0 && crops[i.itemKey] && (crops[i.itemKey].lots ?? ["land", "home"]).includes(lotKind ?? "land"));
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
 * What grows in an empty plot of this kind of lot and where to get it, for the
 * plot's panel and the quick-plant toast (players are never told otherwise).
 */
export function plotHint(lotKind: LotKind | undefined): string {
  switch (lotKind) {
    case "vineyard":
      return "Vineyard: grapevines grow on the trellises (left of the path), apple trees on the orchard side (right). Pip sells grape cuttings and apple saplings.";
    case "orchard":
      return `Orchard: fruit trees only (${ORCHARD_FRUITS.map((f) => f.name.toLowerCase()).join(", ")}, apple). Pip sells apple saplings; the other saplings come from towns whose land suits them.`;
    default:
      return "Field: vegetables grow here. The shopkeeper sells seeds.";
  }
}
