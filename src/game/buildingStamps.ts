// Stamps building templates (chunk-sized Tiled JSONs) into the world at the
// manifest's placement. Every template uses the same layer schema as world
// chunks (Ground / GroundUpper / DecorationLower / DecorationMiddle* /
// DecorationUpper* / Overlay / etc.), so we reuse the same Y-sort rule
// chunks use: SORTED_LAYERS tiles lift to per-tile sprites with depth
// anchored at the column's bottom ANCHOR_LAYERS tile (so a building's roof
// in DecorationUpper1 sorts correctly against the player as the player
// walks past it). Static layers keep their LAYER_DEPTH.
import type { LightSource } from "@/types/lighting";
import type Phaser from "phaser";
import type { GardenPlot } from "@/types/garden";
import {
  CHUNK_TILE_PX,
  CHUNK_TILE_W,
  blockStampTiles,
  blockedFromChunk,
} from "@/lib/chunkCollision";
import {
  doorTileOf,
  footprintOf,
  gardenPlotsAt,
  type BuildingManifest,
  type BuildingManifestEntry,
} from "@/lib/buildingManifest";
import {
  createStaticLayers,
  STAMP_DEPTH_OFFSET,
  instantiateSortedSprites,
  parseCachedTilemap,
  registerReferencedTilesets,
  tileOrigin,
  type ChunkLoadResult,
} from "./worldTilemap";

export type StampedBuilding = {
  entry: BuildingManifestEntry;
  /** World-pixel origin of the stamp — useful for camera bounds and door lookup. */
  origin: { x: number; y: number };
  door: { x: number; y: number } | null;
  /** Interactive/selection rect in world px (collision bbox offset inside the template). */
  zone: { x: number; y: number; w: number; h: number };
  /** Garden plots (crop anchors in world px) from the template's Garden layer. */
  garden: GardenPlot[];
};

// Load a template's Tiled JSON into the Tilemap cache. Mirrors loadChunk's
// filecomplete pattern; resolves on completion or failure (failure is
// logged, not thrown, so the rest of the manifest can still stamp).
// The village grass GIDs (Floors_Tiles) some templates paint under their
// yards. Dropped from a stamp's Ground layer so the ground beneath shows
// through — village grass in the village, the brighter Wilds grass in the
// western towns — instead of a square of mismatched grass.
const PLAIN_GRASS_GIDS = new Set([4952, 4953, 4954]);
function dropPlainGrass(scene: Phaser.Scene, key: string): void {
  const cached = scene.sys.cache.tilemap.get(key) as { data?: { layers?: { name?: string; data?: number[] }[] } } | undefined;
  for (const layer of cached?.data?.layers ?? []) {
    if (layer.name !== "Ground" || !Array.isArray(layer.data)) continue;
    layer.data = layer.data.map((g) => (PLAIN_GRASS_GIDS.has(g) ? 0 : g));
  }
}

function loadTemplate(scene: Phaser.Scene, key: string, url: string): Promise<void> {
  if (scene.sys.cache.tilemap.get(key)) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onComplete = (loadedKey: string) => {
      if (loadedKey !== key) return;
      cleanup();
      resolve();
    };
    const onError = (file: { key?: string } | undefined) => {
      if (!file || file.key !== key) return;
      cleanup();
      console.warn(`[buildingStamps] failed to load template ${key} (${url})`);
      resolve();
    };
    const cleanup = () => {
      scene.load.off("filecomplete", onComplete);
      scene.load.off("loaderror", onError);
    };
    scene.load.on("filecomplete", onComplete);
    scene.load.on("loaderror", onError);
    scene.load.tilemapTiledJSON(key, url);
    if (!scene.load.isLoading()) scene.load.start();
  });
}

// Register the template's DecorationLower + Collision tiles as blocked.
// NOTE: the Tilemap cache (scene.sys.cache.tilemap) stores a
// { format, data } wrapper — the Tiled JSON lives under `.data`, not at
// the top level.
function registerStampCollision(scene: Phaser.Scene, key: string, ox: number, oy: number): void {
  const entry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
  const json = entry?.data ?? entry;
  if (!json) return;
  const blocked = blockedFromChunk(json);
  if (blocked.size === 0) return;
  blockStampTiles(ox, oy, CHUNK_TILE_W, [...blocked]);
}

