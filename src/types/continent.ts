// The procedural continent (src/lib/continent.ts). Types only.

export type Biome =
  | "ocean" | "beach" | "meadow" | "forest" | "darkwood" | "swamp"
  | "desert" | "badlands" | "snow" | "peak" | "snowpeak" | "mesa";

/** Opaque ground families drawn over grass (scripts/draw-wilds.mjs). */
export type GroundKind = "grass" | "sand" | "snow" | "mud" | "darkgrass" | "redrock";
