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
import type { StampSlot } from "@/types/stamps";
import {
  CHUNK_TILE_H,
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

// Stamp the manifest's buildings (only those not stamped yet: when homestead
// lot rows open, calling it again adds the new lots). Returns the new ones. The DATA (collision, door, zone, garden
// plots — and from them lights and smoke) is set up for the whole world at
// once: templates load once per FILE (a few dozen designs, not one per
// building) and that part is cheap. The VISUALS (static tile layers and
// Y-sorted sprites, the expensive part) are made only for buildings near the
// player and freed when they're far (syncStampVisuals), so the cost stays
// flat however many towns and lots the world holds.
export async function stampBuildings(
  scene: Phaser.Scene,
  manifest: BuildingManifest,
): Promise<StampedBuilding[]> {
  const files = [...new Set(manifest.buildings.map((e) => e.file))];
  await Promise.all(files.map(async (file) => {
    const key = templateKey(file);
    await loadTemplate(scene, key, file);
    dropPlainGrass(scene, key);
  }));
  const out: StampedBuilding[] = [];
  for (const entry of manifest.buildings) {
    if (stampSlots.some((s) => s.entry.key === entry.key)) continue; // stamped already (rows opening add the rest)
    const key = templateKey(entry.file);
    const cached = scene.sys.cache.tilemap.get(key) as { data?: unknown } | undefined;
    if (!cached) continue;
    const origin = tileOrigin(entry.tx, entry.ty);
    registerStampCollision(scene, key, origin.x, origin.y);
    out.push({
      entry,
      origin,
      ...deriveDoorAndZone(scene, key, origin),
      garden: gardenPlotsAt(entry.tx, entry.ty, cached?.data ?? cached),
    });
    stampSlots.push({ entry, key, origin, cx: Math.floor((entry.tx + 12) / CHUNK_TILE_W), cy: -Math.floor((entry.ty + 7) / CHUNK_TILE_H), visual: null });
  }
  return out;
}

const templateKey = (file: string) => `stamp_tpl_${file}`;

const stampSlots: StampSlot[] = [];
/** Visuals are made within this many chunks of the player… */
const STAMP_SHOW_CHUNKS = 3;
/** …and freed beyond this (a gap, so walking along an edge doesn't churn). */
const STAMP_HIDE_CHUNKS = 4;

/** Make the visuals of buildings near chunk (cx, cy), free the far ones. */
export function syncStampVisuals(scene: Phaser.Scene, { cx, cy }: { cx: number; cy: number }): void {
  for (const slot of stampSlots) {
    const d = Math.max(Math.abs(slot.cx - cx), Math.abs(slot.cy - cy));
    if (slot.visual && (d > STAMP_HIDE_CHUNKS || slot.visual.tilemap.scene !== scene)) {
      destroyVisual(slot);
    } else if (!slot.visual && d <= STAMP_SHOW_CHUNKS) {
      buildVisual(scene, slot);
    }
  }
}

function buildVisual(scene: Phaser.Scene, slot: StampSlot): void {
  const result = parseStamp(scene, slot.key);
  if (!result) return;
  const { tilemap, sortedTiles, anchorGrid, anchorByObjectId } = result;
  const tilesets = registerReferencedTilesets(tilemap);
  const layers = new Map<string, Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer>();
  createStaticLayers(tilemap, tilesets, slot.origin, `stamp_${slot.entry.key}`, layers, STAMP_DEPTH_OFFSET);
  const sprites: Phaser.GameObjects.Image[] = [];
  instantiateSortedSprites(scene, tilesets, sortedTiles, anchorGrid, anchorByObjectId, slot.origin, sprites);
  slot.visual = { tilemap, layers, sprites };
}

function destroyVisual(slot: StampSlot): void {
  const v = slot.visual;
  if (!v) return;
  for (const layer of v.layers.values()) layer.destroy();
  for (const sprite of v.sprites) sprite.destroy();
  v.tilemap.destroy();
  slot.visual = null;
}

/** Drop every building's visuals (the scene is going away). */
export function resetStampVisuals(): void {
  for (const slot of stampSlots) slot.visual = null; // their scene destroyed them
  stampSlots.length = 0;
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
    if (!door || entry.kind === "land" || entry.kind === "ranch" || entry.kind === "vineyard" || entry.kind === "workshop" || entry.kind === "orchard") continue;
    if (entry.kind === "waystone") {
      // the carved rune glows blue (scripts/draw-trade-buildings.mjs)
      out.push({ x: s.origin.x + 192, y: s.origin.y + 168, radius: 54, color: 0x6cc4ff, flicker: true });
      continue;
    }
    if (entry.kind === "bakery") {
      // both display windows glow warm, and the lamps by the door
      for (const wx of [186, 294]) out.push({ x: s.origin.x + wx, y: s.origin.y + 176, radius: 58, color: 0xffc070 });
      out.push({ x: door.x, y: door.y - 22, radius: 44, color: 0xffc870 });
      continue;
    }
    if (entry.kind === "forge") {
      // the open hearth in the lean-to bay glows day and night
      out.push({ x: s.origin.x + 283, y: s.origin.y + 188, radius: 72, color: 0xff8a3c, flicker: true });
      out.push({ x: door.x, y: door.y - 22, radius: 44, color: 0xffc870 });
      continue;
    }
    if (entry.key === "cave_mouth") out.push({ x: door.x, y: door.y - 34, radius: 56, color: 0xffb860, flicker: true });
    else if (entry.key === "cave_exit") out.push({ x: door.x, y: door.y - 20, radius: 96, color: 0xe8f4ff });
    else out.push({ x: door.x, y: door.y - 22, radius: 50, color: 0xffc870 });
  }
  return out;
}

/** Chimney tops of the house templates (scripts/draw-houses.mjs,
 *  scripts/draw-trade-buildings.mjs), in template pixels, where smoke
 *  rises from. */
const CHIMNEYS: Readonly<Record<string, ReadonlyArray<{ x: number; y: number }>>> = {
  "/buildings/cabin_1.json": [{ x: 271, y: 44 }],
  "/buildings/cabin_2.json": [{ x: 189, y: 44 }],
  "/buildings/house_1.json": [{ x: 277, y: 0 }],
  "/buildings/house_2.json": [{ x: 191, y: 0 }],
  "/buildings/forge.json": [{ x: 131, y: 28 }],
  "/buildings/inn.json": [{ x: 107, y: 4 }, { x: 276, y: 4 }],
  "/buildings/bakery.json": [{ x: 291, y: 22 }],
};

/** World positions of every stamped house's chimney (for smoke). */
export function chimneySources(stamped: StampedBuilding[]): { x: number; y: number }[] {
  return stamped.flatMap((s) => {
    return (CHIMNEYS[s.entry.file] ?? []).map((c) => ({ x: s.origin.x + c.x, y: s.origin.y + c.y }));
  });
}