// Stamp every manifest building: render its static layers at the manifest's
// world position, lift + instantiate its Y-sort tiles, and register its
// collision tiles. Returns the stamped buildings with derived doors.
export async function stampBuildings(
  scene: Phaser.Scene,
  manifest: BuildingManifest,
): Promise<StampedBuilding[]> {
  const out: StampedBuilding[] = [];
  for (const entry of manifest.buildings) {
    const key = `stamp_${entry.key}`;
    await loadTemplate(scene, key, entry.file);
    dropPlainGrass(scene, key);
    const result = parseStamp(scene, key);
    if (!result) continue;
    const { tilemap, sortedTiles, anchorGrid, anchorByObjectId } = result;
    const tilesets = registerReferencedTilesets(tilemap);
    const origin = tileOrigin(entry.tx, entry.ty);
    createStaticLayers(tilemap, tilesets, origin, key, undefined, STAMP_DEPTH_OFFSET);
    const sortedSprites: Phaser.GameObjects.Image[] = [];
    instantiateSortedSprites(scene, tilesets, sortedTiles, anchorGrid, anchorByObjectId, origin, sortedSprites);
    registerStampCollision(scene, key, origin.x, origin.y);
    const cached = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
    out.push({
      entry,
      origin,
      ...deriveDoorAndZone(scene, key, origin),
      garden: gardenPlotsAt(entry.tx, entry.ty, cached?.data ?? cached),
    });
  }
  return out;
}

// Cache key (entry.key) → parsed tilemap + lifted tiles, or null when the
// template's cache entry is missing or the tilemap failed to parse (the
// caller skips stamping in that case).
function parseStamp(
  scene: Phaser.Scene,
  key: string,
): (ChunkLoadResult & { tilemap: Phaser.Tilemaps.Tilemap }) | null {
  const result = parseCachedTilemap(scene, key);
  if (!result.tilemap) return null;
  // Narrow tilemap from Tilemap | null to Tilemap for the caller's
  // convenience — without this, every destructure site has to re-check.
  return result as ChunkLoadResult & { tilemap: Phaser.Tilemaps.Tilemap };
}

// Read the door position + interactive rect from the cached JSON. The
// raw JSON (the data the door / footprint helpers need) lives under
// `.data` in the cache wrapper, with a fallback to the entry itself
// for safety.
function deriveDoorAndZone(scene: Phaser.Scene, key: string, origin: { x: number; y: number }) {
  const cacheEntry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | unknown;
  const json = (cacheEntry as { data?: unknown })?.data ?? cacheEntry;
  const doorTile = doorTileOf(json);
  const fp = footprintOf(json);
  return {
    door: doorTile
      ? { x: origin.x + doorTile.dx * CHUNK_TILE_PX + 8, y: origin.y + doorTile.dy * CHUNK_TILE_PX + 12 }
      : null,
    zone: {
      x: origin.x + fp.x * CHUNK_TILE_PX,
      y: origin.y + fp.y * CHUNK_TILE_PX,
      w: fp.tw * CHUNK_TILE_PX,
      h: fp.th * CHUNK_TILE_PX,
    },
  };
}

// Town square lamp heads (scripts/draw-town-square.mjs): template tiles.
const SQUARE_LAMPS: ReadonlyArray<[number, number]> = [[4, 3], [19, 3], [4, 10], [19, 10]];

/** Night lights for the stamped buildings: lit windows by every home's
 *  door, the square lamps, the cave mouth's lantern, daylight down the
 *  caverns' ladder. */
export function stampLights(stamped: StampedBuilding[]): LightSource[] {
  const out: LightSource[] = [];
  for (const s of stamped) {
    const { entry, door } = s;
    if (entry.kind === "scenery") {
      for (const [c, r] of SQUARE_LAMPS) out.push({ x: (entry.tx + c) * CHUNK_TILE_PX + 8, y: (entry.ty + r) * CHUNK_TILE_PX + 8, radius: 76, color: 0xffd27a });
      continue;
    }
    if (!door || entry.kind === "land") continue;
    if (entry.key === "cave_mouth") out.push({ x: door.x, y: door.y - 34, radius: 56, color: 0xffb860, flicker: true });
    else if (entry.key === "cave_exit") out.push({ x: door.x, y: door.y - 20, radius: 96, color: 0xe8f4ff });
    else out.push({ x: door.x, y: door.y - 22, radius: 50, color: 0xffc870 });
  }
  return out;
}

/** Chimney tops of the house templates (scripts/draw-houses.mjs), in
 *  template pixels, where smoke rises from. */
const CHIMNEYS: Readonly<Record<string, { x: number; y: number }>> = {
  "/buildings/cabin_1.json": { x: 271, y: 44 },
  "/buildings/cabin_2.json": { x: 189, y: 44 },
  "/buildings/house_1.json": { x: 277, y: 0 },
  "/buildings/house_2.json": { x: 191, y: 0 },
};

/** World positions of every stamped house's chimney (for smoke). */
export function chimneySources(stamped: StampedBuilding[]): { x: number; y: number }[] {
  return stamped.flatMap((s) => {
    const c = CHIMNEYS[s.entry.file];
    return c ? [{ x: s.origin.x + c.x, y: s.origin.y + c.y }] : [];
  });
}
