// The continent's generated towns (src/lib/settlements.ts, written by
// scripts/gen-settlements.ts into src/lib/settlementsData.json). Types only.

import type { Appearance } from "./domain";
import type { TileBox } from "./regions";

export type TownFamily = "port" | "desert" | "snow" | "swamp" | "darkwood" | "hills";

/** A generated town: its square's top-left tile and the box it clears. */
export type TownDef = {
  key: string;
  name: string;
  family: TownFamily;
  sq: { tx: number; ty: number };
  box: TileBox;
};

export type TownJob = "innkeeper" | "shopkeeper" | "bounty" | "folk";

/** A generated townsperson (merged into NPC_DEFS, src/lib/seed.ts). */
export type SettlementNpcDef = {
  key: string;
  name: string;
  role: string;
  persona: string;
  greeting: string;
  tilePos: [number, number];
  wanderRadius: number;
  appearance: Appearance;
  mood: string;
  town: string;
  job: TownJob;
};

/** Everything the generator writes. Roads are polylines of tiles. */
export type SettlementsData = { towns: TownDef[]; roads: [number, number][][]; npcs: SettlementNpcDef[] };

/** One building of the town layout, relative to the square's top-left tile. */
export type TownBuildingSlot = { suffix: string; file: string; kind: string; dx: number; dy: number };

/** Terrain dressing on one tile of a town. */
export type TownDecor = { upper?: string; lower?: string; canopy?: string };
