// Lots (owned parcels) and home gardens. Types only — no logic.
//
// A lot is a parcel of land a player can own. Today every lot is a "home"
// lot (a building plus its front garden); "land" lots without a building
// are planned. Garden plots belong to a lot; crops planted in them are
// resource_nodes rows carrying owner_id / lot_id / plot.

/** What kind of parcel a lot is. */
import type { RanchLook } from "./ranchGrowth";

export type LotKind = "home" | "land" | "ranch" | "vineyard" | "workshop" | "orchard";

/** A vineyard plot: a trellis for a vine, or room for a fruit tree. */
export type VineyardSlot = "vine" | "tree";

/** A lot as sent to clients. */
export type LotSnapshot = {
  key: string;
  kind: LotKind;
  /** Building the lot belongs to (home lots). */
  buildingKey: string | null;
  owner: { id: number; name: string } | null;
  /** Coins to acquire it (0 = free to move in). */
  price: number;
  /** Listed for resale by its owner (reserved for a later release). */
  forSale: boolean;
  /** Ranch lots: the buildings to draw on it (src/lib/ranchUpgrades.ts). */
  ranch?: RanchLook;
};

/** One plantable cell of a garden, in template tile units. */
export type GardenCell = {
  /** Stable plot index within the lot (0-based, template scan order). */
  plot: number;
  /** Tile column/row of the cell pair's left tile, relative to the template. */
  dx: number;
  dy: number;
};

/** A garden plot resolved to world pixels (the crop's bottom-centre anchor). */
export type GardenPlot = { plot: number; x: number; y: number };

/** A garden crop: the seed that plants it and what it yields. */
export type GardenCropDef = {
  /** CROP_KINDS key (growth stages, timing, frames). */
  kind: string;
  /** Inventory item consumed to plant it. */
  seedKey: string;
  /** Inventory item produced on harvest. */
  produceKey: string;
  /** Lot kinds it can be planted in (default: land and home gardens). */
  lots?: readonly LotKind[];
  /** Vineyards: the kind of plot it needs. */
  slot?: VineyardSlot;
  /** Farm level of the lot needed to plant it (src/lib/ranchUpgrades.ts). */
  minFarmLevel?: number;
};

/** Result of a lot / garden action. */
export type GardenResult =
  | { ok: true; message: string; gained?: { itemKey: string; qty: number }[]; x?: number; y?: number; notices?: string[] }
  | { ok: false; error: string };

/** An orchard fruit (src/lib/orchard.ts): its tree, fruit, sapling and where saplings are sold. */
export type OrchardFruit = {
  tree: string;
  fruit: string;
  sapling: string;
  name: string;
  icon: string;
  /** Fresh fruit value (shops pay about this). */
  value: number;
  saplingPrice: number;
  /** Kinds of towns whose shops sell the sapling (the land suits it). */
  families: readonly ("port" | "desert" | "snow" | "swamp" | "darkwood" | "hills")[];
  /** Where the sapling comes from, in its description. */
  origin: string;
};
