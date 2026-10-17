// Lots (owned land) and gardens. Types only — no logic.
//
// A lot is what a player can own: a home (a cottage and its front garden) or
// a homestead (src/lib/homestead.ts). Crops planted in their plots are
// resource_nodes rows carrying owner_id / lot_id / plot.

import type { RanchLook } from "./ranchGrowth";
import type { Parcel } from "./homestead";

/** What kind of lot it is. */
export type LotKind = "home" | "homestead";

/** Where a crop is planted: a home's garden, or a homestead's field, vineyard or orchard parcel. */
export type PlantSpot = "garden" | "field" | "vineyard" | "orchard";

/** A lot's parcel in world tiles (the `lots` row's tx/ty/tw/th). */
export type LotBounds = { tx: number; ty: number; tw: number; th: number };

/** A lot's banner: indices into LOT_COLORS and LOT_EMBLEMS (src/lib/lotBanner.ts). */
export type LotBanner = { color: number; emblem: number };

/** A lot as sent to clients. */
export type LotSnapshot = {
  key: string;
  kind: LotKind;
  /** Building the lot belongs to (home lots). */
  buildingKey: string | null;
  owner: { id: number; name: string } | null;
  /** Homesteads: the buildings and machines built (src/lib/ranchUpgrades.ts), and the showroom. */
  ranch?: RanchLook;
  /** Owned lots: the banner it flies and where (the door, world px). */
  banner?: LotBanner & { x: number; y: number };
  /** Owned lots: the parcel, so the client knows when you are inside it (src/lib/lotReach.ts). */
  bounds?: LotBounds;
  /** Owned lots: the cheers its owner has received in all (src/lib/cheers.ts). */
  cheers?: number;
  /** Homesteads (src/lib/homestead.ts): the owned parcels and their uses. */
  parcels?: Parcel[];
  /** Homesteads: the signpost (world px) — "For sale" while unclaimed, the owner's name after. */
  sign?: { x: number; y: number };
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
  /** Where it can be planted (default: fields and home gardens). */
  grows?: readonly PlantSpot[];
  /** Farm level of the homestead needed to plant it (src/lib/ranchUpgrades.ts). */
  minFarmLevel?: number;
};

/** Result of a lot / garden action. */
export type GardenResult =
  | { ok: true; message: string; gained?: { itemKey: string; qty: number }[]; x?: number; y?: number; notices?: string[]; /** How many plots a lot-wide action did. */ count?: number }
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

/** One action in the farm window (src/components/FarmPanel.tsx). */
export type FarmAction = { key: string; label: string; run: () => void };

/** A crop type in a lot, as the farm window shows it. */
export type FarmKindView = {
  kind: string; name: string; icon: string; total: number; ripe: number; thirsty: number;
  /** Harvest / water just this type (null: nothing to do). */
  harvest: (() => void) | null; water: (() => void) | null;
};

/** What the farm window shows for one lot (built by the HUD from the snapshot). */
export type FarmView = {
  title: string; kindLabel: string; ripe: number; thirsty: number;
  harvestAll: (() => void) | null; waterAll: (() => void) | null;
  kinds: FarmKindView[];
  /** Plant all, one per seed that fits. */
  plant: FarmAction[];
  /** The plot / crop E was pressed on. */
  here: FarmAction[];
};
