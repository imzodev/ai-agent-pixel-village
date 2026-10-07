// Building stamps whose visuals come and go with the player (src/game/buildingStamps.ts). Types only.
import type Phaser from "phaser";
import type { BuildingManifestEntry } from "@/lib/buildingManifest";

/** Each building's place, and its visuals while they exist. */
export type StampSlot = {
  entry: BuildingManifestEntry;
  /** Its template in the tilemap cache (one per file). */
  key: string;
  origin: { x: number; y: number };
  /** The chunk its centre lies in. */
  cx: number;
  cy: number;
  visual: {
    tilemap: Phaser.Tilemaps.Tilemap;
    layers: Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>;
    sprites: Phaser.GameObjects.Image[];
  } | null;
};
