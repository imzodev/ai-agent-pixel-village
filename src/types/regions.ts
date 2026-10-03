// World regions west of the village: the King's Road, Whisperwood,
// Hollowmere, Greyspine (mountains + caverns), Silverrun, Brightwater.
// Types only — the plan and terrain rules live in src/lib/regions.ts.

/** A named area, in world tiles (inclusive bounds, ty grows downward). */
export type Region = {
  key: string;
  name: string;
  tx0: number;
  tx1: number;
  ty0: number;
  ty1: number;
  /** Where the map prints its name (tiles); defaults to the box's middle. */
  label?: { tx: number; ty: number };
};

/** An inclusive tile rectangle. */
export type TileBox = { tx0: number; tx1: number; ty0: number; ty1: number };

/** A Wilds tileset tile name (see src/lib/terrain/wildsTiles.json). */
export type WildsTile = string;

/**
 * What a generated world tile holds. `ground` is a Wilds tile or "grass"
 * (the village's grass GIDs); `upper` sits on GroundUpper (walkable decor:
 * paths, tall grass, flowers, bridge deck); `lower` is a blocking
 * DecorationLower tile; `canopy` is a walkable tree-crown fringe that is
 * Y-sorted over the player; `collide` blocks without art (water).
 */
export type TerrainCell = {
  ground: WildsTile | "grass";
  upper?: WildsTile;
  lower?: WildsTile;
  canopy?: WildsTile;
  /** Decoration drawn over a blocking tile (boulders on a mountain ledge). */
  prop?: WildsTile;
  collide?: boolean;
};

/** A resource node placed in the generated regions. */
export type RegionNode = { kind: string; itemKey: string; tx: number; ty: number };
