// The procedural continent (src/lib/continent.ts). Types only.

export type Biome =
  | "ocean" | "beach" | "meadow" | "forest" | "darkwood" | "swamp"
  | "desert" | "badlands" | "snow" | "peak" | "snowpeak" | "mesa";

/** A province's seed point: tiles belong to the nearest seed. */
export type ProvinceSeed = { key: string; name: string; tx: number; ty: number };

/** Opaque ground families drawn over grass (scripts/draw-wilds.mjs). */
export type GroundKind = "grass" | "sand" | "snow" | "mud" | "darkgrass" | "redrock";
