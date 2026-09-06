// Stamps building templates (chunk-sized Tiled JSONs) into the world at the
// manifest's placement. Every template layer is drawn with the same depth
// scheme as chunk layers, and the template's DecorationLower + Collision
// tiles are registered as blocked. The Interactive layer is data-only: its
// first non-zero tile is the door / interaction anchor.
import type Phaser from "phaser";
import { blockStampTiles, blockedFromChunk } from "@/lib/chunkCollision";
import { doorTileOf, type BuildingManifest, type BuildingManifestEntry } from "@/lib/buildingManifest";
import { CHUNK_TILE_PX, LAYER_DEPTH, LAYER_RENDER_ORDER, SKIP_LAYERS } from "./worldTilemap";

export type StampedBuilding = {
  entry: BuildingManifestEntry;
  originX: number;
  originY: number;
  door: { x: number; y: number } | null;
};

// Load a template's Tiled JSON into the Tilemap cache. Mirrors loadChunk's
// filecomplete pattern; resolves null on failure.
function loadTemplate(scene: Phaser.Scene, key: string, url: string): Promise<Phaser.Tilemaps.Tilemap | null> {
  const existing = scene.sys.cache.tilemap.get(key);
  if (existing) return Promise.resolve(scene.make.tilemap({ key }) ?? null);
  return new Promise((resolve) => {
    const cleanup = () => {
      scene.load.off("filecomplete", onComplete);
      scene.load.off("loaderror", onError);
    };
    const onComplete = (loadedKey: string) => {
      if (loadedKey !== key) return;
      cleanup();
      resolve(scene.make.tilemap({ key }) ?? null);
    };
    const onError = (file: { key?: string } | undefined) => {
      if (!file || file.key !== key) return;
      cleanup();
      console.warn(`[buildingStamps] failed to load template ${key} (${url})`);
      resolve(null);
    };
    scene.load.on("filecomplete", onComplete);
    scene.load.on("loaderror", onError);
    scene.load.tilemapTiledJSON(key, url);
    if (!scene.load.isLoading()) scene.load.start();
  });
}

// Stamp every manifest building: render its layers at (tx, ty) and register
// its collision tiles. Returns the stamped buildings with derived doors.
export async function stampBuildings(
  scene: Phaser.Scene,
  manifest: BuildingManifest,
): Promise<StampedBuilding[]> {
  const out: StampedBuilding[] = [];
  for (const entry of manifest.buildings) {
    const key = `stamp_${entry.key}`;
    // Templates live in the game-level Tilemap cache, so after a scene
    // restart make.tilemap re-parses from cache without a network hit.
    const tilemap = await loadTemplate(scene, key, entry.file);
    if (!tilemap) continue;
    const originX = entry.tx * CHUNK_TILE_PX;
    const originY = entry.ty * CHUNK_TILE_PX;
    createStampLayers(scene, tilemap, key, originX, originY);
    registerStampCollision(scene, tilemap, key, originX, originY);
    const doorTile = doorTileOf(scene.sys.cache.tilemap.get(key) as unknown);
    out.push({
      entry,
      originX,
      originY,
      door: doorTile
        ? { x: originX + doorTile.dx * CHUNK_TILE_PX + 8, y: originY + doorTile.dy * CHUNK_TILE_PX + 12 }
        : null,
    });
  }
  return out;
}

function createStampLayers(scene: Phaser.Scene, tilemap: Phaser.Tilemaps.Tilemap, key: string, ox: number, oy: number): void {
  const referenced = new Set(tilemap.tilesets.map((t) => t.name));
  const tilesets: Phaser.Tilemaps.Tileset[] = [];
  for (const name of referenced) {
    const t = tilemap.addTilesetImage(name);
    if (t) tilesets.push(t);
  }
  for (const name of LAYER_RENDER_ORDER) {
    if (SKIP_LAYERS.has(name)) continue;
    const layer = tilemap.createLayer(name, tilesets, ox, oy);
    if (!layer) continue;
    layer.setDepth(LAYER_DEPTH[name] ?? -5);
    layer.name = `${key}_${name}`;
  }
}

function registerStampCollision(scene: Phaser.Scene, tilemap: Phaser.Tilemaps.Tilemap, key: string, ox: number, oy: number): void {
  const entry = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
  const json = entry?.data ?? entry;
  if (!json) return;
  const blocked = blockedFromChunk(json);
  if (blocked.size === 0) return;
  blockStampTiles(ox, oy, 24, [...blocked]);
}
