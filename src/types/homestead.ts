// Homesteads (src/lib/homestead.ts): one plot of land that grows, made of
// square parcels whose use the owner picks. Types only.

/** What a parcel is used for. "wild" = bought but not set up yet. */
export type ParcelUse = "wild" | "field" | "pasture" | "vineyard" | "orchard" | "barn" | "workshop";

/** A parcel's place in its homestead's grid (0-based, col → east, row → south). */
export type ParcelCell = { col: number; row: number };

/** One owned parcel. */
export type Parcel = ParcelCell & { use: ParcelUse };

/** How a use looks and what it holds, for the homestead window and help. */
export type ParcelUseDef = {
  use: ParcelUse;
  icon: string;
  name: string;
  /** One line: what it's for. */
  blurb: string;
  /** Crop plots on one parcel of this use (fields, vines, trees). */
  plots: number;
  /** Pasture space units on one parcel (animals take space, see SPACE_OF). */
  space: number;
};

/** A homestead site (from scripts/gen-homestead-sites.ts): where one can be claimed. */
export type HomesteadSite = {
  key: string;
  /** Top-left tile of parcel (0, 0). */
  tx: number;
  ty: number;
  /** The block it belongs to; blocks open for claiming as the open ones fill. */
  block: number;
  /** Where the "For sale" signpost stands (tile). */
  sign: { tx: number; ty: number };
};

/** Why a parcel action is refused, or null when it's allowed. */
export type HomesteadRefusal = string | null;

/** What changing a parcel's use would clear (for the confirm). */
export type UseChangeCost = {
  /** Crops / vines / trees removed from it. */
  crops: number;
  /** Animals that no longer fit and must be sold or moved first (blocks the change). */
  animalsOver: number;
};

/** The homestead window's data. */
export type HomesteadView = {
  /** The homestead's lot key (= its site key). */
  key: string;
  mine: boolean;
  owner: { id: number; name: string } | null;
  parcels: Parcel[];
  /** Parcels this owner may hold at their level, and the grid's hard cap. */
  cap: number;
  maxCap: number;
  /** Cells that can be bought next (adjacent, inside the site). */
  buyable: ParcelCell[];
  price: number;
  coins: number;
  /** Pasture space in use and in total. */
  space: { used: number; total: number };
  /** Level at which the cap next rises, if any. */
  nextCapAt: { level: number; cap: number } | null;
};

/** src/lib/homesteadSitesData.json (written by scripts/gen-homestead-sites.ts). */
export type HomesteadSitesData = { sites: HomesteadSite[] };

/** A building on a barn or workshop parcel: where its picture goes and which tiles block (tiles from the parcel's top-left). */
export type ParcelBuilding = {
  /** Picture's top-left, px from the parcel's top-left. */
  x: number;
  y: number;
  /** Blocked tiles: the walls (the roof above them is walked behind). */
  solid: { dx: number; dy: number; w: number; h: number };
};

/** Where a built machine stands on its parcel: bottom-left, px from the parcel's top-left. */
export type ParcelSpot = { x: number; y: number };
