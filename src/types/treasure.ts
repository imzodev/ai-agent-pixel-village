// Hidden relics and treasure maps (src/lib/relics.ts, src/lib/treasure.ts).
// Types only.

export type RelicSetKey = "coins" | "fossils" | "cards" | "carvings";

/** One of a set's ten pieces, and where it lies (world tile). */
export type RelicDef = { key: string; set: RelicSetKey; name: string; tx: number; ty: number };

/** A set of ten: its book page and what completing it pays. */
export type RelicSetDef = {
  key: RelicSetKey;
  name: string;
  icon: string;
  /** Where to look, shown in the book. */
  blurb: string;
  names: readonly string[];
  reward: { coins: number; title: string };
};

/** scripts/gen-relics.ts output: every relic's spot. */
export type RelicsData = { relics: { key: string; tx: number; ty: number }[] };

/** A chest's contents. */
export type TreasureLoot = { coins: number; xp: number; gems: number; items: { itemKey: string; qty: number }[] };

/** A treasure map in your bag, as you read it (never where it points). */
export type TreasureMapView = {
  mapId: number;
  /** "Somewhere in the Ember Sands". */
  where: string;
  tier: number;
  /** Part of a three-map trail to a legendary cache. */
  part: number | null;
};

/** Where a new map should lead. */
export type TreasureMapOpts = { tier?: number; chain?: boolean; /** Bought from an innkeeper by this character. */ boughtBy?: number };

/** A tiny pixel sprite: rows of palette keys ("." = clear). */
export type PixelArt = { rows: readonly string[]; palette: Readonly<Record<string, string>> };
